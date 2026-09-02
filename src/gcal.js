/**
 * Googleカレンダーから空きを読む
 *
 * サロンボードと違い、Googleカレンダーには公式のAPIがあります。
 * ただしここで読むのは freeBusy —— 「その時間に予定が入っているかどうか」だけです。
 * 予定のタイトルも、お客様のお名前も、こちらには届きません。
 * 空き枠を出すのに必要なのは「埋まっているか否か」だけなので、それ以上は取りません。
 *
 * カレンダーはセラピストごとに分かれています。
 * 施術ルームは部屋数までしか同時に施術できないため、
 * 「予定が入っているカレンダーの数」を数えて空きを判定します。
 *
 * 読み取り権限の渡し方（オーナー様の作業）:
 *   1. Google Cloud でサービスアカウントを作り、鍵（JSON）を作る
 *   2. 各セラピストのカレンダーの共有設定に、そのサービスアカウントの
 *      メールアドレスを「予定の表示（時間のみ）」で追加する
 *   3. 鍵の client_email と private_key を Workers のシークレットに登録する
 *
 * 手順2で「時間のみ」を選べば、予定の中身はそもそも共有されません。
 */

import { SALON } from './salon.js';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FREEBUSY_URL = 'https://www.googleapis.com/calendar/v3/freeBusy';
const SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';

/** 何分刻みで空きを探すか */
export const STEP_MIN = 15;

/**
 * どのカレンダーがどの部屋か。
 * env.GOOGLE_CALENDARS に JSON で入れる。
 *   [{"id":"therapist-a@group.calendar.google.com","room":"room","label":"Aさん"}, ...]
 */
export function calendarsOf(env, room = null) {
  let list;
  try {
    list = JSON.parse(env.GOOGLE_CALENDARS ?? '[]');
  } catch {
    return [];
  }
  if (!Array.isArray(list)) return [];
  const all = list
    .map((c) => ({ id: String(c?.id ?? ''), room: c?.room === 'self' ? 'self' : 'room',
                   label: String(c?.label ?? '') }))
    .filter((c) => c.id);
  return room ? all.filter((c) => c.room === room) : all;
}

/**
 * 同時に施術できる数。
 * セラピストが2人いても施術ルームが1室なら、同時に受けられるのは1件です。
 * env.ROOM_CAPACITY = {"room":1,"self":1}
 */
export function capacityOf(env, room) {
  let conf;
  try {
    conf = JSON.parse(env.ROOM_CAPACITY ?? '{}');
  } catch {
    conf = {};
  }
  const n = Number(conf?.[room]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}

export const calendarReady = (env) => calendarsOf(env).length > 0;

/* ------------------------------------------------------------------ *
 * 認証
 * ------------------------------------------------------------------ */

/* 取ったトークンは1時間有効。毎回取り直す必要はない */
let cached = null;

export async function accessToken(env, now = Date.now()) {
  if (cached && cached.expires > now + 60_000) return cached.token;

  const email = env.GOOGLE_SA_EMAIL;
  const pem = env.GOOGLE_SA_KEY;
  if (!email || !pem) throw new Error('Googleカレンダーの鍵が登録されていません');

  const assertion = await signJwt(email, pem, now);
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    })
  });
  const body = await res.json();
  if (!res.ok || !body.access_token) {
    throw new Error('Googleの認証に失敗しました: ' + (body.error_description ?? res.status));
  }

  cached = { token: body.access_token, expires: now + (body.expires_in ?? 3600) * 1000 };
  return cached.token;
}

/** テストや、鍵を入れ替えたときのために */
export function resetToken() {
  cached = null;
}

async function signJwt(email, pem, now) {
  const iat = Math.floor(now / 1000);
  const head = { alg: 'RS256', typ: 'JWT' };
  const claim = { iss: email, scope: SCOPE, aud: TOKEN_URL, exp: iat + 3600, iat };

  const enc = new TextEncoder();
  const part = (o) => b64url(enc.encode(JSON.stringify(o)));
  const data = part(head) + '.' + part(claim);

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToBytes(pem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(data));
  return data + '.' + b64url(new Uint8Array(sig));
}

function pemToBytes(pem) {
  const body = String(pem)
    .replace(/-----[^-]+-----/g, '')
    .replace(/\s+/g, '');
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

function b64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/* ------------------------------------------------------------------ *
 * 予定の取得
 * ------------------------------------------------------------------ */

/**
 * 指定した日の、カレンダーごとの「埋まっている時間」。
 * 返るのは開始と終了だけです。
 *
 * @returns {Promise<Record<string, {start:string,end:string}[]>>}
 */
export async function fetchBusy(env, dates, room, fetchImpl = fetch) {
  const cals = calendarsOf(env, room);
  if (!cals.length || !dates.length) return {};

  const sorted = [...dates].sort();
  const res = await fetchImpl(FREEBUSY_URL, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + (await accessToken(env)),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      timeMin: sorted[0] + 'T00:00:00+09:00',
      timeMax: sorted[sorted.length - 1] + 'T23:59:59+09:00',
      timeZone: 'Asia/Tokyo',
      items: cals.map((c) => ({ id: c.id }))
    })
  });

  const body = await res.json();
  if (!res.ok) {
    throw new Error('カレンダーを読めませんでした: ' + (body?.error?.message ?? res.status));
  }

  const out = {};
  for (const c of cals) out[c.id] = body?.calendars?.[c.id]?.busy ?? [];
  return out;
}

/* ------------------------------------------------------------------ *
 * 空きの計算（ここは通信しないので、そのまま試せます）
 * ------------------------------------------------------------------ */

/** '09:00' → 540 */
export const toMin = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + (m || 0);
};

/** 540 → '09:00' */
export const toHm = (min) =>
  String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');

/** その日の0時（日本時間）からの経過分に直す */
function minutesInDay(iso, date) {
  const base = Date.parse(date + 'T00:00:00+09:00');
  return Math.round((Date.parse(iso) - base) / 60000);
}

/**
 * 予定が「部屋の数」に達していない時間帯を返す。
 *
 * セラピストが2人いて施術ルームが1室なら capacity は 1 です。
 * 1人でも予定が入っていれば、その時間は部屋が埋まっています。
 *
 * @param {{start:string,end:string}[][]} busyLists カレンダーごとの予定
 * @param {object} opts
 * @param {string} opts.date     YYYY-MM-DD
 * @param {number} opts.capacity 同時に受けられる数
 * @param {string} [opts.from]   営業開始
 * @param {string} [opts.to]     営業終了
 * @param {number} [opts.buffer] 予定の前後にあける時間（片付けなど）
 * @returns {{from:number,to:number}[]} 空いている時間帯（分）
 */
export function freeRanges(busyLists, opts) {
  const { date, capacity = 1 } = opts;
  const dayFrom = toMin(opts.from ?? SALON.open.from);
  const dayTo = toMin(opts.to ?? SALON.open.to);
  const buffer = opts.buffer ?? 0;

  /* 予定の開始で+1、終了で-1。重なりの数を数えていく */
  const marks = [];
  for (const list of busyLists) {
    for (const b of list ?? []) {
      const s = minutesInDay(b.start, date) - buffer;
      const e = minutesInDay(b.end, date) + buffer;
      if (e <= dayFrom || s >= dayTo) continue; // その日の営業時間の外
      marks.push([Math.max(s, dayFrom), 1], [Math.min(e, dayTo), -1]);
    }
  }
  marks.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  const out = [];
  let count = 0;
  let openedAt = dayFrom;

  for (const [at, delta] of marks) {
    const wasFree = count < capacity;
    count += delta;
    const nowFree = count < capacity;

    if (wasFree && !nowFree && at > openedAt) out.push({ from: openedAt, to: at });
    if (!wasFree && nowFree) openedAt = at;
  }
  if (count < capacity && dayTo > openedAt) out.push({ from: openedAt, to: dayTo });

  return out.filter((r) => r.to > r.from);
}

/**
 * 空いている時間帯を、決まった長さの枠に切り出す。
 * 15分刻みで探し、同じ時間帯からは先頭の1つだけを候補にします
 * （2時間空いていても「11:00」「11:15」「11:30」…と並べても選びにくいため）。
 */
export function slotsFrom(ranges, minutes, opts = {}) {
  const step = opts.step ?? STEP_MIN;
  const perRange = opts.perRange ?? 2;
  const out = [];

  for (const r of ranges) {
    let found = 0;
    for (let t = ceilTo(r.from, step); t + minutes <= r.to && found < perRange; t += step) {
      out.push(toHm(t));
      found++;
      /* 次の候補は、いま出した枠の終わりから探す */
      t = t + minutes - step;
    }
  }
  return out;
}

const ceilTo = (n, step) => Math.ceil(n / step) * step;

/**
 * 日付をまたいで空き枠の候補を作る。画面はこれを呼びます。
 *
 * @returns {Promise<{date:string,time:string,minutes:number}[]>}
 */
export async function findOpenSlots(env, opts) {
  const dates = opts.dates ?? [];
  const room = opts.room ?? 'room';
  const minutes = opts.minutes ?? 60;
  const capacity = opts.capacity ?? capacityOf(env, room);

  const busy = await fetchBusy(env, dates, room, opts.fetchImpl ?? fetch);
  const lists = Object.values(busy);

  const out = [];
  for (const date of dates) {
    const ranges = freeRanges(lists, {
      date,
      capacity,
      from: opts.from,
      to: opts.to,
      buffer: opts.buffer
    });
    for (const time of slotsFrom(ranges, minutes, opts)) {
      out.push({ date, time, minutes });
    }
  }
  return out;
}

/**
 * Instagram と Google ビジネスプロフィールへの自動投稿
 *
 * 順番が大事です。LINE → 30分あけて → Instagram・Google。
 * 先に外へ出してしまうと、LINEに登録していただく理由が消えます。
 * そのため、送信のときにすぐ投げず、予約として貯めて時間が来たら出します。
 *
 * どちらも未設定なら、何も起きません（これまでどおり手で投稿できます）。
 *
 * ■ Instagram
 *   Facebookページを経由しない「Instagram API with Instagram Login」を使います。
 *   ストーリーズは、画像が公開URLに置いてあることと、JPEG であることが要ります。
 *   そのため、スタッフの画面で作った画像をこちらで預かり、
 *   /media/＜ID＞.jpg として出したうえで、そのURLを渡します。
 *
 * ■ Google ビジネスプロフィール
 *   画像は任意なので、文面と「予約」ボタンだけでも投稿できます。
 *   サービスアカウントは使えないため、店舗を管理しているGoogleアカウントで
 *   一度だけ許可を出していただき、そのリフレッシュトークンを使います。
 */

import { SALON, has } from './salon.js';
import { todayJst, nowIso } from './handlers.js';
import { buildInstagramText, INSTAGRAM_DELAY_MIN } from './openslot.js';

const IG_HOST = 'https://graph.instagram.com';
const GBP_HOST = 'https://mybusiness.googleapis.com/v4';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

/** 預かった画像を消すまでの日数。投稿が済めば用済みです */
export const MEDIA_KEEP_DAYS = 3;

export const igReady = (env) => !!(env.IG_USER_ID && env.IG_ACCESS_TOKEN);
export const gbpReady = (env) =>
  !!(env.GBP_ACCOUNT_ID && env.GBP_LOCATION_ID &&
     env.GOOGLE_OAUTH_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET && env.GBP_REFRESH_TOKEN);

/* ------------------------------------------------------------------ *
 * 画像を預かる
 * ------------------------------------------------------------------ */

/** 画像が大きすぎるときは受け取らない（D1に入れるため） */
export const MEDIA_MAX_BYTES = 700 * 1024;

/**
 * スタッフの画面で作った JPEG を預かります。
 * 返ってきたIDが、そのまま公開URLの一部になります。
 */
export async function saveMedia(env, base64, mime = 'image/jpeg') {
  if (!base64) return null;
  if (base64.length > MEDIA_MAX_BYTES * 1.4) {
    throw new Error('画像が大きすぎます');
  }
  const id = crypto.randomUUID().replace(/-/g, '');
  const expires = addDays(todayJst(), MEDIA_KEEP_DAYS);

  await env.DB.prepare(
    'INSERT INTO media (id, mime, data, expires_on, created_at) VALUES (?, ?, ?, ?, ?)'
  )
    .bind(id, mime, base64, expires, nowIso())
    .run();
  return id;
}

/** 公開URL。推測できないIDなので、認証は付けません（外から読めないと投稿できないため） */
export const mediaUrl = (env, id) =>
  (env.PUBLIC_URL ?? '').replace(/\/$/, '') + '/media/' + id + '.jpg';

export async function serveMedia(env, id) {
  const row = await env.DB.prepare('SELECT mime, data FROM media WHERE id = ?')
    .bind(String(id).replace(/\.jpg$/, ''))
    .first();
  if (!row) return new Response('not found', { status: 404 });

  const bin = atob(row.data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

  return new Response(bytes, {
    headers: {
      'Content-Type': row.mime || 'image/jpeg',
      'Cache-Control': 'public, max-age=86400'
    }
  });
}

/* ------------------------------------------------------------------ *
 * 投稿の予約
 * ------------------------------------------------------------------ */

/**
 * LINEに送ったあと、30分後に外へ出す予約を入れます。
 * すぐ投げないのは、LINEが先である事実をつくるためです。
 */
export async function schedulePost(env, opts) {
  const channels = (opts.channels ?? []).filter((c) => c === 'instagram' || c === 'gbp');
  if (!channels.length) return { scheduled: 0 };

  const delay = opts.delayMinutes ?? INSTAGRAM_DELAY_MIN;
  const dueAt = new Date(Date.now() + delay * 60000).toISOString();

  for (const channel of channels) {
    await env.DB.prepare(
      `INSERT INTO scheduled_posts (channel, body, image_url, due_at, status, created_at)
       VALUES (?, ?, ?, ?, 'waiting', ?)`
    )
      .bind(channel, opts.text ?? '', opts.imageUrl ?? null, dueAt, nowIso())
      .run();
  }
  return { scheduled: channels.length, dueAt };
}

/**
 * ストーリーズの画像を作る場所。
 *
 * Cloudflare Workers には絵を描く仕組みがないため、
 * 画像は外の小さな置き場で作ります（env.STORY_IMAGE_URL）。
 * そこに枠の内容を渡すと、JPEGが返る約束です。
 *
 * 決めていないときは null を返し、Instagram は見送ります。
 * Google は文面だけで投稿できるので、そちらは動きます。
 */
export function storyImageUrl(env, slots, today = null) {
  const base = env.STORY_IMAGE_URL;
  if (!base) return null;

  const payload = {
    slots: (slots ?? []).map((s) => ({
      date: s.date, time: s.time, minutes: s.minutes, menus: s.menus ?? []
    })),
    today,
    delay: INSTAGRAM_DELAY_MIN,
    salon: SALON.name
  };
  const d = socialB64url(JSON.stringify(payload));
  return base + (base.includes('?') ? '&' : '?') + 'd=' + d;
}

function socialB64url(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * 時間が来た予約を出します。10分おきの cron から呼びます。
 * 1件が失敗しても、ほかの投稿は止めません。
 */
export async function publishDue(env, now = new Date().toISOString()) {
  const rows = await env.DB.prepare(
    "SELECT * FROM scheduled_posts WHERE status = 'waiting' AND due_at <= ? ORDER BY due_at LIMIT 10"
  )
    .bind(now)
    .all();

  const done = [];
  for (const row of rows.results ?? []) {
    /* 先に「送信中」にして、cron が重なっても二度出さないようにする */
    const claimed = await env.DB.prepare(
      "UPDATE scheduled_posts SET status = 'sending' WHERE id = ? AND status = 'waiting'"
    )
      .bind(row.id)
      .run();
    if (claimed.meta.changes === 0) continue;

    let result;
    try {
      const url = row.image_url || null;
      result = row.channel === 'instagram'
        ? await postInstagramStory(env, url)
        : await postGbp(env, { summary: row.body, imageUrl: url });
    } catch (err) {
      result = { ok: false, error: String(err.message ?? err) };
    }

    await env.DB.prepare(
      'UPDATE scheduled_posts SET status = ?, error = ?, posted_at = ? WHERE id = ?'
    )
      .bind(result.ok ? 'posted' : 'failed', result.ok ? null : result.error ?? '', nowIso(), row.id)
      .run();

    done.push({ id: row.id, channel: row.channel, ok: result.ok, error: result.error ?? null });
  }
  return { published: done.filter((d) => d.ok).length, results: done };
}

/** 使い終わった画像と、古い記録を片づける */
export async function sweepMedia(env, today = todayJst()) {
  const m = await env.DB.prepare('DELETE FROM media WHERE expires_on < ?').bind(today).run();
  const p = await env.DB.prepare(
    "DELETE FROM scheduled_posts WHERE status IN ('posted','failed') AND due_at < ?"
  )
    .bind(addDays(today, -30) + 'T00:00:00.000Z')
    .run();
  return { media: m.meta?.changes ?? 0, posts: p.meta?.changes ?? 0 };
}

/* ------------------------------------------------------------------ *
 * Instagram
 * ------------------------------------------------------------------ */

/**
 * ストーリーズに1枚出します。
 * 「入れ物を作る → 出す」の2段階です。
 */
export async function postInstagramStory(env, imageUrl) {
  if (!igReady(env)) return { ok: false, error: 'Instagramが未設定です' };
  if (!imageUrl) return { ok: false, error: '画像がありません（ストーリーズには画像が要ります）' };

  const base = `${IG_HOST}/${env.IG_USER_ID}`;
  const token = env.IG_ACCESS_TOKEN;

  const made = await igCall(`${base}/media`, {
    media_type: 'STORIES',
    image_url: imageUrl,
    access_token: token
  });
  if (!made.ok) return made;

  const out = await igCall(`${base}/media_publish`, {
    creation_id: made.body.id,
    access_token: token
  });
  return out.ok ? { ok: true, id: out.body.id } : out;
}

async function igCall(url, params) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params)
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) {
    return { ok: false, error: body?.error?.message ?? `Instagram ${res.status}` };
  }
  return { ok: true, body };
}

/* ------------------------------------------------------------------ *
 * Google ビジネスプロフィール
 * ------------------------------------------------------------------ */

let gbpCache = null;

/** リフレッシュトークンから、1時間有効な鍵をもらう */
export async function gbpToken(env, now = Date.now()) {
  if (gbpCache && gbpCache.expires > now + 60_000) return gbpCache.token;

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_OAUTH_CLIENT_ID,
      client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
      refresh_token: env.GBP_REFRESH_TOKEN,
      grant_type: 'refresh_token'
    })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    throw new Error('Googleの認証に失敗しました: ' + (body.error_description ?? res.status));
  }
  gbpCache = { token: body.access_token, expires: now + (body.expires_in ?? 3600) * 1000 };
  return gbpCache.token;
}

export function resetGbpToken() {
  gbpCache = null;
}

/**
 * 「最新情報」として投稿します。
 * ご予約の入口があれば「予約」ボタンを、なければ電話ボタンを付けます。
 */
export async function postGbp(env, { summary, imageUrl = null }) {
  if (!gbpReady(env)) return { ok: false, error: 'Googleビジネスプロフィールが未設定です' };

  const post = {
    languageCode: 'ja',
    summary: String(summary ?? '').slice(0, 1500),
    topicType: 'STANDARD'
  };

  if (has(SALON.bookingUrl)) {
    post.callToAction = { actionType: 'BOOK', url: SALON.bookingUrl };
  } else if (has(SALON.tel)) {
    post.callToAction = { actionType: 'CALL' };
  }
  if (imageUrl) post.media = [{ mediaFormat: 'PHOTO', sourceUrl: imageUrl }];

  const url =
    `${GBP_HOST}/accounts/${env.GBP_ACCOUNT_ID}/locations/${env.GBP_LOCATION_ID}/localPosts`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + (await gbpToken(env)),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(post)
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: body?.error?.message ?? `Google ${res.status}` };
  }
  return { ok: true, id: body.name ?? null };
}

/* ------------------------------------------------------------------ *
 * 文面
 * ------------------------------------------------------------------ */

/**
 * Googleに出す文面。
 * Instagram と違い、Googleは検索から来た方が読むので、
 * どこの店の何の話かが分かるように、店名と場所を添えます。
 */
export function buildGbpText(slots) {
  const lines = [buildInstagramText(slots)];
  lines.push('', SALON.name, SALON.access);
  if (has(SALON.tel)) lines.push('TEL ' + SALON.tel);
  return lines.join('\n');
}

/* ------------------------------------------------------------------ */

function addDays(ymd, days) {
  return new Date(Date.parse(ymd + 'T00:00:00Z') + days * 86400000).toISOString().slice(0, 10);
}

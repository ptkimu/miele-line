/**
 * LIFFのページから届く問い合わせ
 *
 * どれも IDトークンの検証を通してから処理します。
 * ページ側から送られてきた「私は○○です」は信じません。
 *
 * ここで扱うのは3つだけです。
 *   /api/me         いまのご登録状況（診断済みか、空き枠を受け取るか）
 *   /api/diagnosis  診断の結果をタグとして残す
 *   /api/prefs      空き枠のお知らせの受け取り設定
 *   /api/intake     問診表。保存はスタッフが読むまでの短い間だけ
 */

import { verifyIdToken } from './liff.js';
import { grantTags, revokeTag, tagsOf, OPEN_SLOT_TAG } from './tags.js';
import {
  tagsFromDiagnosis,
  diagnose,
  needsMensVioNote,
  MENS_VIO_NOTE,
  CONCERNS
} from './courses.js';
import { ROOM_TAG } from './openslot.js';
import { nowIso, todayJst } from './handlers.js';
import { push, text } from './line.js';

/** 問診表をお預かりする日数。過ぎたものは毎朝の掃除で消えます */
export const INTAKE_KEEP_DAYS = 14;

export async function apiRequest(request, env, url) {
  if (request.method !== 'POST' && url.pathname !== '/api/me') {
    return apiJson({ error: 'method not allowed' }, 405);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return apiJson({ error: '内容を読み取れませんでした' }, 400);
  }

  const who = await verifyIdToken(env, body?.idToken);
  if (who) await ensureCustomer(env, who);

  /* 診断だけは、LINEの外から開かれても結果をお返しします。
     お店の外（デモや、ブラウザで直接開いた場合）でも使えるようにするためで、
     タグとして残すのは、どなたか分かったときだけです。 */
  if (url.pathname === '/api/diagnosis') return diagnosisRoute(env, who, body);

  if (!who) return apiJson({ error: 'LINEでの確認ができませんでした' }, 401);

  switch (url.pathname) {
    case '/api/me':     return meRoute(env, who);
    case '/api/prefs':  return prefsRoute(env, who, body);
    case '/api/intake': return intakeRoute(env, who, body);
    default:            return apiJson({ error: 'not found' }, 404);
  }
}

/* 友だち追加より先にページを開かれることがあるので、無ければ作る */
async function ensureCustomer(env, who) {
  await env.DB.prepare(
    `INSERT INTO customers (line_user_id, display_name, followed_at, status)
     VALUES (?, ?, ?, 'active')
     ON CONFLICT(line_user_id) DO UPDATE SET
       display_name = COALESCE(excluded.display_name, customers.display_name)`
  )
    .bind(who.userId, who.name, nowIso())
    .run();
}

/* ------------------------------------------------------------------ *
 * いまのご登録状況
 * ------------------------------------------------------------------ */

async function meRoute(env, who) {
  const tags = (await tagsOf(env, who.userId)).map((t) => t.name ?? t);
  return apiJson({
    openSlot: tags.includes(OPEN_SLOT_TAG),
    rooms: Object.entries(ROOM_TAG)
      .filter(([, name]) => tags.includes(name))
      .map(([id]) => id),
    concerns: CONCERNS.filter((c) => tags.includes('関心:' + c.label)).map((c) => c.id),
    diagnosed: tags.some((t) => t.startsWith('関心:'))
  });
}

/* ------------------------------------------------------------------ *
 * コース診断
 * ------------------------------------------------------------------ */

/**
 * 診断の答えをタグとして残します。
 * このタグがあると、空き枠のお知らせを「そのお悩みの方だけ」に絞れます。
 *
 * 答えの中身（どのコースをご提案したか）も残しますが、
 * 保存するのは選択肢のIDだけで、自由入力は受け取りません。
 */
async function diagnosisRoute(env, who, body) {
  const answers = cleanAnswers(body?.answers);
  if (!answers) return apiJson({ error: '回答が足りません' }, 400);

  const payload = diagnosisPayload(answers);
  if (!who) return apiJson(payload);

  /* 前回の診断のタグを消してから付け直す。
     お悩みが変わった方に、古い関心のお知らせが届き続けないようにする */
  for (const c of CONCERNS) await revokeTag(env, who.userId, '関心:' + c.label);

  const tags = tagsFromDiagnosis(answers);
  await grantTags(env, who.userId, tags);

  await env.DB.prepare(
    `INSERT INTO diagnoses (line_user_id, gender, concerns, budget, pace, results, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      who.userId,
      answers.gender,
      JSON.stringify(answers.concerns),
      answers.budget,
      answers.pace,
      JSON.stringify(payload.results.map((r) => r.id)),
      nowIso()
    )
    .run();

  return apiJson({ ...payload, saved: true, tags: tags.map((t) => t.name) });
}

/**
 * おすすめの組み立ては、必ずこちら側で行います。
 * ページ側にも同じ処理を置くと、片方だけ古くなるためです。
 */
export function diagnosisPayload(answers) {
  const { results, overBudget } = diagnose(answers);
  return {
    ok: true,
    overBudget,
    mensVioNote: needsMensVioNote(answers) ? MENS_VIO_NOTE : null,
    results: results.map((r) => ({
      id: r.course.id,
      name: r.course.name,
      price: r.course.price,
      reg: r.course.reg ?? null,
      min: r.course.min,
      cat: r.course.cat,
      badge: r.course.badge,
      desc: r.course.desc,
      hits: r.hits,
      rate: r.rate
    })),
    saved: false
  };
}

/** 選択肢にあるものだけを通す。自由入力は受け取らない */
export function cleanAnswers(a) {
  const gender = a?.gender === 'm' ? 'm' : a?.gender === 'f' ? 'f' : null;
  const concerns = (Array.isArray(a?.concerns) ? a.concerns : [])
    .filter((c) => CONCERNS.some((x) => x.id === c));
  if (!gender || !concerns.length || !a?.budget || !a?.pace) return null;
  return { gender, concerns, budget: String(a.budget), pace: String(a.pace) };
}

/* ------------------------------------------------------------------ *
 * 空き枠のお知らせの受け取り設定
 * ------------------------------------------------------------------ */

async function prefsRoute(env, who, body) {
  const wants = !!body?.openSlot;
  const rooms = (Array.isArray(body?.rooms) ? body.rooms : []).filter((r) => ROOM_TAG[r]);

  if (wants) {
    await grantTags(env, who.userId, [{ kind: 'preference', name: OPEN_SLOT_TAG }]);
  } else {
    await revokeTag(env, who.userId, OPEN_SLOT_TAG);
  }

  for (const [id, name] of Object.entries(ROOM_TAG)) {
    if (wants && rooms.includes(id)) {
      await grantTags(env, who.userId, [{ kind: 'preference', name }]);
    } else {
      await revokeTag(env, who.userId, name);
    }
  }

  return apiJson({ ok: true, openSlot: wants, rooms: wants ? rooms : [] });
}

/* ------------------------------------------------------------------ *
 * 問診表
 * ------------------------------------------------------------------ */

/* お伺いする項目。ここにない内容は受け取りません */
export const INTAKE_FIELDS = [
  { id: 'name',      label: 'お名前',            type: 'text',  required: true,
    note: 'ご予約のお名前と同じものをご記入ください' },
  { id: 'kana',      label: 'ふりがな',          type: 'text' },
  { id: 'allergy',   label: 'アレルギー',        type: 'yesno', detail: '差し支えなければ内容を' },
  { id: 'illness',   label: '治療中のご病気・お薬', type: 'yesno', detail: '差し支えなければ内容を' },
  { id: 'pregnant',  label: '妊娠中・授乳中',    type: 'yesno', sex: 'f' },
  { id: 'metal',     label: '体内に金属・ペースメーカー', type: 'yesno',
    note: 'ラジオ波・EMSを使うメニューで確認が必要です' },
  { id: 'skin',      label: '肌のお悩み',        type: 'text' },
  { id: 'note',      label: 'その他ご要望',      type: 'text' }
];

/**
 * 問診表はスタッフにお送りするだけで、長くは持ちません。
 * 期限を入れておき、毎朝の掃除で消します。
 *
 * 健康に関わる内容をお預かりするため、
 *   - ご同意のチェックが無ければ受け取らない
 *   - 保存は14日だけ
 *   - スタッフには「届きました」とだけ通知し、中身はスタッフ用ページで見る
 * という形にしています。
 */
async function intakeRoute(env, who, body) {
  if (!body?.consent) return apiJson({ error: 'ご同意が必要です' }, 400);

  const form = {};
  for (const f of INTAKE_FIELDS) {
    const v = body?.form?.[f.id];
    if (v == null || v === '') continue;
    form[f.id] = String(v).slice(0, 300);
  }
  if (!form.name) return apiJson({ error: 'お名前をご記入ください' }, 400);

  const expires = new Date(Date.parse(todayJst() + 'T00:00:00Z') + INTAKE_KEEP_DAYS * 86400000)
    .toISOString()
    .slice(0, 10);

  await env.DB.prepare(
    `INSERT INTO intake_forms (line_user_id, display_name, body, expires_on, created_at)
     VALUES (?, ?, ?, ?, ?)`
  )
    .bind(who.userId, who.name, JSON.stringify(form), expires, nowIso())
    .run();

  /* スタッフへの合図。中身は入れない（LINEのトークに健康情報を残さないため） */
  const ids = String(env.STAFF_USER_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  for (const id of ids) {
    await push(env, id, [
      text(`【問診表が届きました】\n${form.name} 様\n\nスタッフ用ページでご確認ください。`)
    ]);
  }

  return apiJson({ ok: true });
}

/** 期限の切れた問診表を消す。毎朝の cron から呼びます */
export async function sweepIntake(env, today = todayJst()) {
  const res = await env.DB.prepare('DELETE FROM intake_forms WHERE expires_on < ?')
    .bind(today)
    .run();
  return { deleted: res.meta?.changes ?? 0 };
}

/* ------------------------------------------------------------------ */

export const apiJson = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });

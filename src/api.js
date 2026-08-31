/**
 * コース診断ツールからの受け口
 *
 * 診断ツール（LIFF）が結果を POST してきます。
 * LINEが発行した IDトークンをサーバー側で検証してからタグを付けるので、
 * 他人になりすましてタグを付けることはできません。
 *
 * ここでは配信を行わないため、通数は消費しません。
 */

import { tagsFromDiagnosis, grantTags } from './tags.js';
import { nowIso } from './handlers.js';

const VERIFY_URL = 'https://api.line.me/oauth2/v2.1/verify';

export async function diagnosisRequest(request, env) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'invalid json' }, 400);
  }

  const verified = await verifyIdToken(env, payload.idToken);
  if (!verified) return json({ error: 'invalid id token' }, 401);

  const userId = verified.sub;
  const answers = payload.answers ?? {};

  // 診断ツールから来た人がまだ友だちでない場合もある
  await env.DB.prepare(
    `INSERT INTO customers (line_user_id, display_name, followed_at, status)
     VALUES (?, ?, ?, 'active')
     ON CONFLICT(line_user_id) DO UPDATE SET
       display_name = COALESCE(excluded.display_name, customers.display_name)`
  )
    .bind(userId, verified.name ?? null, nowIso())
    .run();

  await env.DB.prepare(
    `INSERT INTO diagnoses (line_user_id, gender, concerns, budget, pace, results, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      userId,
      answers.gender ?? null,
      JSON.stringify(answers.concerns ?? []),
      answers.budget ?? null,
      answers.pace ?? null,
      JSON.stringify(answers.courses ?? []),
      nowIso()
    )
    .run();

  const tags = tagsFromDiagnosis(answers);
  await grantTags(env, userId, tags);

  return json({ ok: true, tags: tags.map((t) => t.name) });
}

/**
 * LINE の検証エンドポイントに問い合わせる。
 * 自前でJWTを検証するより、公式に確認してもらうほうが安全。
 */
async function verifyIdToken(env, idToken) {
  if (!idToken || !env.LIFF_CHANNEL_ID) return null;

  const res = await fetch(VERIFY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ id_token: idToken, client_id: env.LIFF_CHANNEL_ID })
  });
  if (!res.ok) return null;

  const claims = await res.json();
  return claims?.sub ? claims : null;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

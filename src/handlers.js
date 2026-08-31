/**
 * Webhook イベントの処理
 *
 * 受け取るのはお客様から届いたイベントだけです。
 * スタッフが管理画面やLINEチャットから送った返信は、ここには届きません。
 * （来店の記録をスタッフ用ページで行っているのはこのためです）
 */

import { reply, getProfile } from './line.js';
import { matchReply } from './replies.js';

export async function handleEvent(env, event) {
  // LINE はイベントを再送することがある。二度処理しないよう先に記録する
  if (event.webhookEventId) {
    const res = await env.DB.prepare(
      'INSERT OR IGNORE INTO processed_events (webhook_event_id, created_at) VALUES (?, ?)'
    )
      .bind(event.webhookEventId, nowIso())
      .run();
    if (res.meta.changes === 0) return; // 処理済み
  }

  switch (event.type) {
    case 'follow':
      return onFollow(env, event);
    case 'unfollow':
      return onUnfollow(env, event);
    case 'message':
      return onMessage(env, event);
    default:
      return;
  }
}

/* ------------------------------------------------------------------ *
 * 友だち追加
 * ------------------------------------------------------------------ */

/**
 * ここでは返信しません。
 * 友だち追加直後の案内は、LINE公式アカウント管理画面の「あいさつメッセージ」で
 * 設定してください。オーナー・スタッフが自分で文面を編集できるほうが運用しやすく、
 * どちらも通数は消費しません。
 */
async function onFollow(env, event) {
  const userId = event.source?.userId;
  if (!userId) return;

  const profile = await getProfile(env, userId);

  await env.DB.prepare(
    `INSERT INTO customers (line_user_id, display_name, followed_at, status)
     VALUES (?, ?, ?, 'active')
     ON CONFLICT(line_user_id) DO UPDATE SET
       display_name  = COALESCE(excluded.display_name, customers.display_name),
       unfollowed_at = NULL,
       status        = 'active'`
  )
    .bind(userId, profile?.displayName ?? null, nowIso())
    .run();
}

/* ------------------------------------------------------------------ *
 * ブロック・友だち解除
 * ------------------------------------------------------------------ */

async function onUnfollow(env, event) {
  const userId = event.source?.userId;
  if (!userId) return;

  await env.DB.prepare(
    `UPDATE customers
        SET unfollowed_at = ?, status = 'blocked'
      WHERE line_user_id = ?`
  )
    .bind(nowIso(), userId)
    .run();
}

/* ------------------------------------------------------------------ *
 * メッセージ受信
 * ------------------------------------------------------------------ */

async function onMessage(env, event) {
  const userId = event.source?.userId;
  if (!userId || event.message?.type !== 'text') return;

  const body = event.message.text ?? '';
  const hit = matchReply(body);

  // 応答できたかどうかも含めて記録する。
  // matched が NULL のものが「よく聞かれるのに自動で答えられていない質問」
  await env.DB.prepare(
    'INSERT INTO inbound_messages (line_user_id, body, matched, created_at) VALUES (?, ?, ?, ?)'
  )
    .bind(userId, body.slice(0, 500), hit?.name ?? null, nowIso())
    .run();

  // 当てはまるルールが無ければ返信しない（スタッフがLINEチャットで対応する）
  if (!hit) return;

  await reply(env, event.replyToken, hit.messages);
}

/* ------------------------------------------------------------------ */

export function nowIso() {
  return new Date().toISOString();
}

/** 日本時間の YYYY-MM-DD */
export function todayJst() {
  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

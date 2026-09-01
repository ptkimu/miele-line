/**
 * タグ
 *
 * 空き枠のお知らせを受け取りたいか、どちらのお部屋を希望されるか。
 * このタグが、お送りする方を絞る材料になります。
 */

import { nowIso } from './handlers.js';

/**
 * 空き枠のお知らせを受け取りたい方に付けるタグ。
 *
 * 稼働の初日は、このタグを持つ方が0名です。
 * 一斉送信で募らずに集めるため、リッチメニューの
 * 「空き枠のお知らせを受け取る」から付けられるようにしています（通数0）。
 */
export const OPEN_SLOT_TAG = '希望:空き枠のお知らせ';

/** タグを作って（無ければ）お客様に付ける */
export async function grantTags(env, lineUserId, tags) {
  for (const tag of tags) {
    await env.DB.prepare('INSERT OR IGNORE INTO tags (name, kind) VALUES (?, ?)')
      .bind(tag.name, tag.kind ?? null)
      .run();

    await env.DB.prepare(
      `INSERT OR IGNORE INTO customer_tags (line_user_id, tag_id, granted_at)
       SELECT ?, id, ? FROM tags WHERE name = ?`
    )
      .bind(lineUserId, nowIso(), tag.name)
      .run();
  }
}

/** タグを外す（「もう受け取らない」を選ばれたとき） */
export async function revokeTag(env, lineUserId, name) {
  await env.DB.prepare(
    `DELETE FROM customer_tags
      WHERE line_user_id = ?
        AND tag_id = (SELECT id FROM tags WHERE name = ?)`
  )
    .bind(lineUserId, name)
    .run();
}

/** そのタグを持っているか */
export async function hasTag(env, lineUserId, name) {
  const row = await env.DB.prepare(
    `SELECT 1 AS yes FROM customer_tags ct JOIN tags t ON t.id = ct.tag_id
      WHERE ct.line_user_id = ? AND t.name = ?`
  )
    .bind(lineUserId, name)
    .first();
  return !!row;
}

/** 1人のお客様に付いているタグ */
export async function tagsOf(env, lineUserId) {
  const res = await env.DB.prepare(
    `SELECT t.name, t.kind
       FROM customer_tags ct JOIN tags t ON t.id = ct.tag_id
      WHERE ct.line_user_id = ?
      ORDER BY t.kind, t.name`
  )
    .bind(lineUserId)
    .all();
  return res.results ?? [];
}

/** タグ別の人数。何が貯まっているかの全体像 */
export async function tagCounts(env) {
  const res = await env.DB.prepare(
    `SELECT t.name, t.kind, COUNT(*) AS n
       FROM customer_tags ct
       JOIN tags t      ON t.id = ct.tag_id
       JOIN customers c ON c.line_user_id = ct.line_user_id
      WHERE c.status = 'active'
      GROUP BY t.id
      ORDER BY n DESC, t.name`
  ).all();
  return res.results ?? [];
}

/**
 * お送りする方の絞り込み
 *
 * 空き枠のお知らせは、受け取りを希望された方だけにお送りします。
 * さらに、セルフブースと施術ルームのどちらを希望されたかで分けます。
 * 通数が減るだけでなく、関係のない案内でブロックされるのを防げます。
 *
 * ここは「誰に送るか」を決めるだけで、送信そのものは行いません。
 */

import { todayJst } from './handlers.js';

/**
 * @typedef {object} SegmentSpec
 * @property {string[]} [tags]              このタグを「すべて」持つ人
 * @property {string[]} [anyTags]           このうち「どれか1つでも」持つ人
 * @property {number}   [excludeRecentDays] 直近n日以内にお知らせを受け取った人を外す
 */

/** 「最近送ったばかり」の目安。これより短い間隔で届くと配信疲れになりやすい */
export const RECENT_DAYS = 7;

function buildQuery(spec, today) {
  const where = ["c.status = 'active'"];
  const binds = [];

  for (const tag of spec.tags ?? []) {
    where.push(`EXISTS (
      SELECT 1 FROM customer_tags ct JOIN tags t ON t.id = ct.tag_id
       WHERE ct.line_user_id = c.line_user_id AND t.name = ?)`);
    binds.push(tag);
  }

  /* 診断で選ばれたお悩みのタグ。枠のメニューに関わるものを1つでも
     持っている方に絞る。すべて一致では狭くなりすぎるため「どれか1つ」 */
  const any = (spec.anyTags ?? []).filter(Boolean);
  if (any.length) {
    where.push(`EXISTS (
      SELECT 1 FROM customer_tags ct JOIN tags t ON t.id = ct.tag_id
       WHERE ct.line_user_id = c.line_user_id
         AND t.name IN (${any.map(() => '?').join(',')}))`);
    binds.push(...any);
  }

  if (spec.excludeRecentDays != null) {
    where.push(`NOT EXISTS (
      SELECT 1 FROM deliveries d
       WHERE d.line_user_id = c.line_user_id AND d.status = 'sent' AND d.sent_at >= ?)`);
    binds.push(cutoffIso(today, spec.excludeRecentDays));
  }

  return { sql: where.join(' AND '), binds };
}

function cutoffIso(today, days) {
  return new Date(Date.parse(today + 'T00:00:00Z') - days * 86400000).toISOString();
}

/**
 * 対象者の一覧。
 * last_sent_at も一緒に返すので、「最近お送りしたばかりの方が何人いるか」を
 * 送信前に画面へ出せる。
 */
export async function listSegment(env, spec, today = todayJst()) {
  const { sql, binds } = buildQuery(spec, today);
  const res = await env.DB.prepare(
    `SELECT c.line_user_id, c.display_name,
            (SELECT MAX(d.sent_at) FROM deliveries d
              WHERE d.line_user_id = c.line_user_id AND d.status = 'sent') AS last_sent_at
       FROM customers c
      WHERE ${sql}
      ORDER BY c.followed_at DESC
      LIMIT 500`
  )
    .bind(...binds)
    .all();
  return res.results ?? [];
}

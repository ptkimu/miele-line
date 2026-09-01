/**
 * 配信対象の絞り込み
 *
 * 全員に送ることはしません。タグと来店状況で対象を絞ります。
 * 通数が減るだけでなく、関係のない配信でブロックされるのを防げます。
 *
 * ここは「誰に送るか」を決めるだけで、送信そのものは行いません。
 */

import { todayJst } from './handlers.js';

/**
 * @typedef {object} SegmentSpec
 * @property {string[]} [tags]              このタグを「すべて」持つ人
 * @property {number}   [notVisitedDays]     最終来店からn日以上経っている人
 * @property {boolean}  [unbookedOnly]      次回予約が入っていない人だけ
 * @property {number}   [excludeRecentDays] 直近n日以内に配信を受け取った人を外す
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

  if (spec.notVisitedDays != null) {
    const cutoff = new Date(Date.parse(today + 'T00:00:00Z') - spec.notVisitedDays * 86400000)
      .toISOString()
      .slice(0, 10);
    where.push('(c.last_visit_at IS NULL OR c.last_visit_at <= ?)');
    binds.push(cutoff);
  }

  if (spec.unbookedOnly) where.push('c.next_booked = 0');

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
 * last_sent_at も一緒に返すので、「最近送ったばかりの人が何人いるか」を
 * 送信前に画面へ出せる。
 */
export async function listSegment(env, spec, today = todayJst()) {
  const { sql, binds } = buildQuery(spec, today);
  const res = await env.DB.prepare(
    `SELECT c.line_user_id, c.display_name, c.last_visit_at, c.next_booked,
            (SELECT MAX(d.sent_at) FROM deliveries d
              WHERE d.line_user_id = c.line_user_id AND d.status = 'sent') AS last_sent_at
       FROM customers c
      WHERE ${sql}
      ORDER BY (c.last_visit_at IS NULL), c.last_visit_at DESC
      LIMIT 500`
  )
    .bind(...binds)
    .all();
  return res.results ?? [];
}


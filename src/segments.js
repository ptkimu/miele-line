/**
 * 絞り込み配信
 *
 * 全員に送るのではなく、タグと来店状況で対象を絞ります。
 * 通数が減るだけでなく、関係のない配信でブロックされるのを防げます。
 *
 * 送信前に必ず「何人に届いて、何通使うか」を返します。
 * 通数を消費する操作は、数字を見てから決められるようにするためです。
 */

import { push, text } from './line.js';
import { checkQuota } from './quota.js';
import { todayJst, nowIso } from './handlers.js';

/**
 * @typedef {object} SegmentSpec
 * @property {string[]} [tags]          このタグを「すべて」持つ人
 * @property {number}   [notVisitedDays] 最終来店からn日以上経っている人
 * @property {boolean}  [unbookedOnly]  次回予約が入っていない人だけ
 */

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

  return { sql: where.join(' AND '), binds };
}

/** 対象者の一覧 */
export async function listSegment(env, spec, today = todayJst()) {
  const { sql, binds } = buildQuery(spec, today);
  const res = await env.DB.prepare(
    `SELECT c.line_user_id, c.display_name, c.last_visit_at, c.next_booked
       FROM customers c
      WHERE ${sql}
      ORDER BY (c.last_visit_at IS NULL), c.last_visit_at DESC
      LIMIT 500`
  )
    .bind(...binds)
    .all();
  return res.results ?? [];
}

/**
 * 送る前の確認。何人に届いて、何通使い、通数の枠に収まるか。
 * ここで数字を見てから送信を決めます。
 */
export async function previewSegment(env, spec, options = {}) {
  const today = options.today ?? todayJst();
  const targets = await listSegment(env, spec, today);
  const planned = targets.length;
  const quota = await checkQuota(env, planned, options.quota ?? null);
  return { spec, today, targets, planned, quota };
}

/** 実際に送る。previewSegment で確認した内容と同じ条件で呼ぶ */
export async function sendSegment(env, spec, body, options = {}) {
  const preview = await previewSegment(env, spec, options);
  if (!preview.quota.allowed) {
    return { ...preview, sent: 0, stopped: preview.quota.reason };
  }
  if (options.dryRun) return { ...preview, sent: 0, dryRun: true };

  const key = options.campaignId ?? 'segment:' + nowIso().slice(0, 19);
  let sent = 0;

  for (const c of preview.targets) {
    const claimed = await env.DB.prepare(
      `INSERT OR IGNORE INTO deliveries
         (line_user_id, step_id, dedupe_key, status, messages, sent_at)
       VALUES (?, 'segment', ?, 'sending', 1, ?)`
    )
      .bind(c.line_user_id, key, nowIso())
      .run();
    if (claimed.meta.changes === 0) continue;

    const ok = await push(env, c.line_user_id, [text(body)]);
    await env.DB.prepare(
      `UPDATE deliveries SET status = ?, sent_at = ?
        WHERE line_user_id = ? AND dedupe_key = ?`
    )
      .bind(ok ? 'sent' : 'failed', nowIso(), c.line_user_id, key)
      .run();
    if (ok) sent++;
  }

  return { ...preview, sent, campaignId: key };
}

/** よく使う条件のひな形 */
export const PRESETS = [
  {
    id: 'open_slot',
    label: 'キャンセル枠のお知らせ',
    note: '受け取りを希望した方だけ。Instagramで告知して、枠はLINEだけで出す',
    spec: { tags: ['希望:キャンセル枠'] }
  },
  {
    id: 'hair_thera',
    label: 'セラピスト脱毛に関心がある方',
    note: '診断でセラピスト脱毛を選んだ方',
    spec: { tags: ['希望:セラピスト脱毛'] }
  },
  {
    id: 'sleeping',
    label: '3か月以上ご来店のない方',
    note: '復帰のきっかけづくり。特典をつけるならここ',
    spec: { notVisitedDays: 90, unbookedOnly: true }
  },
  {
    id: 'all',
    label: '友だち全員',
    note: '通数を最も使う。友だち数ぶんの通数が一度に減る',
    spec: {}
  }
];

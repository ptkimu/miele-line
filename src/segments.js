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

/**
 * 送る前の確認。何人に届いて、何通使い、通数の枠に収まるか。
 * ここで数字を見てから送信を決めます。
 */
export async function previewSegment(env, spec, options = {}) {
  const today = options.today ?? todayJst();
  const targets = await listSegment(env, spec, today);
  const planned = targets.length;
  const quota = await checkQuota(env, planned, options.quota ?? null);

  // 通数より先に限界が来るのは、お客様の受信箱のほう。
  // 最近送ったばかりの人が何人混じっているかを、送信前に示す。
  const recentCutoff = cutoffIso(today, RECENT_DAYS);
  const recentlyContacted = targets.filter(
    (c) => c.last_sent_at && c.last_sent_at >= recentCutoff
  ).length;

  return { spec, today, targets, planned, quota, recentlyContacted, recentDays: RECENT_DAYS };
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

/**
 * よく使う条件のひな形。
 * ミエーレの一斉配信は、主に新メニューとキャンペーンのときです。
 * その2つを「全員」と「関心のある方だけ」に分けられるようにしています。
 */
export const PRESETS = [
  {
    id: 'announce_all',
    label: '新メニュー・キャンペーン（全員）',
    note: '内容が全員に関係する場合。直近1週間に送った方は外す',
    spec: { excludeRecentDays: RECENT_DAYS }
  },
  {
    id: 'campaign_hair',
    label: '脱毛のキャンペーン',
    note: '診断で脱毛を選んだ方だけ。関心のない方に届かない',
    spec: { tags: ['希望:セラピスト脱毛'] }
  },
  {
    id: 'campaign_skin',
    label: '肌の悩みで通われている方',
    note: '毛穴・シミ・くすみを選んだ方。肌管理の新メニュー向け',
    spec: { tags: ['希望:毛穴・シミ・くすみ'] }
  },
  {
    id: 'open_slot',
    label: '空き枠のお知らせ',
    note: '受け取りを希望した方だけ。Instagramで告知して、枠はLINEだけで出す',
    spec: { tags: ['希望:空き枠のお知らせ'] }
  },
  {
    id: 'sleeping',
    label: '3か月以上ご来店のない方',
    note: '復帰のきっかけづくり。特典をつけるならここ',
    spec: { notVisitedDays: 90, unbookedOnly: true }
  }
];

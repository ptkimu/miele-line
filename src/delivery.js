/**
 * 定時バッチ（毎朝10時）
 *
 * 「誰に何を送るか」を決めてから、必ず通数ガードを通し、
 * 予算内に収まる場合だけ送ります。
 *
 * dryRun: true で呼ぶと、1通も送らずに「送るはずだった内容」を返します。
 * デモと、本番投入前の確認に使います。
 */

import { push, text } from './line.js';
import { checkQuota } from './quota.js';
import { STEPS, targetVisitDate } from './scenarios.js';
import { todayJst, nowIso } from './handlers.js';

export async function runDailyDelivery(env, options = {}) {
  const today = options.today ?? todayJst();
  const dryRun = options.dryRun ?? false;
  const quotaOverride = options.quota ?? null;

  // 1. 送る相手を集める
  const plan = [];
  for (const step of STEPS) {
    const visitedOn = targetVisitDate(today, step.offsetDays);
    const targets = await findTargets(env, step, visitedOn);
    plan.push({ step, visitedOn, targets });
  }

  const planned = plan.reduce((n, p) => n + p.targets.length, 0);

  // 2. 通数ガード。ここを通らなければ1通も送らない
  const quota = await checkQuota(env, planned, quotaOverride);

  const report = {
    today,
    dryRun,
    quota,
    planned,
    sent: 0,
    steps: plan.map((p) => ({
      id: p.step.id,
      label: p.step.label,
      offsetDays: p.step.offsetDays,
      audience: p.step.audience,
      visitedOn: p.visitedOn,
      count: p.targets.length,
      // 実際に送られる文面。デモではこれをそのまま画面に出す
      samples: p.targets.slice(0, 3).map((c) => ({
        name: c.display_name,
        body: p.step.build(c)[0]
      }))
    }))
  };

  if (!quota.allowed) {
    report.stopped = quota.reason;
    return report; // 送らずに終了。本番ではこのあとオーナーへ通知する
  }
  if (dryRun || planned === 0) return report;

  // 3. 送信。先に記録を作ることで、再実行しても二重に届かない
  for (const { step, visitedOn, targets } of plan) {
    for (const c of targets) {
      const dedupe = `${step.id}:${visitedOn}`;
      const claimed = await env.DB.prepare(
        `INSERT OR IGNORE INTO deliveries
           (line_user_id, step_id, dedupe_key, status, messages, sent_at)
         VALUES (?, ?, ?, 'sending', 1, ?)`
      )
        .bind(c.line_user_id, step.id, dedupe, nowIso())
        .run();

      if (claimed.meta.changes === 0) continue; // 他の実行が既に確保済み

      const ok = await push(env, c.line_user_id, step.build(c).map(text));

      await env.DB.prepare(
        `UPDATE deliveries SET status = ?, sent_at = ?
          WHERE line_user_id = ? AND dedupe_key = ?`
      )
        .bind(ok ? 'sent' : 'failed', nowIso(), c.line_user_id, dedupe)
        .run();

      if (ok) report.sent++;
    }
  }

  return report;
}

/**
 * その日の対象者。
 *   - 指定日に来店している
 *   - unbooked のステップでは、次回予約が入っていない
 *   - まだ同じ案内を受け取っていない
 *   - ブロックしていない
 */
async function findTargets(env, step, visitedOn) {
  const dedupe = `${step.id}:${visitedOn}`;
  const bookedCondition = step.audience === 'unbooked' ? 'AND v.next_booked = 0' : '';

  const res = await env.DB.prepare(
    `SELECT c.line_user_id, c.display_name
       FROM visits v
       JOIN customers c ON c.line_user_id = v.line_user_id
      WHERE v.visited_on = ?
        AND c.status = 'active'
        ${bookedCondition}
        AND NOT EXISTS (
          SELECT 1 FROM deliveries d
           WHERE d.line_user_id = c.line_user_id AND d.dedupe_key = ?
        )`
  )
    .bind(visitedOn, dedupe)
    .all();

  return res.results ?? [];
}

/**
 * 通数ガード
 *
 * ライトプランは 5,000通/月 で、追加購入ができません。
 * 上限に当たると月末まで一切送れなくなるため、配信の前に必ずここを通します。
 *
 * 予備枠を常に残すのが要点です。月初の一斉配信で使い切ってしまうと、
 * 月末の予約リマインドが送れなくなります。
 */

import { getQuota } from './line.js';

/** 何があっても残しておく通数（予約リマインドなど、送らないと困る配信のため） */
export const RESERVE = 500;

/**
 * @param {number} planned これから送ろうとしている通数
 * @param {{limit:number, used:number}} [override] テスト・デモ用に実測値を差し替える
 */
export async function checkQuota(env, planned, override = null) {
  const q = override ?? (await getQuota(env));
  const limit = q.limit ?? Infinity;
  const used = q.used ?? 0;

  const remaining = limit - used;
  const usable = Math.max(0, remaining - RESERVE); // 予備枠を除いた、いま使ってよい通数

  return {
    limit,
    used,
    remaining,
    reserve: RESERVE,
    usable,
    planned,
    allowed: planned <= usable,
    reason: planned <= usable ? null : `残り${usable}通（予備枠${RESERVE}通を除く）に対して${planned}通の送信予定`
  };
}

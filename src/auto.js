/**
 * 空き枠のお知らせを、人が触らずに出す
 *
 * スタッフがGoogleカレンダーを正しく入れている、という前提で動きます。
 * そのため、次のことは「カレンダーで決まる」ことになります。
 *
 *   出さない時間は、カレンダーに予定として入れておく
 *     （移動・休憩・あえて残している枠。何も入っていなければ空きとして出ます）
 *
 * 機械が勝手に増やさないよう、歯止めは残してあります。
 *   ・送信日（月・木）以外は動かない
 *   ・同じお部屋は直近7日で3回まで
 *   ・1回に出す枠は3つまで
 *   ・通数の予備枠（500通）を割り込むなら送らない
 *   ・受け取りを希望された方だけ。希望者がいなければ何もしない
 *
 * 流れ：
 *   10:00  カレンダーを見る → 枠を決める → LINEに送る
 *   10:30  Instagram と Google に出す（LINEが先である事実をつくる）
 */

import { todayJst } from './handlers.js';
import {
  DEFAULT_SCHEDULE,
  MAX_PER_WEEK,
  INSTAGRAM_DELAY_MIN,
  ROOMS,
  isSendDay,
  scheduleDates,
  recentSendCount,
  defaultMenusFor,
  sendOpenSlot,
  buildInstagramText
} from './openslot.js';
import { calendarReady, calendarsOf, findOpenSlots } from './gcal.js';
import { igReady, gbpReady, schedulePost, buildGbpText, storyImageUrl } from './social.js';

/** 1回のお知らせに載せる枠の数。多いと「いつも空いている店」に見える */
export const AUTO_MAX_SLOTS = 3;

/** 自動で出すときの枠の長さ。60分あれば多くのメニューが入る */
export const AUTO_MINUTES = 60;

/**
 * @param {object} [opts]
 * @param {string}  [opts.today]  日付を差し替える（テスト用）
 * @param {boolean} [opts.force]  送信日でなくても動かす
 * @param {boolean} [opts.dryRun] 送らずに、何が起きるかだけ返す
 */
export async function runAuto(env, opts = {}) {
  const today = opts.today ?? todayJst();
  const days = opts.days ?? DEFAULT_SCHEDULE.days;

  if (!opts.force && !isSendDay(today, days)) {
    return { today, skipped: '送信日ではありません', rooms: [] };
  }
  if (!calendarReady(env)) {
    return { today, skipped: 'Googleカレンダーが未設定です', rooms: [] };
  }

  const dates = scheduleDates(today, opts.leadDays);
  const minutes = Number(env.AUTO_SLOT_MINUTES) || AUTO_MINUTES;
  const maxSlots = Number(env.AUTO_MAX_SLOTS) || AUTO_MAX_SLOTS;

  const rooms = [];
  for (const room of ROOMS) {
    rooms.push(await runRoom(env, {
      today, dates, minutes, maxSlots, room: room.id, dryRun: opts.dryRun
    }));
  }

  return { today, dates, rooms, sent: rooms.reduce((n, r) => n + (r.sent ?? 0), 0) };
}

async function runRoom(env, o) {
  const label = ROOMS.find((r) => r.id === o.room)?.label ?? o.room;

  if (!calendarsOf(env, o.room).length) {
    return { room: o.room, label, skipped: 'このお部屋のカレンダーがありません' };
  }

  const week = await recentSendCount(env, o.today, o.room);
  if (week >= MAX_PER_WEEK) {
    return { room: o.room, label, skipped: `直近7日ですでに${week}回出しています` };
  }

  let found;
  try {
    found = await findOpenSlots(env, {
      dates: o.dates,
      room: o.room,
      minutes: o.minutes,
      buffer: Number(env.SLOT_BUFFER_MIN) || 0
    });
  } catch (err) {
    return { room: o.room, label, skipped: 'カレンダーを読めませんでした: ' + err.message };
  }

  if (!found.length) {
    return { room: o.room, label, skipped: 'この日に出せる空きはありませんでした' };
  }

  /* 枠にメニューを載せる。スタッフ用ページと同じ決め方 */
  const slots = found.slice(0, o.maxSlots).map((s) => ({
    ...s,
    menus: defaultMenusFor(o.room, s.minutes)
  }));

  const result = await sendOpenSlot(env, slots, { narrow: true, dryRun: o.dryRun });

  if (o.dryRun) {
    return { room: o.room, label, slots, planned: result.planned, dryRun: true };
  }
  if (result.stopped) {
    return { room: o.room, label, slots, skipped: result.stopped };
  }
  if (!result.sent) {
    return { room: o.room, label, slots, sent: 0, skipped: 'お送りする方がいませんでした' };
  }

  /* LINEが届いたので、30分後に外へ出す予約を入れる */
  const scheduled = await scheduleOutside(env, slots, o.today);

  return { room: o.room, label, slots, sent: result.sent, scheduled };
}

/**
 * Instagram と Google の予約を入れます。
 * Instagram はストーリーズに画像が要るため、画像を作る場所が
 * 決まっていないときは見送ります（Googleは文面だけで出せます）。
 */
async function scheduleOutside(env, slots, today) {
  const channels = [];
  const imageUrl = storyImageUrl(env, slots, today);

  if (igReady(env) && imageUrl) channels.push('instagram');
  if (gbpReady(env)) channels.push('gbp');
  if (!channels.length) return { scheduled: 0 };

  const out = { scheduled: 0 };
  if (channels.includes('instagram')) {
    const r = await schedulePost(env, {
      channels: ['instagram'],
      text: buildInstagramText(slots),
      imageUrl,
      delayMinutes: INSTAGRAM_DELAY_MIN
    });
    out.scheduled += r.scheduled;
    out.dueAt = r.dueAt;
  }
  if (channels.includes('gbp')) {
    const r = await schedulePost(env, {
      channels: ['gbp'],
      text: buildGbpText(slots),
      imageUrl,
      delayMinutes: INSTAGRAM_DELAY_MIN
    });
    out.scheduled += r.scheduled;
    out.dueAt = r.dueAt;
  }
  return out;
}

/** 記録用の短い文。cron のログに出します */
export const autoSummary = (r) =>
  r.skipped
    ? `自動送信なし（${r.skipped}）`
    : r.rooms
        .map((x) => `${x.label}: ${x.skipped ?? `${x.sent}名に送信・外部${x.scheduled?.scheduled ?? 0}件を予約`}`)
        .join(' / ');

/**
 * 空き枠のお知らせ
 *
 * 「LINEだけが先に知る」を、続けられる形にするための道具です。
 * 空きが出るたびに文面を考えていては続かないので、
 * 日時とメニューを選べば、LINEとInstagramの文面が両方出るようにしています。
 *
 * 役割を分けています：
 *   LINE       枠そのものを、受け取りを希望した方だけに出す
 *   Instagram  「LINEの方には先にお知らせ済み」と伝えるだけ（枠は出さない）
 *
 * Instagramに枠を出してしまうと、LINEに登録する理由が消えます。
 *
 * 予約はすべて LINE への返信で受けます。ホットペッパーへは誘導しません。
 * LINEで完結させることが、そのままLINEに登録する価値になるためです。
 */

import { push, text } from './line.js';
import { checkQuota } from './quota.js';
import { listSegment, RECENT_DAYS } from './segments.js';
import { OPEN_SLOT_TAG } from './tags.js';
import { todayJst, nowIso } from './handlers.js';
import { slotMenusOf, concernTagsOfMenus } from './courses.js';

/**
 * 部屋。セルフブースと施術ルームは独立していて、同時に稼働できます。
 * セラピストが埋まっていてもセルフ枠は出せるので、出せる機会が増えます。
 *
 * メニューは src/courses.js から取ります。
 * メニューが変わったときに直す場所を1か所にするためです。
 * 所要時間の掲載があるものだけが、空き枠として出せます。
 */
export const ROOMS = [
  {
    id: 'self',
    label: 'セルフブース',
    note: '1室。セラピストの予定と関係なく空きます',
    menus: slotMenusOf('self')
  },
  {
    id: 'room',
    label: '施術ルーム',
    note: 'セラピストの予定で決まります',
    menus: slotMenusOf('room')
  }
];

/** 枠の長さに収まるメニューだけを返す */
export function menusWithin(roomId, minutes) {
  const room = ROOMS.find((r) => r.id === roomId);
  if (!room) return [];
  return room.menus.filter((m) => !minutes || m.minutes <= minutes);
}

/** よく使う枠の長さ */
export const DURATIONS = [30, 45, 60, 90];

/**
 * 部屋 → その部屋を希望している方のタグ。
 *
 * 受け取りを申し込んだ直後に「どちらをご希望ですか」と伺い、
 * その回答をこのタグとして持ちます。通数は消費しません。
 */
export const ROOM_TAG = {
  self: '希望:セルフ脱毛',
  room: '希望:セラピスト施術'
};

export const roomOfMenu = (menu) =>
  ROOMS.find((r) => r.menus.some((m) => m.name === menu))?.id ?? 'room';

/**
 * 1つの枠で受けられるメニュー。
 * 60分の枠なら複数のメニューが入るので、配列で持ちます。
 * 1つだけ指定された古い形（menu）もそのまま読めるようにしています。
 */
export const slotMenus = (s) =>
  Array.isArray(s?.menus) ? s.menus.filter(Boolean) : (s?.menu ? [s.menu] : []);

export const roomOfSlot = (s) => roomOfMenu(slotMenus(s)[0]);

/**
 * 送る相手を絞るためのタグ。
 * 枠がすべて同じ部屋のときだけ返します。
 * 部屋が混ざっている場合は絞らず、空き枠を希望した方全員に送ります。
 */
export function tagForSlots(slots) {
  const rooms = [...new Set((slots ?? []).map(roomOfSlot))];
  return rooms.length === 1 ? (ROOM_TAG[rooms[0]] ?? null) : null;
}

/**
 * 1週間に出す上限。
 * 定期のお知らせが週2回（月・木）、それに加えて突発の空きが1回まで、という想定。
 * これ以上続けて流すと「いつも空いている店」という印象になり逆効果になる。
 */
export const MAX_PER_WEEK = 3;

/* ------------------------------------------------------------------ *
 * 定期のお知らせ
 *
 * 決まった曜日に、2〜3日後の空きをまとめてご案内します。
 * 突発のキャンセルとは別枠で、こちらは計画的に出せます。
 * ------------------------------------------------------------------ */

export const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

/** 既定は月曜と木曜に、2日後と3日後の空きを案内する */
export const DEFAULT_SCHEDULE = { days: [1, 4], leadDays: [2, 3] };

const shiftDate = (ymd, n) =>
  new Date(Date.parse(ymd + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);

export const weekdayOf = (ymd) => new Date(Date.parse(ymd + 'T00:00:00Z')).getUTCDay();

/** その日が送信日か */
export function isSendDay(today, days) {
  return (days ?? []).includes(weekdayOf(today));
}

/** 次の送信日（当日を含む） */
export function nextSendDay(today, days) {
  if (!days?.length) return null;
  for (let i = 0; i <= 7; i++) {
    const d = shiftDate(today, i);
    if (isSendDay(d, days)) return d;
  }
  return null;
}

/** その日に案内する対象の日付。既定では2日後と3日後 */
export function scheduleDates(today, leadDays = DEFAULT_SCHEDULE.leadDays) {
  return [...leadDays].sort((a, b) => a - b).map((n) => shiftDate(today, n));
}

/**
 * 送信日の朝、スタッフに送るお知らせの文面。
 *
 * サロンボードから空きを自動で取る手段は公開されておらず、
 * また「空いている」枠がすべて「出していい」枠とは限りません
 * （移動や休憩、あえて残している枠が混ざります）。
 * そのため機械は送り忘れだけを防ぎ、どの枠を出すかは人が決めます。
 */
export function buildStaffReminder(today, opts = {}) {
  const leadDays = opts.leadDays ?? DEFAULT_SCHEDULE.leadDays;
  const dates = scheduleDates(today, leadDays);
  return [
    '【空き枠のお知らせの日です】',
    '',
    `本日は${WEEKDAYS[weekdayOf(today)]}曜日です。`,
    `${dates.map(formatDate).join('・')} の空きをご確認ください。`,
    '',
    'サロンボードで空きを見てから、管理ページで枠を選んで送信してください。',
    opts.adminUrl ?? null,
    '',
    '出したくない枠（移動・休憩・あえて残している枠）は入れないでください。'
  ].filter((l) => l !== null).join('\n');
}

/**
 * 送信日の朝にスタッフへ通知する。
 * スタッフ宛の1通なので、通数はごくわずかです（週2回で月8通程度）。
 */
export async function remindStaff(env, opts = {}) {
  const today = opts.today ?? todayJst();
  const days = opts.days ?? DEFAULT_SCHEDULE.days;
  if (!isSendDay(today, days)) return { today, sent: 0, skipped: '送信日ではありません' };

  const ids = String(opts.staffIds ?? env.STAFF_USER_IDS ?? '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  if (!ids.length) return { today, sent: 0, skipped: 'スタッフのIDが未設定です' };

  const body = buildStaffReminder(today, {
    leadDays: opts.leadDays,
    adminUrl: opts.adminUrl ?? env.ADMIN_URL ?? null
  });

  let sent = 0;
  for (const id of ids) {
    if (await push(env, id, [text(body)])) sent++;
  }
  return { today, sent, body };
}

/** Instagram に告知するまでに空ける時間（LINEが先である事実をつくる） */
export const INSTAGRAM_DELAY_MIN = 30;

/* ------------------------------------------------------------------ *
 * 文面
 * ------------------------------------------------------------------ */

const WD = ['日', '月', '火', '水', '木', '金', '土'];

export function formatDate(ymd) {
  const d = new Date(Date.parse(ymd + 'T00:00:00Z'));
  return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日（${WD[d.getUTCDay()]}）`;
}

const isToday = (ymd) => ymd === todayJst();
const hourOf = (time) => String(time ?? '').split(':')[0];

/**
 * LINE に送る文面。
 * 1枠だけなら急ぎの案内、複数枠ならまとめての案内に切り替わります。
 */
export function buildLineMessage(slots) {
  const list = [...(slots ?? [])].sort(sortSlot);
  if (!list.length) return '';

  if (list.length === 1) {
    const s = list[0];
    const when = isToday(s.date) ? '本日' : formatDate(s.date);
    const menus = slotMenus(s);
    return [
      `【${when}${s.time}〜、1枠空きました】`,
      '',
      'ミエーレです。',
      `${when}${s.time}〜のお席に空きが出ました。`,
      '',
      `▼ ${formatDate(s.date)} ${s.time}〜${s.minutes ? '（' + s.minutes + '分）' : ''}`,
      ...menus.map((m) => `　・${m}`),
      menus.length > 1 ? '　いずれかをお選びいただけます' : null,
      '',
      'ご希望の方は、このメッセージに',
      `「${hourOf(s.time)}時希望」とご返信ください。`,
      menus.length > 1 ? 'メニューはご来店時に決めていただいても大丈夫です。' : null,
      '',
      'ご返信の早い方からご案内します。',
      '先にお席が埋まった場合は',
      'その旨お伝えします。'
    ].filter((l) => l !== null).join('\n');
  }

  const byDate = groupByDate(list);
  return [
    '【空き状況のご案内】',
    '',
    'ミエーレです。',
    '直近のお席をご案内します。',
    '',
    ...byDate.flatMap(([date, ss]) => [
      formatDate(date),
      ...ss.map((s) => `　${s.time}〜　${slotMenus(s).join('／')}`),
      ''
    ]),
    'ご希望の日時を、このメッセージに',
    'ご返信ください。',
    '',
    'ご返信の早い方からご案内します。'
  ].join('\n');
}

/**
 * Instagram ストーリーズ用。
 * 枠は出しますが「LINEには先に案内済み」を必ず添えます。
 * DMでのご予約は受ける方針です（埋まらない枠を埋めるのが本来の目的のため）。
 */
export function buildInstagramText(slots) {
  const list = [...(slots ?? [])].sort(sortSlot);
  if (!list.length) return '';

  const head =
    list.length === 1 && isToday(list[0].date)
      ? [`本日${list[0].time}に空きが出ました`]
      : groupByDate(list).map(([date, ss]) => `${formatDate(date)}　${ss.map((s) => s.time).join(' / ')}`);

  /* 「キャンセルが出ました」とは書きません。
     キャンセルされたご本人がこれを見たとき、自分のことだと分かってしまうためです。
     LINEの表示名はニックネームが多く、ご本人を配信対象から外せるとは限りません。 */
  return [
    list.length === 1 ? 'OPEN SLOT' : 'OPEN SLOTS',
    '',
    ...head,
    '',
    'LINEの方には',
    `${INSTAGRAM_DELAY_MIN}分前にお知らせ済みです`,
    '',
    'まだ空いていればご案内できます',
    'DMまたはプロフィールのリンクから'
  ].join('\n');
}

function sortSlot(a, b) {
  return String(a.date + a.time).localeCompare(String(b.date + b.time));
}

function groupByDate(list) {
  const m = new Map();
  list.forEach((s) => m.set(s.date, [...(m.get(s.date) ?? []), s]));
  return [...m.entries()];
}

/* ------------------------------------------------------------------ *
 * 配信
 * ------------------------------------------------------------------ */

/**
 * 直近7日間に空き枠のお知らせを何回出したか。
 * 部屋ごとに数えます。セルフ枠を2回出しても、施術ルームの枠は減りません。
 * 送り先が別なので、受け取る側から見た頻度は変わらないためです。
 */
export async function recentSendCount(env, today = todayJst(), room = null) {
  const since = new Date(Date.parse(today + 'T00:00:00Z') - 7 * 86400000).toISOString();
  const row = room
    ? await env.DB.prepare(
        'SELECT COUNT(*) AS n FROM open_slots WHERE created_at >= ? AND kind = ?'
      ).bind(since, room).first()
    : await env.DB.prepare(
        'SELECT COUNT(*) AS n FROM open_slots WHERE created_at >= ?'
      ).bind(since).first();
  return row?.n ?? 0;
}

/**
 * 送る前の確認。
 * 対象者・通数・文面・注意点をまとめて返します。
 *
 * その枠に入っていた方を個別に外す機能は持ちません。
 * LINEの表示名はニックネームのことが多く、サロンボードの予約者と
 * 突き合わせられないためです。代わりに文面から「キャンセル」の語を外し、
 * ご本人に届いてもご自身のことだと分からないようにしています。
 *
 * @param {object[]} slots 空き枠
 * @param {object}   opts
 * @param {boolean}  opts.narrow        メニューに関心のある方だけに絞るか（既定は絞る）
 * @param {boolean}  opts.excludeRecent 直近7日に配信を受け取った方を外すか
 * @param {boolean}  opts.everyone      受け取りを希望していない方にも送るか（既定は送らない）
 */
export async function previewOpenSlot(env, slots, opts = {}) {
  const today = opts.today ?? todayJst();
  const room = opts.room ?? roomOfSlot(slots?.[0]);

  // 既定では、そのメニューに関心のある方だけに絞る
  const narrowTag = opts.narrow === false ? null : tagForSlots(slots);

  /* 通常は「受け取りを希望した方」だけ。
     everyone を立てると、希望していない方にも送る。
     稼働直後で希望者がいないときの呼び水に使えるが、
     頼んでいない案内が届くのでブロックされやすい。 */
  const everyone = !!opts.everyone;
  const baseTag = everyone ? [] : [OPEN_SLOT_TAG];

  /* コース診断をお受けになった方は、お悩みのタグをお持ちです。
     枠のメニューに関わるお悩みを1つでも選んでいた方に絞れます。
     診断をまだの方は当てはまらないので、送り先はぐっと狭くなります。 */
  const interestTags = opts.byInterest
    ? concernTagsOfMenus(slots.flatMap((s) => slotMenus(s)))
    : [];

  const base = opts.excludeRecent ? { excludeRecentDays: RECENT_DAYS } : {};
  const pick = (tags, anyTags = []) => listSegment(env, { ...base, tags, anyTags }, today);

  const targets = await pick(narrowTag ? [...baseTag, narrowTag] : baseTag, interestTags);
  // 絞った結果いなかったとき、広げれば何名になるかを示せるようにしておく
  const wide = narrowTag || interestTags.length ? await pick(baseTag) : targets;

  const quota = await checkQuota(env, targets.length, opts.quota ?? null);
  const weekCount = await recentSendCount(env, today, room);

  const notes = [];
  if (everyone) {
    notes.push({
      kind: 'everyone',
      text: '受け取りを希望していない方にも送ります。頼んでいない案内が届くため、' +
            'ブロックされやすくなります。稼働の直後など、必要なときだけにしてください。'
    });
  }
  if ((narrowTag || interestTags.length) && !targets.length && wide.length) {
    notes.push({
      kind: 'narrow-empty',
      text: `絞り込みに当てはまる方はいませんでした。` +
            `絞り込みを外すと、空き枠を希望された${wide.length}名にお送りできます。`
    });
  }
  if (interestTags.length && targets.length) {
    notes.push({
      kind: 'by-interest',
      text: `コース診断で「${interestTags.map((t) => t.replace('関心:', '')).join('・')}」を` +
            `選ばれた方に絞っています。診断がまだの方には届きません。`
    });
  }
  if (weekCount >= MAX_PER_WEEK) {
    notes.push({
      kind: 'too-often',
      text: `直近7日間ですでに${weekCount}回お送りしています。` +
            `続けすぎると「いつも空いている店」という印象になり、逆効果になります。`
    });
  }
  if (!targets.length) {
    notes.push({
      kind: 'empty',
      text: `お知らせを希望された方がいません。あいさつメッセージで` +
            `「空き枠のお知らせを受け取りますか」をご案内すると増えていきます。`
    });
  }

  return {
    today,
    slots,
    room,
    everyone,
    roomLabel: ROOMS.find((r) => r.id === room)?.label ?? '',
    narrowTag,
    interestTags,
    wideCount: wide.length,
    targets,
    planned: targets.length,
    quota,
    weekCount,
    maxPerWeek: MAX_PER_WEEK,
    tooOften: weekCount >= MAX_PER_WEEK,
    notes,
    lineText: buildLineMessage(slots),
    instagramText: buildInstagramText(slots)
  };
}

/** 実際に送る */
export async function sendOpenSlot(env, slots, opts = {}) {
  const preview = await previewOpenSlot(env, slots, opts);
  if (!preview.quota.allowed) return { ...preview, sent: 0, stopped: preview.quota.reason };
  if (opts.dryRun) return { ...preview, sent: 0, dryRun: true };

  const at = nowIso();
  const key = 'slot:' + at.slice(0, 19);
  let sent = 0;

  for (const c of preview.targets) {
    const claimed = await env.DB.prepare(
      `INSERT OR IGNORE INTO deliveries
         (line_user_id, step_id, dedupe_key, status, messages, sent_at)
       VALUES (?, 'open_slot', ?, 'sending', 1, ?)`
    )
      .bind(c.line_user_id, key, at)
      .run();
    if (claimed.meta.changes === 0) continue;

    const ok = await push(env, c.line_user_id, [text(preview.lineText)]);
    await env.DB.prepare(
      "UPDATE deliveries SET status = ?, sent_at = ? WHERE line_user_id = ? AND dedupe_key = ?"
    )
      .bind(ok ? 'sent' : 'failed', nowIso(), c.line_user_id, key)
      .run();
    if (ok) sent++;
  }

  await env.DB.prepare(
    'INSERT INTO open_slots (kind, slots, sent_count, created_at) VALUES (?, ?, ?, ?)'
  )
    .bind(preview.room, JSON.stringify(slots), sent, at)
    .run();

  return { ...preview, sent, campaignId: key };
}

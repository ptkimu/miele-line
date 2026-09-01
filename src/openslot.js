/**
 * 空き枠・キャンセル枠のお知らせ
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
import { todayJst, nowIso } from './handlers.js';

/** 受け取りを希望した方に付けるタグ */
export const OPEN_SLOT_TAG = '希望:キャンセル枠';

/**
 * 1週間に出す上限。
 * 毎日のように「キャンセルが出ました」と送っていると、
 * 「人気がない店」という印象になり逆効果になるため。
 */
export const MAX_PER_WEEK = 2;

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
    return [
      `【${when}${s.time}〜、1枠空きました】`,
      '',
      'ミエーレです。',
      `${when}${s.time}〜のお席に空きが出ました。`,
      '',
      `▼ ${formatDate(s.date)} ${s.time}〜`,
      `　${s.menu}`,
      s.minutes ? `　${s.minutes}分` : null,
      '',
      'ご希望の方は、このメッセージに',
      `「${hourOf(s.time)}時希望」とご返信ください。`,
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
    ...byDate.flatMap(([date, ss]) => [formatDate(date), ...ss.map((s) => `　${s.time}〜　${s.menu}`), '']),
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

  return [
    list.length === 1 ? 'CANCEL INFO' : 'OPEN SLOTS',
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

/** 直近7日間に空き枠のお知らせを何回出したか */
export async function recentSendCount(env, today = todayJst()) {
  const since = new Date(Date.parse(today + 'T00:00:00Z') - 7 * 86400000).toISOString();
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM open_slots WHERE created_at >= ?"
  )
    .bind(since)
    .first();
  return row?.n ?? 0;
}

/**
 * 送る前の確認。
 * 対象者・通数・文面・注意点をまとめて返します。
 *
 * @param {object[]} slots 空き枠
 * @param {object}   opts
 * @param {string[]} opts.excludeUserIds その日にキャンセルされた方など、外したい相手
 * @param {boolean}  opts.excludeRecent  直近7日に配信を受け取った方を外すか
 */
export async function previewOpenSlot(env, slots, opts = {}) {
  const today = opts.today ?? todayJst();
  const exclude = new Set(opts.excludeUserIds ?? []);

  const spec = { tags: [OPEN_SLOT_TAG] };
  if (opts.excludeRecent) spec.excludeRecentDays = RECENT_DAYS;

  const all = await listSegment(env, spec, today);
  const targets = all.filter((c) => !exclude.has(c.line_user_id));

  const quota = await checkQuota(env, targets.length, opts.quota ?? null);
  const weekCount = await recentSendCount(env, today);

  const notes = [];
  if (exclude.size) {
    notes.push({
      kind: 'excluded',
      text: `${exclude.size}名を対象から外しました。キャンセルされたご本人に案内が届くと、` +
            `「自分のせいで穴埋めしている」と感じさせてしまうためです。`
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
            `「キャンセル枠のお知らせを受け取りますか」をご案内すると増えていきます。`
    });
  }

  return {
    today,
    slots,
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
    .bind(slots.length === 1 ? 'single' : 'multi', JSON.stringify(slots), sent, at)
    .run();

  return { ...preview, sent, campaignId: key };
}

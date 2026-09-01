/**
 * Instagram ストーリーズ用の画像
 *
 * 文面をコピーして文字入れする手間をなくすため、画像そのものを作ります。
 * ブラウザの Canvas に描くので、スタッフの画面（スマホでも）で完結します。
 *
 * 枠そのものは載せますが、「LINEの方には先にお知らせ済み」を必ず入れます。
 * ここが抜けると、LINEに登録する理由が伝わりません。
 */

import { formatDate, slotMenus } from './openslot.js';
import { SALON } from './salon.js';

export const STORY_W = 1080;
export const STORY_H = 1920;

/* Instagram は上下におよそ 250px ぶんの操作領域が重なるため、
   大事な要素はこの範囲に収める */
const SAFE_TOP = 300;
const SAFE_BOTTOM = 1660;

const C = {
  ground: '#FAF7F5',
  ink: '#2B2724',
  muted: '#8B7F79',
  accent: '#98543F',
  rule: '#E0D2CA'
};

const DISPLAY = '"Zen Kaku Gothic New","Hiragino Kaku Gothic ProN","Yu Gothic Medium",sans-serif';
const BODY = '"Noto Sans JP","Hiragino Kaku Gothic ProN","Yu Gothic Medium",sans-serif';

/**
 * @param {CanvasRenderingContext2D} ctx  1080×1920 のコンテキスト
 * @param {object[]} slots  空き枠
 * @param {object} [opts]
 * @param {string} [opts.today]        「本日」と出すかの判定に使う
 * @param {number} [opts.delayMinutes] LINEに送ってからの経過分数
 */
export function drawStory(ctx, slots, opts = {}) {
  const list = [...(slots ?? [])].sort(
    (a, b) => String(a.date + a.time).localeCompare(String(b.date + b.time))
  );
  const today = opts.today ?? null;
  const delay = opts.delayMinutes ?? 30;

  ctx.clearRect(0, 0, STORY_W, STORY_H);
  ctx.fillStyle = C.ground;
  ctx.fillRect(0, 0, STORY_W, STORY_H);

  /* 上下の帯。写真を敷かなくても締まって見える */
  ctx.fillStyle = C.accent;
  ctx.fillRect(0, 0, STORY_W, 14);
  ctx.fillRect(0, STORY_H - 14, STORY_W, 14);

  const cx = STORY_W / 2;
  let y = SAFE_TOP;

  center(ctx, 'MIELE', cx, y, `700 40px ${DISPLAY}`, C.accent, 16);
  y += 70;
  rule(ctx, cx, y, 120);
  y += 90;

  center(ctx, list.length === 1 ? 'OPEN SLOT' : 'OPEN SLOTS', cx, y,
         `700 34px ${DISPLAY}`, C.accent, 10);
  y += 110;

  /* 枠の一覧。1枠なら大きく、複数なら並べる */
  if (list.length === 1) {
    const s = list[0];
    const when = today && s.date === today ? '本日' : formatDate(s.date);
    center(ctx, when, cx, y, `500 56px ${BODY}`, C.ink, 2);
    y += 130;
    center(ctx, s.time, cx, y, `700 168px ${DISPLAY}`, C.ink, 2);
    y += 190;
    /* メニューが複数なら、画像は先頭だけにして「ほか◯件」と添える。
       ストーリーズは一瞬しか見られないので、詰め込まない */
    const menus = slotMenus(s);
    if (menus.length) {
      center(ctx, menus[0], cx, y, `400 40px ${BODY}`, C.muted, 1);
      y += 58;
      if (menus.length > 1) {
        center(ctx, `ほか ${menus.length - 1} メニューも可`, cx, y, `400 34px ${BODY}`, C.muted, 1);
        y += 46;
      }
    }
    y += 32;
  } else {
    /* 同じ日は1行にまとめる。「9月3日（木） 11:00 / 14:30」のように出す */
    const groups = groupDates(list);
    const big = groups.length >= 3 ? 76 : 96;
    for (const [date, ss] of groups) {
      center(ctx, formatDate(date), cx, y, `400 38px ${BODY}`, C.muted, 1);
      y += 60;
      center(ctx, ss.map((s) => s.time).join('  /  '), cx, y,
             `700 ${big}px ${DISPLAY}`, C.ink, 2);
      y += big + 26;
    }
    y += 20;
  }

  y = Math.max(y, 1120);
  rule(ctx, cx, y, 220);
  y += 96;

  center(ctx, 'LINEの方には', cx, y, `500 48px ${BODY}`, C.ink, 2);
  y += 74;
  center(ctx, `${delay}分前にお知らせ済みです`, cx, y, `500 48px ${BODY}`, C.ink, 2);
  y += 130;

  center(ctx, 'まだ空いていればご案内できます', cx, y, `400 40px ${BODY}`, C.muted, 1);
  y += 66;
  center(ctx, 'DM または プロフィールのリンクから', cx, y, `400 40px ${BODY}`, C.muted, 1);

  /* 下端の署名。安全領域の内側に置く */
  center(ctx, SALON.name, cx, SAFE_BOTTOM - 20,
         `400 34px ${BODY}`, C.muted, 4);
}

function center(ctx, textValue, cx, y, font, color, spacing = 0) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  const chars = [...String(textValue)];
  const width = chars.reduce((w, ch) => w + ctx.measureText(ch).width + spacing, 0) - spacing;
  let x = cx - width / 2;
  for (const ch of chars) {
    ctx.fillText(ch, x, y);
    x += ctx.measureText(ch).width + spacing;
  }
}

function groupDates(list) {
  const m = new Map();
  list.forEach((s) => m.set(s.date, [...(m.get(s.date) ?? []), s]));
  return [...m.entries()];
}

function rule(ctx, cx, y, half) {
  ctx.strokeStyle = C.rule;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - half, y);
  ctx.lineTo(cx + half, y);
  ctx.stroke();
}

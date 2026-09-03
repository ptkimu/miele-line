/**
 * Instagram ストーリーズ用の画像
 *
 * 文面をコピーして文字入れする手間をなくすため、画像そのものを作ります。
 * 枠そのものは載せますが、「LINEの方には先にお知らせ済み」を必ず入れます。
 * ここが抜けると、LINEに登録する理由が伝わりません。
 *
 * 描く処理は「文字列」で持っています。
 * スタッフ用ページ（Worker が組み立てるHTML）にそのまま埋め込む必要があり、
 * 同じコードを2か所に置きたくないためです。
 *   ブラウザ  … makeStory() で関数にして呼ぶ／ページに直接埋め込む
 *   Worker側  … 文字列のまま <script> に流し込むだけ（実行はしない）
 */

import { SALON } from './salon.js';

/* Instagram は上下におよそ 250px ぶんの操作領域が重なるため、
   大事な要素はこの範囲に収める */
export const STORY_SRC = `
const STORY_W = 1080;
const STORY_H = 1920;
const SAFE_TOP = 300;
const SAFE_BOTTOM = 1660;
const SALON_NAME = ${JSON.stringify(SALON.name)};
const STORY_WD = ${JSON.stringify(['日', '月', '火', '水', '木', '金', '土'])};

const C = {
  ground: '#FAF7F5',
  ink: '#2B2724',
  muted: '#8B7F79',
  accent: '#98543F',
  rule: '#E0D2CA'
};

const DISPLAY = '"Zen Kaku Gothic New","Hiragino Kaku Gothic ProN","Yu Gothic Medium",sans-serif';
const BODY = '"Noto Sans JP","Hiragino Kaku Gothic ProN","Yu Gothic Medium",sans-serif';

/** 2026-09-03 → 9月3日（木） */
function stDate(ymd) {
  const d = new Date(Date.parse(ymd + 'T00:00:00Z'));
  return (d.getUTCMonth() + 1) + '月' + d.getUTCDate() + '日（' + STORY_WD[d.getUTCDay()] + '）';
}

/** 枠に入っているメニュー。1つだけの古い形も読む */
function stMenus(s) {
  if (Array.isArray(s && s.menus)) return s.menus.filter(Boolean);
  return (s && s.menu) ? [s.menu] : [];
}

function stCenter(ctx, textValue, cx, y, font, color, spacing) {
  spacing = spacing || 0;
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  const chars = Array.from(String(textValue));
  let width = -spacing;
  for (const ch of chars) width += ctx.measureText(ch).width + spacing;
  let x = cx - width / 2;
  for (const ch of chars) {
    ctx.fillText(ch, x, y);
    x += ctx.measureText(ch).width + spacing;
  }
}

function stRule(ctx, cx, y, half) {
  ctx.strokeStyle = C.rule;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - half, y);
  ctx.lineTo(cx + half, y);
  ctx.stroke();
}

function stGroup(list) {
  const m = new Map();
  for (const s of list) m.set(s.date, (m.get(s.date) || []).concat([s]));
  return Array.from(m.entries());
}

/**
 * @param {CanvasRenderingContext2D} ctx  1080×1920 のコンテキスト
 * @param {object[]} slots  空き枠
 * @param {object} [opts]   today / delayMinutes
 */
function drawStory(ctx, slots, opts) {
  opts = opts || {};
  const list = (slots || []).slice().sort(function (a, b) {
    return String(a.date + a.time).localeCompare(String(b.date + b.time));
  });
  const today = opts.today || null;
  const delay = opts.delayMinutes == null ? 30 : opts.delayMinutes;

  ctx.clearRect(0, 0, STORY_W, STORY_H);
  ctx.fillStyle = C.ground;
  ctx.fillRect(0, 0, STORY_W, STORY_H);

  /* 上下の帯。写真を敷かなくても締まって見える */
  ctx.fillStyle = C.accent;
  ctx.fillRect(0, 0, STORY_W, 14);
  ctx.fillRect(0, STORY_H - 14, STORY_W, 14);

  const cx = STORY_W / 2;
  let y = SAFE_TOP;

  stCenter(ctx, 'MIELE', cx, y, '700 40px ' + DISPLAY, C.accent, 16);
  y += 70;
  stRule(ctx, cx, y, 120);
  y += 90;

  stCenter(ctx, list.length === 1 ? 'OPEN SLOT' : 'OPEN SLOTS', cx, y,
           '700 34px ' + DISPLAY, C.accent, 10);
  y += 110;

  if (list.length === 1) {
    const s = list[0];
    const when = (today && s.date === today) ? '本日' : stDate(s.date);
    stCenter(ctx, when, cx, y, '500 56px ' + BODY, C.ink, 2);
    y += 130;
    stCenter(ctx, s.time, cx, y, '700 168px ' + DISPLAY, C.ink, 2);
    y += 190;
    /* メニューが複数なら、画像は先頭だけにして「ほか◯件」と添える。
       ストーリーズは一瞬しか見られないので、詰め込まない */
    const menus = stMenus(s);
    if (menus.length) {
      stCenter(ctx, menus[0], cx, y, '400 40px ' + BODY, C.muted, 1);
      y += 58;
      if (menus.length > 1) {
        stCenter(ctx, 'ほか ' + (menus.length - 1) + ' メニューも可', cx, y,
                 '400 34px ' + BODY, C.muted, 1);
        y += 46;
      }
    }
    y += 32;
  } else {
    /* 同じ日は1行にまとめる。「9月3日（木） 11:00 / 14:30」のように出す */
    const groups = stGroup(list);
    const big = groups.length >= 3 ? 76 : 96;
    for (const g of groups) {
      stCenter(ctx, stDate(g[0]), cx, y, '400 38px ' + BODY, C.muted, 1);
      y += 60;
      stCenter(ctx, g[1].map(function (s) { return s.time; }).join('  /  '), cx, y,
               '700 ' + big + 'px ' + DISPLAY, C.ink, 2);
      y += big + 26;
    }
    y += 20;
  }

  y = Math.max(y, 1120);
  stRule(ctx, cx, y, 220);
  y += 96;

  stCenter(ctx, 'LINEの方には', cx, y, '500 48px ' + BODY, C.ink, 2);
  y += 74;
  stCenter(ctx, delay + '分前にお知らせ済みです', cx, y, '500 48px ' + BODY, C.ink, 2);
  y += 130;

  stCenter(ctx, 'まだ空いていればご案内できます', cx, y, '400 40px ' + BODY, C.muted, 1);
  y += 66;
  stCenter(ctx, 'DM または プロフィールのリンクから', cx, y, '400 40px ' + BODY, C.muted, 1);

  /* 下端の署名。安全領域の内側に置く */
  stCenter(ctx, SALON_NAME, cx, SAFE_BOTTOM - 20, '400 34px ' + BODY, C.muted, 4);
}
`;

/**
 * ブラウザで使うときに、上の文字列から関数を取り出す。
 * Worker では呼びません（Workers は new Function を許していません）。
 */
export const makeStory = () =>
  new Function(STORY_SRC + '\nreturn { STORY_W, STORY_H, drawStory };')();

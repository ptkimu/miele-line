/**
 * リッチメニューの画像
 *
 * Canvas に描くので、ブラウザ上で文字を変えてその場で作り直せます。
 * 画像とキーワードの定義は menu.js の1か所にまとまっています。
 */

import { ICONS } from './menu.js';

const RM = {
  ground: '#FAF7F5',
  ink: '#2B2724',
  muted: '#8B7F79',
  accent: '#98543F',
  rule: '#E7DBD4',
  onLead: '#FFFFFF',
  onLeadSub: '#EBD6CD'
};

const RM_DISPLAY = '"Zen Kaku Gothic New","Hiragino Kaku Gothic ProN","Yu Gothic Medium",sans-serif';
const RM_BODY = '"Noto Sans JP","Hiragino Kaku Gothic ProN","Yu Gothic Medium",sans-serif';

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object[]} cells   ボタン（label / sub / icon / lead / badge）
 * @param {object} layout    { w, h, cols, rows }
 */
export function drawRichMenu(ctx, cells, layout) {
  const { w, h, cols, rows } = layout;
  const cw = w / cols;
  const ch = h / rows;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = RM.ground;
  ctx.fillRect(0, 0, w, h);

  /* 1マスの高さで、文字とアイコンの大きさを決める。
     小さいレイアウトでも詰まって見えないようにする */
  const s = Math.min(cw / 833, ch / 843);
  const iconSize = 150 * s;
  const labelSize = Math.max(38, 74 * s);
  const subSize = Math.max(24, 40 * s);
  const gap = 44 * s;

  cells.forEach((cell, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = col * cw;
    const y = row * ch;
    const lead = !!cell.lead;

    if (lead) {
      ctx.fillStyle = RM.accent;
      ctx.fillRect(x, y, cw, ch);
    }

    /* 区切り線。外周には引かない */
    ctx.strokeStyle = lead ? RM.accent : RM.rule;
    ctx.lineWidth = 3;
    if (col < cols - 1) rmLine(ctx, x + cw, y, x + cw, y + ch);
    if (row < rows - 1) rmLine(ctx, x, y + ch, x + cw, y + ch);

    const hasSub = !!cell.sub;
    const blockH = iconSize + gap + labelSize + (hasSub ? gap * 0.5 + subSize : 0);
    let cy = y + (ch - blockH) / 2;

    if (cell.icon && ICONS[cell.icon]) {
      drawIcon(ctx, ICONS[cell.icon], x + cw / 2, cy, iconSize, lead ? RM.onLead : RM.accent);
      cy += iconSize + gap;
    }

    rmCenter(ctx, cell.label ?? '', x + cw / 2, cy + labelSize * 0.78,
           `700 ${labelSize}px ${RM_DISPLAY}`, lead ? RM.onLead : RM.ink, labelSize * 0.02);

    if (hasSub) {
      cy += labelSize + gap * 0.5;
      rmCenter(ctx, cell.sub, x + cw / 2, cy + subSize * 0.78,
             `500 ${subSize}px ${RM_BODY}`, lead ? RM.onLeadSub : RM.muted, subSize * 0.04);
    }

    if (cell.badge) {
      badge(ctx, cell.badge, x + cw - 56 * s, y + 52 * s, s, lead);
    }
  });
}

function rmLine(ctx, x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function drawIcon(ctx, pathData, cx, top, size, color) {
  const p = new Path2D(pathData);
  ctx.save();
  ctx.translate(cx - size / 2, top);
  ctx.scale(size / 100, size / 100);
  ctx.strokeStyle = color;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke(p);
  ctx.restore();
}

/** 字間を空けて中央に置く。日本語は1文字ずつ測る */
function rmCenter(ctx, textValue, cx, baseline, font, color, spacing = 0) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  const chars = [...String(textValue)];
  if (!chars.length) return;
  const width = chars.reduce((n, ch) => n + ctx.measureText(ch).width + spacing, 0) - spacing;
  let x = cx - width / 2;
  for (const ch of chars) {
    ctx.fillText(ch, x, baseline);
    x += ctx.measureText(ch).width + spacing;
  }
}

function badge(ctx, label, right, top, s, lead) {
  const font = `700 ${32 * s}px ${RM_DISPLAY}`;
  ctx.font = font;
  const padX = 26 * s;
  const w = ctx.measureText(label).width + padX * 2;
  const h = 52 * s;
  const x = right - w;

  ctx.fillStyle = lead ? '#FFFFFF' : RM.accent;
  roundRect(ctx, x, top, w, h, h / 2);
  ctx.fill();

  ctx.fillStyle = lead ? RM.accent : '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, top + h / 2 + 1);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

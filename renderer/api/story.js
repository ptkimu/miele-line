/**
 * ストーリーズ画像を作るだけの小さな置き場（Vercel）
 *
 * なぜ分けているか：
 *   Cloudflare Workers には絵を描く仕組みがありません。
 *   Instagram のストーリーズは「公開URLにある JPEG」しか受け取れないため、
 *   画像を作って返す場所だけ、外に置いています。
 *
 * 使い方：
 *   このフォルダ（renderer/）を Vercel にデプロイし、
 *   発行された https://＜アプリ名＞.vercel.app/api/story を
 *   Workers の STORY_IMAGE_URL に登録してください。
 *
 *   npm i @vercel/og sharp
 *
 * 呼ばれ方：
 *   /api/story?d=＜base64url の JSON＞
 *   JSON は { slots:[{date,time,minutes,menus}], today, delay, salon }
 *
 * 中身は src/story.js と同じ見た目に合わせてあります。
 * 変えるときは両方を直してください（描き方の仕組みが違うため、
 * 1つにまとめられません）。
 */

import { ImageResponse } from '@vercel/og';
import sharp from 'sharp';

export const config = { runtime: 'nodejs' };

const W = 1080;
const H = 1920;
const C = {
  ground: '#FAF7F5',
  ink: '#2B2724',
  muted: '#8B7F79',
  accent: '#98543F',
  rule: '#E0D2CA'
};
const WD = ['日', '月', '火', '水', '木', '金', '土'];

const fmtDate = (ymd) => {
  const d = new Date(Date.parse(ymd + 'T00:00:00Z'));
  return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日（${WD[d.getUTCDay()]}）`;
};

function decode(d) {
  const b64 = String(d).replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
}

export default async function handler(req) {
  const url = new URL(req.url, 'https://x');
  let data;
  try {
    data = decode(url.searchParams.get('d'));
  } catch {
    return new Response('bad request', { status: 400 });
  }

  const slots = [...(data.slots ?? [])].sort((a, b) =>
    String(a.date + a.time).localeCompare(String(b.date + b.time))
  );
  const delay = data.delay ?? 30;
  const salon = data.salon ?? '';
  const today = data.today ?? null;

  /* 同じ日は1行にまとめる */
  const groups = [];
  for (const s of slots) {
    const last = groups[groups.length - 1];
    if (last && last.date === s.date) last.times.push(s.time);
    else groups.push({ date: s.date, times: [s.time], menus: s.menus ?? [] });
  }

  const one = slots.length === 1;
  const big = groups.length >= 3 ? 76 : 96;

  const png = await new ImageResponse(
    {
      type: 'div',
      props: {
        style: {
          width: W, height: H, background: C.ground, display: 'flex',
          flexDirection: 'column', alignItems: 'center',
          paddingTop: 300, paddingBottom: 260, borderTop: `14px solid ${C.accent}`,
          borderBottom: `14px solid ${C.accent}`, fontFamily: 'sans-serif'
        },
        children: [
          txt('MIELE', { fontSize: 40, fontWeight: 700, color: C.accent, letterSpacing: 16 }),
          rule(120, 40),
          txt(one ? 'OPEN SLOT' : 'OPEN SLOTS',
              { fontSize: 34, fontWeight: 700, color: C.accent, letterSpacing: 10, marginBottom: 50 }),

          one
            ? group([
                txt(today && slots[0].date === today ? '本日' : fmtDate(slots[0].date),
                    { fontSize: 56, color: C.ink, marginBottom: 40 }),
                txt(slots[0].time, { fontSize: 168, fontWeight: 700, color: C.ink }),
                ...(slots[0].menus?.length
                  ? [txt(slots[0].menus[0], { fontSize: 40, color: C.muted, marginTop: 30 })]
                  : []),
                ...(slots[0].menus?.length > 1
                  ? [txt(`ほか ${slots[0].menus.length - 1} メニューも可`,
                         { fontSize: 34, color: C.muted, marginTop: 12 })]
                  : [])
              ])
            : group(groups.flatMap((g) => [
                txt(fmtDate(g.date), { fontSize: 38, color: C.muted, marginTop: 20 }),
                txt(g.times.join('  /  '), { fontSize: big, fontWeight: 700, color: C.ink })
              ])),

          rule(220, 60),
          txt('LINEの方には', { fontSize: 48, color: C.ink, marginTop: 40 }),
          txt(`${delay}分前にお知らせ済みです`, { fontSize: 48, color: C.ink, marginBottom: 60 }),
          txt('まだ空いていればご案内できます', { fontSize: 40, color: C.muted }),
          txt('DM または プロフィールのリンクから', { fontSize: 40, color: C.muted }),
          txt(salon, { fontSize: 34, color: C.muted, marginTop: 'auto', letterSpacing: 4 })
        ]
      }
    },
    { width: W, height: H }
  ).arrayBuffer();

  /* Instagram は JPEG しか受け取らないので変換する */
  const jpeg = await sharp(Buffer.from(png)).jpeg({ quality: 88 }).toBuffer();

  return new Response(jpeg, {
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=3600'
    }
  });
}

const txt = (children, style) => ({
  type: 'div',
  props: { style: { display: 'flex', ...style }, children: String(children) }
});

const group = (children) => ({
  type: 'div',
  props: { style: { display: 'flex', flexDirection: 'column', alignItems: 'center' }, children }
});

const rule = (half, margin) => ({
  type: 'div',
  props: {
    style: {
      width: half * 2, height: 2, background: C.rule,
      marginTop: margin, marginBottom: margin, display: 'flex'
    }
  }
});

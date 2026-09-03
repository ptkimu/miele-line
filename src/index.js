/**
 * ミエーレ 空き枠のお知らせ
 *
 * お客様からの受信（Webhook）、スタッフ用ページ、
 * 送信日の朝の通知（cron）の3つが入口です。
 *
 * 通数を消費するのは、スタッフが画面から送る空き枠と、
 * 送信日の朝のスタッフ宛の通知だけです。
 */

import { verifySignature } from './line.js';
import { handleEvent } from './handlers.js';
import { adminRequest } from './admin.js';
import { appRequest } from './app.js';
import { apiRequest, sweepIntake } from './api.js';
import { remindStaff } from './openslot.js';
import { runAuto, autoSummary } from './auto.js';
import { publishDue, serveMedia, sweepMedia } from './social.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/line/webhook') {
      if (request.method !== 'POST') return new Response('method not allowed', { status: 405 });
      return webhook(request, env, ctx);
    }

    if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) {
      return adminRequest(request, env, url);
    }

    /* LINEの中で開くページ（コース診断・メニュー・問診表・アクセス・空き枠の設定） */
    if (url.pathname.startsWith('/app/')) {
      return appRequest(request, env, url);
    }

    /* そのページから届く問い合わせ。IDトークンで本人確認をしてから処理する */
    if (url.pathname.startsWith('/api/')) {
      return apiRequest(request, env, url);
    }

    /* スタッフの画面で作った画像。Instagram は「公開URLにある画像」しか
       受け取れないため、ここから読めるようにしている */
    if (url.pathname.startsWith('/media/')) {
      return serveMedia(env, url.pathname.slice('/media/'.length));
    }

    if (url.pathname === '/health') {
      return new Response('ok', { headers: { 'Content-Type': 'text/plain' } });
    }

    return new Response('not found', { status: 404 });
  },

  /**
   * 時間で動くもの。
   *   毎朝10時（JST）  空き枠を自動で出す／問診表の掃除
   *   10分おき        時間が来た Instagram・Google の投稿を出す
   */
  async scheduled(event, env, ctx) {
    const daily = event.cron === '0 1 * * *';

    if (daily) {
      /* カレンダーを見て、空き枠のお知らせを出すところまで自動で行う。
         出さない時間はカレンダーに予定として入れておく約束。 */
      ctx.waitUntil(
        runAuto(env)
          .then((r) => console.log('auto slot', autoSummary(r)))
          .catch((err) => console.error('auto slot failed', err))
      );

      /* カレンダーが未設定のときの保険。送信日の朝、スタッフに声をかける */
      ctx.waitUntil(
        remindStaff(env)
          .then((r) => console.log('staff reminder', JSON.stringify(r.skipped ?? { sent: r.sent })))
          .catch((err) => console.error('staff reminder failed', err))
      );

      /* 期限の切れた問診表と、使い終わった画像を消す */
      ctx.waitUntil(
        Promise.all([sweepIntake(env), sweepMedia(env)])
          .then((r) => console.log('sweep', JSON.stringify(r)))
          .catch((err) => console.error('sweep failed', err))
      );
      return;
    }

    /* 30分あけてから Instagram・Google に出す。10分おきに見に来る */
    ctx.waitUntil(
      publishDue(env)
        .then((r) => { if (r.results.length) console.log('social', JSON.stringify(r)); })
        .catch((err) => console.error('social failed', err))
    );
  }
};


async function webhook(request, env, ctx) {
  // 署名検証は JSON.parse する前の生ボディに対して行う
  const rawBody = await request.text();
  const ok = await verifySignature(
    env.CHANNEL_SECRET,
    rawBody,
    request.headers.get('x-line-signature')
  );
  if (!ok) return new Response('invalid signature', { status: 401 });

  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new Response('invalid json', { status: 400 });
  }

  const events = Array.isArray(body.events) ? body.events : [];

  // LINE には即座に 200 を返す。処理が遅いと再送されるため、
  // 実際の処理はレスポンスを返したあとに続行する。
  // 1件が失敗しても他のイベントを巻き込まないよう、個別に握りつぶす。
  ctx.waitUntil(
    Promise.all(
      events.map((event) =>
        handleEvent(env, event).catch((err) =>
          console.error('handleEvent failed', event.type, err)
        )
      )
    )
  );

  return new Response('ok');
}

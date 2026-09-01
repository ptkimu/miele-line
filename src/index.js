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
import { remindStaff } from './openslot.js';

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

    if (url.pathname === '/health') {
      return new Response('ok', { headers: { 'Content-Type': 'text/plain' } });
    }

    return new Response('not found', { status: 404 });
  },

  /**
   * 毎朝10時（JST）。送信日かどうかを見て、その日だけスタッフに声をかける。
   */
  async scheduled(event, env, ctx) {
    /* 空き枠のお知らせの日だけ、スタッフに声をかける。
       どの枠を出すかは人が決めるので、送信そのものは自動化しない。 */
    ctx.waitUntil(
      remindStaff(env)
        .then((r) => console.log('staff reminder', JSON.stringify(r.skipped ?? { sent: r.sent })))
        .catch((err) => console.error('staff reminder failed', err))
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

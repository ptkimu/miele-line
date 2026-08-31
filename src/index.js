/**
 * ミエーレ LINE配信システム / フェーズ1
 *
 * この段階では通数を1通も消費しません。
 * 送信に使っているのは応答メッセージ（Reply API）だけです。
 */

import { verifySignature } from './line.js';
import { handleEvent } from './handlers.js';
import { adminRequest } from './admin.js';

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

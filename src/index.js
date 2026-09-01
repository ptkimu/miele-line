/**
 * ミエーレ LINE配信システム / フェーズ1
 *
 * この段階では通数を1通も消費しません。
 * 送信に使っているのは応答メッセージ（Reply API）だけです。
 */

import { verifySignature } from './line.js';
import { handleEvent } from './handlers.js';
import { adminRequest } from './admin.js';
import { diagnosisRequest } from './api.js';
import { runDailyDelivery } from './delivery.js';
import { remindStaff } from './openslot.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/line/webhook') {
      if (request.method !== 'POST') return new Response('method not allowed', { status: 405 });
      return webhook(request, env, ctx);
    }

    if (url.pathname === '/api/diagnosis') {
      if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));
      if (request.method !== 'POST') return new Response('method not allowed', { status: 405 });
      return cors(await diagnosisRequest(request, env));
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
   * 毎朝10時（JST）の定時バッチ。
   * 通数を消費する唯一の入口で、必ず通数ガードを通ります。
   */
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      runDailyDelivery(env)
        .then((report) => {
          console.log('daily delivery', JSON.stringify({
            today: report.today,
            planned: report.planned,
            sent: report.sent,
            stopped: report.stopped ?? null,
            remaining: report.quota.remaining
          }));
        })
        .catch((err) => console.error('daily delivery failed', err))
    );

    /* 空き枠のお知らせの日だけ、スタッフに声をかける。
       どの枠を出すかは人が決めるので、送信そのものは自動化しない。 */
    ctx.waitUntil(
      remindStaff(env)
        .then((r) => console.log('staff reminder', JSON.stringify(r.skipped ?? { sent: r.sent })))
        .catch((err) => console.error('staff reminder failed', err))
    );
  }
};

/** 診断ツールは別ドメインに置くため、ブラウザからの呼び出しを許可する */
function cors(res) {
  const headers = new Headers(res.headers);
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type');
  return new Response(res.body, { status: res.status, headers });
}

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

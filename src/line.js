/**
 * LINE Messaging API クライアント
 *
 * 通数について：
 *   reply()   応答メッセージ。通数を消費しない。フェーズ1で使うのはこちらだけ。
 *   push()    プッシュ配信。通数を消費する。フェーズ3の通数ガードを通してから使う。
 */

const API = 'https://api.line.me/v2/bot';

/* ------------------------------------------------------------------ *
 * 署名検証
 * ------------------------------------------------------------------ */

/**
 * LINE から送られてきたリクエストであることを検証する。
 * ボディは JSON.parse する前の生の文字列で渡すこと。
 */
export async function verifySignature(channelSecret, rawBody, signature) {
  if (!channelSecret || !signature) return false;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(channelSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(rawBody));
  return safeEqual(toBase64(new Uint8Array(mac)), signature);
}

function toBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

/** 比較にかかる時間の差から署名を推測されないよう、長さに関わらず全桁を比較する */
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* ------------------------------------------------------------------ *
 * メッセージ送信
 * ------------------------------------------------------------------ */

/** 応答メッセージ。通数を消費しない */
export function reply(env, replyToken, messages) {
  return call(env, '/message/reply', {
    replyToken,
    messages: messages.slice(0, 5) // 1回に送れるのは5件まで
  });
}

/**
 * プッシュ配信。通数を消費する。
 * フェーズ3で通数ガードを実装するまで、この関数はどこからも呼ばない。
 */
export function push(env, to, messages) {
  return call(env, '/message/push', { to, messages: messages.slice(0, 5) });
}

/** 友だちのプロフィール。ブロック済みなどで取得できないことがあるので null を許容する */
export async function getProfile(env, userId) {
  try {
    const res = await fetch(`${API}/profile/${userId}`, {
      headers: { Authorization: `Bearer ${env.CHANNEL_ACCESS_TOKEN}` }
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error('getProfile failed', err);
    return null;
  }
}

/** 今月の通数の上限と消費量。フェーズ3の通数ガードで使う */
export async function getQuota(env) {
  const headers = { Authorization: `Bearer ${env.CHANNEL_ACCESS_TOKEN}` };
  const [limit, used] = await Promise.all([
    fetch(`${API}/message/quota`, { headers }).then((r) => r.json()),
    fetch(`${API}/message/quota/consumption`, { headers }).then((r) => r.json())
  ]);
  return {
    limit: limit.type === 'limited' ? limit.value : Infinity,
    used: used.totalUsage ?? 0
  };
}

async function call(env, path, body) {
  const res = await fetch(API + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.CHANNEL_ACCESS_TOKEN}`
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    console.error('LINE API error', path, res.status, await res.text());
  }
  return res.ok;
}

/* ------------------------------------------------------------------ *
 * メッセージオブジェクト
 * ------------------------------------------------------------------ */

export const text = (t) => ({ type: 'text', text: t });

/** メッセージの下に出るボタン。タップしても通数は消費しない */
export const withButtons = (message, items) => ({ ...message, quickReply: { items } });

export const button = (label, data, displayText) => ({
  type: 'action',
  action: { type: 'postback', label, data, displayText: displayText ?? label }
});

/**
 * LIFF（LINEの中で開くページ）から届いた「どなたか」を確かめる
 *
 * ページ側の JavaScript は誰でも書き換えられるので、
 * 「私は○○です」と言われた内容をそのまま信じることはできません。
 * LIFF が発行する IDトークンを LINE に問い合わせて、本物か確かめます。
 *
 * LINEヤフーは LIFF を LINEミニアプリに統合する方針を示していますが、
 * 確かめ方はどちらも同じ（IDトークンの検証）なので、
 * ミニアプリへ移した後もこのファイルはそのまま使えます。
 */

const VERIFY_URL = 'https://api.line.me/oauth2/v2.1/verify';

/**
 * IDトークンからユーザーIDを取り出す。
 * 偽物・期限切れ・別のチャネル宛のものは null を返します。
 *
 * @returns {Promise<{userId:string, name:string|null}|null>}
 */
export async function verifyIdToken(env, idToken) {
  if (!idToken || !env.LIFF_CHANNEL_ID) return null;

  const res = await fetch(VERIFY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ id_token: idToken, client_id: env.LIFF_CHANNEL_ID })
  });
  if (!res.ok) return null;

  const claim = await res.json();
  /* aud（宛先）が自分のチャネルであることまで見る。
     LINEが検証してくれる範囲だが、設定を取り違えたときに気づけるようにしておく */
  if (!claim?.sub || (claim.aud && claim.aud !== env.LIFF_CHANNEL_ID)) return null;

  return { userId: claim.sub, name: claim.name ?? null };
}

/** 各ページに渡す設定。LIFF ID はページに出てよい値です */
export const liffConfig = (env) => ({
  liffId: env.LIFF_ID ?? '',
  ready: !!env.LIFF_ID && !!env.LIFF_CHANNEL_ID
});

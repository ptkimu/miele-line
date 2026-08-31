/**
 * スタッフ用ページ（Basic認証）
 *
 * 会計後に、その日来店されたお客様を名前で探してボタンを押すだけ。
 * スマホでの操作を前提にしています。
 *
 * なぜ管理ページが必要か：
 *   LINEのWebhookに届くのは「お客様から届いたメッセージ」だけで、
 *   スタッフが管理画面から送った返信はイベントとして飛んできません。
 *   そのため、来店の記録はLINEのトーク上では行えません。
 */

import { todayJst, nowIso } from './handlers.js';

const REMIND_AFTER_DAYS = 11; // 2〜3週サイクルの手前で声をかける想定

export async function adminRequest(request, env, url) {
  if (!checkAuth(request, env)) {
    return new Response('認証が必要です', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="miele-line", charset="UTF-8"' }
    });
  }

  if (url.pathname === '/admin/visit' && request.method === 'POST') {
    return recordVisit(request, env);
  }
  if (url.pathname === '/admin/questions') {
    return questionsPage(env);
  }
  return listPage(env, url.searchParams.get('q') ?? '');
}

/* ------------------------------------------------------------------ *
 * 来店の記録
 * ------------------------------------------------------------------ */

async function recordVisit(request, env) {
  const form = await request.formData();
  const userId = String(form.get('user_id') ?? '');
  const booked = form.get('next_booked') === '1' ? 1 : 0;
  const back = String(form.get('q') ?? '');
  const today = todayJst();

  if (userId) {
    // 同じ人の同じ日は UNIQUE 制約で二重に入らない。押し間違いは上書きで直せる
    await env.DB.prepare(
      `INSERT INTO visits (line_user_id, visited_on, next_booked, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(line_user_id, visited_on)
       DO UPDATE SET next_booked = excluded.next_booked`
    )
      .bind(userId, today, booked, nowIso())
      .run();

    await env.DB.prepare(
      'UPDATE customers SET last_visit_at = ?, next_booked = ? WHERE line_user_id = ?'
    )
      .bind(today, booked, userId)
      .run();
  }

  return new Response(null, {
    status: 303,
    headers: { Location: '/admin' + (back ? '?q=' + encodeURIComponent(back) : '') }
  });
}

/* ------------------------------------------------------------------ *
 * 一覧
 * ------------------------------------------------------------------ */

async function listPage(env, q) {
  const today = todayJst();

  const stats = await env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM customers WHERE status = 'active')      AS friends,
       (SELECT COUNT(*) FROM customers WHERE status = 'blocked')     AS blocked,
       (SELECT COUNT(*) FROM visits    WHERE visited_on = ?)         AS today_visits`
  )
    .bind(today)
    .first();

  const rows = q
    ? await env.DB.prepare(
        `SELECT line_user_id, display_name, last_visit_at, next_booked
           FROM customers
          WHERE status = 'active' AND display_name LIKE ?
          ORDER BY (last_visit_at IS NULL), last_visit_at DESC, followed_at DESC
          LIMIT 60`
      )
        .bind('%' + q + '%')
        .all()
    : await env.DB.prepare(
        `SELECT line_user_id, display_name, last_visit_at, next_booked
           FROM customers
          WHERE status = 'active'
          ORDER BY followed_at DESC
          LIMIT 40`
      ).all();

  const cards = (rows.results ?? []).map((c) => customerCard(c, today, q)).join('');

  return html(`
    <header>
      <h1>ミエーレ スタッフ用</h1>
      <p class="date">${esc(today)}</p>
    </header>

    <dl class="stats">
      <div><dt>友だち</dt><dd>${stats?.friends ?? 0}</dd></div>
      <div><dt>本日の記録</dt><dd>${stats?.today_visits ?? 0}</dd></div>
      <div><dt>ブロック</dt><dd>${stats?.blocked ?? 0}</dd></div>
    </dl>

    <form class="search" method="get" action="/admin">
      <input type="search" name="q" value="${esc(q)}" placeholder="お名前で検索" autocomplete="off">
      <button type="submit">検索</button>
    </form>

    <p class="hint">会計のあとに、来店されたお客様のボタンを押してください。<br>
    次回予約が取れた方は「予約あり」、取れなかった方は「未予約」です。<br>
    未予約の方にだけ、後日おすすめのタイミングでご案内が届くようになります（フェーズ3で稼働）。</p>

    ${cards || '<p class="empty">該当する方が見つかりませんでした。</p>'}

    <p class="foot"><a href="/admin/questions">自動応答できていない質問を見る</a></p>
  `);
}

function customerCard(c, today, q) {
  const days = c.last_visit_at ? daysBetween(c.last_visit_at, today) : null;
  const isToday = c.last_visit_at === today;

  let state = '<span class="tag tag--none">来店記録なし</span>';
  if (isToday) {
    state = c.next_booked
      ? '<span class="tag tag--ok">本日記録済み・予約あり</span>'
      : '<span class="tag tag--wait">本日記録済み・未予約</span>';
  } else if (c.last_visit_at) {
    const due = !c.next_booked && days >= REMIND_AFTER_DAYS;
    state =
      `<span class="tag ${due ? 'tag--due' : 'tag--past'}">` +
      `前回 ${esc(c.last_visit_at)}・${days}日前` +
      (c.next_booked ? '・予約あり' : '・未予約') +
      '</span>';
  }

  return `
    <article class="card${isToday ? ' card--done' : ''}">
      <h2>${esc(c.display_name || '(表示名なし)')}</h2>
      <div class="state">${state}</div>
      <form method="post" action="/admin/visit">
        <input type="hidden" name="user_id" value="${esc(c.line_user_id)}">
        <input type="hidden" name="q" value="${esc(q)}">
        <button type="submit" name="next_booked" value="1" class="b b--ok">来店・予約あり</button>
        <button type="submit" name="next_booked" value="0" class="b b--wait">来店・未予約</button>
      </form>
    </article>`;
}

/* ------------------------------------------------------------------ *
 * 自動応答できていない質問
 * ------------------------------------------------------------------ */

async function questionsPage(env) {
  const rows = await env.DB.prepare(
    `SELECT body, COUNT(*) AS n, MAX(created_at) AS latest
       FROM inbound_messages
      WHERE matched IS NULL
      GROUP BY body
      ORDER BY n DESC, latest DESC
      LIMIT 50`
  ).all();

  const items = (rows.results ?? [])
    .map((r) => `<li><b>${r.n}回</b> ${esc(r.body ?? '')}</li>`)
    .join('');

  return html(`
    <header>
      <h1>自動応答できていない質問</h1>
      <p class="date">よく聞かれるものは、キーワード応答に追加できます</p>
    </header>
    <ul class="qs">${items || '<li class="empty">まだありません。</li>'}</ul>
    <p class="foot"><a href="/admin">一覧に戻る</a></p>
  `);
}

/* ------------------------------------------------------------------ *
 * 認証・共通
 * ------------------------------------------------------------------ */

function checkAuth(request, env) {
  const header = request.headers.get('Authorization') ?? '';
  if (!header.startsWith('Basic ')) return false;

  let decoded;
  try {
    decoded = atob(header.slice(6));
  } catch {
    return false;
  }
  const i = decoded.indexOf(':');
  if (i < 0) return false;

  return (
    safeEqual(decoded.slice(0, i), env.ADMIN_USER ?? '') &&
    safeEqual(decoded.slice(i + 1), env.ADMIN_PASS ?? '')
  );
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function daysBetween(fromYmd, toYmd) {
  const ms = Date.parse(toYmd + 'T00:00:00Z') - Date.parse(fromYmd + 'T00:00:00Z');
  return Math.max(0, Math.round(ms / 86400000));
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function html(inner) {
  return new Response(
    `<!doctype html><html lang="ja"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>ミエーレ スタッフ用</title>
<style>
  :root{--bg:#FAF7F5;--card:#fff;--ink:#2B2724;--sub:#8B7F79;--line:#E7DBD4;
        --accent:#98543F;--ok:#1F7A4C;--wait:#8E6415;--due:#A73A2A}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);font-size:15px;line-height:1.7;
       font-family:"Hiragino Kaku Gothic ProN","Yu Gothic Medium",system-ui,sans-serif}
  .app{max-width:560px;margin:0 auto;padding:20px 16px 60px}
  header{border-bottom:1px solid var(--line);padding-bottom:14px;margin-bottom:18px}
  h1{font-size:18px;margin:0}
  .date{margin:2px 0 0;font-size:13px;color:var(--sub)}
  .stats{display:flex;gap:0;margin:0 0 18px;padding:0;border:1px solid var(--line);
         border-radius:10px;background:var(--card);overflow:hidden}
  .stats div{flex:1;padding:10px 12px;border-right:1px solid var(--line);text-align:center}
  .stats div:last-child{border-right:0}
  .stats dt{font-size:11px;color:var(--sub);margin:0}
  .stats dd{margin:0;font-size:20px;font-weight:700;font-variant-numeric:tabular-nums}
  .search{display:flex;gap:8px;margin:0 0 14px}
  .search input{flex:1;min-width:0;padding:11px 12px;border:1px solid var(--line);
                border-radius:9px;font:inherit;background:var(--card);color:inherit}
  .search button{padding:11px 16px;border:0;border-radius:9px;background:var(--accent);
                 color:#fff;font:inherit;font-weight:700}
  .hint{font-size:12.5px;color:var(--sub);margin:0 0 18px;line-height:1.75}
  .card{background:var(--card);border:1px solid var(--line);border-radius:12px;
        padding:14px 16px;margin-bottom:10px}
  .card--done{opacity:.55}
  .card h2{font-size:15.5px;margin:0 0 6px}
  .state{margin-bottom:10px}
  .tag{display:inline-block;font-size:11.5px;font-weight:700;padding:3px 9px;border-radius:99px}
  .tag--none{background:#F0E9E5;color:var(--sub)}
  .tag--past{background:#F0E9E5;color:var(--sub)}
  .tag--ok{background:#E4F1EA;color:var(--ok)}
  .tag--wait{background:#F7EFDF;color:var(--wait)}
  .tag--due{background:#FBE6E2;color:var(--due)}
  .card form{display:flex;gap:8px}
  .b{flex:1;padding:12px 8px;border:0;border-radius:9px;font:inherit;font-weight:700;
     font-size:13.5px;color:#fff}
  .b--ok{background:var(--ok)}
  .b--wait{background:var(--wait)}
  .qs{list-style:none;padding:0;margin:0}
  .qs li{background:var(--card);border:1px solid var(--line);border-radius:9px;
         padding:10px 14px;margin-bottom:8px;font-size:14px}
  .qs b{color:var(--accent);margin-right:8px;font-variant-numeric:tabular-nums}
  .empty{color:var(--sub);font-size:14px}
  .foot{margin-top:26px;font-size:13px}
  a{color:var(--accent)}
  @media (prefers-color-scheme:dark){
    :root{--bg:#1B1817;--card:#242020;--ink:#EFE8E4;--sub:#9C8F89;--line:#3A3331;
          --accent:#D9967C;--ok:#5CC98C;--wait:#DEAC57;--due:#E58775}
    .tag--none,.tag--past{background:#2F2A28}
    .tag--ok{background:#1C2C24}
    .tag--wait{background:#2E2619}
    .tag--due{background:#33211E}
    .b{color:#1B1817}
  }
</style></head><body><div class="app">${inner}</div></body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

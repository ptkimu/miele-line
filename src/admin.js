/**
 * スタッフ用ページ（Basic認証）
 *
 * 空き枠をお知らせするための画面です。ここでやることは3つだけ。
 *   1. 今日が送信日かどうかを見る
 *   2. サロンボードで見た空きを入力する
 *   3. 文面と人数を確かめてから送る
 *
 * ブラウザのホームページにこのURLを設定しておくと、
 * 店舗のパソコンを開いた時点で送信日かどうかが目に入ります。
 *
 * サロンボードから空きを自動で取る手段は公開されていません。
 * また「空いている」枠がすべて「出していい」枠とは限らない（移動・休憩・
 * あえて残している枠が混ざる）ため、どの枠を出すかは人が決めます。
 */

import { todayJst } from './handlers.js';
import {
  ROOMS,
  DURATIONS,
  WEEKDAYS,
  DEFAULT_SCHEDULE,
  MAX_PER_WEEK,
  INSTAGRAM_DELAY_MIN,
  isSendDay,
  nextSendDay,
  scheduleDates,
  weekdayOf,
  formatDate,
  recentSendCount,
  previewOpenSlot,
  sendOpenSlot
} from './openslot.js';
import { OPEN_SLOT_TAG } from './tags.js';

export async function adminRequest(request, env, url) {
  if (!checkAuth(request, env)) {
    return new Response('認証が必要です', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="miele-line", charset="UTF-8"' }
    });
  }

  if (url.pathname === '/admin/preview' && request.method === 'POST') {
    return previewPage(request, env);
  }
  if (url.pathname === '/admin/send' && request.method === 'POST') {
    return sendPage(request, env);
  }
  if (url.pathname === '/admin/questions') {
    return questionsPage(env);
  }
  return slotPage(env);
}

/* ------------------------------------------------------------------ *
 * 1. 入力
 * ------------------------------------------------------------------ */

async function slotPage(env) {
  const today = todayJst();
  const days = DEFAULT_SCHEDULE.days;
  const sendDay = isSendDay(today, days);
  const dates = scheduleDates(today);

  const stats = await env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM customers WHERE status = 'active') AS friends,
       (SELECT COUNT(*)
          FROM customer_tags ct
          JOIN tags t      ON t.id = ct.tag_id
          JOIN customers c ON c.line_user_id = ct.line_user_id
         WHERE t.name = ? AND c.status = 'active')              AS wants`
  )
    .bind(OPEN_SLOT_TAG)
    .first();

  const week = await recentSendCount(env, today);

  /* 送信日かどうかを、開いた瞬間に分かる大きさで出す。
     これが「送り忘れないための仕組み」の本体です */
  const banner = sendDay
    ? `<div class="banner banner--on">
         <b>本日は空き枠のお知らせの日です</b>
         <span>${esc(dates.map(formatDate).join('・'))} の空きをご確認ください</span>
       </div>`
    : `<div class="banner">
         <b>本日は送信日ではありません</b>
         <span>次は ${esc(WEEKDAYS[nextSendDay(today, days)])}曜日です。
         急な空きが出たときは、そのままお使いいただけます</span>
       </div>`;

  return admPage(`
    <header>
      <h1>空き枠のお知らせ</h1>
      <p class="date">${esc(today)}（${esc(WEEKDAYS[weekdayOf(today)])}）</p>
    </header>

    ${banner}

    <dl class="stats">
      <div><dt>友だち</dt><dd>${stats?.friends ?? 0}</dd></div>
      <div><dt>お知らせ希望</dt><dd>${stats?.wants ?? 0}</dd></div>
      <div><dt>直近7日の送信</dt><dd>${week}<small>/${MAX_PER_WEEK}</small></dd></div>
    </dl>

    <form method="post" action="/admin/preview" id="f">
      <section>
        <h2>1. どちらのお部屋ですか</h2>
        <div class="rooms">
          ${ROOMS.map(
            (r) => `<button type="button" class="room" data-room="${esc(r.id)}">
                      <b>${esc(r.label)}</b><span>${esc(r.note)}</span>
                    </button>`
          ).join('')}
        </div>
      </section>

      <section>
        <h2>2. 空いている枠</h2>
        <div id="rows"></div>
        <button type="button" id="add" class="ghost">＋ 枠を増やす</button>
      </section>

      <section>
        <h2>3. 送り方</h2>
        <label class="check">
          <input type="checkbox" name="narrow" value="1" checked>
          <span>そのお部屋を希望された方だけに送る<small>関係のない案内を減らせます</small></span>
        </label>
        <label class="check">
          <input type="checkbox" name="exclude_recent" value="1">
          <span>直近7日に受け取った方を外す<small>続けて届くのを避けます</small></span>
        </label>
        <label class="check check--warn">
          <input type="checkbox" name="everyone" value="1">
          <span>希望していない方にも送る<small>ブロックされやすくなります。稼働の直後だけにしてください</small></span>
        </label>
      </section>

      <input type="hidden" name="slots" id="slots">
      <button type="submit" class="primary">送る前に確認する</button>
    </form>

    <p class="foot"><a href="/admin/questions">自動応答できていない質問を見る</a></p>

    <script>
      const ROOMS = ${JSON.stringify(ROOMS)};
      const DURATIONS = ${JSON.stringify(DURATIONS)};
      const DATES = ${JSON.stringify(dates)};
      ${admClient}
    </script>
  `);
}

/* 入力欄の組み立て。枠の長さを変えると、収まらなくなったメニューは自動で外れる */
const admClient = `
  let room = ROOMS[0].id;
  let rows = [{ date: DATES[0], time: '', minutes: 60, menus: null }];

  const fits = (minutes) =>
    (ROOMS.find((r) => r.id === room)?.menus ?? []).filter((m) => m.minutes <= minutes);

  /* 既定のチェック。枠の長さぴったりのものを優先し、多くても3つまで。
     並べすぎると、お客様がどれを選べばよいか分からなくなります */
  function defaultMenus(minutes) {
    const f = fits(minutes);
    const exact = f.filter((m) => m.minutes === minutes);
    return (exact.length ? exact : f).slice(0, 3).map((m) => m.name);
  }

  function render() {
    document.querySelectorAll('.room').forEach((b) =>
      b.setAttribute('aria-pressed', String(b.dataset.room === room))
    );

    document.getElementById('rows').innerHTML = rows
      .map((s, i) => {
        const chosen = s.menus ?? defaultMenus(s.minutes);
        const picks = fits(s.minutes)
          .map(
            (m) =>
              '<label><input type="checkbox" data-i="' + i + '" data-menu="' + m.name + '"' +
              (chosen.includes(m.name) ? ' checked' : '') + '>' +
              '<span>' + m.name + '<small>' + m.minutes + '分</small></span></label>'
          )
          .join('');
        return (
          '<div class="row">' +
          '<div class="when">' +
          '<input type="date" data-i="' + i + '" data-f="date" value="' + s.date + '">' +
          '<input type="time" data-i="' + i + '" data-f="time" value="' + s.time + '" step="900">' +
          '<select data-i="' + i + '" data-f="minutes">' +
          DURATIONS.map(
            (d) => '<option value="' + d + '"' + (d === s.minutes ? ' selected' : '') + '>' + d + '分</option>'
          ).join('') +
          '</select>' +
          (rows.length > 1 ? '<button type="button" class="del" data-i="' + i + '">消す</button>' : '') +
          '</div>' +
          '<p class="note">この時間にご案内できるメニューです。' +
          '<b>機材の不調や材料切れのときは、チェックを外してください。</b></p>' +
          '<div class="menupick">' + (picks || '<span class="none">この長さに入るメニューがありません</span>') + '</div>' +
          '</div>'
        );
      })
      .join('');
  }

  document.addEventListener('click', (e) => {
    const r = e.target.closest('.room');
    if (r) { room = r.dataset.room; rows.forEach((s) => (s.menus = null)); render(); return; }
    const d = e.target.closest('.del');
    if (d) { rows.splice(Number(d.dataset.i), 1); render(); return; }
    if (e.target.id === 'add') {
      const last = rows[rows.length - 1];
      rows.push({ date: last ? last.date : DATES[0], time: '', minutes: 60, menus: null });
      render();
    }
  });

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.f) {
      const s = rows[Number(t.dataset.i)];
      if (t.dataset.f === 'minutes') {
        const minutes = Number(t.value);
        /* 長さを短くしたら、入らなくなったメニューは落とす */
        const keep = new Set(fits(minutes).map((m) => m.name));
        const chosen = (s.menus ?? defaultMenus(s.minutes)).filter((n) => keep.has(n));
        s.minutes = minutes;
        s.menus = chosen.length ? chosen : null;
        render();
      } else {
        s[t.dataset.f] = t.value;
      }
      return;
    }
    if (t.dataset.menu) {
      const s = rows[Number(t.dataset.i)];
      const chosen = new Set(s.menus ?? defaultMenus(s.minutes));
      if (t.checked) chosen.add(t.dataset.menu);
      else chosen.delete(t.dataset.menu);
      s.menus = [...chosen];
    }
  });

  document.getElementById('f').addEventListener('submit', (e) => {
    const out = rows
      .filter((s) => s.date && s.time)
      .map((s) => ({
        date: s.date,
        time: s.time,
        minutes: s.minutes,
        menus: s.menus ?? defaultMenus(s.minutes)
      }));
    if (!out.length) { e.preventDefault(); alert('日付と時間を入れてください。'); return; }
    document.getElementById('slots').value = JSON.stringify(out);
  });

  render();
`;

/* ------------------------------------------------------------------ *
 * 2. 確認
 * ------------------------------------------------------------------ */

async function previewPage(request, env) {
  const form = await request.formData();
  const slots = parseSlots(form.get('slots'));
  if (!slots.length) return redirectToTop();

  const opts = optsFrom(form);
  const p = await previewOpenSlot(env, slots, opts);

  const notes = p.notes
    .map((n) => `<p class="alert alert--${esc(n.kind)}">${esc(n.text)}</p>`)
    .join('');

  const blocked = !p.quota.allowed || !p.planned;

  return admPage(`
    <header>
      <h1>送る前の確認</h1>
      <p class="date">${esc(p.roomLabel)}・${p.slots.length}枠</p>
    </header>

    ${notes}

    <dl class="stats">
      <div><dt>お送りする方</dt><dd>${p.planned}</dd></div>
      <div><dt>今月の残り</dt><dd>${p.quota.usable}</dd></div>
      <div><dt>直近7日の送信</dt><dd>${p.weekCount}<small>/${p.maxPerWeek}</small></dd></div>
    </dl>

    <section>
      <h2>LINEに届く文面</h2>
      <pre class="msg">${esc(p.lineText)}</pre>
    </section>

    <section>
      <h2>Instagram ストーリーズ</h2>
      <p class="note">LINEにお送りしてから <b>${INSTAGRAM_DELAY_MIN}分あけて</b> ご投稿ください。
      LINEのほうが早いという事実が、登録していただく理由になります。</p>
      <pre class="msg">${esc(p.instagramText)}</pre>
    </section>

    <form method="post" action="/admin/send">
      <input type="hidden" name="slots" value="${esc(JSON.stringify(p.slots))}">
      ${opts.narrow ? '<input type="hidden" name="narrow" value="1">' : ''}
      ${opts.excludeRecent ? '<input type="hidden" name="exclude_recent" value="1">' : ''}
      ${opts.everyone ? '<input type="hidden" name="everyone" value="1">' : ''}
      <button type="submit" class="primary"${blocked ? ' disabled' : ''}>
        ${blocked ? '送信できません' : `${p.planned}名に送信する`}
      </button>
    </form>

    <p class="foot"><a href="/admin">入力に戻る</a></p>
  `);
}

/* ------------------------------------------------------------------ *
 * 3. 送信
 * ------------------------------------------------------------------ */

async function sendPage(request, env) {
  const form = await request.formData();
  const slots = parseSlots(form.get('slots'));
  if (!slots.length) return redirectToTop();

  const r = await sendOpenSlot(env, slots, optsFrom(form));

  return admPage(`
    <header>
      <h1>${r.stopped ? '送信を止めました' : '送信しました'}</h1>
      <p class="date">${esc(r.roomLabel)}・${r.slots.length}枠</p>
    </header>

    ${
      r.stopped
        ? `<p class="alert alert--too-often">${esc(r.stopped)}</p>`
        : `<p class="done"><b>${r.sent}名</b>にお届けしました。</p>
           <p class="note">このあと <b>${INSTAGRAM_DELAY_MIN}分</b> あけてから、
           Instagram のストーリーズにご投稿ください。</p>
           <pre class="msg">${esc(r.instagramText)}</pre>`
    }

    <p class="foot"><a href="/admin">最初に戻る</a></p>
  `);
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

  return admPage(`
    <header>
      <h1>自動応答できていない質問</h1>
      <p class="date">よく聞かれるものは、キーワード応答に追加できます</p>
    </header>
    <ul class="qs">${items || '<li class="empty">まだありません。</li>'}</ul>
    <p class="foot"><a href="/admin">最初に戻る</a></p>
  `);
}

/* ------------------------------------------------------------------ *
 * 入力の受け取り・認証・共通
 * ------------------------------------------------------------------ */

/** 画面から届いた JSON を、信じずに組み立て直す */
function parseSlots(raw) {
  let list;
  try {
    list = JSON.parse(String(raw ?? ''));
  } catch {
    return [];
  }
  if (!Array.isArray(list)) return [];

  return list
    .slice(0, 12)
    .map((s) => ({
      date: String(s?.date ?? ''),
      time: String(s?.time ?? ''),
      minutes: Number(s?.minutes) || 60,
      menus: (Array.isArray(s?.menus) ? s.menus : []).map(String).filter(Boolean)
    }))
    .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s.date) && /^\d{2}:\d{2}$/.test(s.time));
}

function optsFrom(form) {
  return {
    narrow: form.get('narrow') === '1',
    excludeRecent: form.get('exclude_recent') === '1',
    everyone: form.get('everyone') === '1'
  };
}

function redirectToTop() {
  return new Response(null, { status: 303, headers: { Location: '/admin' } });
}

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
    credsEqual(decoded.slice(0, i), env.ADMIN_USER ?? '') &&
    credsEqual(decoded.slice(i + 1), env.ADMIN_PASS ?? '')
  );
}

function credsEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function admPage(inner) {
  return new Response(
    `<!doctype html><html lang="ja"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>ミエーレ 空き枠のお知らせ</title>
<style>
  :root{--bg:#FAF7F5;--card:#fff;--ink:#2B2724;--sub:#8B7F79;--line:#E7DBD4;
        --accent:#98543F;--ok:#1F7A4C;--warn:#8E6415;--due:#A73A2A}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);font-size:15px;line-height:1.7;
       font-family:"Hiragino Kaku Gothic ProN","Yu Gothic Medium",system-ui,sans-serif}
  .app{max-width:620px;margin:0 auto;padding:20px 16px 60px}
  header{border-bottom:1px solid var(--line);padding-bottom:14px;margin-bottom:18px}
  h1{font-size:19px;margin:0}
  h2{font-size:14px;margin:0 0 10px;color:var(--sub);font-weight:700}
  .date{margin:2px 0 0;font-size:13px;color:var(--sub)}
  .banner{border:1px solid var(--line);border-radius:12px;background:var(--card);
          padding:14px 16px;margin-bottom:16px}
  .banner b{display:block;font-size:16px}
  .banner span{display:block;font-size:13px;color:var(--sub);margin-top:3px}
  .banner--on{border-color:var(--accent);border-width:2px}
  .banner--on b{color:var(--accent)}
  .stats{display:flex;margin:0 0 18px;padding:0;border:1px solid var(--line);
         border-radius:10px;background:var(--card);overflow:hidden}
  .stats div{flex:1;padding:10px 12px;border-right:1px solid var(--line);text-align:center}
  .stats div:last-child{border-right:0}
  .stats dt{font-size:11px;color:var(--sub);margin:0}
  .stats dd{margin:0;font-size:20px;font-weight:700;font-variant-numeric:tabular-nums}
  .stats small{font-size:12px;font-weight:400;color:var(--sub)}
  section{margin-bottom:22px}
  .rooms{display:flex;gap:8px}
  .room{flex:1;text-align:left;padding:12px 14px;border:1px solid var(--line);
        border-radius:11px;background:var(--card);color:inherit;font:inherit}
  .room[aria-pressed="true"]{border-color:var(--accent);border-width:2px;padding:11px 13px}
  .room b{display:block;font-size:14.5px}
  .room span{display:block;font-size:11.5px;color:var(--sub);margin-top:2px}
  .row{background:var(--card);border:1px solid var(--line);border-radius:12px;
       padding:12px 14px;margin-bottom:10px}
  .when{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
  .when input,.when select{padding:9px 10px;border:1px solid var(--line);border-radius:9px;
                           font:inherit;background:var(--bg);color:inherit}
  .del{margin-left:auto;padding:8px 12px;border:1px solid var(--line);border-radius:9px;
       background:none;color:var(--sub);font:inherit;font-size:13px}
  .note{font-size:12.5px;color:var(--sub);margin:10px 0 8px;line-height:1.7}
  .note b{color:var(--due)}
  .menupick{display:grid;gap:6px}
  .menupick label{display:flex;gap:8px;align-items:flex-start;font-size:13.5px}
  .menupick small{color:var(--sub);margin-left:6px;font-size:11.5px}
  .menupick .none{font-size:13px;color:var(--sub)}
  .check{display:flex;gap:10px;align-items:flex-start;background:var(--card);
         border:1px solid var(--line);border-radius:11px;padding:12px 14px;margin-bottom:8px}
  .check span{font-size:14px}
  .check small{display:block;font-size:12px;color:var(--sub);margin-top:2px}
  .check--warn{border-color:#E7C8BF}
  .ghost{padding:11px 14px;border:1px dashed var(--line);border-radius:10px;
         background:none;color:var(--accent);font:inherit;width:100%}
  .primary{width:100%;padding:15px;border:0;border-radius:11px;background:var(--accent);
           color:#fff;font:inherit;font-weight:700;font-size:15.5px;margin-top:6px}
  .primary[disabled]{background:var(--line);color:var(--sub)}
  .msg{background:var(--card);border:1px solid var(--line);border-radius:11px;
       padding:14px 16px;margin:0;font:inherit;font-size:13.5px;white-space:pre-wrap;
       word-break:break-word}
  .alert{border-radius:11px;padding:12px 14px;font-size:13px;margin:0 0 10px;
         background:#F7EFDF;color:var(--warn)}
  .alert--everyone,.alert--too-often{background:#FBE6E2;color:var(--due)}
  .done{font-size:16px;margin:0 0 10px}
  .done b{color:var(--ok)}
  .qs{list-style:none;padding:0;margin:0}
  .qs li{background:var(--card);border:1px solid var(--line);border-radius:9px;
         padding:10px 14px;margin-bottom:8px;font-size:14px}
  .qs b{color:var(--accent);margin-right:8px;font-variant-numeric:tabular-nums}
  .empty{color:var(--sub);font-size:14px}
  .foot{margin-top:26px;font-size:13px}
  a{color:var(--accent)}
  @media (prefers-color-scheme:dark){
    :root{--bg:#1B1817;--card:#242020;--ink:#EFE8E4;--sub:#9C8F89;--line:#3A3331;
          --accent:#D9967C;--ok:#5CC98C;--warn:#DEAC57;--due:#E58775}
    .alert{background:#2E2619}
    .alert--everyone,.alert--too-often{background:#33211E}
    .check--warn{border-color:#4A3630}
    .primary{color:#1B1817}
  }
</style></head><body><div class="app">${inner}</div></body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

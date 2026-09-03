/**
 * LINEの中で開くページ（LIFF）
 *
 *   /app/diagnosis  コース診断
 *   /app/menu       メニュー・料金
 *   /app/intake     問診表
 *   /app/access     アクセス・営業時間
 *   /app/slot       空き枠のお知らせの受け取り設定
 *
 * つながり方：
 *   診断 → お悩みがタグになる → 空き枠のお知らせが「その方に関わるもの」だけになる
 *   診断 → 料金ページの並び順が、その方のお悩みの順になる
 *   料金 → ご予約（お使いの予約システムへ）
 *   空き枠のお知らせ → ご予約
 *
 * ご予約フォームはここでは作りません。すでにお使いの予約システムがあり、
 * 別に受けてしまうと同じ枠が二重に売れるためです。
 */

import { SALON, has } from './salon.js';
import { liffConfig } from './liff.js';
import {
  COURSES, GENDERS, CONCERNS, BUDGETS, PACES
} from './courses.js';
import { INTAKE_FIELDS, INTAKE_KEEP_DAYS } from './api.js';
import { ROOMS, ROOM_TAG } from './openslot.js';

export const APP_PAGES = [
  { path: '/app/diagnosis', title: 'コース診断' },
  { path: '/app/menu',      title: 'メニュー・料金' },
  { path: '/app/intake',    title: '問診表' },
  { path: '/app/access',    title: 'アクセス・営業時間' },
  { path: '/app/slot',      title: '空き枠のお知らせ' }
];

export function appRequest(request, env, url) {
  switch (url.pathname) {
    /* LIFF のエンドポイントはここにします。
       https://liff.line.me/＜LIFF ID＞/menu のように後ろを足すと、
       1つの LIFF ID で全ページをまかなえます */
    case '/app':
    case '/app/':          return appPage(env, 'ミエーレ', hubBody(), '');
    case '/app/diagnosis': return appPage(env, 'コース診断', diagnosisBody(), diagnosisJs);
    case '/app/menu':      return appPage(env, 'メニュー・料金', menuBody(), menuJs);
    case '/app/intake':    return appPage(env, '問診表', intakeBody(), intakeJs);
    case '/app/access':    return appPage(env, 'アクセス・営業時間', accessBody(), '');
    case '/app/slot':      return appPage(env, '空き枠のお知らせ', slotBody(), slotJs);
    default:               return new Response('not found', { status: 404 });
  }
}

/* ------------------------------------------------------------------ *
 * 入口（LIFF のエンドポイント）
 * ------------------------------------------------------------------ */

function hubBody() {
  const link = (p, title, note) =>
    `<a class="hubitem" href="${appEsc(p)}"><b>${appEsc(title)}</b><small>${appEsc(note)}</small></a>`;

  return `
    <header class="head">
      <p class="eyebrow">${appEsc(SALON.shortName)}</p>
      <h1>${appEsc(SALON.name)}</h1>
      <p class="lead">${appEsc(SALON.hours)}／${appEsc(SALON.closed)}／${appEsc(SALON.reservation)}</p>
    </header>
    <div class="hub">
      ${link('/app/diagnosis', 'コース診断', '4つの質問でおすすめをご提案します')}
      ${link('/app/menu', 'メニュー・料金', '新規価格でご案内しています')}
      ${has(SALON.bookingUrl) ? `<a class="hubitem" href="${appEsc(SALON.bookingUrl)}" target="_blank" rel="noopener"><b>ご予約</b><small>ご予約ページが開きます</small></a>` : ''}
      ${link('/app/intake', '問診表', 'ご来店前にご記入いただけます')}
      ${link('/app/slot', '空き枠のお知らせ', '急なお席が空いたときにお知らせします')}
      ${link('/app/access', 'アクセス・営業時間', 'JR古河駅から徒歩8分')}
    </div>`;
}

/* ------------------------------------------------------------------ *
 * コース診断
 * ------------------------------------------------------------------ */

function diagnosisBody() {
  return `
    <header class="head">
      <p class="eyebrow">${appEsc(SALON.shortName)}</p>
      <h1>コース診断</h1>
      <p class="lead">4つの質問にお答えいただくと、おすすめのコースをご提案します。
      表示はすべて<b>新規（初回）価格</b>です。</p>
    </header>
    <div class="bar"><span id="bar"></span></div>
    <div id="q"></div>`;
}

const diagnosisJs = `
  const state = { step: 0, gender: null, concerns: [], budget: null, pace: null };
  const q = document.getElementById('q');

  const forSex = (o) => !o.sex || o.sex === state.gender;
  const opt = (o, on) =>
    '<button type="button" class="opt' + (on ? ' on' : '') + '" data-id="' + o.id + '">' +
    (o.em ? '<span class="em">' + o.em + '</span>' : '') +
    '<span class="t">' + o.label + (o.sub ? '<small>' + o.sub + '</small>' : '') + '</span></button>';

  const STEPS = [
    { key: 'gender',   title: 'お客様について',       list: () => DATA.genders,  multi: false },
    { key: 'concerns', title: '気になるところは？',   list: () => DATA.concerns.filter(forSex), multi: true,
      note: 'いくつでもお選びいただけます' },
    { key: 'budget',   title: '1回あたりのご予算は？', list: () => DATA.budgets,  multi: false,
      note: 'この金額を超えるコースはご提案しません' },
    { key: 'pace',     title: 'どのように通いたいですか？', list: () => DATA.paces, multi: false }
  ];

  function render() {
    document.getElementById('bar').style.width =
      Math.round((state.step / STEPS.length) * 100) + '%';

    if (state.step >= STEPS.length) return finish();

    const s = STEPS[state.step];
    q.innerHTML =
      '<section class="step"><h2>' + s.title + '</h2>' +
      (s.note ? '<p class="note">' + s.note + '</p>' : '') +
      '<div class="opts">' +
      s.list().map((o) => opt(o, s.multi ? state[s.key].includes(o.id) : state[s.key] === o.id)).join('') +
      '</div>' +
      (needsVio() ? '<p class="warn">' + DATA.mensVio + '</p>' : '') +
      '<div class="nav">' +
      (state.step > 0 ? '<button type="button" class="back" id="back">戻る</button>' : '') +
      (s.multi ? '<button type="button" class="go" id="next">次へ</button>' : '') +
      '</div></section>';
  }

  const needsVio = () =>
    state.gender === 'm' && state.concerns.includes('thera') &&
    STEPS[state.step] && STEPS[state.step].key === 'concerns';

  q.addEventListener('click', (e) => {
    const b = e.target.closest('.opt');
    if (b) {
      const s = STEPS[state.step];
      if (s.multi) {
        const i = state[s.key].indexOf(b.dataset.id);
        if (i < 0) state[s.key].push(b.dataset.id); else state[s.key].splice(i, 1);
        render();
      } else {
        state[s.key] = b.dataset.id;
        /* 男性のときは、女性限定のお悩みが消えるので選び直していただく */
        if (s.key === 'gender') state.concerns = state.concerns.filter(
          (id) => forSex(DATA.concerns.find((c) => c.id === id) || {}));
        state.step++;
        render();
      }
      return;
    }
    if (e.target.id === 'next') {
      if (!state.concerns.length) { alert('1つ以上お選びください。'); return; }
      state.step++; render(); return;
    }
    if (e.target.id === 'back') { state.step--; render(); return; }
    if (e.target.id === 'again') { location.reload(); }
  });

  async function finish() {
    q.innerHTML = '<p class="loading">おすすめを組み立てています…</p>';
    const r = await post('/api/diagnosis', {
      answers: { gender: state.gender, concerns: state.concerns,
                 budget: state.budget, pace: state.pace }
    });
    if (!r || !r.ok) {
      q.innerHTML = '<p class="warn">うまくいきませんでした。もう一度お試しください。</p>';
      return;
    }

    const cards = r.results.map((c) =>
      '<article class="card">' +
      '<div class="row1">' +
      (c.badge ? '<span class="badge">' + c.badge + '</span>' : '') +
      '<span class="cat">' + c.cat + '</span>' +
      '<span class="rate">おすすめ度 ' + c.rate + '%</span></div>' +
      '<h3>' + c.name + '</h3>' +
      '<p class="price"><b>' + yen(c.price) + '</b>' +
      (c.reg ? '<s>' + yen(c.reg) + '</s>' : '') +
      (c.min ? '<span class="min">' + c.min + '分</span>' : '') + '</p>' +
      '<p class="desc">' + c.desc + '</p>' +
      (c.hits.length ? '<ul class="hits">' + c.hits.map((h) => '<li>' + h + '</li>').join('') + '</ul>' : '') +
      '</article>').join('');

    q.innerHTML =
      '<section class="result"><h2>お客様におすすめのコース</h2>' +
      (r.overBudget
        ? '<p class="warn">ご予算内にぴったりのコースがありませんでした。' +
          '条件の近いものを、お安い順にご案内します。</p>' : '') +
      (r.mensVioNote ? '<p class="warn">' + r.mensVioNote + '</p>' : '') +
      (cards || '<p class="note">条件に合うコースが見つかりませんでした。</p>') +
      (r.saved
        ? '<p class="saved">診断の結果をお預かりしました。' +
          '空き枠のお知らせを、お客様のお悩みに合わせてお送りできます。</p>' : '') +
      '<div class="cta">' +
      (DATA.bookingUrl
        ? '<a class="go" href="' + DATA.bookingUrl + '" target="_blank" rel="noopener">ご予約に進む</a>' : '') +
      '<a class="sub" href="/app/slot">空き枠のお知らせを受け取る</a>' +
      '<button type="button" class="sub" id="again">もう一度診断する</button>' +
      '</div></section>';
  }

  render();
`;

/* ------------------------------------------------------------------ *
 * メニュー・料金
 * ------------------------------------------------------------------ */

function menuBody() {
  return `
    <header class="head">
      <p class="eyebrow">${appEsc(SALON.shortName)}</p>
      <h1>メニュー・料金</h1>
      <p class="lead">表示はすべて<b>新規（初回）価格</b>です。
      取り消し線は2回目以降の通常価格です。</p>
    </header>
    <div id="mine"></div>
    <div class="chips" id="chips"></div>
    <div id="list"></div>`;
}

const menuJs = `
  let filter = null;
  const cats = [...new Set(DATA.courses.map((c) => c.cat))];

  function card(c) {
    return '<article class="card">' +
      '<div class="row1">' +
      (c.badge ? '<span class="badge">' + c.badge + '</span>' : '') +
      '<span class="cat">' + c.cat + '</span></div>' +
      '<h3>' + c.name + '</h3>' +
      '<p class="price"><b>' + yen(c.price) + '</b>' +
      (c.reg ? '<s>' + yen(c.reg) + '</s>' : '') +
      (c.min ? '<span class="min">' + c.min + '分</span>' : '') + '</p>' +
      '<p class="desc">' + c.desc + '</p></article>';
  }

  function render() {
    document.getElementById('chips').innerHTML =
      '<button type="button" class="chip' + (filter ? '' : ' on') + '" data-cat="">すべて</button>' +
      cats.map((c) => '<button type="button" class="chip' + (filter === c ? ' on' : '') +
        '" data-cat="' + c + '">' + c + '</button>').join('');

    const list = DATA.courses.filter((c) => !filter || c.cat === filter);
    document.getElementById('list').innerHTML =
      '<section>' + list.map(card).join('') + '</section>' +
      (DATA.bookingUrl
        ? '<div class="cta"><a class="go" href="' + DATA.bookingUrl +
          '" target="_blank" rel="noopener">ご予約に進む</a></div>' : '');
  }

  document.getElementById('chips').addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (!b) return;
    filter = b.dataset.cat || null;
    render();
  });

  /* 診断をお受けになっていれば、そのお悩みに関わるものを先にお見せする */
  async function mine() {
    const me = await post('/api/me', {});
    if (!me || !me.concerns || !me.concerns.length) return;
    const hit = DATA.courses.filter((c) => c.concerns.some((x) => me.concerns.includes(x)));
    if (!hit.length) return;
    const names = me.concerns
      .map((id) => (DATA.concerns.find((c) => c.id === id) || {}).label).filter(Boolean);
    document.getElementById('mine').innerHTML =
      '<section class="mine"><h2>お客様のお悩みに合うメニュー</h2>' +
      '<p class="note">コース診断で「' + names.join('・') + '」をお選びいただきました。</p>' +
      hit.slice(0, 4).map(card).join('') + '</section>';
  }

  render();
  mine();
`;

/* ------------------------------------------------------------------ *
 * 問診表
 * ------------------------------------------------------------------ */

function intakeBody() {
  const fields = INTAKE_FIELDS.map((f) => {
    const note = f.note ? `<small>${appEsc(f.note)}</small>` : '';
    if (f.type === 'yesno') {
      return `<div class="field">
        <label>${appEsc(f.label)}${f.id === 'pregnant' ? '<em>該当する方のみ</em>' : ''}${note}</label>
        <div class="yesno">
          <button type="button" class="opt" data-f="${appEsc(f.id)}" data-v="なし">なし</button>
          <button type="button" class="opt" data-f="${appEsc(f.id)}" data-v="あり">あり</button>
        </div>
        ${f.detail ? `<input type="text" data-f="${appEsc(f.id)}_detail" placeholder="${appEsc(f.detail)}">` : ''}
      </div>`;
    }
    return `<div class="field">
      <label>${appEsc(f.label)}${f.required ? '<em>必須</em>' : ''}${note}</label>
      <input type="text" data-f="${appEsc(f.id)}">
    </div>`;
  }).join('');

  return `
    <header class="head">
      <p class="eyebrow">${appEsc(SALON.shortName)}</p>
      <h1>問診表</h1>
      <p class="lead">ご来店前にご記入いただくと、当日のお時間が短くなります。</p>
    </header>

    <div class="privacy">
      <b>お預かりする内容について</b>
      <ul>
        <li>安全に施術を行うためだけに使います</li>
        <li>スタッフが確認してカルテに転記したあと、<b>${INTAKE_KEEP_DAYS}日で自動的に消去</b>します</li>
        <li>LINEのトークには内容を残しません</li>
      </ul>
    </div>

    <form id="f">${fields}
      <label class="consent">
        <input type="checkbox" id="consent">
        <span>上記に同意して送信します</span>
      </label>
      <button type="submit" class="go">送信する</button>
    </form>
    <p class="msg" id="msg"></p>`;
}

const intakeJs = `
  const form = {};

  document.getElementById('f').addEventListener('click', (e) => {
    const b = e.target.closest('.opt');
    if (!b) return;
    form[b.dataset.f] = b.dataset.v;
    b.parentElement.querySelectorAll('.opt').forEach((x) => x.classList.remove('on'));
    b.classList.add('on');
  });

  document.getElementById('f').addEventListener('input', (e) => {
    if (e.target.dataset.f) form[e.target.dataset.f] = e.target.value;
  });

  document.getElementById('f').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('msg');
    if (!document.getElementById('consent').checked) {
      msg.textContent = 'ご同意のチェックをお願いします。'; return;
    }
    if (!form.name) { msg.textContent = 'お名前をご記入ください。'; return; }

    /* 「あり」で内容を書いていただいた場合は、ひとつにまとめて送る */
    const out = {};
    for (const k of Object.keys(form)) {
      if (k.endsWith('_detail')) continue;
      const d = form[k + '_detail'];
      out[k] = d ? form[k] + '（' + d + '）' : form[k];
    }

    msg.textContent = '送信しています…';
    const r = await post('/api/intake', { consent: true, form: out });
    if (r && r.ok) {
      document.getElementById('f').style.display = 'none';
      msg.innerHTML = '<b>ありがとうございました。</b><br>' +
        'ご来店をお待ちしております。内容はスタッフが確認いたします。';
    } else {
      msg.textContent = (r && r.error) || '送信できませんでした。もう一度お試しください。';
    }
  });
`;

/* ------------------------------------------------------------------ *
 * アクセス・営業時間
 * ------------------------------------------------------------------ */

function accessBody() {
  const map = 'https://www.google.com/maps/search/?api=1&query=' +
    encodeURIComponent(SALON.address);

  const row = (label, value) =>
    has(value) ? `<div class="row"><dt>${appEsc(label)}</dt><dd>${appEsc(value)}</dd></div>` : '';

  return `
    <header class="head">
      <p class="eyebrow">${appEsc(SALON.shortName)}</p>
      <h1>アクセス・営業時間</h1>
    </header>

    <dl class="info">
      ${row('店舗名', SALON.name)}
      ${row('住所', SALON.postal + ' ' + SALON.address)}
      ${row('アクセス', SALON.access)}
      ${row('駐車場', SALON.parking)}
      ${row('営業時間', SALON.hours)}
      ${row('定休日', SALON.closed)}
      ${row('ご予約', SALON.reservation + (has(SALON.reservationNote) ? '（' + SALON.reservationNote + '）' : ''))}
      ${row('お支払い', SALON.payment)}
    </dl>

    <div class="cta">
      <a class="go" href="${appEsc(map)}" target="_blank" rel="noopener">地図で見る</a>
      ${has(SALON.tel) ? `<a class="sub" href="tel:${appEsc(SALON.tel.replace(/-/g, ''))}">電話をかける（${appEsc(SALON.tel)}）</a>` : ''}
      ${has(SALON.bookingUrl) ? `<a class="sub" href="${appEsc(SALON.bookingUrl)}" target="_blank" rel="noopener">ご予約に進む</a>` : ''}
    </div>`;
}

/* ------------------------------------------------------------------ *
 * 空き枠のお知らせの受け取り設定
 * ------------------------------------------------------------------ */

function slotBody() {
  const rooms = ROOMS.map(
    (r) => `<label class="check">
      <input type="checkbox" data-room="${appEsc(r.id)}">
      <span>${appEsc(r.label)}<small>${appEsc(r.note)}</small></span>
    </label>`
  ).join('');

  return `
    <header class="head">
      <p class="eyebrow">${appEsc(SALON.shortName)}</p>
      <h1>空き枠のお知らせ</h1>
      <p class="lead">急なお席が空いたときに、LINEでお知らせします。
      Instagram に出すより<b>30分早く</b>お届けしています。</p>
    </header>

    <div class="toggle">
      <button type="button" class="opt" id="on">受け取る</button>
      <button type="button" class="opt" id="off">受け取らない</button>
    </div>

    <section id="detail" hidden>
      <h2>どちらのお席をご希望ですか</h2>
      <p class="note">選んでいただくと、関係のないお知らせは届かなくなります。</p>
      ${rooms}
      <p class="note" id="hint"></p>
    </section>

    <button type="button" class="go" id="save">この内容で登録する</button>
    <p class="msg" id="msg"></p>

    <p class="foot">お知らせは多くても週に2〜3回までです。
    いつでもこの画面から止められます。</p>`;
}

const slotJs = `
  let wants = false;
  const rooms = new Set();

  function paint() {
    document.getElementById('on').classList.toggle('on', wants);
    document.getElementById('off').classList.toggle('on', !wants);
    document.getElementById('detail').hidden = !wants;
    document.querySelectorAll('[data-room]').forEach((b) => { b.checked = rooms.has(b.dataset.room); });
    document.getElementById('hint').textContent =
      rooms.size ? '' : '選ばれていないときは、どちらのお席もお知らせします。';
  }

  document.getElementById('on').addEventListener('click', () => { wants = true; paint(); });
  document.getElementById('off').addEventListener('click', () => { wants = false; paint(); });
  document.addEventListener('change', (e) => {
    if (!e.target.dataset.room) return;
    e.target.checked ? rooms.add(e.target.dataset.room) : rooms.delete(e.target.dataset.room);
    paint();
  });

  document.getElementById('save').addEventListener('click', async () => {
    const msg = document.getElementById('msg');
    msg.textContent = '登録しています…';
    const r = await post('/api/prefs', { openSlot: wants, rooms: [...rooms] });
    msg.textContent = r && r.ok
      ? (wants ? '登録しました。空きが出ましたらお知らせします。' : 'お知らせを止めました。')
      : ((r && r.error) || '登録できませんでした。');
  });

  (async () => {
    const me = await post('/api/me', {});
    if (me && !me.error) {
      wants = !!me.openSlot;
      (me.rooms || []).forEach((r) => rooms.add(r));
    }
    paint();
  })();
`;

/* ------------------------------------------------------------------ *
 * 共通の枠組み
 * ------------------------------------------------------------------ */

/* ページに渡すデータ。お客様に見えて困るものは入れない */
const appData = () => ({
  genders: GENDERS,
  concerns: CONCERNS,
  budgets: BUDGETS.map((b) => ({ ...b, cap: b.cap === Infinity ? null : b.cap })),
  paces: PACES,
  courses: COURSES.map((c) => ({
    id: c.id, name: c.name, price: c.price, reg: c.reg ?? null, min: c.min,
    cat: c.cat, badge: c.badge, desc: c.desc, concerns: c.concerns
  })),
  rooms: ROOMS.map((r) => ({ id: r.id, label: r.label })),
  bookingUrl: has(SALON.bookingUrl) ? SALON.bookingUrl : null,
  mensVio:
    '※ メンズのVIO脱毛は、セラピストによる施術は行っておりません。' +
    'セルフ脱毛でのご対応となります（ブースをご用意しています）。'
});

/* LIFF の準備。IDトークンが取れなければ、そのまま「どなたか分からない」で進みます。
   （LINEの外でブラウザから開かれたときや、デモのとき） */
const APP_BOOT = `
  const DATA = window.__APP_DATA__;
  const CONF = window.__APP_CONF__;
  let idToken = null;

  const yen = (n) => '¥' + Number(n).toLocaleString('ja-JP');

  async function boot() {
    if (!CONF.ready || typeof liff === 'undefined') return;
    try {
      await liff.init({ liffId: CONF.liffId });
      if (liff.isLoggedIn()) idToken = liff.getIDToken();
    } catch (e) {
      /* 開けなくても、ページそのものは読めるようにしておく */
    }
  }

  async function post(path, body) {
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, idToken })
      });
      return await res.json();
    } catch (e) {
      return { error: '通信できませんでした' };
    }
  }
`;

function appPage(env, title, body, pageJs) {
  const conf = liffConfig(env);
  return new Response(
    `<!doctype html><html lang="ja"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${appEsc(title)}｜${appEsc(SALON.shortName)}</title>
<style>${APP_CSS}</style>
</head><body>
<div class="app">${body}</div>
${conf.ready ? '<script src="https://static.line-scdn.net/liff/edge/2/sdk.js"><\/script>' : ''}
<script>
window.__APP_DATA__ = ${JSON.stringify(appData())};
window.__APP_CONF__ = ${JSON.stringify(conf)};
${APP_BOOT}
boot().then(() => { ${pageJs} });
<\/script>
</body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

export const APP_CSS = `
  :root{--bg:#FAF7F5;--card:#fff;--ink:#2B2724;--sub:#8B7F79;--line:#E7DBD4;
        --accent:#98543F;--wash:#F7EBE5;--warn:#8E6415;--warn-bg:#F7EFDF}
  @media (prefers-color-scheme:dark){
    :root{--bg:#1B1817;--card:#242020;--ink:#EFE8E4;--sub:#9C8F89;--line:#3A3331;
          --accent:#D9967C;--wash:#33241F;--warn:#DEAC57;--warn-bg:#2E2619}
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);font-size:15px;line-height:1.75;
       font-family:"Hiragino Kaku Gothic ProN","Yu Gothic Medium",system-ui,sans-serif}
  .app{max-width:560px;margin:0 auto;padding:22px 16px 64px}
  .head{margin-bottom:18px}
  .eyebrow{font-size:11px;font-weight:700;letter-spacing:.18em;color:var(--accent);margin:0 0 8px}
  h1{font-size:22px;margin:0 0 8px;line-height:1.35}
  h2{font-size:16px;margin:0 0 10px}
  h3{font-size:15.5px;margin:0 0 6px;line-height:1.5}
  .lead{font-size:13.5px;color:var(--sub);margin:0}
  .note{font-size:12.5px;color:var(--sub);margin:0 0 12px}
  .warn{font-size:12.5px;color:var(--warn);background:var(--warn-bg);
        border-radius:9px;padding:10px 12px;margin:0 0 14px}
  .bar{height:3px;background:var(--line);border-radius:99px;margin:0 0 22px;overflow:hidden}
  .bar span{display:block;height:100%;background:var(--accent);width:0;transition:width .25s}
  .opts{display:grid;gap:8px;margin-bottom:16px}
  .opt{display:flex;gap:11px;align-items:center;text-align:left;width:100%;
       padding:14px 15px;border:1px solid var(--line);border-radius:12px;
       background:var(--card);color:inherit;font:inherit}
  .opt.on{border-color:var(--accent);border-width:2px;padding:13px 14px;background:var(--wash)}
  .opt .em{font-size:20px;line-height:1}
  .opt .t{font-size:14.5px}
  .opt small{display:block;font-size:11.5px;color:var(--sub)}
  .nav{display:flex;gap:8px}
  .back{padding:12px 18px;border:1px solid var(--line);border-radius:10px;
        background:none;color:var(--sub);font:inherit}
  .go{flex:1;display:block;text-align:center;padding:14px;border:0;border-radius:11px;
      background:var(--accent);color:#fff;font:inherit;font-weight:700;text-decoration:none}
  .sub{display:block;text-align:center;padding:13px;border:1px solid var(--line);
       border-radius:11px;background:var(--card);color:var(--accent);font:inherit;
       text-decoration:none;margin-top:8px;width:100%}
  .cta{margin-top:22px}
  .card{background:var(--card);border:1px solid var(--line);border-radius:13px;
        padding:15px 16px;margin-bottom:10px}
  .row1{display:flex;gap:7px;align-items:center;margin-bottom:7px;flex-wrap:wrap}
  .badge{font-size:10.5px;font-weight:700;color:#fff;background:var(--accent);
         border-radius:99px;padding:2px 9px}
  .cat{font-size:11px;color:var(--sub)}
  .rate{margin-left:auto;font-size:11.5px;font-weight:700;color:var(--accent)}
  .price{margin:0 0 7px;display:flex;gap:9px;align-items:baseline;flex-wrap:wrap}
  .price b{font-size:19px;font-variant-numeric:tabular-nums}
  .price s{font-size:12.5px;color:var(--sub)}
  .price .min{font-size:12px;color:var(--sub)}
  .desc{font-size:13px;color:var(--sub);margin:0}
  .hits{list-style:none;padding:0;margin:9px 0 0;display:flex;gap:6px;flex-wrap:wrap}
  .hits li{font-size:11px;background:var(--wash);color:var(--accent);
           border-radius:99px;padding:3px 10px}
  .saved{font-size:12.5px;color:var(--accent);background:var(--wash);
         border-radius:9px;padding:11px 13px;margin:14px 0 0}
  .loading{color:var(--sub);font-size:14px;text-align:center;padding:40px 0}
  .chips{display:flex;gap:7px;overflow-x:auto;padding:0 0 12px;margin-bottom:4px}
  .chip{flex:0 0 auto;padding:7px 14px;border:1px solid var(--line);border-radius:99px;
        background:var(--card);color:var(--sub);font:inherit;font-size:12.5px}
  .chip.on{border-color:var(--accent);color:var(--accent);font-weight:700}
  .mine{background:var(--wash);border-radius:14px;padding:15px 14px 6px;margin-bottom:20px}
  .mine h2{color:var(--accent)}
  .info{margin:0 0 8px;padding:0;border:1px solid var(--line);border-radius:13px;
        background:var(--card);overflow:hidden}
  .info .row{display:flex;gap:0;border-bottom:1px solid var(--line)}
  .info .row:last-child{border-bottom:0}
  .info dt{flex:0 0 92px;padding:11px 13px;font-size:12px;color:var(--sub)}
  .info dd{flex:1;margin:0;padding:11px 13px;font-size:13.5px}
  .privacy{background:var(--card);border:1px solid var(--line);border-radius:13px;
           padding:14px 16px;margin-bottom:20px;font-size:12.5px;color:var(--sub)}
  .privacy b{color:var(--ink);display:block;margin-bottom:6px;font-size:13.5px}
  .privacy ul{margin:0;padding-left:18px}
  .privacy li{margin-bottom:4px}
  .field{margin-bottom:15px}
  .field label{display:block;font-size:13.5px;margin-bottom:6px}
  .field label em{font-style:normal;font-size:10.5px;color:var(--accent);margin-left:7px}
  .field label small{display:block;font-size:11.5px;color:var(--sub);margin-top:2px}
  .field input{width:100%;padding:12px;border:1px solid var(--line);border-radius:10px;
               font:inherit;background:var(--card);color:inherit}
  .yesno{display:flex;gap:8px;margin-bottom:7px}
  .yesno .opt{justify-content:center}
  .consent{display:flex;gap:10px;align-items:center;margin:20px 0 14px;font-size:13.5px}
  .toggle{display:flex;gap:8px;margin-bottom:20px}
  .toggle .opt{justify-content:center;font-weight:700}
  .check{display:flex;gap:10px;align-items:flex-start;background:var(--card);
         border:1px solid var(--line);border-radius:11px;padding:13px 14px;margin-bottom:8px}
  .check small{display:block;font-size:11.5px;color:var(--sub)}
  .hub{display:grid;gap:9px}
  .hubitem{display:block;padding:15px 17px;border:1px solid var(--line);border-radius:12px;
           background:var(--card);text-decoration:none;color:inherit}
  .hubitem b{display:block;font-size:15px;color:var(--accent)}
  .hubitem small{display:block;font-size:12px;color:var(--sub);margin-top:2px}
  .msg{font-size:13px;color:var(--accent);margin:12px 0 0}
  .foot{font-size:11.5px;color:var(--sub);margin-top:22px}
  a{color:var(--accent)}
`;

function appEsc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

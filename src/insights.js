/**
 * 売上から「次に何を送るか」を決める
 *
 * オーナー管理のシステムから書き出した売上データを読み込み、
 *   1. 昨年の同じ月に強かったもの（季節性）
 *   2. 直近で落ちているもの（テコ入れの余地）
 *   3. 診断で関心はあるのに売れていないもの（need と売上のギャップ）
 * を突き合わせて、配信の候補を出します。
 *
 * 判断の根拠を必ず一緒に返すので、「なぜこれを送るのか」が説明できます。
 */

import { tagCounts } from './tags.js';
import { nowIso } from './handlers.js';

/* ------------------------------------------------------------------ *
 * メニュー名 → カテゴリ
 * 書き方の揺れ（「ララピール」「韓国肌管理ララピール」など）をここで吸収する
 * ------------------------------------------------------------------ */

const CATEGORY_RULES = [
  [/脱毛|ヒゲ|髭|VIO/i, '脱毛'],
  [/ダクトピール|dactorpeel|doctorpeel|ララピール|リジュラン|ピーリング|肌管理/i, '韓国肌管理'],
  [/花嫁|ブライダル/i, 'ブライダル'],
  [/red\s*ショット|レッドショット(?!body)|サーマエッジ|小顔|輪郭/i, '小顔'],
  [/脂肪冷却|ラジオ波|痩身|body|電磁パルス|産後/i, '痩身'],
  [/プラズマ|フェイシャル|光|ミルキー/i, 'フェイシャル'],
  [/アロマ|ヘッド|デコルテ|マッサージ|トリートメント/i, 'リラク']
];

export function categoryOf(menu) {
  const name = String(menu ?? '');
  for (const [re, cat] of CATEGORY_RULES) if (re.test(name)) return cat;
  return 'その他';
}

/** カテゴリ → 絞り込み配信に使うタグ（null は全員向け） */
export const CATEGORY_TAG = {
  脱毛: '希望:セラピスト脱毛',
  韓国肌管理: '希望:毛穴・シミ・くすみ',
  フェイシャル: '希望:毛穴・シミ・くすみ',
  小顔: '希望:たるみ・小顔',
  痩身: '希望:お腹・太ももの脂肪',
  ブライダル: '希望:結婚式・イベント前',
  リラク: null,
  その他: null
};

/* ------------------------------------------------------------------ *
 * 取り込み
 * ------------------------------------------------------------------ */

const COLUMNS = {
  date: ['日付', '売上日', '来店日', 'date', '年月日'],
  menu: ['メニュー', 'メニュー名', '商品名', '施術', 'menu', '内容'],
  amount: ['金額', '売上', '税込金額', '合計', 'amount', '価格'],
  isNew: ['区分', '新規', '新規再来', 'type']
};

/**
 * CSV を読み取って売上の行にする。
 * 列の順番ではなく見出しの名前で判断するので、書き出し形式が多少違っても通ります。
 */
export function parseSalesCsv(csvText) {
  const rows = splitCsv(String(csvText ?? '').trim());
  if (rows.length < 2) return { rows: [], errors: ['データが見つかりません'] };

  const header = rows[0].map((h) => h.trim());
  const idx = {};
  for (const [key, names] of Object.entries(COLUMNS)) {
    idx[key] = header.findIndex((h) => names.some((n) => h.toLowerCase() === n.toLowerCase()));
  }

  const errors = [];
  if (idx.date < 0) errors.push('日付の列が見つかりません（' + COLUMNS.date.join(' / ') + '）');
  if (idx.menu < 0) errors.push('メニューの列が見つかりません（' + COLUMNS.menu.join(' / ') + '）');
  if (idx.amount < 0) errors.push('金額の列が見つかりません（' + COLUMNS.amount.join(' / ') + '）');
  if (errors.length) return { rows: [], errors };

  const out = [];
  const skipped = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r.length || r.every((v) => !String(v).trim())) continue;

    const soldOn = normalizeDate(r[idx.date]);
    const menu = String(r[idx.menu] ?? '').trim();
    const amount = Number(String(r[idx.amount] ?? '').replace(/[^\d.-]/g, ''));

    if (!soldOn || !menu || !Number.isFinite(amount)) {
      skipped.push(i + 1);
      continue;
    }
    out.push({
      sold_on: soldOn,
      menu,
      category: categoryOf(menu),
      amount: Math.round(amount),
      is_new: idx.isNew >= 0 && /新規/.test(String(r[idx.isNew] ?? '')) ? 1 : 0
    });
  }

  if (skipped.length) errors.push(`${skipped.length}行を読み取れませんでした（${skipped.slice(0, 5).join(', ')}行目など）`);
  return { rows: out, errors };
}

/** 2026/8/1 も 2026-08-01 も受け取る */
function normalizeDate(v) {
  const s = String(v ?? '').trim();
  const m = s.match(/^(\d{4})[-/年.](\d{1,2})[-/月.](\d{1,2})/);
  if (!m) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
}

function splitCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch !== '\r') field += ch;
  }
  row.push(field);
  if (row.some((f) => f !== '')) rows.push(row);
  return rows;
}

export async function importSales(env, rows) {
  const at = nowIso();
  for (const r of rows) {
    await env.DB.prepare(
      `INSERT INTO sales (sold_on, menu, category, amount, is_new, imported_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
      .bind(r.sold_on, r.menu, r.category, r.amount, r.is_new ?? 0, at)
      .run();
  }
  return rows.length;
}

/* ------------------------------------------------------------------ *
 * 集計
 * ------------------------------------------------------------------ */

/** カテゴリ×月の売上 */
export async function categoryMonthly(env) {
  const res = await env.DB.prepare(
    `SELECT category, substr(sold_on, 1, 7) AS ym, SUM(amount) AS total, COUNT(*) AS n
       FROM sales
      GROUP BY category, ym
      ORDER BY ym`
  ).all();
  return res.results ?? [];
}

const sum = (a) => a.reduce((n, x) => n + x, 0);
const share = (part, whole) => (whole > 0 ? part / whole : 0);

export function monthsBefore(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 - n, 1));
  return d.toISOString().slice(0, 7);
}

/* ------------------------------------------------------------------ *
 * 配信候補
 * ------------------------------------------------------------------ */

const W = { season: 3, decline: 2, gap: 3 };

/**
 * @param {string} targetYm 送る予定の月（例 '2026-09'）
 */
export async function recommend(env, targetYm) {
  const rows = await categoryMonthly(env);
  if (!rows.length) return { targetYm, ready: false, reason: '売上データがまだ取り込まれていません', items: [] };

  const categories = [...new Set(rows.map((r) => r.category))];
  const totalOf = (cat, ym) => sum(rows.filter((r) => r.category === cat && r.ym === ym).map((r) => r.total));
  const monthTotal = (ym) => sum(rows.filter((r) => r.ym === ym).map((r) => r.total));

  const lastYearYm = monthsBefore(targetYm, 12);
  const recent = [1, 2, 3].map((n) => monthsBefore(targetYm, n)); // 直近3か月
  const allYms = [...new Set(rows.map((r) => r.ym))];

  // 診断でどのくらい関心が集まっているか
  const tags = await tagCounts(env);
  const interestTotal = sum(tags.filter((t) => t.name.startsWith('希望:')).map((t) => t.n));
  const interestOf = (cat) => {
    const tag = CATEGORY_TAG[cat];
    if (!tag || !interestTotal) return null;
    return share(tags.find((t) => t.name === tag)?.n ?? 0, interestTotal);
  };

  const items = categories.map((cat) => {
    const reasons = [];
    let score = 0;

    // 1. 季節性：昨年の同じ月、このカテゴリは平均より強かったか
    const lyShare = share(totalOf(cat, lastYearYm), monthTotal(lastYearYm));
    const avgShare = share(
      sum(allYms.map((ym) => totalOf(cat, ym))),
      sum(allYms.map((ym) => monthTotal(ym)))
    );
    if (monthTotal(lastYearYm) > 0 && lyShare > avgShare * 1.15) {
      score += W.season;
      reasons.push({
        type: 'season',
        label: '昨年の同じ月に強かった',
        detail: `昨年${lastYearYm.slice(5)}月は売上の${pct(lyShare)}を占めた（通常は${pct(avgShare)}）`
      });
    }

    // 2. 落ち込み：前年の同じ時期と比べる。
    //    単に3か月前と比べると、季節で下がるだけのメニュー（夏後の痩身など）まで
    //    「落ちている」と判定してしまうため、季節の影響を除いて見る。
    const recentThis = sum(recent.map((ym) => totalOf(cat, ym)));
    const recentLast = sum(recent.map((ym) => totalOf(cat, monthsBefore(ym, 12))));
    if (recentLast > 0 && recentThis < recentLast * 0.85) {
      score += W.decline;
      reasons.push({
        type: 'decline',
        label: '昨年の同じ時期より落ちている',
        detail: `直近3か月は ${yen(recentThis)}（昨年同期 ${yen(recentLast)}／${pct((recentThis - recentLast) / recentLast, true)}）`
      });
    }

    // 3. 関心と売上のギャップ：診断で選ばれているのに売上が伴っていない
    const interest = interestOf(cat);
    const salesShare = share(sum(recent.map((ym) => totalOf(cat, ym))), sum(recent.map((ym) => monthTotal(ym))));
    if (interest != null && interest > salesShare * 1.3 && interest > 0.1) {
      score += W.gap;
      reasons.push({
        type: 'gap',
        label: '関心はあるのに売上が伴っていない',
        detail: `診断で${pct(interest)}の方が希望しているが、売上では${pct(salesShare)}`
      });
    }

    return {
      category: cat,
      score,
      reasons,
      tag: CATEGORY_TAG[cat] ?? null,
      lastYear: totalOf(cat, lastYearYm),
      recentTotal: sum(recent.map((ym) => totalOf(cat, ym)))
    };
  });

  items.sort((a, b) => b.score - a.score || b.recentTotal - a.recentTotal);

  return { targetYm, lastYearYm, recent, ready: true, items: items.filter((i) => i.score > 0), all: items };
}

export const pct = (v, signed = false) => (signed && v > 0 ? '+' : '') + Math.round(v * 100) + '%';
export const yen = (v) => '¥' + Math.round(v).toLocaleString('ja-JP');

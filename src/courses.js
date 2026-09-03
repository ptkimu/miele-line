/**
 * メニューの一覧。ここが唯一の置き場所です。
 *
 * コース診断・メニュー料金ページ・空き枠のお知らせは、すべてここを読みます。
 * メニューが変わったときに直すのはこのファイルだけで、
 * 3か所に書き写す必要はありません。
 *
 *   price    新規（初回）価格。掲載価格はすべて新規価格でそろえています
 *   reg      2回目以降の通常価格（ある場合のみ）
 *   min      所要時間（分）。null は掲載がないもの
 *   room     'self' セルフブース / 'room' 施術ルーム
 *   slot     空き枠のお知らせに出せるか。所要時間が分かっているものだけ true
 *   short    空き枠のお知らせで使う短い名前（長い正式名の代わり）
 *   sex      'f' 女性限定 / 'm' 男性向け。無ければどなたでも
 *   concerns お悩み。診断で突き合わせる
 *   paces    通い方
 */

export const GENDERS = [
  { id: 'f', label: '女性', em: '👩' },
  { id: 'm', label: '男性', em: '👨' }
];

/* 女性限定の項目（sex:'f'）は末尾に置く。男性のとき2つ消えても
   「セルフ脱毛／セラピスト脱毛」が同じ行に並ぶよう並び順を固定している */
export const CONCERNS = [
  { id: 'pore',   label: '毛穴・シミ・くすみ',   em: '✨' },
  { id: 'acne',   label: 'ニキビ・肌荒れ',       em: '🌿' },
  { id: 'lift',   label: 'たるみ・小顔',         em: '🪞' },
  { id: 'belly',  label: 'お腹・太ももの脂肪',   em: '🎯' },
  { id: 'arm',    label: '二の腕・脚のライン',   em: '💧' },
  { id: 'relax',  label: '疲れ・肩こり・むくみ', em: '🌙' },
  { id: 'self',   label: 'セルフ脱毛',           em: '🪶', sub: 'ご自身で照射／低価格' },
  { id: 'thera',  label: 'セラピスト脱毛',       em: '🧔', sub: 'スタッフにおまかせ' },
  { id: 'post',   label: '産後の体型戻し',       em: '🍼', sex: 'f' },
  { id: 'bridal', label: '結婚式・イベント前',   em: '💍', sex: 'f' }
];

/** cap = ご予算の上限額。この金額を超えるコースは候補に出さない */
export const BUDGETS = [
  { id: 'b1',  tier: 1, cap: 5000,     label: '〜5,000円',        sub: 'まずは気軽に試したい' },
  { id: 'b2',  tier: 2, cap: 10000,    label: '5,000〜10,000円',  sub: '続けやすい価格帯' },
  { id: 'b3',  tier: 3, cap: 15000,    label: '10,000〜15,000円', sub: 'しっかりケアしたい' },
  { id: 'b4',  tier: 4, cap: Infinity, label: '15,000円以上',     sub: '結果を最優先したい' },
  { id: 'any', tier: 0, cap: Infinity, label: 'こだわらない',      sub: '内容で選びたい' }
];

export const PACES = [
  { id: 'trial',     label: 'まずは1回体験したい',     sub: '初回体験・お試しメニュー' },
  { id: 'intensive', label: '短期集中で結果を出したい', sub: '回数を重ねてしっかり' },
  { id: 'monthly',   label: '月1〜2回でコツコツ',       sub: '無理なく続けたい' },
  { id: 'quick',     label: '30分以内でサッと',         sub: '仕事帰り・すきま時間に' }
];

/** 男性がセラピスト脱毛を選んだときに出す注意書き */
export const MENS_VIO_NOTE =
  '※ メンズのVIO脱毛は、セラピストによる施術は行っておりません。' +
  'セルフ脱毛でのご対応となります（ブースをご用意しています）。';

export const COURSES = [
  /* --- 肌管理・フェイシャル --- */
  { id: 'duct-try', name: 'ダクトピール お試しお手軽コース', price: 5800, min: 60,
    cat: '韓国肌管理', badge: '新規限定', room: 'room', slot: true,
    concerns: ['pore', 'acne'], paces: ['trial'],
    desc: '日本初上陸の第5世代韓国ピーリング。毛穴ケア・シミケアをまず1回試したい方へ。' },
  { id: 'duct', name: '韓国肌管理 ダクトピール（毛穴/美白/水光肌）', price: 7800, min: 60,
    cat: '韓国肌管理', badge: '新規限定', room: 'room', slot: true,
    concerns: ['pore', 'acne'], paces: ['monthly', 'intensive'],
    desc: 'ピーリング→美容導入→特殊ゲルマスクの3ステップ。透明感のある水光肌へ。' },
  { id: 'duct-90', name: 'ダクトピール 90分 specialコース', price: 12800, min: 90,
    cat: '韓国肌管理', badge: '新規限定', room: 'room', slot: true,
    concerns: ['pore', 'acne', 'bridal'], paces: ['intensive'],
    desc: 'ピールクレンザーから美容導入・ゲルマスクまで、90分かけて行うフルコースです。' },
  { id: 'duct-plasma', name: 'ダクトピール × プラズマ トリプルアプローチ', price: 10800, min: null,
    cat: '韓国肌管理', badge: '新規限定', room: 'room', slot: false,
    concerns: ['pore', 'acne'], paces: ['intensive'],
    desc: 'DactorPeel のあとにプラズマ＋ヒト幹細胞導入。肌トラブルを多角的にケアします。' },
  { id: 'plasma', name: 'プラズマシャワー', price: 5500, min: 60,
    cat: 'フェイシャル', badge: '新規限定', room: 'room', slot: true,
    concerns: ['acne', 'pore'], paces: ['trial', 'quick', 'monthly'],
    desc: 'オゾンプラズマ→フラッシュプラズマ→幹細胞導入。肌荒れが気になる季節におすすめ。' },
  { id: 'plasma-photo', name: 'プラズマ × 光フェイシャル', price: 8800, min: 60,
    cat: 'フェイシャル', badge: '期間限定', room: 'room', slot: true,
    concerns: ['pore', 'acne'], paces: ['monthly', 'intensive'],
    desc: 'プラズマシャワー後にミルキー光フェイシャル。毛穴とシミをまとめてケアします。' },
  { id: 'milky', name: 'ミルキーフェイシャル 30分', price: 3300, reg: 5390, min: 30,
    cat: 'フェイシャル', badge: '新規限定', room: 'room', slot: true,
    concerns: ['pore'], paces: ['quick', 'trial', 'monthly'],
    desc: '光フェイシャル＋保湿パックを30分で。すきま時間に肌のトーンを整えたい方へ。' },
  { id: 'lala', name: '韓国肌管理 ララピール', price: 8800, reg: 11000, min: 60,
    cat: '韓国肌管理', badge: '新規限定', room: 'room', slot: true,
    concerns: ['pore', 'bridal'], paces: ['monthly', 'intensive'],
    desc: '第4世代ピーリング。ごわつきをリセットし、なめらかな肌質へ導きます。' },
  { id: 'potenza', name: 'エステ版ポテンツァ リジュラン導入', price: 16800, min: null,
    cat: '韓国肌管理', badge: '', room: 'room', slot: false,
    concerns: ['pore', 'lift', 'bridal'], paces: ['intensive'],
    desc: 'DactorPeel後にマイクロチップニードルマシンで導入。ハリ不足が気になる方に。' },

  /* --- 小顔・リフト --- */
  { id: 'red-face', name: '小顔輪郭形成 REDショット（目の下・頬・ほうれい線）',
    short: '小顔輪郭形成 REDショット', price: 9800, min: 60,
    cat: '小顔', badge: '新規限定', room: 'room', slot: true,
    concerns: ['lift'], paces: ['intensive'],
    desc: 'REDショット×プラズマ×EMSで、目の下・頬・ほうれい線に集中アプローチ。' },
  { id: 'red-jaw', name: '小顔輪郭形成 REDショット（二重アゴ・フェイスライン）', price: 9800, min: null,
    cat: '小顔', badge: '新規限定', room: 'room', slot: false,
    concerns: ['lift'], paces: ['intensive'],
    desc: 'REDショット×プラズマ×EMSで、フェイスラインと二重アゴを集中ケアします。' },
  { id: 'therma-low', name: 'サーマエッジ 下顔ショット 時間内打ち放題', price: 11000, min: null,
    cat: '小顔', badge: '', room: 'room', slot: false,
    concerns: ['lift'], paces: ['intensive', 'monthly'],
    desc: '下顔まわりを時間内打ち放題で引き締め。フェイスラインの変化を狙う方に。' },
  { id: 'therma-full', name: 'サーマエッジ 全顔ショット 時間内打ち放題', price: 16000, min: null,
    cat: '小顔', badge: '', room: 'room', slot: false,
    concerns: ['lift', 'bridal'], paces: ['intensive'],
    desc: '顔全体を時間内打ち放題。しっかり結果を出したい方向けのハイグレードコースです。' },
  { id: 'bridal-face', name: '結婚式向け 花嫁フェイシャル集中コース', price: 14300, min: 90,
    cat: 'ブライダル', badge: '新規限定', sex: 'f', room: 'room', slot: true,
    concerns: ['bridal', 'pore', 'lift'], paces: ['intensive'],
    desc: 'ララピール→光フェイシャル→高浸透パックの90分。式当日のベストコンディションへ。' },

  /* --- 痩身・ボディ --- */
  { id: 'cryo-arm', name: '脂肪冷却 2カップ 二の腕', price: 7800, min: 30,
    cat: '痩身', badge: '新規限定', room: 'room', slot: true,
    concerns: ['arm'], paces: ['trial', 'intensive'],
    desc: 'マイナス12度の脂肪冷却で二の腕を集中ケア。30分で気軽に始められます。' },
  { id: 'cryo-belly', name: '脂肪冷却 2カップ お腹 or 太もも or お尻', price: 9800, min: 45,
    cat: '痩身', badge: '新規限定', room: 'room', slot: true,
    concerns: ['belly'], paces: ['trial', 'intensive'],
    desc: '話題の脂肪冷却をマイナス12度で。気になる1箇所をピンポイントで狙います。' },
  { id: 'redbody-arm', name: 'レッドショットBODY 二の腕コース', price: 7700, min: null,
    cat: '痩身', badge: '', room: 'room', slot: false,
    concerns: ['arm'], paces: ['intensive'],
    desc: '韓国発の痩身マシン。REDショット×超音波で二の腕をすっきり見せます。' },
  { id: 'redbody-belly', name: 'レッドショットBODY お腹 or 脚コース', price: 14800, min: null,
    cat: '痩身', badge: '', room: 'room', slot: false,
    concerns: ['belly'], paces: ['intensive'],
    desc: 'RED×超音波×EMSの組み合わせで、お腹または脚を本格的にケアします。' },
  { id: 'rf-pulse', name: 'お腹・太ももを集中ケア（ラジオ波×電磁パルス）',
    short: 'お腹・太ももを集中ケア', price: 6300, min: 50,
    cat: '痩身', badge: '新規限定', room: 'room', slot: true,
    concerns: ['belly', 'post'], paces: ['monthly', 'trial'],
    desc: 'ラジオ波20分＋電磁パルス30分。まずは続けやすい価格で始めたい方に。' },
  { id: 'rf-cryo-arm', name: 'ラジオ波 & 脂肪冷却 二の腕 or ふくらはぎ', price: 11100, min: 60,
    cat: '痩身', badge: '新規限定', room: 'room', slot: true,
    concerns: ['arm'], paces: ['intensive', 'monthly'],
    desc: 'ラジオ波20分＋冷却30分＋マッサージ。温めてから冷やす二段階アプローチ。' },
  { id: 'rf-cryo-belly', name: 'ラジオ波 & 脂肪冷却 お腹 or 太もも', price: 13100, min: 75,
    cat: '痩身', badge: '新規限定', room: 'room', slot: true,
    concerns: ['belly'], paces: ['intensive', 'monthly'],
    desc: 'ラジオ波20分＋脂肪冷却45分の75分コース。お腹・太ももをじっくりケアします。' },
  { id: 'cryo-rf-60', name: '最新 脂肪冷却 × 全身ラジオ波 60分', price: 17500, min: 60,
    cat: '痩身', badge: '期間限定', room: 'room', slot: true,
    concerns: ['belly', 'relax', 'post'], paces: ['intensive'],
    desc: '痩身と疲労回復を同時に。全身のめぐりを整えながら脂肪にアプローチします。' },
  { id: 'cryo-4', name: '脂肪冷却 4カップ 痩身コース', price: 20900, min: null,
    cat: '痩身', badge: '期間限定', room: 'room', slot: false,
    concerns: ['belly', 'arm', 'post'], paces: ['intensive'],
    desc: '脂肪冷却4カップ＋ラジオ波で2箇所同時施術。短期で変化を出したい方へ。' },
  { id: 'post-diet', name: '産後ダイエット向け マシン3種コース', price: 16100, min: null,
    cat: '痩身', badge: '新規限定', sex: 'f', room: 'room', slot: false,
    concerns: ['post', 'belly'], paces: ['intensive'],
    desc: '脂肪冷却・電磁パルス・ラジオ波の3種で、産後の気になる脂肪をケアします。' },

  /* --- リラクゼーション --- */
  { id: 'head-20', name: 'ヘッド & デコルテマッサージ 20分', price: 2200, min: 20,
    cat: 'リラク', badge: '', room: 'room', slot: true,
    concerns: ['relax'], paces: ['quick', 'trial'],
    desc: 'デコルテオイル10分＋ヘッドマッサージ10分。仕事帰りのリセットに。' },
  { id: 'aroma-40', name: 'アロマトリートメント 40分', price: 5500, min: 40,
    cat: 'リラク', badge: '', room: 'room', slot: true,
    concerns: ['relax'], paces: ['quick', 'monthly', 'trial'],
    desc: 'エッセンシャルオイルを使った全身トリートメント。心身をゆるめたい日に。' },
  { id: 'aroma-60', name: 'アロマトリートメント 60分', price: 7700, min: 60,
    cat: 'リラク', badge: '', room: 'room', slot: true,
    concerns: ['relax'], paces: ['monthly'],
    desc: 'アロマトリートメント＋もも・ふくらはぎのリンパマッサージでむくみもケア。' },

  /* --- 脱毛 --- */
  { id: 'led-try', name: '痛みが少ないLED脱毛 初回体験', price: 2200, min: 20,
    cat: '脱毛', badge: '新規限定', room: 'room', slot: true,
    concerns: ['thera'], paces: ['trial', 'quick'],
    desc: '1部位20分。痛みが少ないLED脱毛を、まずは初回体験価格でお試しいただけます。' },
  { id: 'vio-30', name: '【女性限定】VIO脱毛 30分', price: 4950, min: 30,
    cat: '脱毛', badge: '新規限定', sex: 'f', room: 'room', slot: true,
    concerns: ['thera'], paces: ['trial', 'quick', 'intensive'],
    desc: 'セラピストによるVIO脱毛30分。デリケートゾーンもお任せください。' },
  { id: 'thera-30', name: 'セラピスト脱毛 30分', price: 4950, reg: 6600, min: 30,
    cat: '脱毛', badge: '新規限定', room: 'room', slot: true,
    concerns: ['thera'], paces: ['monthly', 'quick', 'intensive'],
    desc: 'LED脱毛30分の打ち放題。気になる部位を時間内で自由にお手入れできます。' },
  { id: 'self-30', name: 'セルフ脱毛 30分', price: 3300, reg: 4950, min: 30,
    cat: '脱毛', badge: '新規限定', room: 'self', slot: true,
    concerns: ['self'], paces: ['quick', 'trial', 'monthly'],
    desc: '時間内でご自身でお手入れ。費用を抑えながら、気になる部位をこまめにケアできます。' },
  { id: 'thera-60', name: 'セラピスト脱毛 60分（全身可）', price: 9900, reg: 13200, min: 60,
    cat: '脱毛', badge: '新規限定', room: 'room', slot: true,
    concerns: ['thera'], paces: ['intensive', 'monthly'],
    desc: '60分の打ち放題。全身をまとめてでも、気になる部位を重点的にでもOK。顔・VIOをご希望の方は90分コースへ。' },
  { id: 'self-60', name: 'セルフ脱毛 60分（全身OK）', price: 6600, reg: 9900, min: 60,
    cat: '脱毛', badge: '新規限定', room: 'self', slot: true,
    concerns: ['self'], paces: ['monthly', 'intensive'],
    desc: '60分のセルフ脱毛。全身をまるごと、ご自身のペースでお手入れいただけます。' },
  /* 90分の全身は顔・VIOの扱いが男女で異なるため2本立て（メンズVIOはセルフのため対象外） */
  { id: 'thera-90-f', name: 'セラピスト全身脱毛（顔・VIOあり）90分',
    short: 'セラピスト全身脱毛 90分', price: 14850, reg: 19800, min: 90,
    cat: '脱毛', badge: '新規限定', sex: 'f', room: 'room', slot: true,
    concerns: ['thera', 'bridal'], paces: ['intensive'],
    desc: '顔・VIOまで含めた90分の全身脱毛。まるごとお手入れしたい方の決定版プランです。' },
  { id: 'thera-90-m', name: 'セラピスト全身脱毛（顔あり・VIO無し）90分',
    short: 'セラピスト全身脱毛 90分（VIO無し）', price: 14850, reg: 19800, min: 90,
    cat: '脱毛', badge: '新規限定', sex: 'm', room: 'room', slot: true,
    concerns: ['thera'], paces: ['intensive'],
    desc: '顔を含めた90分の全身脱毛。VIOはセルフ脱毛のご用意がありますのでご相談ください。' },
  { id: 'mens-beard', name: 'メンズ髭脱毛 LED脱毛 初回体験', price: 2200, min: 20,
    cat: 'メンズ', badge: '新規限定', sex: 'm', room: 'room', slot: true,
    concerns: ['thera'], paces: ['trial', 'quick'],
    desc: '痛みが少ないLED脱毛でヒゲを。毎日の髭剃り負担を減らしたい方へ。' },
  { id: 'mens-body', name: '体毛が濃いメンズへ LED脱毛 初回体験', price: 2200, min: 20,
    cat: 'メンズ', badge: '新規限定', sex: 'm', room: 'room', slot: true,
    concerns: ['thera'], paces: ['trial', 'quick'],
    desc: '1部位20分以内。体毛の濃さが気になる男性の初回体験メニューです。' }
];

/* ------------------------------------------------------------------ *
 * 取り出し
 * ------------------------------------------------------------------ */

/** 空き枠のお知らせに出す名前。長い正式名には短い名前を用意している */
export const slotName = (course) => course.short ?? course.name;

/** 空き枠に出せるメニュー（所要時間が分かっているもの）を部屋ごとに */
export const slotMenusOf = (room) =>
  COURSES.filter((c) => c.slot && c.room === room && c.min)
    .map((c) => ({ name: slotName(c), minutes: c.min }))
    .sort((a, b) => a.minutes - b.minutes);

/** 名前からコースを引く。空き枠の短い名前でも引けるようにしておく */
export const courseByName = (name) =>
  COURSES.find((c) => c.name === name || c.short === name) ?? null;

export const courseById = (id) => COURSES.find((c) => c.id === id) ?? null;

/** 性別で対象外のもの（女性限定／男性限定）は外す。質問項目にも使う */
export const forGender = (item, gender) => !item.sex || item.sex === gender;

export const labelOf = (list, id) => list.find((o) => o.id === id)?.label ?? '';

/* ------------------------------------------------------------------ *
 * 診断
 * ------------------------------------------------------------------ *
 * お悩み一致 +2 / 予算ぴったり +3・隣の価格帯 +1 / 通い方一致 +3
 * ご予算は「上限」として扱い、超える金額のコースは出しません。
 */

export const MAX_RESULTS = 4;

const tierOf = (price) => (price <= 5000 ? 1 : price <= 10000 ? 2 : price <= 15000 ? 3 : 4);

export const budgetCap = (budgetId) =>
  BUDGETS.find((b) => b.id === budgetId)?.cap ?? Infinity;

export function needsMensVioNote(answers) {
  return answers?.gender === 'm' && (answers?.concerns ?? []).includes('thera');
}

function scoreCourse(course, answers) {
  const hits = [];
  let score = 0;

  const matched = course.concerns.filter((c) => (answers.concerns ?? []).includes(c));
  score += matched.length * 2;
  for (const m of matched) hits.push(labelOf(CONCERNS, m) + ' に対応');

  const budget = BUDGETS.find((b) => b.id === answers.budget) ?? BUDGETS[4];
  const t = tierOf(course.price);
  if (budget.tier === 0) {
    score += 2;
    hits.push('価格帯おまかせ');
  } else if (budget.tier === t) {
    score += 3;
    hits.push('ご予算にぴったり');
  } else if (Math.abs(budget.tier - t) === 1) {
    score += 1;
    hits.push('ご予算に近い');
  }

  if (course.paces.includes(answers.pace)) {
    score += 3;
    hits.push(labelOf(PACES, answers.pace).replace(/したい$/, '').replace(/で$/, '') + ' に最適');
  }

  const max = (answers.concerns ?? []).length * 2 + 3 + 3;
  return { course, score, hits, rate: Math.round((score / max) * 100), matched: matched.length };
}

/* ご予算「こだわらない」のときは、同じ価格帯だけで枠が埋まらないよう
   価格帯が重ならないように上位から採り、余った枠をスコア順で埋める。
   お手頃コースだけが並んで、しっかりコースが埋もれるのを防ぐ */
function pickSpread(list, n) {
  const picked = [];
  const seen = new Set();
  for (const r of list) {
    if (picked.length >= n) break;
    const t = tierOf(r.course.price);
    if (seen.has(t)) continue;
    seen.add(t);
    picked.push(r);
  }
  for (const r of list) {
    if (picked.length >= n) break;
    if (!picked.includes(r)) picked.push(r);
  }
  return picked.sort((a, b) => list.indexOf(a) - list.indexOf(b));
}

/**
 * 診断の結果。
 * @returns {{results:object[], overBudget:boolean}}
 */
export function diagnose(answers) {
  const cap = budgetCap(answers.budget);

  const ranked = COURSES.filter((c) => forGender(c, answers.gender))
    .map((c) => scoreCourse(c, answers))
    .sort((a, b) => b.score - a.score || a.course.price - b.course.price);

  // お悩みが1つも一致しないコースは出さない
  const hit = ranked.filter((r) => r.matched > 0);
  const within = hit.filter((r) => r.course.price <= cap);

  if (within.length) {
    return {
      results: answers.budget === 'any' ? pickSpread(within, MAX_RESULTS) : within.slice(0, MAX_RESULTS),
      overBudget: false
    };
  }

  // ご予算内に該当が無い場合だけ、条件に合う中で安いものを2件ご案内する
  if (hit.length) {
    return {
      results: [...hit].sort((a, b) => a.course.price - b.course.price).slice(0, 2),
      overBudget: true
    };
  }
  return { results: [], overBudget: false };
}

/* ------------------------------------------------------------------ *
 * タグ
 * ------------------------------------------------------------------ *
 * 診断の答えをタグに変えます。
 * このタグが、空き枠のお知らせを「関心のある方だけ」に絞る材料になります。
 */

export function tagsFromDiagnosis(answers, results = []) {
  const out = [];
  const push = (kind, name) => name && !name.endsWith(':') && out.push({ kind, name });

  push('gender', '性別:' + (answers.gender === 'm' ? '男性' : '女性'));
  for (const c of answers.concerns ?? []) push('concern', '関心:' + labelOf(CONCERNS, c));
  push('budget', '予算:' + labelOf(BUDGETS, answers.budget));
  push('pace', '通い方:' + labelOf(PACES, answers.pace));

  return out;
}

/** 空き枠のメニューから、関心タグの名前を作る（絞り込みの突き合わせ用） */
export function concernTagsOfMenus(menuNames = []) {
  const ids = new Set();
  for (const name of menuNames) {
    for (const c of courseByName(name)?.concerns ?? []) ids.add(c);
  }
  return [...ids].map((id) => '関心:' + labelOf(CONCERNS, id));
}

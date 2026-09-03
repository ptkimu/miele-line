/**
 * リッチメニューのボタン
 *
 * ここが1か所の定義です。編集すると、
 *   - メニュー画像（design / 作成ページ）
 *   - お客様がタップしたときのキーワード
 *   - デモの表示
 * のすべてに反映されます。
 *
 * 管理画面で設定するアクションは「テキスト」で、送る内容が keyword です。
 * ポストバックは管理画面から選べないため、テキストで受けています。
 */

/** アイコン。SVG の path（100×100 の座標系、線で描く） */
export const ICONS = {
  calendar:
    'M18 26 h64 a6 6 0 0 1 6 6 v50 a6 6 0 0 1 -6 6 h-64 a6 6 0 0 1 -6 -6 v-50 a6 6 0 0 1 6 -6 z ' +
    'M12 44 h76 M32 18 v16 M68 18 v16 M38 62 l8 9 18 -20',
  chat:
    'M18 24 h64 a6 6 0 0 1 6 6 v34 a6 6 0 0 1 -6 6 h-40 l-16 14 v-14 h-8 ' +
    'a6 6 0 0 1 -6 -6 v-34 a6 6 0 0 1 6 -6 z M32 40 h36 M32 54 h24',
  doc:
    'M24 12 h52 a6 6 0 0 1 6 6 v64 a6 6 0 0 1 -6 6 h-52 a6 6 0 0 1 -6 -6 v-64 a6 6 0 0 1 6 -6 z ' +
    'M36 34 h28 M36 50 h28 M36 66 h18',
  search:
    'M72 45 a27 27 0 1 1 -54 0 a27 27 0 1 1 54 0 M64 64 L86 86 M45 33 v9 M45 52 v1',
  pin:
    'M50 88 C50 88 76 62 76 42 A26 26 0 0 0 24 42 C24 62 50 88 50 88 z ' +
    'M60 42 a10 10 0 1 1 -20 0 a10 10 0 1 1 20 0',
  clock:
    'M84 50 a34 34 0 1 1 -68 0 a34 34 0 1 1 68 0 M50 28 v24 l17 9',
  gift:
    'M14 44 h72 v14 h-72 z M20 58 h60 v30 h-60 z M50 44 v44 ' +
    'M50 44 c-14 0 -22 -6 -22 -14 a10 10 0 0 1 22 -2 a10 10 0 0 1 22 2 c0 8 -8 14 -22 14 z',
  star:
    'M50 16 l10 22 24 3 -18 17 5 24 -21 -12 -21 12 5 -24 -18 -17 24 -3 z',
  clip:
    'M32 16 h36 a6 6 0 0 1 6 6 v62 a6 6 0 0 1 -6 6 h-36 a6 6 0 0 1 -6 -6 v-62 a6 6 0 0 1 6 -6 z ' +
    'M40 10 h20 a4 4 0 0 1 4 4 v6 h-28 v-6 a4 4 0 0 1 4 -4 z M38 44 h24 M38 58 h24 M38 72 h14'
};

/** 画像の大きさと区切り方。管理画面のテンプレートに対応する */
export const LAYOUTS = [
  { id: 'large-6', label: '大・3列×2段（6ボタン）', w: 2500, h: 1686, cols: 3, rows: 2 },
  { id: 'large-4', label: '大・2列×2段（4ボタン）', w: 2500, h: 1686, cols: 2, rows: 2 },
  { id: 'small-4', label: '小・4列×1段（4ボタン）', w: 2500, h: 843,  cols: 4, rows: 1 },
  { id: 'small-2', label: '小・2列×1段（2ボタン）', w: 2500, h: 843,  cols: 2, rows: 1 }
];

/**
 * 既定のボタン。
 *   label   画像に出る文字
 *   sub     その下の小さい文字
 *   icon    ICONS の名前
 *   keyword 管理画面の「テキスト」に入れる内容。空なら応答なし
 *   lead    地色を変えて目立たせるボタン（1つだけ）
 *   link    リンクにする場合の説明（keyword の代わり）
 */
export const MENU = [
  { id:'diagnosis', label:'コース診断',       sub:'1分でおすすめを提案',  icon:'search',   link:'/app/diagnosis', lead:true },
  { id:'menu',      label:'メニュー・料金',   sub:'新規価格でご案内',     icon:'doc',      link:'/app/menu' },
  { id:'booking',   label:'ご予約',           sub:'予約システムへ',       icon:'chat',     link:'booking' },
  { id:'intake',    label:'問診表',           sub:'ご来店前にご記入',     icon:'clip',     link:'/app/intake' },
  { id:'open_slot', label:'空き枠のお知らせ', sub:'受け取り設定はこちら', icon:'calendar', link:'/app/slot', badge:'NEW' },
  { id:'access',    label:'アクセス・営業時間', sub:'古河駅 徒歩8分',     icon:'pin',      link:'/app/access' }
];

/**
 * ボタンの行き先。
 *
 * LIFFのURLは https://liff.line.me/＜LIFF ID＞/＜続き＞ の形です。
 * 「続き」がエンドポイントURLの後ろに足されるので、
 * エンドポイントを .../app/ にしておけば
 *   https://liff.line.me/＜LIFF ID＞/menu → .../app/menu
 * のように、1つのLIFF IDで全ページをまかなえます。
 *
 *   '/app/...'  LIFFのページ
 *   'booking'   予約システム（src/salon.js の bookingUrl）
 *   keyword     テキスト送信 →自動応答（LIFFを使わない場合の代わり）
 */
export const LIFF_ENDPOINT_PATH = '/app/';

export const linkTarget = (item, salon, liffId = '') => {
  if (item.link === 'booking') return salon?.bookingUrl ?? '';
  if (item.link?.startsWith('/app/')) {
    const rest = item.link.slice('/app/'.length);
    return liffId ? `https://liff.line.me/${liffId}/${rest}` : item.link;
  }
  return item.link ?? '';
};

/** レイアウトに合わせて必要な数だけ切り出す */
export function cellsFor(menu, layout) {
  const need = layout.cols * layout.rows;
  return menu.slice(0, need);
}

export const layoutById = (id) => LAYOUTS.find((l) => l.id === id) ?? LAYOUTS[0];

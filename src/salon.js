/**
 * 店舗情報。応答メッセージの文面はすべてここを参照する。
 *
 * ★ TODO と書かれた項目は、実際の値に置き換えてください。
 *   置き換えるまでの間、その項目に関する質問には自動応答せず、
 *   スタッフのLINEチャットに回す動きになります（誤った案内を出さないため）。
 */

export const SALON = {
  name: 'ビューティサロン ミエーレ',
  address: '茨城県古河市本町3-19-1 Anesisビル',
  access: 'JR古河駅から徒歩8分',

  // ★ TODO: 営業時間（例: '10:00〜20:00（最終受付 19:00）'）
  hours: null,

  // ★ TODO: 定休日（例: '毎週火曜日'）
  closed: null,

  // ★ TODO: 電話番号
  tel: null,

  // ★ TODO: 駐車場の案内（例: '店舗裏に3台分ございます'）
  parking: null,

  bookingUrl: 'https://beauty.hotpepper.jp/kr/slnH000649391/',
  couponUrl: 'https://beauty.hotpepper.jp/kr/slnH000649391/coupon/',

  // ★ TODO: LIFF ID を発行したら、コース診断ツールのURLに置き換える
  //   https://liff.line.me/＜LIFF_ID＞
  diagnosisUrl: null
};

/** TODO のままの項目を使った案内は出さない */
export const has = (value) => typeof value === 'string' && value.length > 0;

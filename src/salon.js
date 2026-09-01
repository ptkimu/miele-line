/**
 * 店舗情報。応答メッセージの文面はすべてここを参照する。
 *
 * 値が null の項目は、その話題への自動応答が無効になる。
 * 間違った案内を自動で返すより、スタッフがお答えするほうが確実なため。
 */

export const SALON = {
  name: 'トータル・ビューティー・サロン ミエーレ',
  shortName: 'ミエーレ',

  postal: '〒306-0023',
  address: '茨城県古河市本町3丁目19-1 Anesisビル',
  access: 'JR古河駅から徒歩8分',
  parking: '専用駐車場あり（店舗前にスタッフが駐車場までご案内します）',

  hours: '9:00〜19:00',
  closed: '年中無休',
  tel: '090-3286-4994',

  reservation: '完全予約制',
  reservationNote: 'お一人さま・ペアでのご来店も承ります',
  payment: '現金 / Visa / Mastercard / JCB / American Express',

  bookingUrl: 'https://beauty.hotpepper.jp/kr/slnH000649391/',
  couponUrl: 'https://beauty.hotpepper.jp/kr/slnH000649391/coupon/',

  // ★ TODO: LIFF ID を発行したら、コース診断ツールのURLに置き換える
  //   https://liff.line.me/＜LIFF_ID＞
  diagnosisUrl: null
};

/** 未設定の項目を使った案内は出さない */
export const has = (value) => typeof value === 'string' && value.length > 0;

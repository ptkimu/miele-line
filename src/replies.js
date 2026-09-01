/**
 * キーワード応答
 *
 * すべて Reply API で返すため、何件返しても通数は消費しません。
 *
 * 方針：
 *   - どのルールにも当てはまらない場合は「返信しない」。
 *     「わかりません」と返すより、スタッフがLINEチャットで答えたほうが良いため。
 *   - 店舗情報が salon.js で未設定（TODO）の項目は、案内を出さずに黙る。
 *     誤った営業時間を自動で答えてしまうほうが害が大きいため。
 *   - 未対応の質問は inbound_messages に matched=NULL で残るので、
 *     `npm run db:unmatched` で「よく聞かれるのに答えられていない質問」が分かります。
 */

import { SALON, has } from './salon.js';
import { text, withButtons, button } from './line.js';

/* ボタンを押したあとの返信。設定手順の資料からも参照するので、
   文面はここに置いて1か所で管理する */
export const OPTIN_DONE = [
  '空き枠のお知らせを受け取る設定にしました。',
  '',
  'ご希望に近いお席だけをお送りしたいので、よろしければ教えてください。',
  '下のボタンからお選びいただけます。'
].join('\n');

/** 受け取り希望のあとに伺う内容。ここで選んでいただくと、送る枠を絞れます */
export const PREF_QUESTION = [
  { label: 'セルフ脱毛', value: 'self' },
  { label: 'セラピスト施術', value: 'room' },
  { label: 'どちらも', value: 'both' }
];

export const PREF_DONE = (labels) => [
  `${labels}のお席が空いたときにお送りします。`,
  '',
  'ご予約のキャンセルなどでお席が空いたとき、こちらにご連絡します。',
  '止めたいときは「空き枠」とお送りください。'
].join('\n');

export const OPTOUT_DONE = [
  '空き枠のお知らせは送らない設定にしました。',
  '',
  'またご希望のときは「空き枠」とお送りください。'
].join('\n');

const RULES = [
  /* 空き枠の受け取り希望。
     稼働の初日は希望者が0名なので、こことリッチメニューから集めます。
     一斉送信で募る必要はありません。 */
  {
    name: 'open_slot_optin',
    keys: ['空き枠', 'キャンセル待ち', '空きが出たら', 'お知らせ希望'],
    build: () => [
      withButtons(
        text([
          '空き枠のお知らせについてです。',
          '',
          'ご予約のキャンセルなどで空きが出たとき、LINEにご登録の方へ先にお知らせしています。',
          '',
          '受け取りをご希望の場合は、下のボタンを押してください。いつでも止められます。'
        ].join('\n')),
        [button('受け取る', 'action=optin', '受け取ります'),
         button('今はやめておく', 'action=optout', '今はやめておきます')]
      )
    ]
  },

  {
    name: 'booking',
    keys: ['予約', 'よやく', '空き', 'あき', '空いて', 'キャンセル'],
    /* LINEで完結させます。ホットペッパーへは誘導しません。
       LINEで予約が取れること自体が、LINEに登録する価値になるためです。 */
    build: () => {
      const lines = [
        'ご予約のご相談ありがとうございます。',
        has(SALON.reservation) ? `${SALON.name}は${SALON.reservation}です。` : null,
        '',
        'ご希望のお日にちと時間帯を、このままメッセージでお知らせください。',
        'スタッフが空き状況を確認して、折り返しご連絡いたします。',
        '',
        '「今週の土曜の午後」のようなおおまかなご希望でも大丈夫です。',
        has(SALON.reservationNote) ? SALON.reservationNote + '。' : null
      ].filter((l) => l !== null);
      if (has(SALON.diagnosisUrl)) {
        lines.push('', 'メニューで迷われている場合は、こちらの診断もご利用ください。', SALON.diagnosisUrl);
      }
      return [text(lines.join('\n'))];
    }
  },

  {
    name: 'hours',
    keys: ['営業時間', '何時', '開いて', '定休', '休み', 'やってま'],
    requires: () => has(SALON.hours),
    build: () => {
      const lines = ['営業時間のご案内です。', '', `営業時間　${SALON.hours}`];
      if (has(SALON.closed)) lines.push(`定休日　　${SALON.closed}`);
      lines.push('', '最新の空き状況はネット予約からご確認いただけます。', SALON.bookingUrl);
      return [text(lines.join('\n'))];
    }
  },

  {
    name: 'access',
    keys: ['場所', 'アクセス', '住所', 'どこ', '行き方', '地図', '駅'],
    build: () => {
      const lines = [
        `${SALON.name}へのアクセスです。`,
        '',
        has(SALON.postal) ? SALON.postal : null,
        SALON.address,
        SALON.access
      ].filter((l) => l !== null);
      if (has(SALON.parking)) lines.push('', SALON.parking);
      lines.push('', 'Googleマップ',
        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(SALON.address)}`);
      return [text(lines.join('\n'))];
    }
  },

  {
    name: 'parking',
    keys: ['駐車', 'ちゅうしゃ', '車で'],
    requires: () => has(SALON.parking),
    build: () => [text(['駐車場のご案内です。', '', SALON.parking].join('\n'))]
  },

  {
    name: 'menu',
    keys: ['メニュー', '料金', '値段', 'いくら', '価格', 'コース'],
    build: () => {
      /* 料金表として掲載ページを案内するが、ご予約はLINEで受ける */
      const lines = [
        'メニューと料金はこちらからご覧いただけます。',
        '',
        SALON.couponUrl,
        '',
        '掲載価格はすべて税込・新規（初回）価格です。',
        '',
        'ご予約は、このままメッセージでご希望のお日にちをお知らせいただければ承ります。'
      ];
      if (has(SALON.diagnosisUrl)) {
        lines.push(
          '',
          'どのコースが合うか迷われている方へ、3つの質問でおすすめをご提案する診断もご用意しています。',
          SALON.diagnosisUrl
        );
      }
      return [text(lines.join('\n'))];
    }
  },

  {
    name: 'diagnosis',
    keys: ['診断', 'おすすめ', 'どれがいい', '迷って'],
    requires: () => has(SALON.diagnosisUrl),
    build: () =>
      [text([
        'お悩みとご予算から、おすすめのコースをご提案します。',
        '',
        SALON.diagnosisUrl,
        '',
        '所要1分ほどです。結果はそのままご相談にお使いいただけます。'
      ].join('\n'))]
  },

  {
    name: 'tel',
    keys: ['電話', 'でんわ', 'tel'],
    requires: () => has(SALON.tel),
    build: () => [text(['お電話でのお問い合わせはこちらです。', '', SALON.tel].join('\n'))]
  },

  {
    name: 'payment',
    keys: ['支払', 'カード', 'クレジット', '現金', 'paypay', '決済'],
    requires: () => has(SALON.payment),
    build: () =>
      [text([
        'お支払い方法のご案内です。',
        '',
        SALON.payment,
        '',
        'ご不明な点は、このままメッセージでお尋ねください。'
      ].join('\n'))]
  }
];

/**
 * @returns {{ name: string, messages: object[] } | null}
 *   当てはまるルールが無ければ null（＝返信しない）
 */
export function matchReply(input) {
  const q = normalize(input);
  if (!q) return null;

  for (const rule of RULES) {
    if (rule.requires && !rule.requires()) continue;
    if (rule.keys.some((k) => q.includes(normalize(k)))) {
      return { name: rule.name, messages: rule.build() };
    }
  }
  return null;
}

/** 全角スペース・大文字小文字の揺れを吸収する */
function normalize(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[\s　]+/g, '');
}

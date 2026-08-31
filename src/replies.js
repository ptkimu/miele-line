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
import { text } from './line.js';

const RULES = [
  {
    name: 'booking',
    keys: ['予約', 'よやく', '空き', 'あき', '空いて', 'キャンセル'],
    build: () => {
      const lines = [
        'ご予約のご相談ありがとうございます。',
        '',
        'ネット予約はこちらから承っております。',
        SALON.bookingUrl,
        '',
        'お日にちのご相談や、メニューで迷われている場合は、このままメッセージをお送りください。スタッフが確認してお返事いたします。'
      ];
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
        SALON.address,
        SALON.access
      ];
      if (has(SALON.parking)) lines.push('', `駐車場　${SALON.parking}`);
      lines.push('', 'Googleマップ', `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(SALON.address)}`);
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
      const lines = [
        'メニューと料金はこちらからご覧いただけます。',
        '',
        SALON.couponUrl,
        '',
        '掲載価格はすべて税込・新規（初回）価格です。'
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

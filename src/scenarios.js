/**
 * 来店後のご案内（ステップ配信）
 *
 * ミエーレは2〜3週間サイクル、かつ会計時に次回予約を取る運用のため、
 *   - 予約が取れた方には送らない（audience: 'unbooked'）
 *   - サイクルを過ぎる前の11日目に声をかける
 * という組み方にしています。
 *
 * 文面を変えたいときは、このファイルだけを直せば全体に反映されます。
 */

const さん = (name) => (name ? `${name}さん` : 'お客様');

export const STEPS = [
  {
    id: 'after_care',
    label: 'アフターケアのご案内',
    offsetDays: 1,
    audience: 'all', // 予約の有無にかかわらず全員
    purpose: 'お礼と施術後の過ごし方。売り込みはしない',
    build: (c) => [
      [
        `${さん(c.display_name)}、昨日はご来店ありがとうございました。`,
        '',
        '施術後2〜3日は、いつもより保湿を丁寧に、日中の紫外線対策をお願いします。',
        'ご自宅でのケアで気になることがあれば、このままメッセージでご相談ください。'
      ].join('\n')
    ]
  },

  {
    id: 'next_cycle',
    label: '次回のご案内',
    offsetDays: 11,
    audience: 'unbooked', // 次回予約が入っていない方だけ
    purpose: '2〜3週サイクルの手前で、予約を入れる余裕があるうちに声をかける',
    build: (c) => [
      [
        `${さん(c.display_name)}、前回のご来店から2週間ほどが経ちました。`,
        '',
        '続けてお手入れいただくと変化を感じやすい時期です。',
        'ご都合のよいお日にちがあれば、このままメッセージでお知らせください。お席をお取りします。'
      ].join('\n')
    ]
  },

  {
    id: 'open_slot',
    label: 'キャンセル枠のご案内',
    offsetDays: 21,
    audience: 'unbooked',
    purpose: 'まだ予約が無い方へ。売り込みではなく、入りやすい枠の提示に切り替える',
    build: (c) => [
      [
        `${さん(c.display_name)}、こんにちは。`,
        '',
        'お忙しい時期かと思います。直近で空きが出たお日にちは、LINEの方に先にご案内しています。',
        '「空き」とメッセージをいただければ、今週のご案内をお送りします。'
      ].join('\n')
    ]
  },

  {
    id: 'comeback',
    label: 'ご無沙汰フォロー',
    offsetDays: 60,
    audience: 'unbooked',
    purpose: '離れかけている方への復帰のきっかけ。ここだけ特典をつける',
    build: (c) => [
      [
        `${さん(c.display_name)}、お久しぶりです。ミエーレです。`,
        '',
        '前回のご来店から2か月が経ちました。季節の変わり目でお肌の調子が変わりやすい時期です。',
        '久しぶりのご来店の方に、次回ご利用いただける特典をご用意しています。',
        'ご興味があれば「特典」とお送りください。'
      ].join('\n')
    ]
  }
];

/** 何日前の来店が対象になるか（デモの説明用） */
export const stepById = (id) => STEPS.find((s) => s.id === id) ?? null;

/** その日に送る対象となる来店日 */
export function targetVisitDate(today, offsetDays) {
  const ms = Date.parse(today + 'T00:00:00Z') - offsetDays * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
}

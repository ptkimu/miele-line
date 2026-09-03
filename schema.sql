-- ミエーレ 空き枠のお知らせ / D1 スキーマ
-- 実行: npm run db:init

-- 友だち一覧。保存するのは LINE のユーザーIDと表示名だけ。
-- 氏名・電話番号・住所は保存しない（予約情報はサロンボード側に置いたまま）
CREATE TABLE IF NOT EXISTS customers (
  line_user_id  TEXT PRIMARY KEY,
  display_name  TEXT,
  followed_at   TEXT NOT NULL,
  unfollowed_at TEXT,
  status        TEXT NOT NULL DEFAULT 'active'     -- active | blocked
);

CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status, followed_at DESC);

-- タグ。空き枠のお知らせを希望されたか、どちらのお部屋を希望されたか。
--   希望:空き枠のお知らせ / 希望:セルフ脱毛 / 希望:セラピスト施術
CREATE TABLE IF NOT EXISTS tags (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  kind TEXT                                        -- preference
);

CREATE TABLE IF NOT EXISTS customer_tags (
  line_user_id TEXT    NOT NULL,
  tag_id       INTEGER NOT NULL,
  granted_at   TEXT    NOT NULL,
  PRIMARY KEY (line_user_id, tag_id),
  FOREIGN KEY (line_user_id) REFERENCES customers(line_user_id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id)       REFERENCES tags(id)                ON DELETE CASCADE
);

-- Webhook の再送で同じイベントを二度処理しないための記録
CREATE TABLE IF NOT EXISTS processed_events (
  webhook_event_id TEXT PRIMARY KEY,
  created_at       TEXT NOT NULL
);

-- お客様から届いたメッセージのログ。よく聞かれる質問を洗い出して
-- キーワード応答を増やすための材料にする
CREATE TABLE IF NOT EXISTS inbound_messages (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  line_user_id TEXT NOT NULL,
  body         TEXT,
  matched      TEXT,                               -- 応答したルール名 / NULL は未対応
  created_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_inbound_created ON inbound_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inbound_matched ON inbound_messages(matched);

-- 送信の記録。
-- UNIQUE(line_user_id, dedupe_key) により、途中で失敗して送り直しても
-- 同じ人に同じ案内が二度届くことがデータベース側で起こり得ない。
CREATE TABLE IF NOT EXISTS deliveries (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  line_user_id TEXT    NOT NULL,
  step_id      TEXT    NOT NULL,                  -- open_slot
  dedupe_key   TEXT    NOT NULL,                  -- 例 'slot:2026-09-01T09:12:33'
  status       TEXT    NOT NULL,                  -- sending | sent | failed
  messages     INTEGER NOT NULL DEFAULT 1,        -- 消費した通数
  error        TEXT,
  sent_at      TEXT    NOT NULL,
  UNIQUE (line_user_id, dedupe_key),
  FOREIGN KEY (line_user_id) REFERENCES customers(line_user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_deliveries_sent ON deliveries(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_deliveries_step ON deliveries(step_id, status);

-- コース診断の回答。どのお悩みを選ばれたかがタグになり、
-- 空き枠のお知らせを「関心のある方だけ」に絞る材料になる。
-- 保存するのは選択肢のIDだけで、自由入力は受け取らない。
CREATE TABLE IF NOT EXISTS diagnoses (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  line_user_id TEXT NOT NULL,
  gender       TEXT,
  concerns     TEXT,                              -- JSON配列
  budget       TEXT,
  pace         TEXT,
  results      TEXT,                              -- ご提案したコースのID（JSON配列）
  created_at   TEXT NOT NULL,
  FOREIGN KEY (line_user_id) REFERENCES customers(line_user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_diagnoses_user ON diagnoses(line_user_id, created_at DESC);

-- 問診表。健康に関わる内容をお預かりするため、長くは持たない。
-- expires_on を過ぎたものは、毎朝の cron で削除する。
CREATE TABLE IF NOT EXISTS intake_forms (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  line_user_id TEXT NOT NULL,
  display_name TEXT,
  body         TEXT NOT NULL,                     -- 記入内容（JSON）
  expires_on   TEXT NOT NULL,                     -- YYYY-MM-DD。この日を過ぎたら消す
  created_at   TEXT NOT NULL,
  FOREIGN KEY (line_user_id) REFERENCES customers(line_user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_intake_expires ON intake_forms(expires_on);
CREATE INDEX IF NOT EXISTS idx_intake_created ON intake_forms(created_at DESC);

-- 空き枠のお知らせを出した履歴。
-- 「直近7日で何回出したか」をお部屋ごとに数えて、出しすぎを止めるために使う。
CREATE TABLE IF NOT EXISTS open_slots (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kind       TEXT    NOT NULL,               -- 部屋 self = セルフブース / room = 施術ルーム
  slots      TEXT    NOT NULL,               -- 日時・所要時間・メニュー（JSON）
  sent_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_open_slots_created ON open_slots(created_at DESC);

-- Instagram と Google への投稿の予約。
-- LINEに送ってから30分あけて出すため、すぐには投げずにここへ貯める。
-- status を先に 'sending' へ動かしてから投げるので、cron が重なっても二度出ない。
CREATE TABLE IF NOT EXISTS scheduled_posts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  channel    TEXT    NOT NULL,               -- instagram | gbp
  body       TEXT    NOT NULL,               -- 投稿する文面
  image_url  TEXT,                           -- ストーリーズ用の画像（公開URL）
  due_at     TEXT    NOT NULL,               -- この時刻を過ぎたら出す
  status     TEXT    NOT NULL,               -- waiting | sending | posted | failed
  error      TEXT,
  posted_at  TEXT,
  created_at TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scheduled_due ON scheduled_posts(status, due_at);

-- スタッフ用ページから手で出すときに、画像を短い間だけ預かる場所。
-- Instagram は「公開URLにある画像」しか受け取れないため。
CREATE TABLE IF NOT EXISTS media (
  id         TEXT PRIMARY KEY,               -- 推測できない文字列。そのままURLになる
  mime       TEXT NOT NULL,
  data       TEXT NOT NULL,                  -- base64
  expires_on TEXT NOT NULL,                  -- この日を過ぎたら消す
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_media_expires ON media(expires_on);

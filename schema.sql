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

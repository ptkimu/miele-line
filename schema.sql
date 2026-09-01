-- ミエーレ LINE配信システム / D1 スキーマ
-- 実行: npm run db:init

-- 友だち一覧。保存するのは LINE のユーザーIDと表示名だけ。
-- 氏名・電話番号・住所は保存しない（予約情報はホットペッパー側に置いたまま）
CREATE TABLE IF NOT EXISTS customers (
  line_user_id  TEXT PRIMARY KEY,
  display_name  TEXT,
  followed_at   TEXT NOT NULL,
  unfollowed_at TEXT,
  last_visit_at TEXT,                              -- 最終来店日 YYYY-MM-DD
  next_booked   INTEGER NOT NULL DEFAULT 0,        -- 1 = 次回予約が入っている
  status        TEXT NOT NULL DEFAULT 'active'     -- active | blocked
);

CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status, followed_at DESC);
CREATE INDEX IF NOT EXISTS idx_customers_visit  ON customers(last_visit_at);

-- タグ。診断結果や希望条件を貯めていく（フェーズ2以降で本格利用）
CREATE TABLE IF NOT EXISTS tags (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  kind TEXT                                        -- diagnosis | preference | lifecycle
);

CREATE TABLE IF NOT EXISTS customer_tags (
  line_user_id TEXT    NOT NULL,
  tag_id       INTEGER NOT NULL,
  granted_at   TEXT    NOT NULL,
  PRIMARY KEY (line_user_id, tag_id),
  FOREIGN KEY (line_user_id) REFERENCES customers(line_user_id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id)       REFERENCES tags(id)                ON DELETE CASCADE
);

-- 来店記録。次回予約の有無でリマインド対象を分ける
-- UNIQUE により、同じ人の同じ日を二重に記録できない
CREATE TABLE IF NOT EXISTS visits (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  line_user_id TEXT    NOT NULL,
  visited_on   TEXT    NOT NULL,                   -- YYYY-MM-DD
  next_booked  INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT    NOT NULL,
  UNIQUE (line_user_id, visited_on),
  FOREIGN KEY (line_user_id) REFERENCES customers(line_user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_visits_date ON visits(visited_on DESC);

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

-- ============ フェーズ2以降で使うテーブル ============

-- コース診断の回答。タグの元になった内容を残しておく
CREATE TABLE IF NOT EXISTS diagnoses (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  line_user_id TEXT NOT NULL,
  gender       TEXT,
  concerns     TEXT,                              -- JSON配列
  budget       TEXT,
  pace         TEXT,
  results      TEXT,                              -- 提案したコース（JSON配列）
  created_at   TEXT NOT NULL,
  FOREIGN KEY (line_user_id) REFERENCES customers(line_user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_diagnoses_user ON diagnoses(line_user_id, created_at DESC);

-- 配信の記録。
-- UNIQUE(line_user_id, dedupe_key) により、バッチが再実行されても
-- 同じ人に同じ案内が二度届くことがデータベース側で起こり得ない。
CREATE TABLE IF NOT EXISTS deliveries (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  line_user_id TEXT    NOT NULL,
  step_id      TEXT    NOT NULL,
  dedupe_key   TEXT    NOT NULL,                  -- 例 'next_cycle:2026-08-20'
  status       TEXT    NOT NULL,                  -- sending | sent | failed
  messages     INTEGER NOT NULL DEFAULT 1,        -- 消費した通数
  error        TEXT,
  sent_at      TEXT    NOT NULL,
  UNIQUE (line_user_id, dedupe_key),
  FOREIGN KEY (line_user_id) REFERENCES customers(line_user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_deliveries_sent ON deliveries(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_deliveries_step ON deliveries(step_id, status);

-- 売上。オーナー管理のシステムから書き出したCSVを取り込む。
-- お客様個人とは結び付けず、日付・メニュー・金額の集計だけを持つ。
CREATE TABLE IF NOT EXISTS sales (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  sold_on     TEXT    NOT NULL,                  -- YYYY-MM-DD
  menu        TEXT    NOT NULL,                  -- 書き出したままのメニュー名
  category    TEXT,                              -- 脱毛 / 韓国肌管理 など（自動判定）
  amount      INTEGER NOT NULL,
  is_new      INTEGER NOT NULL DEFAULT 0,        -- 1 = 新規
  imported_at TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sales_month ON sales(sold_on);
CREATE INDEX IF NOT EXISTS idx_sales_cat   ON sales(category, sold_on);

-- 空き枠・キャンセル枠のお知らせを出した履歴。
-- 「直近7日で何回出したか」を数えて、出しすぎを止めるために使う。
CREATE TABLE IF NOT EXISTS open_slots (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kind       TEXT    NOT NULL,               -- 部屋 self = セルフブース / room = 施術ルーム
  slots      TEXT    NOT NULL,               -- 日時・メニュー（JSON）
  sent_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_open_slots_created ON open_slots(created_at DESC);

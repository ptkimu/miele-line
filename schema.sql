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

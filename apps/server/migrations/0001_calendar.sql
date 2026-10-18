ALTER TABLE tasks ADD COLUMN scheduled_start TEXT;
ALTER TABLE tasks ADD COLUMN scheduled_end TEXT;

CREATE TABLE IF NOT EXISTS calendar_subscriptions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'url' CHECK (source_type IN ('url', 'file')),
  url TEXT,
  raw_ics TEXT NOT NULL DEFAULT '',
  last_fetched_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_scheduled ON tasks(scheduled_start);

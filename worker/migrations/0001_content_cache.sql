CREATE TABLE IF NOT EXISTS learning_content (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  audio_file_id TEXT NOT NULL DEFAULT '',
  audio_url TEXT NOT NULL DEFAULT '',
  attachments TEXT NOT NULL DEFAULT '',
  links TEXT NOT NULL DEFAULT '',
  is_private TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_learning_content_date ON learning_content(date);
CREATE INDEX IF NOT EXISTS idx_learning_content_subject ON learning_content(subject);
CREATE INDEX IF NOT EXISTS idx_learning_content_created_at ON learning_content(created_at);

CREATE TABLE IF NOT EXISTS sync_state (
  key TEXT PRIMARY KEY,
  last_synced_at TEXT NOT NULL,
  last_row_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'success',
  error_message TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS uploaders (
  id INTEGER PRIMARY KEY,
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  disabled_at TEXT
);

CREATE TABLE IF NOT EXISTS uploader_emails (
  email TEXT PRIMARY KEY COLLATE NOCASE,
  uploader_id INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_uploader_emails_uploader ON uploader_emails(uploader_id);

CREATE TABLE IF NOT EXISTS uploads (
  content_hash TEXT PRIMARY KEY,
  uploader_id INTEGER NOT NULL,
  original_filename TEXT NOT NULL,
  raw_key TEXT NOT NULL,
  uploaded_at TEXT NOT NULL
);

ALTER TABLE images ADD COLUMN uploader_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE images ADD COLUMN content_hash TEXT;

INSERT OR IGNORE INTO uploaders (id, display_name, created_at, disabled_at) VALUES (1, 'MH', datetime('now'), NULL);
INSERT OR IGNORE INTO uploader_emails (email, uploader_id) VALUES ('malephex@gmail.com', 1);

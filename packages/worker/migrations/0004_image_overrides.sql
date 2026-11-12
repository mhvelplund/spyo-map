CREATE TABLE IF NOT EXISTS image_overrides (
  content_hash TEXT PRIMARY KEY,
  latitude REAL,
  longitude REAL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_images_content_hash ON images(content_hash);

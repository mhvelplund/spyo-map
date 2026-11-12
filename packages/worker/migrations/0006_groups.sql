ALTER TABLE image_overrides ADD COLUMN group_id TEXT;
ALTER TABLE image_overrides ADD COLUMN grouped_at TEXT;
ALTER TABLE image_overrides ADD COLUMN pre_group_latitude REAL;
ALTER TABLE image_overrides ADD COLUMN pre_group_longitude REAL;
CREATE INDEX IF NOT EXISTS idx_image_overrides_group ON image_overrides(group_id);

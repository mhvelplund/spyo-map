ALTER TABLE image_overrides ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0;
ALTER TABLE image_overrides ADD COLUMN private_name TEXT;

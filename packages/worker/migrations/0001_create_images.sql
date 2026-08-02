CREATE TABLE IF NOT EXISTS images (
  id TEXT PRIMARY KEY,
  path TEXT,
  latitude REAL,
  longitude REAL,
  timestamp TEXT,
  latitude_ref TEXT,
  longitude_ref TEXT,
  altitude_ref TEXT,
  altitude REAL,
  speed_ref TEXT,
  speed REAL,
  img_direction_ref TEXT,
  img_direction REAL,
  dest_bearing_ref TEXT,
  dest_bearing REAL,
  h_positioning_error REAL
);

CREATE INDEX IF NOT EXISTS idx_location ON images(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_timestamp ON images(timestamp);

import Database from 'better-sqlite3';
import type { ExifData } from './processor.js';

export interface ImageRow {
  id: string;
  path: string;
  latitude: number;
  longitude: number;
  timestamp: string | null;
  latitude_ref: string | null;
  longitude_ref: string | null;
  altitude_ref: string | null;
  altitude: number | null;
  speed_ref: string | null;
  speed: number | null;
  img_direction_ref: string | null;
  img_direction: number | null;
  dest_bearing_ref: string | null;
  dest_bearing: number | null;
  h_positioning_error: number | null;
}

const CREATE_TABLE_SQL = `
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
)
`;

const CREATE_INDEX_LOCATION = `CREATE INDEX IF NOT EXISTS idx_location ON images(latitude, longitude)`;
const CREATE_INDEX_TIMESTAMP = `CREATE INDEX IF NOT EXISTS idx_timestamp ON images(timestamp)`;

export function openDatabase(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(CREATE_TABLE_SQL);
  db.exec(CREATE_INDEX_LOCATION);
  db.exec(CREATE_INDEX_TIMESTAMP);
  return db;
}

export function imageExists(db: Database.Database, id: string): boolean {
  const row = db.prepare('SELECT 1 FROM images WHERE id = ?').get(id);
  return row != null;
}

export function insertImage(
  db: Database.Database,
  id: string,
  path: string,
  exif: ExifData,
): void {
  db.prepare(
    `INSERT INTO images (
      id, path, latitude, longitude, timestamp,
      latitude_ref, longitude_ref, altitude_ref, altitude,
      speed_ref, speed, img_direction_ref, img_direction,
      dest_bearing_ref, dest_bearing, h_positioning_error
    ) VALUES (
      @id, @path, @latitude, @longitude, @timestamp,
      @latitude_ref, @longitude_ref, @altitude_ref, @altitude,
      @speed_ref, @speed, @img_direction_ref, @img_direction,
      @dest_bearing_ref, @dest_bearing, @h_positioning_error
    )`,
  ).run({
    id,
    path,
    latitude: exif.latitude,
    longitude: exif.longitude,
    timestamp: exif.timestamp ?? null,
    latitude_ref: exif.latitudeRef ?? null,
    longitude_ref: exif.longitudeRef ?? null,
    altitude_ref: exif.altitudeRef ?? null,
    altitude: exif.altitude ?? null,
    speed_ref: exif.speedRef ?? null,
    speed: exif.speed ?? null,
    img_direction_ref: exif.imgDirectionRef ?? null,
    img_direction: exif.imgDirection ?? null,
    dest_bearing_ref: exif.destBearingRef ?? null,
    dest_bearing: exif.destBearing ?? null,
    h_positioning_error: exif.hPositioningError ?? null,
  });
}

export function copyDatabase(srcPath: string, destPath: string): void {
  const src = new Database(srcPath, { readonly: true });
  src.backup(destPath);
  src.close();
}

export function getAllImageIds(db: Database.Database): Set<string> {
  const rows = db.prepare('SELECT id FROM images').all() as Array<{ id: string }>;
  return new Set(rows.map((r) => r.id));
}

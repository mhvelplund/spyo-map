import BetterSqlite3 from 'better-sqlite3';
import { rowToRecord, queryAllImages, queryImageById, queryNearbyImages } from '../src/services/database.js';

const BASE_URL = 'http://test';

const SCHEMA = `
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
)`;

function makeDb(): BetterSqlite3.Database {
  const db = new BetterSqlite3(':memory:');
  db.exec(SCHEMA);
  return db;
}

function insertRow(
  db: BetterSqlite3.Database,
  id: string,
  lat: number,
  lon: number,
): void {
  db.prepare(
    `INSERT INTO images (id, path, latitude, longitude, timestamp) VALUES (?, ?, ?, ?, ?)`,
  ).run(id, `${id}.jpg`, lat, lon, '2024-01-01T00:00:00.000Z');
}

describe('rowToRecord', () => {
  it('maps a row to ImageRecord with constructed URLs', () => {
    const row = {
      id: 'abc123',
      latitude: 51.5,
      longitude: -0.12,
      timestamp: '2024-01-01T00:00:00.000Z',
    };
    const record = rowToRecord(row, BASE_URL);
    expect(record.id).toBe('abc123');
    expect(record.imageUrl).toBe('http://test/images/abc123.jpg');
    expect(record.thumbnailUrl).toBe('http://test/images/thumbnails/abc123.jpg');
    expect(record.latitude).toBe(51.5);
    expect(record.longitude).toBe(-0.12);
  });

  it('includes optional fields when present', () => {
    const row = {
      id: 'x',
      latitude: 0,
      longitude: 0,
      timestamp: null,
      altitude: 100,
      speed: 5.5,
    };
    const record = rowToRecord(row, BASE_URL);
    expect(record.altitude).toBe(100);
    expect(record.speed).toBe(5.5);
    expect(record.timestamp).toBe('');
  });
});

describe('queryAllImages', () => {
  it('returns all rows as ImageRecords', () => {
    const db = makeDb();
    insertRow(db, 'img1', 51.5, -0.12);
    insertRow(db, 'img2', 48.86, 2.35);
    const results = queryAllImages(db, BASE_URL);
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.id)).toEqual(expect.arrayContaining(['img1', 'img2']));
    db.close();
  });

  it('returns empty array when no images', () => {
    const db = makeDb();
    expect(queryAllImages(db, BASE_URL)).toEqual([]);
    db.close();
  });
});

describe('queryImageById', () => {
  it('returns correct record for known id', () => {
    const db = makeDb();
    insertRow(db, 'img1', 51.5, -0.12);
    const result = queryImageById(db, 'img1', BASE_URL);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('img1');
    expect(result!.latitude).toBe(51.5);
    db.close();
  });

  it('returns null for unknown id', () => {
    const db = makeDb();
    expect(queryImageById(db, 'nope', BASE_URL)).toBeNull();
    db.close();
  });
});

describe('queryNearbyImages', () => {
  it('returns images within radius, sorted by distance', () => {
    const db = makeDb();
    // London
    insertRow(db, 'london', 51.5074, -0.1278);
    // Paris (~340 km from London)
    insertRow(db, 'paris', 48.8566, 2.3522);
    // Berlin (~930 km from London)
    insertRow(db, 'berlin', 52.52, 13.405);

    const nearby = queryNearbyImages(db, 'london', 51.5074, -0.1278, 500, BASE_URL);
    expect(nearby.map((r) => r.id)).toEqual(['paris']);
    db.close();
  });

  it('excludes the source image itself from results', () => {
    const db = makeDb();
    insertRow(db, 'a', 51.5, -0.12);
    insertRow(db, 'b', 51.501, -0.12);

    const nearby = queryNearbyImages(db, 'a', 51.5, -0.12, 100, BASE_URL);
    expect(nearby.every((r) => r.id !== 'a')).toBe(true);
    db.close();
  });

  it('returns empty array when no images are within radius', () => {
    const db = makeDb();
    insertRow(db, 'london', 51.5074, -0.1278);
    insertRow(db, 'berlin', 52.52, 13.405);

    const nearby = queryNearbyImages(db, 'london', 51.5074, -0.1278, 100, BASE_URL);
    expect(nearby).toEqual([]);
    db.close();
  });
});

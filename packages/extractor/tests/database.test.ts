import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase, imageExists, insertImage, getAllImageIds, copyDatabase } from '../src/database.js';
import type { Database } from 'better-sqlite3';
import type { ExifData } from '../src/processor.js';

const EXIF_FIXTURE: ExifData = {
  latitude: 51.5074,
  longitude: -0.1278,
  timestamp: '2024-06-15T10:30:00.000Z',
  latitudeRef: 'N',
  longitudeRef: 'W',
  altitudeRef: undefined,
  altitude: 12.5,
  speedRef: undefined,
  speed: undefined,
  imgDirectionRef: undefined,
  imgDirection: undefined,
  destBearingRef: undefined,
  destBearing: undefined,
  hPositioningError: undefined,
};

describe('openDatabase', () => {
  let db: Database;

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  it('creates a database with the images table', () => {
    db = openDatabase(':memory:');
    const result = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='images'")
      .get();
    expect(result).toBeDefined();
  });

  it('creates lat/lon and timestamp indexes', () => {
    db = openDatabase(':memory:');
    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index'")
      .all() as Array<{ name: string }>;
    const names = indexes.map((i) => i.name);
    expect(names).toContain('idx_location');
    expect(names).toContain('idx_timestamp');
  });
});

describe('imageExists', () => {
  let db: Database;

  beforeEach(() => {
    db = openDatabase(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('returns false for an unknown id', () => {
    expect(imageExists(db, 'missing')).toBe(false);
  });

  it('returns true after inserting the image', () => {
    insertImage(db, 'img1', 'photo.jpg', EXIF_FIXTURE);
    expect(imageExists(db, 'img1')).toBe(true);
  });
});

describe('insertImage', () => {
  let db: Database;

  beforeEach(() => {
    db = openDatabase(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('inserts a row with all EXIF fields', () => {
    insertImage(db, 'img1', 'photos/test.jpg', EXIF_FIXTURE);
    const row = db.prepare('SELECT * FROM images WHERE id = ?').get('img1') as Record<string, unknown>;
    expect(row.id).toBe('img1');
    expect(row.path).toBe('photos/test.jpg');
    expect(row.latitude).toBe(51.5074);
    expect(row.longitude).toBe(-0.1278);
    expect(row.timestamp).toBe('2024-06-15T10:30:00.000Z');
    expect(row.latitude_ref).toBe('N');
    expect(row.altitude).toBe(12.5);
  });

  it('stores null for missing optional fields', () => {
    const minimalExif: ExifData = {
      latitude: 51.5,
      longitude: -0.12,
      timestamp: undefined,
      latitudeRef: undefined,
      longitudeRef: undefined,
      altitudeRef: undefined,
      altitude: undefined,
      speedRef: undefined,
      speed: undefined,
      imgDirectionRef: undefined,
      imgDirection: undefined,
      destBearingRef: undefined,
      destBearing: undefined,
      hPositioningError: undefined,
    };
    insertImage(db, 'minimal', 'x.jpg', minimalExif);
    const row = db.prepare('SELECT * FROM images WHERE id = ?').get('minimal') as Record<string, unknown>;
    expect(row.timestamp).toBeNull();
    expect(row.altitude).toBeNull();
  });
});

describe('getAllImageIds', () => {
  let db: Database;

  beforeEach(() => {
    db = openDatabase(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('returns an empty set for an empty database', () => {
    expect(getAllImageIds(db).size).toBe(0);
  });

  it('returns all inserted ids', () => {
    insertImage(db, 'a', 'a.jpg', EXIF_FIXTURE);
    insertImage(db, 'b', 'b.jpg', EXIF_FIXTURE);
    const ids = getAllImageIds(db);
    expect(ids.has('a')).toBe(true);
    expect(ids.has('b')).toBe(true);
    expect(ids.size).toBe(2);
  });
});

describe('copyDatabase', () => {
  let srcPath: string;
  let destPath: string;

  beforeEach(() => {
    srcPath = path.join(os.tmpdir(), `test-src-${Date.now()}.db`);
    destPath = path.join(os.tmpdir(), `test-dest-${Date.now()}.db`);
  });

  afterEach(() => {
    if (fs.existsSync(srcPath)) {
      fs.unlinkSync(srcPath);
    }
    if (fs.existsSync(destPath)) {
      fs.unlinkSync(destPath);
    }
  });

  it('successfully copies database with data', async () => {
    const db = openDatabase(srcPath);
    insertImage(db, 'test1', 'photo1.jpg', EXIF_FIXTURE);
    insertImage(db, 'test2', 'photo2.jpg', EXIF_FIXTURE);
    db.close();

    await copyDatabase(srcPath, destPath);

    expect(fs.existsSync(destPath)).toBe(true);

    const copiedDb = openDatabase(destPath);
    const ids = getAllImageIds(copiedDb);
    expect(ids.has('test1')).toBe(true);
    expect(ids.has('test2')).toBe(true);
    expect(ids.size).toBe(2);
    copiedDb.close();
  });

  it('creates a valid SQLite database file', async () => {
    const db = openDatabase(srcPath);
    insertImage(db, 'single', 'single.jpg', EXIF_FIXTURE);
    db.close();

    await copyDatabase(srcPath, destPath);

    expect(fs.existsSync(destPath)).toBe(true);

    const copiedDb = openDatabase(destPath);
    const result = copiedDb
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='images'")
      .get();
    expect(result).toBeDefined();
    copiedDb.close();
  });
});

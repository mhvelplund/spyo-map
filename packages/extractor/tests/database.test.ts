import { openDatabase, imageExists, insertImage, getAllImageIds } from '../src/database.js';
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
  it('creates a database with the images table', () => {
    const db = openDatabase(':memory:');
    const result = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='images'")
      .get();
    expect(result).toBeDefined();
    db.close();
  });

  it('creates lat/lon and timestamp indexes', () => {
    const db = openDatabase(':memory:');
    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index'")
      .all() as Array<{ name: string }>;
    const names = indexes.map((i) => i.name);
    expect(names).toContain('idx_location');
    expect(names).toContain('idx_timestamp');
    db.close();
  });
});

describe('imageExists', () => {
  it('returns false for an unknown id', () => {
    const db = openDatabase(':memory:');
    expect(imageExists(db, 'missing')).toBe(false);
    db.close();
  });

  it('returns true after inserting the image', () => {
    const db = openDatabase(':memory:');
    insertImage(db, 'img1', 'photo.jpg', EXIF_FIXTURE);
    expect(imageExists(db, 'img1')).toBe(true);
    db.close();
  });
});

describe('insertImage', () => {
  it('inserts a row with all EXIF fields', () => {
    const db = openDatabase(':memory:');
    insertImage(db, 'img1', 'photos/test.jpg', EXIF_FIXTURE);
    const row = db.prepare('SELECT * FROM images WHERE id = ?').get('img1') as Record<string, unknown>;
    expect(row.id).toBe('img1');
    expect(row.path).toBe('photos/test.jpg');
    expect(row.latitude).toBe(51.5074);
    expect(row.longitude).toBe(-0.1278);
    expect(row.timestamp).toBe('2024-06-15T10:30:00.000Z');
    expect(row.latitude_ref).toBe('N');
    expect(row.altitude).toBe(12.5);
    db.close();
  });

  it('stores null for missing optional fields', () => {
    const db = openDatabase(':memory:');
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
    db.close();
  });
});

describe('getAllImageIds', () => {
  it('returns an empty set for an empty database', () => {
    const db = openDatabase(':memory:');
    expect(getAllImageIds(db).size).toBe(0);
    db.close();
  });

  it('returns all inserted ids', () => {
    const db = openDatabase(':memory:');
    insertImage(db, 'a', 'a.jpg', EXIF_FIXTURE);
    insertImage(db, 'b', 'b.jpg', EXIF_FIXTURE);
    const ids = getAllImageIds(db);
    expect(ids.has('a')).toBe(true);
    expect(ids.has('b')).toBe(true);
    expect(ids.size).toBe(2);
    db.close();
  });
});

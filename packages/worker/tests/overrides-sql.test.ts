import { describe, it, expect } from '@jest/globals';
import { queryAllImages, queryNearbyImages } from '../src/services/database.js';
import { sqliteD1 } from './helpers/sqliteD1.js';

const BASE = 'https://img.test';

function insertImage(
  raw: ReturnType<typeof sqliteD1>['raw'],
  id: string,
  lat: number,
  lon: number,
  hash: string | null,
) {
  raw
    .prepare('INSERT INTO images (id, latitude, longitude, timestamp, content_hash) VALUES (?, ?, ?, ?, ?)')
    .run(id, lat, lon, '2024-01-01T00:00:00.000Z', hash);
}

function setOverride(raw: ReturnType<typeof sqliteD1>['raw'], hash: string, lat: number, lon: number) {
  raw
    .prepare('INSERT INTO image_overrides (content_hash, latitude, longitude, updated_at) VALUES (?, ?, ?, ?)')
    .run(hash, lat, lon, '2024-02-01T00:00:00.000Z');
}

describe('image overrides (real SQL)', () => {
  it('applies the migrations to an empty database', () => {
    const { raw } = sqliteD1();
    expect(raw.prepare('SELECT COUNT(*) AS n FROM image_overrides').get()).toEqual({ n: 0 });
  });

  it('returns the override position when one exists, EXIF otherwise', async () => {
    const { db, raw } = sqliteD1();
    insertImage(raw, 'a', 10, 20, 'h1');
    insertImage(raw, 'b', 30, 40, 'h2');
    setOverride(raw, 'h1', 11, 21);
    const all = await queryAllImages(db, BASE, { isAdmin: false });
    const a = all.find((r) => r.id === 'a')!;
    const b = all.find((r) => r.id === 'b')!;
    expect([a.latitude, a.longitude]).toEqual([11, 21]);
    expect([b.latitude, b.longitude]).toEqual([30, 40]);
  });

  it('keeps the override after the image row is deleted and re-inserted', async () => {
    const { db, raw } = sqliteD1();
    insertImage(raw, 'a', 10, 20, 'h1');
    setOverride(raw, 'h1', 11, 21);
    raw.exec('DELETE FROM images');
    insertImage(raw, 'a2', 10, 20, 'h1');
    const [rec] = await queryAllImages(db, BASE, { isAdmin: false });
    expect(rec.id).toBe('a2');
    expect([rec.latitude, rec.longitude]).toEqual([11, 21]);
    raw.exec('DELETE FROM images');
    insertImage(raw, 'a2', 10, 20, 'h1');
    expect((await queryAllImages(db, BASE, { isAdmin: false }))[0].latitude).toBe(11);
  });

  it('marks rows without a content_hash as editable: false only', async () => {
    const { db, raw } = sqliteD1();
    insertImage(raw, 'nohash', 1, 2, null);
    insertImage(raw, 'hash', 3, 4, 'h');
    const all = await queryAllImages(db, BASE, { isAdmin: false });
    expect(all.find((r) => r.id === 'nohash')!.editable).toBe(false);
    expect(all.find((r) => r.id === 'hash')!).not.toHaveProperty('editable');
  });

  it('measures nearby distance from effective positions', async () => {
    const { db, raw } = sqliteD1();
    insertImage(raw, 'center', 51.5, -0.12, 'c');
    insertImage(raw, 'moved', 52.5, -0.12, 'm'); // EXIF ~111 km away
    setOverride(raw, 'm', 51.501, -0.12);
    const near = await queryNearbyImages(db, 'center', 51.5, -0.12, 1, BASE, { isAdmin: false });
    expect(near.map((r) => r.id)).toEqual(['moved']);
  });
});

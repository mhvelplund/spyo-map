import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, it, expect } from '@jest/globals';
import { upsertImages, type D1Client, type ImageInsert } from '../src/d1.js';
import type { ExifData } from '../src/processor.js';

// Jest's resolver strips the `node:` prefix and fails on prefix-only builtins
// like node:sqlite, so load it through a native require.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');

const MIGRATIONS_DIR = new URL('../../worker/migrations/', import.meta.url);

type SqlValue = null | number | bigint | string;

function sqliteClient() {
  const raw = new DatabaseSync(':memory:');
  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()) {
    raw.exec(readFileSync(new URL(file, MIGRATIONS_DIR), 'utf8'));
  }
  const sqls: string[] = [];
  const client: D1Client = {
    async query(sql, params = []) {
      sqls.push(sql);
      return raw.prepare(sql).all(...(params as SqlValue[])) as Array<Record<string, unknown>>;
    },
  };
  return { raw, client, sqls };
}

const EXIF: ExifData = {
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

describe('re-ingest and admin overrides', () => {
  it('leaves image_overrides untouched and writes EXIF coordinates to images', async () => {
    const { raw, client, sqls } = sqliteClient();
    raw
      .prepare('INSERT INTO image_overrides (content_hash, latitude, longitude, updated_at) VALUES (?, ?, ?, ?)')
      .run('h1', 10, 20, '2026-01-01T00:00:00Z');
    const before = raw.prepare('SELECT * FROM image_overrides').all();

    const row: ImageInsert = { id: 'img1', path: 'images/img1.jpg', exif: EXIF, uploaderId: 1, contentHash: 'h1' };
    await upsertImages(client, [row]);
    raw.exec('DELETE FROM images');
    await upsertImages(client, [row]);

    expect(raw.prepare('SELECT * FROM image_overrides').all()).toEqual(before);
    const img = raw.prepare('SELECT latitude, longitude FROM images WHERE id = ?').get('img1') as {
      latitude: number;
      longitude: number;
    };
    expect(img.latitude).toBe(51.5);
    expect(img.longitude).toBe(-0.12);
    expect(sqls.some((s) => s.includes('image_overrides'))).toBe(false);
  });
});

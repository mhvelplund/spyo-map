import { describe, it, expect } from '@jest/globals';
import {
  rowToRecord,
  queryAllImages,
  queryImageById,
  queryNearbyImages,
} from '../src/services/database.js';
import type { D1Database } from '@cloudflare/workers-types';

const BASE_URL = 'https://img.test';

interface Call {
  sql: string;
  params: unknown[];
}

/** Minimal stand-in for D1Database that records calls and replays fixed rows. */
function fakeD1(rows: Array<Record<string, unknown>>): {
  db: D1Database;
  calls: Call[];
} {
  const calls: Call[] = [];
  const db = {
    prepare(sql: string) {
      const call: Call = { sql, params: [] };
      calls.push(call);
      const stmt = {
        bind(...params: unknown[]) {
          call.params = params;
          return stmt;
        },
        all: async () => ({ results: rows }),
        first: async () => rows[0] ?? null,
      };
      return stmt;
    },
  } as unknown as D1Database;
  return { db, calls };
}

const ROW_A = {
  id: 'a',
  path: 'a.jpg',
  latitude: 51.5,
  longitude: -0.12,
  timestamp: '2024-01-01T00:00:00.000Z',
  latitude_ref: 'N',
  longitude_ref: 'W',
  altitude_ref: null,
  altitude: null,
  speed_ref: null,
  speed: null,
  img_direction_ref: null,
  img_direction: null,
  dest_bearing_ref: null,
  dest_bearing: null,
  h_positioning_error: null,
};

// ~1.1 km north of ROW_A
const ROW_NEAR = { ...ROW_A, id: 'near', latitude: 51.51, longitude: -0.12 };
// ~111 km north of ROW_A
const ROW_FAR = { ...ROW_A, id: 'far', latitude: 52.5, longitude: -0.12 };

describe('rowToRecord', () => {
  it('builds absolute image URLs from the base URL and id', () => {
    const record = rowToRecord(ROW_A, BASE_URL);
    expect(record.imageUrl).toBe('https://img.test/images/a.jpg');
    expect(record.thumbnailUrl).toBe('https://img.test/images/thumbnails/a.jpg');
  });

  it('includes optional EXIF fields only when present', () => {
    const record = rowToRecord(ROW_A, BASE_URL);
    expect(record.latitudeRef).toBe('N');
    expect(record).not.toHaveProperty('altitude');
  });

  it('coerces a null timestamp to an empty string', () => {
    const record = rowToRecord({ ...ROW_A, timestamp: null }, BASE_URL);
    expect(record.timestamp).toBe('');
  });
});

describe('queryAllImages', () => {
  it('returns a record per row', async () => {
    const { db } = fakeD1([ROW_A, ROW_NEAR]);
    const records = await queryAllImages(db, BASE_URL);
    expect(records.map((r) => r.id)).toEqual(['a', 'near']);
  });

  it('selects every image', async () => {
    const { db, calls } = fakeD1([]);
    await queryAllImages(db, BASE_URL);
    expect(calls[0]!.sql).toBe('SELECT * FROM images');
  });
});

describe('queryImageById', () => {
  it('binds the id as a parameter', async () => {
    const { db, calls } = fakeD1([ROW_A]);
    await queryImageById(db, 'a', BASE_URL);
    expect(calls[0]!.sql).toBe('SELECT * FROM images WHERE id = ?');
    expect(calls[0]!.params).toEqual(['a']);
  });

  it('returns the record when found', async () => {
    const { db } = fakeD1([ROW_A]);
    expect((await queryImageById(db, 'a', BASE_URL))?.id).toBe('a');
  });

  it('returns null when not found', async () => {
    const { db } = fakeD1([]);
    expect(await queryImageById(db, 'missing', BASE_URL)).toBeNull();
  });
});

describe('queryNearbyImages', () => {
  it('excludes the origin image from the query', async () => {
    const { db, calls } = fakeD1([]);
    await queryNearbyImages(db, 'a', 51.5, -0.12, 1, BASE_URL);
    expect(calls[0]!.sql).toBe('SELECT * FROM images WHERE id != ?');
    expect(calls[0]!.params).toEqual(['a']);
  });

  it('keeps only images inside the radius', async () => {
    const { db } = fakeD1([ROW_NEAR, ROW_FAR]);
    const records = await queryNearbyImages(db, 'a', 51.5, -0.12, 5, BASE_URL);
    expect(records.map((r) => r.id)).toEqual(['near']);
  });

  it('sorts results nearest first', async () => {
    const { db } = fakeD1([ROW_FAR, ROW_NEAR]);
    const records = await queryNearbyImages(db, 'a', 51.5, -0.12, 500, BASE_URL);
    expect(records.map((r) => r.id)).toEqual(['near', 'far']);
  });
});

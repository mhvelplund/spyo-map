import { describe, it, expect } from '@jest/globals';
import {
  rowToRecord,
  queryAllImages,
  queryImageById,
  queryNearbyImages,
} from '../src/services/database.js';
import { fakeD1 } from './helpers/fakeD1.js';

const BASE_URL = 'https://img.test';

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

  it('maps uploader_name and never copies unknown columns', () => {
    const record = rowToRecord({ ...ROW_A, uploader_name: 'MH', email: 'x@y.z' }, BASE_URL);
    expect(record.uploaderName).toBe('MH');
    expect(JSON.stringify(record)).not.toContain('@');
  });

  it('defaults uploaderName to an empty string', () => {
    expect(rowToRecord(ROW_A, BASE_URL).uploaderName).toBe('');
  });

  it('prefers eff_latitude/eff_longitude over latitude/longitude', () => {
    const record = rowToRecord({ ...ROW_A, eff_latitude: 1.5, eff_longitude: 2.5 }, BASE_URL);
    expect(record.latitude).toBe(1.5);
    expect(record.longitude).toBe(2.5);
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
    expect(calls[0]!.sql).toContain('LEFT JOIN uploaders');
  });
});

describe('queryImageById', () => {
  it('binds the id as a parameter', async () => {
    const { db, calls } = fakeD1([ROW_A]);
    await queryImageById(db, 'a', BASE_URL);
    expect(calls[0]!.sql).toContain('LEFT JOIN uploaders');
    expect(calls[0]!.sql).toMatch(/WHERE images\.id = \?$/);
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
    expect(calls[0]!.sql).toContain('LEFT JOIN uploaders');
    expect(calls[0]!.sql).toMatch(/WHERE images\.id != \?$/);
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

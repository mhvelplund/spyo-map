import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { sqliteD1 } from './helpers/sqliteD1.js';

const mockCurrent = jest.fn<(req: Request, env: unknown) => Promise<unknown>>();
jest.unstable_mockModule('../src/auth/currentUploader.js', () => ({
  currentUploader: mockCurrent,
}));

const { handleApiRequest } = await import('../src/router.js');

const ORIGIN = 'https://app.test';
const BASE = 'https://img.test';

function setup() {
  const { db, raw } = sqliteD1();
  const insert = (id: string, hash: string | null) =>
    raw
      .prepare('INSERT INTO images (id, latitude, longitude, timestamp, content_hash) VALUES (?, ?, ?, ?, ?)')
      .run(id, 10, 20, '2024-01-01T00:00:00.000Z', hash);
  const env = { DB: db, IMAGES_BASE_URL: BASE } as never;
  const overrides = () => raw.prepare('SELECT * FROM image_overrides').all();
  return { env, raw, insert, overrides };
}

function put(id: string, body: unknown, headers: Record<string, string> = { origin: ORIGIN }) {
  return new Request(`${ORIGIN}/api/images/${id}/location`, {
    method: 'PUT',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers,
  });
}

const admin = { id: 1, displayName: 'A', isAdmin: true };

beforeEach(() => {
  mockCurrent.mockReset();
  mockCurrent.mockResolvedValue(admin);
});

describe('PUT /api/images/:id/location', () => {
  it('writes an override and returns the record at the new position', async () => {
    const { env, raw, insert, overrides } = setup();
    insert('a', 'h1');
    const res = await handleApiRequest(put('a', { latitude: 55.1, longitude: 12.2 }), env);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = (await res.json()) as Array<{ id: string; latitude: number; longitude: number }>;
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({ id: 'a', latitude: 55.1, longitude: 12.2 });
    expect(raw.prepare('SELECT latitude, longitude FROM images').all()).toEqual([{ latitude: 10, longitude: 20 }]);
    expect(overrides()).toHaveLength(1);
  });

  it('returns every row sharing the hash', async () => {
    const { env, insert } = setup();
    insert('a', 'h1');
    insert('b', 'h1');
    insert('c', 'h2');
    const res = await handleApiRequest(put('a', { latitude: 1, longitude: 2 }), env);
    const body = (await res.json()) as Array<{ id: string; latitude: number; longitude: number }>;
    expect(body.map((r) => r.id).sort()).toEqual(['a', 'b']);
    for (const r of body) expect([r.latitude, r.longitude]).toEqual([1, 2]);
  });

  it('replaces an existing override', async () => {
    const { env, insert, overrides } = setup();
    insert('a', 'h1');
    await handleApiRequest(put('a', { latitude: 1, longitude: 2 }), env);
    const res = await handleApiRequest(put('a', { latitude: 3, longitude: 4 }), env);
    expect(res.status).toBe(200);
    const rows = overrides() as Array<{ latitude: number; longitude: number }>;
    expect(rows).toHaveLength(1);
    expect([rows[0].latitude, rows[0].longitude]).toEqual([3, 4]);
  });

  it('answers 401 signed out, 403 non-admin, 403 cross-origin without writing', async () => {
    const { env, insert, overrides } = setup();
    insert('a', 'h1');
    const body = { latitude: 1, longitude: 2 };
    mockCurrent.mockResolvedValueOnce(null);
    expect((await handleApiRequest(put('a', body), env)).status).toBe(401);
    mockCurrent.mockResolvedValueOnce({ ...admin, isAdmin: false });
    expect((await handleApiRequest(put('a', body), env)).status).toBe(403);
    expect((await handleApiRequest(put('a', body, { origin: 'https://evil.test' }), env)).status).toBe(403);
    expect(overrides()).toHaveLength(0);
  });

  it.each([
    [{ latitude: '12', longitude: 1 }],
    [{ latitude: 91, longitude: 0 }],
    [{ latitude: 0, longitude: -181 }],
    [{ latitude: 0 }],
    ['not json'],
    [{ latitude: null, longitude: 0 }],
  ])('rejects invalid body %j with 400', async (bad) => {
    const { env, insert, overrides } = setup();
    insert('a', 'h1');
    const res = await handleApiRequest(put('a', bad), env);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid location' });
    expect(overrides()).toHaveLength(0);
  });

  it.each([
    [90, 180],
    [-90, -180],
  ])('accepts boundary %d,%d', async (lat, lon) => {
    const { env, insert } = setup();
    insert('a', 'h1');
    const res = await handleApiRequest(put('a', { latitude: lat, longitude: lon }), env);
    expect(res.status).toBe(200);
  });

  it('answers 404 for an unknown id', async () => {
    const { env } = setup();
    const res = await handleApiRequest(put('nope', { latitude: 1, longitude: 2 }), env);
    expect(res.status).toBe(404);
  });

  it('answers 409 for a row without a content hash', async () => {
    const { env, insert, overrides } = setup();
    insert('a', null);
    const res = await handleApiRequest(put('a', { latitude: 1, longitude: 2 }), env);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'Image cannot be edited' });
    expect(overrides()).toHaveLength(0);
  });

  it('keeps other image routes read-only (405)', async () => {
    const { env, insert } = setup();
    insert('a', 'h1');
    const req = (method: string, path: string) =>
      new Request(`${ORIGIN}${path}`, { method, headers: { origin: ORIGIN } });
    expect((await handleApiRequest(req('GET', '/api/images/a/location'), env)).status).toBe(405);
    expect((await handleApiRequest(req('PUT', '/api/images/a'), env)).status).toBe(405);
    expect((await handleApiRequest(req('POST', '/api/images'), env)).status).toBe(405);
  });
});

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { sqliteD1 } from './helpers/sqliteD1.js';

const mockCurrent = jest.fn<(req: Request, env: unknown) => Promise<unknown>>();
jest.unstable_mockModule('../src/auth/currentUploader.js', () => ({
  currentUploader: mockCurrent,
}));

const { handleApiRequest } = await import('../src/router.js');

const ORIGIN = 'https://app.test';
const BASE = 'https://img.test';
const NAME = 'f'.repeat(64);

function setup() {
  const { db, raw } = sqliteD1();
  const insert = (id: string, hash: string, lat = 10, lon = 20) =>
    raw
      .prepare('INSERT INTO images (id, latitude, longitude, timestamp, content_hash) VALUES (?, ?, ?, ?, ?)')
      .run(id, lat, lon, '2024-01-01T00:00:00.000Z', hash);
  insert('vis', 'h-vis');
  insert('hid', 'h-hid');
  insert('hid2', 'h-hid');
  raw
    .prepare("INSERT INTO image_overrides (content_hash, updated_at, hidden, private_name) VALUES ('h-hid', 'x', 1, ?)")
    .run(NAME);
  return { env: { DB: db, IMAGES_BASE_URL: BASE } as never };
}

const get = (path: string) => new Request(`${ORIGIN}${path}`);
const NO_STORE = 'private, no-store';

const asVisitor = () => mockCurrent.mockResolvedValue(null);
const asUploader = () => mockCurrent.mockResolvedValue({ id: 2, displayName: 'U', isAdmin: false });
const asAdmin = () => mockCurrent.mockResolvedValue({ id: 1, displayName: 'A', isAdmin: true });

beforeEach(() => mockCurrent.mockReset());

describe.each([
  ['visitor', asVisitor],
  ['non-admin uploader', asUploader],
])('%s', (_name, login) => {
  beforeEach(() => login());

  it('omits hidden rows from the list', async () => {
    const { env } = setup();
    const res = await handleApiRequest(get('/api/images'), env);
    expect(res.headers.get('cache-control')).toBe(NO_STORE);
    const body = (await res.json()) as Array<{ id: string }>;
    expect(body.map((r) => r.id)).toEqual(['vis']);
  });

  it('404s a hidden image and its nearby', async () => {
    const { env } = setup();
    for (const path of ['/api/images/hid', '/api/images/hid/nearby']) {
      const res = await handleApiRequest(get(path), env);
      expect(res.status).toBe(404);
      expect(res.headers.get('cache-control')).toBe(NO_STORE);
    }
  });

  it('omits hidden rows from nearby of a visible image', async () => {
    const { env } = setup();
    const res = await handleApiRequest(get('/api/images/vis/nearby?radius=1000'), env);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe(NO_STORE);
    expect(await res.json()).toEqual([]);
  });

  it('serves a visible image with no-store', async () => {
    const { env } = setup();
    const res = await handleApiRequest(get('/api/images/vis'), env);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe(NO_STORE);
  });
});

describe('admin', () => {
  beforeEach(() => asAdmin());

  it('sees hidden rows with private urls and the hidden flag', async () => {
    const { env } = setup();
    const res = await handleApiRequest(get('/api/images'), env);
    expect(res.headers.get('cache-control')).toBe(NO_STORE);
    const body = (await res.json()) as Array<Record<string, unknown>>;
    expect(body.map((r) => r.id).sort()).toEqual(['hid', 'hid2', 'vis']);
    for (const r of body.filter((r) => r.id !== 'vis')) {
      expect(r.hidden).toBe(true);
      expect(r.imageUrl).toBe(`${BASE}/private/${NAME}.jpg`);
      expect(r.thumbnailUrl).toBe(`${BASE}/private/thumbnails/${NAME}.jpg`);
    }
    const vis = body.find((r) => r.id === 'vis')!;
    expect('hidden' in vis).toBe(false);
    expect(vis.imageUrl).toBe(`${BASE}/images/vis.jpg`);
  });

  it('serves a hidden image and its nearby', async () => {
    const { env } = setup();
    const one = await handleApiRequest(get('/api/images/hid'), env);
    expect(one.status).toBe(200);
    expect(one.headers.get('cache-control')).toBe(NO_STORE);
    expect(((await one.json()) as { hidden: boolean }).hidden).toBe(true);
    const near = await handleApiRequest(get('/api/images/hid/nearby?radius=1000'), env);
    expect(near.status).toBe(200);
    expect(near.headers.get('cache-control')).toBe(NO_STORE);
    expect(((await near.json()) as Array<{ id: string }>).map((r) => r.id).sort()).toEqual(['hid2', 'vis']);
  });

  it('PUT location on a hidden image returns the hidden record', async () => {
    const { env } = setup();
    const res = await handleApiRequest(
      new Request(`${ORIGIN}/api/images/hid/location`, {
        method: 'PUT',
        body: JSON.stringify({ latitude: 1, longitude: 2 }),
        headers: { origin: ORIGIN },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{ id: string; hidden?: boolean }>;
    expect(body.map((r) => r.id).sort()).toEqual(['hid', 'hid2']);
    for (const r of body) expect(r.hidden).toBe(true);
  });
});

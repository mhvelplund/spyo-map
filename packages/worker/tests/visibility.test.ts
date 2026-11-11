import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { sqliteD1 } from './helpers/sqliteD1.js';

const mockCurrent = jest.fn<(req: Request, env: unknown) => Promise<unknown>>();
jest.unstable_mockModule('../src/auth/currentUploader.js', () => ({
  currentUploader: mockCurrent,
}));

const { handleApiRequest } = await import('../src/router.js');
const { randomPrivateName } = await import('../src/admin/visibility.js');

const ORIGIN = 'https://app.test';
const BASE = 'https://img.test';
const admin = { id: 1, displayName: 'A', isAdmin: true };

type Op = { op: 'get' | 'put' | 'delete'; key: string; hidden?: unknown };

function setup() {
  const { db, raw } = sqliteD1();
  const store = new Map<string, { data: Uint8Array; meta: unknown }>();
  const log: Op[] = [];
  const hooks: { afterPut?: (n: number) => Promise<void>; failDeleteAt?: number } = {};
  let puts = 0;
  let deletes = 0;
  const bucket = {
    async head(key: string) {
      return store.has(key) ? { key } : null;
    },
    async get(key: string) {
      log.push({ op: 'get', key });
      const o = store.get(key);
      if (!o) return null;
      return { arrayBuffer: async () => o.data.slice().buffer, body: null, httpMetadata: o.meta };
    },
    async put(key: string, value: unknown, opts?: { httpMetadata?: unknown }) {
      log.push({ op: 'put', key });
      const data = new Uint8Array(value as ArrayBuffer);
      store.set(key, { data, meta: opts?.httpMetadata });
      puts += 1;
      await hooks.afterPut?.(puts);
    },
    async delete(key: string) {
      deletes += 1;
      if (hooks.failDeleteAt === deletes) throw new Error('boom');
      const row = raw.prepare('SELECT hidden, private_name FROM image_overrides').get();
      log.push({ op: 'delete', key, hidden: row });
      store.delete(key);
    },
  };
  const env = { DB: db, PUBLIC_BUCKET: bucket, IMAGES_BASE_URL: BASE } as never;
  const insert = (id: string, hash: string | null) =>
    raw
      .prepare('INSERT INTO images (id, latitude, longitude, timestamp, content_hash) VALUES (?, ?, ?, ?, ?)')
      .run(id, 10, 20, '2024-01-01T00:00:00.000Z', hash);
  const seed = (id: string, thumb = true) => {
    store.set(`images/${id}.jpg`, { data: new Uint8Array([1, 2, id.length]), meta: { contentType: 'image/jpeg' } });
    if (thumb) store.set(`images/thumbnails/${id}.jpg`, { data: new Uint8Array([9]), meta: { contentType: 'image/jpeg' } });
  };
  const override = () => raw.prepare('SELECT * FROM image_overrides').get() as
    | { hidden: number; private_name: string | null; latitude: number | null }
    | undefined;
  return { env, raw, store, log, hooks, insert, seed, override };
}

const post = (action: string, id = 'a', headers: Record<string, string> = { origin: ORIGIN }, method = 'POST') =>
  new Request(`${ORIGIN}/api/images/${id}/${action}`, { method, headers });

beforeEach(() => {
  mockCurrent.mockReset();
  mockCurrent.mockResolvedValue(admin);
});

describe('randomPrivateName', () => {
  it('is 64 hex chars and unique', () => {
    expect(randomPrivateName()).toMatch(/^[0-9a-f]{64}$/);
    expect(randomPrivateName()).not.toBe(randomPrivateName());
  });
});

describe('hide', () => {
  async function hidden() {
    const s = setup();
    s.insert('a', 'h1');
    s.insert('a2', 'h1');
    s.seed('a');
    s.seed('a2');
    const res = await handleApiRequest(post('hide'), s.env);
    return { s, res };
  }

  it('copies to private keys, flips the override, then deletes', async () => {
    const { s, res } = await hidden();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const name = s.override()!.private_name!;
    expect(name).toMatch(/^[0-9a-f]{64}$/);
    expect(s.override()!.hidden).toBe(1);
    const putKeys = s.log.filter((o) => o.op === 'put').map((o) => o.key);
    expect(putKeys.filter((k) => k === `private/${name}.jpg`)).not.toHaveLength(0);
    expect(putKeys.filter((k) => k === `private/thumbnails/${name}.jpg`)).not.toHaveLength(0);
    expect(new Set(putKeys)).toEqual(new Set([`private/${name}.jpg`, `private/thumbnails/${name}.jpg`]));
    expect(putKeys).toHaveLength(4);
    const firstDelete = s.log.findIndex((o) => o.op === 'delete');
    const lastPut = s.log.map((o) => o.op).lastIndexOf('put');
    expect(lastPut).toBeLessThan(firstDelete);
    for (const d of s.log.filter((o) => o.op === 'delete')) {
      expect(d.hidden).toEqual({ hidden: 1, private_name: name });
    }
    expect([...s.store.keys()].filter((k) => k.startsWith('images/'))).toEqual([]);
    const body = (await res.json()) as Array<{ id: string; hidden?: boolean; imageUrl: string; thumbnailUrl: string }>;
    expect(body.map((r) => r.id).sort()).toEqual(['a', 'a2']);
    for (const r of body) {
      expect(r.hidden).toBe(true);
      expect(r.imageUrl).toBe(`${BASE}/private/${name}.jpg`);
      expect(r.thumbnailUrl).toBe(`${BASE}/private/thumbnails/${name}.jpg`);
    }
  });

  it('tolerates a missing thumbnail', async () => {
    const s = setup();
    s.insert('a', 'h1');
    s.seed('a', false);
    const res = await handleApiRequest(post('hide'), s.env);
    expect(res.status).toBe(200);
    expect(s.override()!.hidden).toBe(1);
    const name = s.override()!.private_name!;
    expect(s.store.has(`private/${name}.jpg`)).toBe(true);
    expect(s.store.has('images/a.jpg')).toBe(false);
  });

  it('retries after a failed delete and leaves no public objects', async () => {
    const s = setup();
    s.insert('a', 'h1');
    s.seed('a');
    s.hooks.failDeleteAt = 2;
    const first = await handleApiRequest(post('hide'), s.env);
    expect(first.status).toBe(500);
    expect(s.override()!.hidden).toBe(1);
    expect(s.store.has('images/a.jpg') || s.store.has('images/thumbnails/a.jpg')).toBe(true);
    const retry = await handleApiRequest(post('hide'), s.env);
    expect(retry.status).toBe(200);
    expect([...s.store.keys()].filter((k) => k.startsWith('images/'))).toEqual([]);
  });

  it('hide on a fully hidden image is 200 with no new puts', async () => {
    const { s } = await hidden();
    s.log.length = 0;
    const res = await handleApiRequest(post('hide'), s.env);
    expect(res.status).toBe(200);
    expect(s.log.filter((o) => o.op === 'put')).toEqual([]);
  });

  it('409s Already hidden when the private copy is missing, without deleting', async () => {
    const { s } = await hidden();
    s.store.delete(`private/${s.override()!.private_name}.jpg`);
    s.seed('a');
    s.log.length = 0;
    const res = await handleApiRequest(post('hide'), s.env);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'Already hidden' });
    expect(s.log.filter((o) => o.op !== 'get')).toEqual([]);
  });

  it('409s Image files missing and leaves no override when nothing can be copied', async () => {
    const s = setup();
    s.insert('a', 'h1');
    const res = await handleApiRequest(post('hide'), s.env);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'Image files missing' });
    expect(s.override()).toBeUndefined();
  });

  it('two interleaved hides end with the override pointing at existing objects', async () => {
    const s = setup();
    s.insert('a', 'h1');
    s.seed('a');
    let fired = false;
    let second: Promise<Response> | undefined;
    s.hooks.afterPut = async (n) => {
      if (n === 2 && !fired) {
        fired = true;
        // Second request runs fully after the first's copies, before its setHidden.
        second = handleApiRequest(post('hide'), s.env);
        await second;
      }
    };
    const first = await handleApiRequest(post('hide'), s.env);
    expect(first.status).toBe(200);
    expect((await second!).status).toBe(200);
    const o = s.override()!;
    expect(o.hidden).toBe(1);
    expect(s.store.has(`private/${o.private_name}.jpg`)).toBe(true);
    expect(s.store.has(`private/thumbnails/${o.private_name}.jpg`)).toBe(true);
    expect([...s.store.keys()].filter((k) => k.startsWith('images/'))).toEqual([]);
    expect([...s.store.keys()].filter((k) => k.startsWith('private/'))).toHaveLength(2);
  });
});

describe('unhide', () => {
  it('restores objects, clears the override, deletes private copies; re-hide uses a new name', async () => {
    const s = setup();
    s.insert('a', 'h1');
    s.insert('a2', 'h1');
    s.seed('a');
    s.seed('a2');
    await handleApiRequest(post('hide'), s.env);
    const first = s.override()!.private_name!;
    s.log.length = 0;
    const res = await handleApiRequest(post('unhide'), s.env);
    expect(res.status).toBe(200);
    for (const id of ['a', 'a2']) {
      expect(s.store.has(`images/${id}.jpg`)).toBe(true);
      expect(s.store.has(`images/thumbnails/${id}.jpg`)).toBe(true);
    }
    expect([...s.store.keys()].filter((k) => k.startsWith('private/'))).toEqual([]);
    expect(s.store.get('images/a.jpg')!.meta).toEqual({ contentType: 'image/jpeg' });
    expect(s.override()).toMatchObject({ hidden: 0, private_name: null });
    const firstDelete = s.log.findIndex((o) => o.op === 'delete');
    expect(s.log.map((o) => o.op).lastIndexOf('put')).toBeLessThan(firstDelete);
    for (const d of s.log.filter((o) => o.op === 'delete')) {
      expect(d.hidden).toEqual({ hidden: 0, private_name: null });
    }
    const body = (await res.json()) as Array<{ hidden?: boolean; imageUrl: string }>;
    for (const r of body) {
      expect(r.hidden).toBeUndefined();
      expect(r.imageUrl).toMatch(/\/images\//);
    }
    await handleApiRequest(post('hide'), s.env);
    expect(s.override()!.private_name).not.toBe(first);
  });

  it('409s when not hidden', async () => {
    const s = setup();
    s.insert('a', 'h1');
    s.seed('a');
    const res = await handleApiRequest(post('unhide'), s.env);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'Not hidden' });
    expect(s.log.filter((o) => o.op !== 'get')).toEqual([]);
  });
});

describe('errors and guards', () => {
  it('409 for NULL hash, 404 for unknown id, no writes', async () => {
    const s = setup();
    s.insert('n', null);
    const r1 = await handleApiRequest(post('hide', 'n'), s.env);
    expect(r1.status).toBe(409);
    expect(await r1.json()).toEqual({ error: 'Image cannot be edited' });
    const r2 = await handleApiRequest(post('hide', 'zzz'), s.env);
    expect(r2.status).toBe(404);
    expect(s.log).toEqual([]);
    expect(s.override()).toBeUndefined();
  });

  it('401 / 403 / 403 cross-origin with no writes', async () => {
    const s = setup();
    s.insert('a', 'h1');
    s.seed('a');
    mockCurrent.mockResolvedValueOnce(null);
    expect((await handleApiRequest(post('hide'), s.env)).status).toBe(401);
    mockCurrent.mockResolvedValueOnce({ ...admin, isAdmin: false });
    expect((await handleApiRequest(post('hide'), s.env)).status).toBe(403);
    expect((await handleApiRequest(post('hide', 'a', { origin: 'https://evil.test' }), s.env)).status).toBe(403);
    expect(s.log).toEqual([]);
    expect(s.override()).toBeUndefined();
  });

  it('405 for GET', async () => {
    const s = setup();
    expect((await handleApiRequest(post('hide', 'a', {}, 'GET'), s.env)).status).toBe(405);
    expect((await handleApiRequest(post('unhide', 'a', {}, 'GET'), s.env)).status).toBe(405);
  });
});

describe('interaction with moves', () => {
  const move = (lat: number, lon: number) =>
    new Request(`${ORIGIN}/api/images/a/location`, {
      method: 'PUT',
      body: JSON.stringify({ latitude: lat, longitude: lon }),
      headers: { origin: ORIGIN },
    });

  it('a move after hide keeps hidden=1', async () => {
    const s = setup();
    s.insert('a', 'h1');
    s.seed('a');
    await handleApiRequest(post('hide'), s.env);
    const name = s.override()!.private_name;
    await handleApiRequest(move(1, 2), s.env);
    expect(s.override()).toMatchObject({ hidden: 1, private_name: name, latitude: 1 });
  });

  it('a hide after a move keeps the position', async () => {
    const s = setup();
    s.insert('a', 'h1');
    s.seed('a');
    await handleApiRequest(move(1, 2), s.env);
    const res = await handleApiRequest(post('hide'), s.env);
    expect(s.override()).toMatchObject({ hidden: 1, latitude: 1 });
    const body = (await res.json()) as Array<{ latitude: number; longitude: number }>;
    expect([body[0].latitude, body[0].longitude]).toEqual([1, 2]);
  });
});

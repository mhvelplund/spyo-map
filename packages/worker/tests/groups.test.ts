import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { sqliteD1 } from './helpers/sqliteD1.js';

const mockCurrent = jest.fn<(req: Request, env: unknown) => Promise<unknown>>();
jest.unstable_mockModule('../src/auth/currentUploader.js', () => ({
  currentUploader: mockCurrent,
}));

const { handleApiRequest } = await import('../src/router.js');
const { randomGroupId } = await import('../src/admin/groups.js');

const ORIGIN = 'https://app.test';
const BASE = 'https://img.test';
const admin = { id: 1, displayName: 'A', isAdmin: true };

type Rec = { id: string; latitude: number; longitude: number; groupId?: string; groupedAt?: string };
type Row = {
  content_hash: string;
  latitude: number | null;
  longitude: number | null;
  group_id: string | null;
  grouped_at: string | null;
  pre_group_latitude: number | null;
  pre_group_longitude: number | null;
};

function setup() {
  const { db, raw } = sqliteD1();
  let batches = 0;
  // Runs once just before the next batch: simulates another request landing between the handler's read and write.
  let beforeBatch: (() => void) | null = null;
  const counted = {
    prepare: db.prepare.bind(db),
    batch: (stmts: never) => {
      batches += 1;
      const hook = beforeBatch;
      beforeBatch = null;
      hook?.();
      return db.batch(stmts);
    },
  };
  const insert = (id: string, hash: string | null, lat = 10, lon = 20) =>
    raw
      .prepare('INSERT INTO images (id, latitude, longitude, timestamp, content_hash) VALUES (?, ?, ?, ?, ?)')
      .run(id, lat, lon, '2024-01-01T00:00:00.000Z', hash);
  const override = (
    hash: string,
    o: { lat?: number | null; lon?: number | null; group?: string; at?: string; pre?: [number, number] | null } = {},
  ) =>
    raw
      .prepare(
        'INSERT INTO image_overrides (content_hash, latitude, longitude, updated_at, group_id, grouped_at, pre_group_latitude, pre_group_longitude) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        hash,
        o.lat ?? null,
        o.lon ?? null,
        'x',
        o.group ?? null,
        o.group ? (o.at ?? '2024-02-01T00:00:00.000Z') : null,
        o.pre?.[0] ?? null,
        o.pre?.[1] ?? null,
      );
  const row = (hash: string) =>
    raw
      .prepare(
        'SELECT content_hash, latitude, longitude, group_id, grouped_at, pre_group_latitude, pre_group_longitude FROM image_overrides WHERE content_hash = ?',
      )
      .get(hash) as Row | undefined;
  const all = () => raw.prepare('SELECT * FROM image_overrides ORDER BY content_hash').all();
  const env = { DB: counted, IMAGES_BASE_URL: BASE } as never;
  const onNextBatch = (fn: () => void) => {
    beforeBatch = fn;
  };
  return { env, raw, insert, override, row, all, batches: () => batches, onNextBatch };
}

const req = (
  action: 'group' | 'ungroup',
  id: string,
  body?: unknown,
  headers: Record<string, string> = { origin: ORIGIN },
  method = 'POST',
) =>
  new Request(`${ORIGIN}/api/images/${id}/${action}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  });
const group = (id: string, targetId: unknown, headers?: Record<string, string>) =>
  req('group', id, { targetId }, headers);
const ungroup = (id: string, headers?: Record<string, string>) => req('ungroup', id, undefined, headers);

beforeEach(() => {
  mockCurrent.mockReset();
  mockCurrent.mockResolvedValue(admin);
});

describe('randomGroupId', () => {
  it('is 32 lowercase hex chars and unique', () => {
    expect(randomGroupId()).toMatch(/^[0-9a-f]{32}$/);
    expect(randomGroupId()).not.toBe(randomGroupId());
  });
});

describe('POST /api/images/:id/group', () => {
  it('groups A onto ungrouped B: new group, B earlier, A at B position, pre_group_* kept', async () => {
    const { env, insert, override, row, batches } = setup();
    insert('a', 'ha', 1, 2);
    insert('b', 'hb', 10, 20);
    override('hb', { lat: 30, lon: 40 }); // B's effective position is its override
    const res = await handleApiRequest(group('a', 'b'), env);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(batches()).toBe(1);
    const body = (await res.json()) as Rec[];
    expect(body.map((r) => r.id).sort()).toEqual(['a', 'b']);
    const a = row('ha')!;
    const b = row('hb')!;
    expect(a.group_id).toMatch(/^[0-9a-f]{32}$/);
    expect(b.group_id).toBe(a.group_id);
    expect(b.grouped_at! < a.grouped_at!).toBe(true);
    expect([a.latitude, a.longitude]).toEqual([30, 40]);
    expect([b.latitude, b.longitude]).toEqual([30, 40]);
    expect([a.pre_group_latitude, a.pre_group_longitude]).toEqual([1, 2]);
    expect([b.pre_group_latitude, b.pre_group_longitude]).toEqual([30, 40]);
    for (const r of body) {
      expect([r.latitude, r.longitude, r.groupId]).toEqual([30, 40, a.group_id]);
      expect(r.groupedAt).toBe(r.id === 'a' ? a.grouped_at : b.grouped_at);
    }
  });

  it('groups C onto B already in a group: C joins, B keeps grouped_at', async () => {
    const { env, insert, override, row } = setup();
    const G = 'b'.repeat(32);
    insert('b', 'hb');
    insert('x', 'hx');
    insert('c', 'hc', 7, 8);
    override('hb', { lat: 30, lon: 40, group: G, at: '2024-02-01T00:00:00.000Z', pre: [10, 20] });
    override('hx', { lat: 30, lon: 40, group: G, at: '2024-02-02T00:00:00.000Z', pre: [10, 20] });
    const res = await handleApiRequest(group('c', 'b'), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Rec[];
    expect(body.map((r) => r.id)).toContain('c');
    expect(row('hb')).toMatchObject({ group_id: G, grouped_at: '2024-02-01T00:00:00.000Z', pre_group_latitude: 10 });
    expect(row('hc')).toMatchObject({ group_id: G, latitude: 30, longitude: 40, pre_group_latitude: 7, pre_group_longitude: 8 });
    expect(row('hc')!.grouped_at! > '2024-02-02T00:00:00.000Z').toBe(true);
    expect(row('hx')).toMatchObject({ group_id: G, grouped_at: '2024-02-02T00:00:00.000Z' });
  });

  it('merges group G1 = {A, D} into ungrouped E with each member keeping its own pre_group_*', async () => {
    const { env, insert, override, row } = setup();
    const G1 = 'c'.repeat(32);
    insert('a', 'ha');
    insert('d', 'hd');
    insert('e', 'he', 50, 60);
    override('ha', { lat: 1, lon: 2, group: G1, at: '2024-02-01T00:00:00.000Z', pre: [9, 9] });
    override('hd', { lat: 1, lon: 2, group: G1, at: '2024-02-02T00:00:00.000Z', pre: [8, 8] });
    const res = await handleApiRequest(group('a', 'e'), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Rec[];
    expect(body.map((r) => r.id).sort()).toEqual(['a', 'd', 'e']);
    const G2 = row('he')!.group_id!;
    expect(G2).toMatch(/^[0-9a-f]{32}$/);
    expect(G2).not.toBe(G1);
    for (const h of ['ha', 'hd']) {
      expect(row(h)).toMatchObject({ group_id: G2, latitude: 50, longitude: 60, pre_group_latitude: 1, pre_group_longitude: 2 });
      expect(row(h)!.grouped_at! > row('he')!.grouped_at!).toBe(true);
    }
    expect(row('he')).toMatchObject({ latitude: 50, longitude: 60, pre_group_latitude: 50, pre_group_longitude: 60 });
  });

  it('returns the whole resulting group', async () => {
    const { env, insert, override } = setup();
    const G = 'f'.repeat(32);
    insert('b', 'hb');
    insert('x', 'hx');
    insert('y', 'hy');
    insert('c', 'hc');
    override('hb', { lat: 1, lon: 2, group: G, at: '2024-02-01T00:00:00.000Z' });
    override('hx', { lat: 1, lon: 2, group: G, at: '2024-02-02T00:00:00.000Z' });
    override('hy', { lat: 1, lon: 2, group: G, at: '2024-02-03T00:00:00.000Z' });
    const res = await handleApiRequest(group('c', 'b'), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Rec[];
    expect(body.map((r) => r.id).sort()).toEqual(['b', 'c', 'x', 'y']);
    for (const r of body) expect(r.groupId).toBe(G);
  });

  it('answers 409 Conflict and writes nothing when the target was grouped by a concurrent request', async () => {
    const { env, insert, override, row, onNextBatch } = setup();
    insert('a', 'ha', 1, 2);
    insert('b', 'hb', 10, 20);
    insert('x', 'hx', 3, 4);
    const OTHER = '9'.repeat(32);
    // The other request (X onto B) commits after our read, before our batch.
    onNextBatch(() => {
      override('hb', { lat: 10, lon: 20, group: OTHER, at: '2024-03-01T00:00:00.000Z', pre: [10, 20] });
      override('hx', { lat: 10, lon: 20, group: OTHER, at: '2024-03-02T00:00:00.000Z', pre: [3, 4] });
    });
    const res = await handleApiRequest(group('a', 'b'), env);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'Conflict' });
    expect(row('ha')).toBeUndefined();
    expect(row('hb')).toMatchObject({ group_id: OTHER, grouped_at: '2024-03-01T00:00:00.000Z' });
    expect(row('hx')).toMatchObject({ group_id: OTHER });
  });

  it('answers 409 Conflict when the existing target group changed before the write', async () => {
    const { env, insert, override, raw, row, onNextBatch } = setup();
    const G = 'a'.repeat(32);
    insert('a', 'ha');
    insert('b', 'hb');
    insert('x', 'hx');
    override('hb', { lat: 1, lon: 2, group: G });
    override('hx', { lat: 1, lon: 2, group: G });
    onNextBatch(() => {
      raw.prepare('UPDATE image_overrides SET group_id = NULL, grouped_at = NULL').run();
    });
    const res = await handleApiRequest(group('a', 'b'), env);
    expect(res.status).toBe(409);
    expect(row('ha')).toBeUndefined();
  });

  it('answers 409 Already grouped onto a member of the same group', async () => {
    const { env, insert, override, all } = setup();
    const G = 'd'.repeat(32);
    insert('a', 'ha');
    insert('b', 'hb');
    override('ha', { lat: 1, lon: 2, group: G });
    override('hb', { lat: 1, lon: 2, group: G });
    const before = all();
    const res = await handleApiRequest(group('a', 'b'), env);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'Already grouped' });
    expect(all()).toEqual(before);
  });

  it('answers 409 for the same id or the same hash', async () => {
    const { env, insert, all } = setup();
    insert('a', 'ha');
    insert('a2', 'ha');
    for (const target of ['a', 'a2']) {
      const res = await handleApiRequest(group('a', target), env);
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: 'Cannot group a photo with itself' });
    }
    expect(all()).toEqual([]);
  });

  it('answers 409 when either side has no content hash', async () => {
    const { env, insert, all } = setup();
    insert('a', 'ha');
    insert('n', null);
    for (const [id, target] of [
      ['a', 'n'],
      ['n', 'a'],
    ]) {
      const res = await handleApiRequest(group(id, target), env);
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: 'Image cannot be edited' });
    }
    expect(all()).toEqual([]);
  });

  it('answers 404 for an unknown id or targetId', async () => {
    const { env, insert, all } = setup();
    insert('a', 'ha');
    expect((await handleApiRequest(group('nope', 'a'), env)).status).toBe(404);
    expect((await handleApiRequest(group('a', 'nope'), env)).status).toBe(404);
    expect(all()).toEqual([]);
  });

  it.each([[{}], [{ targetId: 5 }], [{ targetId: null }], ['not json'], [null]])(
    'answers 400 Invalid target for body %j',
    async (bad) => {
      const { env, insert, all } = setup();
      insert('a', 'ha');
      insert('b', 'hb');
      const res = await handleApiRequest(req('group', 'a', bad), env);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Invalid target' });
      expect(all()).toEqual([]);
    },
  );
});

describe('POST /api/images/:id/ungroup', () => {
  const G = 'e'.repeat(32);

  it('removes A from {A, B, C} and returns it to pre_group_*', async () => {
    const { env, insert, override, row, batches } = setup();
    insert('a', 'ha');
    insert('b', 'hb');
    insert('c', 'hc');
    override('ha', { lat: 5, lon: 6, group: G, pre: [1, 2] });
    override('hb', { lat: 5, lon: 6, group: G, pre: [3, 4] });
    override('hc', { lat: 5, lon: 6, group: G, pre: [7, 8] });
    const before = { hb: row('hb'), hc: row('hc') };
    const res = await handleApiRequest(ungroup('a'), env);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(batches()).toBe(1);
    const body = (await res.json()) as Rec[];
    expect(body.map((r) => r.id)).toEqual(['a']);
    expect([body[0].latitude, body[0].longitude]).toEqual([1, 2]);
    expect('groupId' in body[0]).toBe(false);
    expect(row('ha')).toMatchObject({
      latitude: 1,
      longitude: 2,
      group_id: null,
      grouped_at: null,
      pre_group_latitude: null,
      pre_group_longitude: null,
    });
    expect(row('hb')).toEqual(before.hb);
    expect(row('hc')).toEqual(before.hc);
  });

  it('keeps the group position when pre_group_* was cleared by a move', async () => {
    const { env, insert, override, row } = setup();
    insert('a', 'ha');
    insert('b', 'hb');
    insert('c', 'hc');
    override('ha', { lat: 5, lon: 6, group: G, pre: null });
    override('hb', { lat: 5, lon: 6, group: G, pre: null });
    override('hc', { lat: 5, lon: 6, group: G, pre: null });
    const res = await handleApiRequest(ungroup('a'), env);
    expect(res.status).toBe(200);
    expect(row('ha')).toMatchObject({ latitude: 5, longitude: 6, group_id: null });
  });

  it('dissolves a two-member group; the other member keeps its position', async () => {
    const { env, insert, override, row } = setup();
    insert('a', 'ha');
    insert('b', 'hb');
    override('ha', { lat: 5, lon: 6, group: G, pre: [1, 2] });
    override('hb', { lat: 5, lon: 6, group: G, pre: [3, 4] });
    const res = await handleApiRequest(ungroup('a'), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Rec[];
    expect(body.map((r) => r.id).sort()).toEqual(['a', 'b']);
    for (const r of body) expect('groupId' in r).toBe(false);
    expect(row('hb')).toMatchObject({ latitude: 5, longitude: 6, group_id: null, grouped_at: null });
    expect(row('ha')).toMatchObject({ latitude: 1, longitude: 2, group_id: null });
  });

  it('ignores orphan overrides (no images row) when deciding to dissolve', async () => {
    const { env, insert, override, raw, row } = setup();
    insert('a', 'ha');
    insert('b', 'hb');
    insert('c', 'hc');
    override('ha', { lat: 5, lon: 6, group: G, pre: [1, 2] });
    override('hb', { lat: 5, lon: 6, group: G, pre: [3, 4] });
    override('hc', { lat: 5, lon: 6, group: G, pre: [7, 8] });
    raw.prepare('DELETE FROM images WHERE id = ?').run('c'); // e.g. `admin images remove`
    const res = await handleApiRequest(ungroup('a'), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Rec[];
    expect(body.map((r) => r.id).sort()).toEqual(['a', 'b']);
    expect(row('hb')).toMatchObject({ group_id: null, grouped_at: null });
  });

  it('answers 409 Not grouped for an ungrouped photo', async () => {
    const { env, insert, override, all } = setup();
    insert('a', 'ha');
    insert('b', 'hb');
    override('hb', { lat: 1, lon: 2 });
    for (const id of ['a', 'b']) {
      const res = await handleApiRequest(ungroup(id), env);
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: 'Not grouped' });
    }
    expect(all()).toHaveLength(1);
  });

  it('answers 404 for an unknown id and 409 for a row without a hash', async () => {
    const { env, insert } = setup();
    insert('n', null);
    expect((await handleApiRequest(ungroup('nope'), env)).status).toBe(404);
    const res = await handleApiRequest(ungroup('n'), env);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'Image cannot be edited' });
  });
});

describe('group/ungroup auth and routing', () => {
  it('answers 401 signed out, 403 non-admin, 403 cross-origin without writing', async () => {
    const { env, insert, override, all } = setup();
    insert('a', 'ha');
    insert('b', 'hb');
    override('ha', { lat: 1, lon: 2, group: 'f'.repeat(32) });
    override('hb', { lat: 1, lon: 2, group: 'f'.repeat(32) });
    const before = all();
    for (const make of [() => group('a', 'b'), () => ungroup('a')]) {
      mockCurrent.mockResolvedValueOnce(null);
      expect((await handleApiRequest(make(), env)).status).toBe(401);
      mockCurrent.mockResolvedValueOnce({ ...admin, isAdmin: false });
      expect((await handleApiRequest(make(), env)).status).toBe(403);
    }
    expect((await handleApiRequest(group('a', 'b', { origin: 'https://evil.test' }), env)).status).toBe(403);
    expect((await handleApiRequest(ungroup('a', { origin: 'https://evil.test' }), env)).status).toBe(403);
    expect(all()).toEqual(before);
  });

  it('answers 405 for GET on group and ungroup', async () => {
    const { env, insert } = setup();
    insert('a', 'ha');
    expect((await handleApiRequest(req('group', 'a', undefined, { origin: ORIGIN }, 'GET'), env)).status).toBe(405);
    expect((await handleApiRequest(req('ungroup', 'a', undefined, { origin: ORIGIN }, 'GET'), env)).status).toBe(405);
  });
});

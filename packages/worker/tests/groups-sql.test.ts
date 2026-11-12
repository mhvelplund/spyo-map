import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { sqliteD1 } from './helpers/sqliteD1.js';

const mockCurrent = jest.fn<(req: Request, env: unknown) => Promise<unknown>>();
jest.unstable_mockModule('../src/auth/currentUploader.js', () => ({
  currentUploader: mockCurrent,
}));

const { handleApiRequest } = await import('../src/router.js');

const ORIGIN = 'https://app.test';
const BASE = 'https://img.test';
const G = 'a'.repeat(32);

type Rec = { id: string; latitude: number; longitude: number; groupId?: string; groupedAt?: string };

function setup() {
  const { db, raw } = sqliteD1();
  const insert = (id: string, hash: string) =>
    raw
      .prepare('INSERT INTO images (id, latitude, longitude, timestamp, content_hash) VALUES (?, ?, ?, ?, ?)')
      .run(id, 10, 20, '2024-01-01T00:00:00.000Z', hash);
  const override = (hash: string, extra: { hidden?: number; group?: boolean } = {}) =>
    raw
      .prepare(
        'INSERT INTO image_overrides (content_hash, latitude, longitude, updated_at, hidden, group_id, grouped_at, pre_group_latitude, pre_group_longitude) VALUES (?, 5, 6, ?, ?, ?, ?, 1, 2)',
      )
      .run(hash, 'x', extra.hidden ?? 0, extra.group ? G : null, extra.group ? '2024-02-01T00:00:00.000Z' : null);
  return { env: { DB: db, IMAGES_BASE_URL: BASE } as never, raw, insert, override };
}

const admin = { id: 1, displayName: 'A', isAdmin: true };
beforeEach(() => {
  mockCurrent.mockReset();
  mockCurrent.mockResolvedValue(admin);
});

const list = async (env: never) =>
  (await (await handleApiRequest(new Request(`${ORIGIN}/api/images`), env)).json()) as Rec[];

describe('group reads', () => {
  it('carries groupId/groupedAt on grouped rows only', async () => {
    const { env, insert, override } = setup();
    insert('a', 'h1');
    insert('b', 'h2');
    override('h1', { group: true });
    const recs = await list(env);
    const a = recs.find((r) => r.id === 'a')!;
    const b = recs.find((r) => r.id === 'b')!;
    expect(a.groupId).toBe(G);
    expect(a.groupedAt).toBe('2024-02-01T00:00:00.000Z');
    expect('groupId' in b).toBe(false);
    expect('groupedAt' in b).toBe(false);
  });

  it('omits hidden members for visitors but keeps visible ones with groupId', async () => {
    const { env, insert, override } = setup();
    insert('a', 'h1');
    insert('b', 'h2');
    override('h1', { group: true });
    override('h2', { group: true, hidden: 1 });
    mockCurrent.mockResolvedValue(null);
    const recs = await list(env);
    expect(recs.map((r) => r.id)).toEqual(['a']);
    expect(recs[0].groupId).toBe(G);
  });
});

describe('PUT location on a grouped photo', () => {
  const put = (id: string) =>
    new Request(`${ORIGIN}/api/images/${id}/location`, {
      method: 'PUT',
      body: JSON.stringify({ latitude: 55, longitude: 12 }),
      headers: { origin: ORIGIN },
    });

  it('moves every member, clears pre_group_*, and returns all member records', async () => {
    const { env, raw, insert, override } = setup();
    insert('a', 'h1');
    insert('a2', 'h1');
    insert('b', 'h2');
    insert('c', 'h3');
    override('h1', { group: true });
    override('h2', { group: true });
    override('h3');
    const res = await handleApiRequest(put('a'), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Rec[];
    expect(body.map((r) => r.id).sort()).toEqual(['a', 'a2', 'b']);
    for (const r of body) expect([r.latitude, r.longitude, r.groupId]).toEqual([55, 12, G]);
    const rows = raw
      .prepare('SELECT content_hash, latitude, longitude, pre_group_latitude, pre_group_longitude FROM image_overrides ORDER BY content_hash')
      .all();
    expect(rows).toEqual([
      { content_hash: 'h1', latitude: 55, longitude: 12, pre_group_latitude: null, pre_group_longitude: null },
      { content_hash: 'h2', latitude: 55, longitude: 12, pre_group_latitude: null, pre_group_longitude: null },
      { content_hash: 'h3', latitude: 5, longitude: 6, pre_group_latitude: 1, pre_group_longitude: 2 },
    ]);
  });

  it('behaves as before for an ungrouped photo', async () => {
    const { env, raw, insert, override } = setup();
    insert('a', 'h1');
    insert('b', 'h2');
    override('h2', { group: true });
    const res = await handleApiRequest(put('a'), env);
    const body = (await res.json()) as Rec[];
    expect(body.map((r) => r.id)).toEqual(['a']);
    expect('groupId' in body[0]).toBe(false);
    expect(raw.prepare("SELECT latitude FROM image_overrides WHERE content_hash = 'h2'").get()).toEqual({ latitude: 5 });
  });
});

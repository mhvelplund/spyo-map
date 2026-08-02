import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import {
  createD1Client,
  fetchExistingIds,
  upsertImages,
  type D1Client,
  type ImageInsert,
} from '../src/d1.js';
import type { Config } from '../src/config.js';
import type { ExifData } from '../src/processor.js';

const CONFIG: Config = {
  storageEndpoint: 'https://acct.r2.cloudflarestorage.com',
  storageBucket: 'spyo-map',
  storageAccessKey: 'key',
  storageSecretKey: 'secret',
  storageRegion: 'auto',
  localSourcePath: undefined,
  cloudflareAccountId: 'acct123',
  cloudflareApiToken: 'token123',
  d1DatabaseId: 'db123',
};

function makeExif(overrides: Partial<ExifData> = {}): ExifData {
  return {
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
    ...overrides,
  };
}

const EXIF: ExifData = makeExif();

function okResponse(results: unknown[]): Response {
  return new Response(
    JSON.stringify({ success: true, result: [{ results, success: true }] }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

/** Records every query a client makes, and replays canned row sets. */
function fakeClient(rows: Array<Record<string, unknown>> = []): {
  client: D1Client;
  calls: Array<{ sql: string; params: unknown[] }>;
} {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const client: D1Client = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      return rows;
    },
  };
  return { client, calls };
}

describe('createD1Client', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockFetch: jest.Mock<any>;

  beforeEach(() => {
    mockFetch = jest.fn();
    globalThis.fetch = mockFetch as unknown as typeof fetch;
  });

  it('posts to the account and database specific endpoint', async () => {
    mockFetch.mockResolvedValue(okResponse([]));
    await createD1Client(CONFIG).query('SELECT 1');
    expect(mockFetch.mock.calls[0]![0]).toBe(
      'https://api.cloudflare.com/client/v4/accounts/acct123/d1/database/db123/query',
    );
  });

  it('sends the API token as a bearer credential', async () => {
    mockFetch.mockResolvedValue(okResponse([]));
    await createD1Client(CONFIG).query('SELECT 1');
    const init = mockFetch.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer token123');
    expect(init.method).toBe('POST');
  });

  it('sends sql and params in the body', async () => {
    mockFetch.mockResolvedValue(okResponse([]));
    await createD1Client(CONFIG).query('SELECT * FROM images WHERE id = ?', ['abc']);
    const init = mockFetch.mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({
      sql: 'SELECT * FROM images WHERE id = ?',
      params: ['abc'],
    });
  });

  it('returns the rows from the first result block', async () => {
    mockFetch.mockResolvedValue(okResponse([{ id: 'a' }, { id: 'b' }]));
    const rows = await createD1Client(CONFIG).query('SELECT id FROM images');
    expect(rows).toEqual([{ id: 'a' }, { id: 'b' }]);
  });

  it('throws with the API error message when the call fails', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({ success: false, errors: [{ code: 7500, message: 'no such table' }] }),
        { status: 400 },
      ),
    );
    await expect(createD1Client(CONFIG).query('SELECT 1')).rejects.toThrow('no such table');
  });

  it('throws on a non-JSON transport failure', async () => {
    mockFetch.mockResolvedValue(new Response('gateway timeout', { status: 504 }));
    await expect(createD1Client(CONFIG).query('SELECT 1')).rejects.toThrow('504');
  });
});

describe('fetchExistingIds', () => {
  it('selects only the id column', async () => {
    const { client, calls } = fakeClient([]);
    await fetchExistingIds(client);
    expect(calls[0]!.sql).toBe('SELECT id FROM images');
  });

  it('returns the ids as a set', async () => {
    const { client } = fakeClient([{ id: 'a' }, { id: 'b' }]);
    expect(await fetchExistingIds(client)).toEqual(new Set(['a', 'b']));
  });

  it('returns an empty set for an empty table', async () => {
    const { client } = fakeClient([]);
    expect((await fetchExistingIds(client)).size).toBe(0);
  });
});

describe('upsertImages', () => {
  const row = (id: string): ImageInsert => ({ id, path: `${id}.jpg`, exif: EXIF });

  it('issues no query for an empty batch', async () => {
    const { client, calls } = fakeClient();
    await upsertImages(client, []);
    expect(calls).toHaveLength(0);
  });

  it('writes all rows of a small batch in one statement', async () => {
    const { client, calls } = fakeClient();
    await upsertImages(client, [row('a'), row('b')]);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.sql).toMatch(/^INSERT INTO images/);
    expect(calls[0]!.sql).toMatch(/ON CONFLICT\(id\) DO UPDATE/);
  });

  it('binds sixteen parameters per row, id first', async () => {
    const { client, calls } = fakeClient();
    await upsertImages(client, [row('a'), row('b')]);
    expect(calls[0]!.params).toHaveLength(32);
    expect(calls[0]!.params[0]).toBe('a');
    expect(calls[0]!.params[16]).toBe('b');
  });

  it('maps absent EXIF fields to null rather than undefined', async () => {
    const { client, calls } = fakeClient();
    await upsertImages(client, [row('a')]);
    // [id, path, latitude, longitude, timestamp, ...]
    expect(calls[0]!.params[4]).toBeNull();
    expect(calls[0]!.params.every((p) => p !== undefined)).toBe(true);
  });

  it('splits batches larger than twenty rows', async () => {
    const { client, calls } = fakeClient();
    await upsertImages(
      client,
      Array.from({ length: 45 }, (_, i) => row(`id${i}`)),
    );
    expect(calls).toHaveLength(3);
    expect(calls[0]!.params).toHaveLength(20 * 16);
    expect(calls[2]!.params).toHaveLength(5 * 16);
  });
});

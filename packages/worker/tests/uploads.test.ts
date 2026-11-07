import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { fakeD1 } from './helpers/fakeD1.js';

const mockCurrent = jest.fn<(req: Request, env: unknown) => Promise<unknown>>();
jest.unstable_mockModule('../src/auth/currentUploader.js', () => ({
  currentUploader: mockCurrent,
}));

const { findKnownHashes, recordUpload } = await import('../src/services/uploads.js');
const { handleUploadCheck, handleUploadPut } = await import('../src/uploads/handlers.js');
const { handleApiRequest } = await import('../src/router.js');

const SHA = 'a'.repeat(64);
const ORIGIN = 'https://app.test';

/** In-memory R2: put drains the body, get supports a byte range, delete removes. */
function makeEnv(rows: Array<Record<string, unknown>> = []) {
  const { db, calls } = fakeD1(rows);
  const objects = new Map<string, Uint8Array>();
  const put = jest.fn<(...a: unknown[]) => Promise<unknown>>(async (key, body) => {
    objects.set(key as string, new Uint8Array(await readAll(body)));
    return {};
  });
  const get = jest.fn<(...a: unknown[]) => Promise<unknown>>(async (key, opts) => {
    const bytes = objects.get(key as string);
    if (!bytes) return null;
    const range = (opts as { range?: { offset: number; length: number } } | undefined)?.range;
    const slice = range ? bytes.slice(range.offset, range.offset + range.length) : bytes;
    return { arrayBuffer: async () => slice.buffer };
  });
  const del = jest.fn<(...a: unknown[]) => Promise<void>>(async (key) => {
    objects.delete(key as string);
  });
  return { env: { DB: db, BUCKET: { put, get, delete: del } } as never, calls, put, get, del, objects };
}

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2]);
const TIFF = new Uint8Array([0x49, 0x49, 0x2a, 0x00, 1, 2]);

function putReq(body: Uint8Array, headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}/api/uploads/${SHA}`, {
    method: 'PUT',
    body,
    headers: {
      origin: ORIGIN,
      'content-length': String(body.length),
      'content-type': 'image/jpeg',
      ...headers,
    },
  });
}

async function readAll(stream: unknown): Promise<number[]> {
  const out: number[] = [];
  const reader = (stream as ReadableStream<Uint8Array>).getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return out;
    out.push(...value);
  }
}

function failingLedgerEnv() {
  const made = makeEnv();
  const db = (made.env as { DB: { prepare: (sql: string) => { run: () => Promise<unknown> } } }).DB;
  const prepare = db.prepare.bind(db);
  db.prepare = (sql: string) => {
    const stmt = prepare(sql);
    if (sql.includes('INSERT INTO uploads')) {
      stmt.run = async () => {
        throw new Error('d1 down');
      };
    }
    return stmt;
  };
  return made;
}

function checkReq(body: unknown, origin: string | null = ORIGIN): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (origin) headers.origin = origin;
  return new Request(`${ORIGIN}/api/uploads/check`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers,
  });
}

beforeEach(() => {
  mockCurrent.mockReset();
  mockCurrent.mockResolvedValue({ id: 1, displayName: 'MH' });
});

describe('services', () => {
  it('chunks known-hash lookups to <= 90 binds', async () => {
    const { db, calls } = fakeD1([]);
    const hashes = Array.from({ length: 250 }, (_, i) => String(i).padStart(64, '0'));
    await findKnownHashes(db, hashes);
    expect(calls).toHaveLength(3);
    for (const c of calls) expect(c.params.length).toBeLessThanOrEqual(90);
  });

  it('recordUpload binds fields with ON CONFLICT DO NOTHING', async () => {
    const { db, calls } = fakeD1([]);
    await recordUpload(db, {
      contentHash: SHA,
      uploaderId: 1,
      originalFilename: 'x.jpg',
      rawKey: `raw/${SHA}.jpg`,
    });
    expect(calls[0].sql).toContain('ON CONFLICT(content_hash) DO NOTHING');
    expect(calls[0].params).toEqual([SHA, 1, 'x.jpg', `raw/${SHA}.jpg`]);
  });
});

describe('POST /api/uploads/check', () => {
  it('403 without Origin', async () => {
    const res = await handleUploadCheck(checkReq({ hashes: [SHA] }, null), makeEnv().env);
    expect(res.status).toBe(403);
  });
  it('401 without session', async () => {
    mockCurrent.mockResolvedValue(null);
    const res = await handleUploadCheck(checkReq({ hashes: [SHA] }), makeEnv().env);
    expect(res.status).toBe(401);
  });
  it('400 on bad hashes', async () => {
    const { env } = makeEnv();
    expect((await handleUploadCheck(checkReq({ hashes: ['nothex'] }), env)).status).toBe(400);
    expect((await handleUploadCheck(checkReq({ hashes: [] }), env)).status).toBe(400);
    expect((await handleUploadCheck(checkReq({}), env)).status).toBe(400);
  });
  it('returns known from D1', async () => {
    const { env } = makeEnv([{ content_hash: SHA }]);
    const res = await handleUploadCheck(checkReq({ hashes: [SHA, 'b'.repeat(64)] }), env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ known: [SHA] });
  });
});

describe('PUT /api/uploads/:sha256', () => {
  it('stores a JPEG and records the ledger row', async () => {
    const { env, calls, put } = makeEnv();
    const res = await handleUploadPut(
      putReq(JPEG, { 'x-original-filename': 'N%C3%B8rrebro%20%C3%A6ble.jpg' }),
      env,
      SHA,
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ status: 'added' });
    expect(put).toHaveBeenCalledTimes(1);
    const [key, , opts] = put.mock.calls[0] as [
      string,
      unknown,
      { customMetadata: Record<string, string>; httpMetadata: { contentType: string } },
    ];
    expect(key).toBe(`raw/${SHA}.jpg`);
    expect(opts.customMetadata['uploader-id']).toBe('1');
    expect(opts.customMetadata.sha256).toBe(SHA);
    expect(opts.customMetadata['original-name']).toBe('N%C3%B8rrebro%20%C3%A6ble.jpg');
    expect(opts.httpMetadata.contentType).toBe('image/jpeg');
    const insert = calls.find((c) => c.sql.includes('INSERT INTO uploads'));
    expect(insert?.params).toEqual([SHA, 1, 'Nørrebro æble.jpg', `raw/${SHA}.jpg`]);
  });

  it('falls back to <sha>.<ext> when the filename is undecodable', async () => {
    const { env, calls } = makeEnv();
    const res = await handleUploadPut(putReq(JPEG, { 'x-original-filename': '%E0%A4%A' }), env, SHA);
    expect(res.status).toBe(201);
    expect(calls.find((c) => c.sql.includes('INSERT'))?.params[2]).toBe(`${SHA}.jpg`);
  });

  it('duplicate: 200 and no put', async () => {
    const { env, put } = makeEnv([{ content_hash: SHA }]);
    const res = await handleUploadPut(putReq(JPEG), env, SHA);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'duplicate' });
    expect(put).not.toHaveBeenCalled();
  });

  it('rejects a PNG declared as JPEG: verified after put, object deleted, no ledger row', async () => {
    const { env, calls, objects, del } = makeEnv();
    const res = await handleUploadPut(putReq(PNG), env, SHA);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ status: 'rejected', reason: 'Not a JPEG or TIFF file.' });
    expect(del).toHaveBeenCalledWith(`raw/${SHA}.jpg`);
    expect(objects.size).toBe(0);
    expect(calls.some((c) => c.sql.includes('INSERT'))).toBe(false);
  });

  it('rejects a JPEG declared as TIFF and deletes it', async () => {
    const { env, objects } = makeEnv();
    const res = await handleUploadPut(putReq(JPEG, { 'content-type': 'image/tiff' }), env, SHA);
    expect(res.status).toBe(400);
    expect(objects.size).toBe(0);
  });

  it('stores a TIFF under .tif', async () => {
    const { env, objects } = makeEnv();
    const res = await handleUploadPut(putReq(TIFF, { 'content-type': 'image/tiff' }), env, SHA);
    expect(res.status).toBe(201);
    expect([...objects.keys()]).toEqual([`raw/${SHA}.tif`]);
  });

  it('rejects a missing or unsupported Content-Type without a put', async () => {
    for (const ct of ['', 'image/png', 'application/octet-stream']) {
      const { env, put } = makeEnv();
      const res = await handleUploadPut(putReq(JPEG, { 'content-type': ct }), env, SHA);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ status: 'rejected', reason: 'Not a JPEG or TIFF file.' });
      expect(put).not.toHaveBeenCalled();
    }
  });

  it('accepts a Content-Type with parameters', async () => {
    const { env } = makeEnv();
    const res = await handleUploadPut(putReq(JPEG, { 'content-type': 'Image/JPEG; charset=binary' }), env, SHA);
    expect(res.status).toBe(201);
  });

  it('500, object deleted and no ledger row when the verify read throws', async () => {
    const { env, get, objects, calls } = makeEnv();
    get.mockRejectedValue(new Error('r2 down'));
    const res = await handleUploadPut(putReq(JPEG), env, SHA);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Upload failed' });
    expect(objects.size).toBe(0);
    expect(calls.some((c) => c.sql.includes('INSERT'))).toBe(false);
  });

  it('413 on oversized Content-Length without reading body', async () => {
    const { env, put } = makeEnv();
    const req = putReq(JPEG, { 'content-length': '52428801' });
    const spy = jest.spyOn(req, 'arrayBuffer');
    const res = await handleUploadPut(req, env, SHA);
    expect(res.status).toBe(413);
    expect(spy).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });

  it('401 for a disabled uploader, no put', async () => {
    mockCurrent.mockResolvedValue(null);
    const { env, put } = makeEnv();
    const res = await handleUploadPut(putReq(JPEG), env, SHA);
    expect(res.status).toBe(401);
    expect(put).not.toHaveBeenCalled();
  });

  it('403 without origin; 400 bad-hash', async () => {
    const { env } = makeEnv();
    const noOrigin = new Request(`${ORIGIN}/api/uploads/${SHA}`, { method: 'PUT', body: JPEG });
    expect((await handleUploadPut(noOrigin, env, SHA)).status).toBe(403);
    const res = await handleUploadPut(putReq(JPEG), env, 'XYZ');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ status: 'rejected', reason: 'bad-hash' });
  });

  it('500 and no ledger row when put throws', async () => {
    const { env, calls, put } = makeEnv();
    put.mockRejectedValue(new Error('boom'));
    const res = await handleUploadPut(putReq(JPEG), env, SHA);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Upload failed' });
    expect(calls.some((c) => c.sql.includes('INSERT'))).toBe(false);
  });

  it('no response body contains @', async () => {
    const { env } = makeEnv();
    const responses = [
      await handleUploadPut(putReq(PNG), env, SHA),
      await handleUploadPut(putReq(JPEG), env, 'bad'),
      await handleUploadCheck(checkReq({ hashes: ['x'] }), env),
    ];
    for (const r of responses) expect(await r.text()).not.toContain('@');
  });

  it('hands put request.body itself (no JS stream wrapper) and never buffers it', async () => {
    // Regression: wrapping the body in a JS ReadableStream cost ~10 ms CPU per photo and the free plan
    // killed uploads with exceededCpu. R2 must receive the native request stream.
    const { env, put, objects } = makeEnv();
    const req = putReq(JPEG);
    const body = req.body;
    const spy = jest.spyOn(req, 'arrayBuffer');
    const res = await handleUploadPut(req, env, SHA);
    expect(res.status).toBe(201);
    expect(spy).not.toHaveBeenCalled();
    expect(put.mock.calls[0][1]).toBe(body);
    expect([...objects.get(`raw/${SHA}.jpg`)!]).toEqual([...JPEG]);
  });

  it('verifies with a 4-byte ranged read', async () => {
    const { env, get } = makeEnv();
    await handleUploadPut(putReq(JPEG), env, SHA);
    expect(get).toHaveBeenCalledWith(`raw/${SHA}.jpg`, { range: { offset: 0, length: 4 } });
  });

  it('rejects a body shorter than the magic bytes without a put', async () => {
    const { env, put } = makeEnv();
    const res = await handleUploadPut(putReq(new Uint8Array([0xff, 0xd8])), env, SHA);
    expect(res.status).toBe(400);
    expect(put).not.toHaveBeenCalled();
  });

  it('rejects a missing body as wrong type', async () => {
    const { env, put } = makeEnv();
    const req = new Request(`${ORIGIN}/api/uploads/${SHA}`, {
      method: 'PUT',
      headers: { origin: ORIGIN, 'content-length': '0', 'content-type': 'image/jpeg' },
    });
    const res = await handleUploadPut(req, env, SHA);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ status: 'rejected', reason: 'Not a JPEG or TIFF file.' });
    expect(put).not.toHaveBeenCalled();
  });

  it('500 JSON when the ledger insert throws', async () => {
    const { env, put } = failingLedgerEnv();
    const res = await handleUploadPut(putReq(JPEG), env, SHA);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Upload failed' });
    expect(put).toHaveBeenCalledTimes(1);
  });

  it('falls back to <sha>.<ext> for a filename header over 1024 chars', async () => {
    const { env, calls, put } = makeEnv();
    const res = await handleUploadPut(putReq(JPEG, { 'x-original-filename': 'a'.repeat(1025) }), env, SHA);
    expect(res.status).toBe(201);
    const opts = put.mock.calls[0][2] as { customMetadata: Record<string, string> };
    expect(opts.customMetadata['original-name']).toBe(`${SHA}.jpg`);
    expect(calls.find((c) => c.sql.includes('INSERT'))?.params[2]).toBe(`${SHA}.jpg`);
  });

  it('keeps a filename header of exactly 1024 chars', async () => {
    const { env, calls, put } = makeEnv();
    const name = 'a'.repeat(1024);
    await handleUploadPut(putReq(JPEG, { 'x-original-filename': name }), env, SHA);
    const opts = put.mock.calls[0][2] as { customMetadata: Record<string, string> };
    expect(opts.customMetadata['original-name']).toBe(name);
    expect(calls.find((c) => c.sql.includes('INSERT'))?.params[2]).toBe(name);
  });

  it('falls back to <sha>.<ext> for an empty or missing filename header', async () => {
    for (const headers of [{ 'x-original-filename': '' }, {}]) {
      const { env, calls, put } = makeEnv();
      await handleUploadPut(putReq(JPEG, headers), env, SHA);
      const opts = put.mock.calls[0][2] as { customMetadata: Record<string, string> };
      expect(opts.customMetadata['original-name']).toBe(`${SHA}.jpg`);
      expect(calls.find((c) => c.sql.includes('INSERT'))?.params[2]).toBe(`${SHA}.jpg`);
    }
  });
});

describe('router: /api/uploads/:sha256 path decoding', () => {
  it('a malformed % escape answers 400 bad-hash, not 500', async () => {
    const { env, put } = makeEnv();
    const req = new Request(`${ORIGIN}/api/uploads/%E0%A4%A`, {
      method: 'PUT',
      body: JPEG,
      headers: { origin: ORIGIN, 'content-length': String(JPEG.length) },
    });
    const res = await handleApiRequest(req, env);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ status: 'rejected', reason: 'bad-hash' });
    expect(put).not.toHaveBeenCalled();
  });

  it('a malformed % escape still runs the origin and session checks first', async () => {
    const { env } = makeEnv();
    const noOrigin = new Request(`${ORIGIN}/api/uploads/%zz`, { method: 'PUT', body: JPEG });
    expect((await handleApiRequest(noOrigin, env)).status).toBe(403);
    mockCurrent.mockResolvedValue(null);
    const req = new Request(`${ORIGIN}/api/uploads/%zz`, {
      method: 'PUT',
      body: JPEG,
      headers: { origin: ORIGIN },
    });
    expect((await handleApiRequest(req, env)).status).toBe(401);
  });
});

describe('upload and /api/me responses never contain an email-shaped string', () => {
  const EMAIL_RE = /[^\s"@]+@[^\s"@]+\.[a-z]+/i;
  const LEAKY = { content_hash: SHA, email: 'leak@example.com' };
  const routerEnv = (rows: Array<Record<string, unknown>>) => {
    const { env } = makeEnv(rows);
    return Object.assign(env as object, { IMAGES_BASE_URL: 'https://img.test', ASSETS: {} }) as never;
  };
  const me = () => handleApiRequest(new Request(`${ORIGIN}/api/me`), routerEnv([]));
  const check = (rows: Array<Record<string, unknown>>) =>
    handleApiRequest(checkReq({ hashes: [SHA] }), routerEnv(rows));
  const put = (body: Uint8Array, rows: Array<Record<string, unknown>>) =>
    handleApiRequest(putReq(body), routerEnv(rows));

  beforeEach(() => {
    mockCurrent.mockResolvedValue({ id: 1, displayName: 'MH', email: 'leak@example.com' });
  });

  const signedIn: Array<[string, () => Promise<Response>, number]> = [
    ['GET /api/me', me, 200],
    ['POST /api/uploads/check', () => check([LEAKY]), 200],
    ['PUT added', () => put(JPEG, []), 201],
    ['PUT duplicate', () => put(JPEG, [LEAKY]), 200],
    ['PUT rejected', () => put(PNG, []), 400],
    [
      'PUT forbidden',
      () =>
        handleApiRequest(
          new Request(`${ORIGIN}/api/uploads/${SHA}`, { method: 'PUT', body: JPEG }),
          routerEnv([]),
        ),
      403,
    ],
    [
      'POST check forbidden',
      () => handleApiRequest(checkReq({ hashes: [SHA] }, null), routerEnv([])),
      403,
    ],
  ];
  for (const [name, call, status] of signedIn) {
    it(`${name} -> ${status}`, async () => {
      const res = await call();
      expect(res.status).toBe(status);
      expect(await res.text()).not.toMatch(EMAIL_RE);
    });
  }

  const signedOut: Array<[string, () => Promise<Response>]> = [
    ['GET /api/me', me],
    ['POST /api/uploads/check', () => check([])],
    ['PUT', () => put(JPEG, [])],
  ];
  for (const [name, call] of signedOut) {
    it(`${name} -> 401`, async () => {
      mockCurrent.mockResolvedValue(null);
      const res = await call();
      expect(res.status).toBe(401);
      expect(await res.text()).not.toMatch(EMAIL_RE);
    });
  }
});

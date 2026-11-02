import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { fakeD1 } from './helpers/fakeD1.js';

const mockCurrent = jest.fn<(req: Request, env: unknown) => Promise<unknown>>();
jest.unstable_mockModule('../src/auth/currentUploader.js', () => ({
  currentUploader: mockCurrent,
}));

const { findKnownHashes, recordUpload } = await import('../src/services/uploads.js');
const { handleUploadCheck, handleUploadPut } = await import('../src/uploads/handlers.js');

const SHA = 'a'.repeat(64);
const ORIGIN = 'https://app.test';

function makeEnv(rows: Array<Record<string, unknown>> = []) {
  const { db, calls } = fakeD1(rows);
  const put = jest.fn<(...a: unknown[]) => Promise<unknown>>(async () => ({}));
  return { env: { DB: db, BUCKET: { put } } as never, calls, put };
}

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2]);

function putReq(body: Uint8Array, headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}/api/uploads/${SHA}`, {
    method: 'PUT',
    body,
    headers: { origin: ORIGIN, 'content-length': String(body.length), ...headers },
  });
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

  it('rejects PNG', async () => {
    const { env, put } = makeEnv();
    const res = await handleUploadPut(putReq(PNG), env, SHA);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ status: 'rejected', reason: 'Not a JPEG or TIFF file.' });
    expect(put).not.toHaveBeenCalled();
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
});

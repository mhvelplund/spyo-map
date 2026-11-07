import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { UploadClient } from '../src/services/UploadClient.js';

const SHA = 'a'.repeat(64);
const JPEG = [0xff, 0xd8, 0xff, 0xe1, 1, 2, 3];
const TIFF_LE = [0x49, 0x49, 0x2a, 0x00, 1, 2];
const TIFF_BE = [0x4d, 0x4d, 0x00, 0x2a, 1, 2];

let fetchSpy: ReturnType<typeof jest.spyOn>;

beforeEach(() => {
  fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
    status: 201,
    json: () => Promise.resolve({ status: 'added' }),
  } as unknown as Response);
});

afterEach(() => {
  fetchSpy.mockRestore();
});

function sentHeaders(): Record<string, string> {
  const init = fetchSpy.mock.calls[0][1] as RequestInit;
  return init.headers as Record<string, string>;
}

describe('UploadClient.uploadFile', () => {
  // The Worker picks the R2 key extension from Content-Type and verifies it against the stored bytes.
  it('declares image/jpeg from JPEG magic bytes, ignoring an empty file.type', async () => {
    const file = new File([new Uint8Array(JPEG)], 'PXL_1.jpg', { type: '' });
    expect(await new UploadClient().uploadFile(file, SHA)).toEqual({ status: 'added' });
    expect(sentHeaders()['Content-Type']).toBe('image/jpeg');
  });

  it.each([
    ['little-endian', TIFF_LE],
    ['big-endian', TIFF_BE],
  ])('declares image/tiff for a %s TIFF even if file.type says otherwise', async (_, bytes) => {
    const file = new File([new Uint8Array(bytes)], 'scan.jpg', { type: 'image/jpeg' });
    await new UploadClient().uploadFile(file, SHA);
    expect(sentHeaders()['Content-Type']).toBe('image/tiff');
  });

  it('still sends the encoded original filename', async () => {
    const file = new File([new Uint8Array(JPEG)], 'Nørrebro æble.jpg');
    await new UploadClient().uploadFile(file, SHA);
    expect(sentHeaders()['X-Original-Filename']).toBe(encodeURIComponent('Nørrebro æble.jpg'));
  });
});

describe('UploadClient.signInWithIdToken', () => {
  const respond = (status: number, body: unknown) =>
    fetchSpy.mockResolvedValue({ status, ok: status >= 200 && status < 300, json: () => Promise.resolve(body) } as unknown as Response);

  it('POSTs {idToken} same-origin to /auth/google/idtoken and returns the MeResponse on 200', async () => {
    respond(200, { displayName: 'Ada' });
    expect(await new UploadClient().signInWithIdToken('tok')).toEqual({ displayName: 'Ada' });
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/auth/google/idtoken');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('same-origin');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual({ idToken: 'tok' });
  });

  it("returns 'denied' on 403 Not allowed", async () => {
    respond(403, { error: 'Not allowed' });
    expect(await new UploadClient().signInWithIdToken('tok')).toBe('denied');
  });

  it('throws on 401', async () => {
    respond(401, { error: 'Invalid token' });
    await expect(new UploadClient().signInWithIdToken('tok')).rejects.toThrow();
  });

  it('throws on 403 Forbidden (cross-origin), which is not a denial', async () => {
    respond(403, { error: 'Forbidden' });
    await expect(new UploadClient().signInWithIdToken('tok')).rejects.toThrow();
  });
});

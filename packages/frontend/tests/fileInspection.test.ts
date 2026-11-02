import { jest } from '@jest/globals';

jest.unstable_mockModule('exifr', () => ({
  default: { gps: jest.fn() },
}));

const { inspectFile } = await import('../src/utils/fileInspection');

const JPEG = [0xff, 0xd8, 0xff, 0xe0];
const PNG = [0x89, 0x50, 0x4e, 0x47];
const digest = async () => new Uint8Array(32).fill(0xab).buffer as ArrayBuffer;

describe('inspectFile', () => {
  it('rejects files over 50 MB', async () => {
    const file = new File([new Uint8Array(JPEG)], 'big.jpg');
    Object.defineProperty(file, 'size', { value: 50 * 1024 * 1024 + 1 });
    const gps = jest.fn(async () => ({ latitude: 1, longitude: 2 }));
    expect(await inspectFile(file, { gps, digest })).toEqual({ ok: false, reason: 'Larger than 50 MB.' });
    expect(gps).not.toHaveBeenCalled();
  });

  it('rejects non JPEG/TIFF bytes', async () => {
    const file = new File([new Uint8Array(PNG)], 'a.jpg');
    const r = await inspectFile(file, { gps: async () => ({ latitude: 1, longitude: 2 }), digest });
    expect(r).toEqual({ ok: false, reason: 'Not a JPEG or TIFF file.' });
  });

  it('rejects files without GPS', async () => {
    const file = new File([new Uint8Array(JPEG)], 'a.jpg');
    const r = await inspectFile(file, { gps: async () => undefined, digest });
    expect(r).toEqual({
      ok: false,
      reason: 'No location data — on Android the browser may have removed it; try a computer.',
    });
  });

  it('rejects non-finite coordinates', async () => {
    const file = new File([new Uint8Array(JPEG)], 'a.jpg');
    const r = await inspectFile(file, { gps: async () => ({ latitude: NaN, longitude: 2 }), digest });
    expect(r.ok).toBe(false);
  });

  it('returns a lowercase hex sha for a JPEG with GPS', async () => {
    const file = new File([new Uint8Array(JPEG)], 'a.jpg');
    const r = await inspectFile(file, { gps: async () => ({ latitude: 55, longitude: 12 }), digest });
    expect(r).toEqual({ ok: true, sha256: 'ab'.repeat(32) });
  });
});

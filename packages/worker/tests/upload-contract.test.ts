import { describe, it, expect } from '@jest/globals';
import { detectImageType, isSha256Hex, MAX_UPLOAD_BYTES } from '@spyo-map/shared';

describe('upload contract', () => {
  it('detects image types from magic bytes', () => {
    expect(detectImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpg');
    expect(detectImageType(new Uint8Array([0x49, 0x49, 0x2a, 0x00]))).toBe('tif');
    expect(detectImageType(new Uint8Array([0x4d, 0x4d, 0x00, 0x2a]))).toBe('tif');
    expect(detectImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
    expect(detectImageType(new Uint8Array([]))).toBeNull();
  });

  it('validates sha256 hex', () => {
    expect(isSha256Hex('a'.repeat(64))).toBe(true);
    expect(isSha256Hex('A'.repeat(64))).toBe(false);
    expect(isSha256Hex('a'.repeat(63))).toBe(false);
    expect(isSha256Hex('g'.repeat(64))).toBe(false);
  });

  it('caps uploads at 50 MB', () => {
    expect(MAX_UPLOAD_BYTES).toBe(52428800);
  });
});

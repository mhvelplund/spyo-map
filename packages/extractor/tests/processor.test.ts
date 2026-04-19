// @ts-nocheck
import { jest } from '@jest/globals';

// Create mock functions
const mockExifrParse = jest.fn();
const mockToBuffer = jest.fn().mockResolvedValue(Buffer.from('mock-image'));
const mockResize = jest.fn().mockReturnThis();
const mockJpeg = jest.fn().mockReturnThis();
const mockInstance = {
  resize: mockResize,
  jpeg: mockJpeg,
  toBuffer: mockToBuffer,
};
const mockSharp = jest.fn().mockReturnValue(mockInstance);

// Mock exifr using unstable_mockModule (ESM-compatible)
jest.unstable_mockModule('exifr', () => ({
  default: {
    parse: mockExifrParse,
  },
}));

// Mock sharp using unstable_mockModule (ESM-compatible)
jest.unstable_mockModule('sharp', () => ({
  default: mockSharp,
}));

// Import the processor module after mocking
const { extractExif, processImage } = await import('../src/processor.js');

beforeEach(() => {
  jest.clearAllMocks();
  // Re-stub the mock implementations
  mockToBuffer.mockResolvedValue(Buffer.from('mock-image'));
  mockResize.mockReturnThis();
  mockJpeg.mockReturnThis();
  mockSharp.mockReturnValue(mockInstance);
});

describe('extractExif', () => {
  it('returns ExifData when GPS fields are present', async () => {
    mockExifrParse.mockResolvedValue({
      latitude: 51.5074,
      longitude: -0.1278,
      DateTimeOriginal: new Date('2024-06-15T10:30:00Z'),
      GPSLatitudeRef: 'N',
      GPSLongitudeRef: 'W',
      GPSAltitude: 12.5,
    });

    const result = await extractExif(Buffer.from('fake-jpeg'));

    expect(result).not.toBeNull();
    expect(result!.latitude).toBe(51.5074);
    expect(result!.longitude).toBe(-0.1278);
    expect(result!.latitudeRef).toBe('N');
    expect(result!.altitude).toBe(12.5);
    expect(result!.timestamp).toBe('2024-06-15T10:30:00.000Z');
  });

  it('returns null when no GPS data', async () => {
    mockExifrParse.mockResolvedValue({ Make: 'Canon' });
    const result = await extractExif(Buffer.from('no-gps'));
    expect(result).toBeNull();
  });

  it('returns null when exifr.parse returns null', async () => {
    mockExifrParse.mockResolvedValue(null);
    const result = await extractExif(Buffer.from('empty'));
    expect(result).toBeNull();
  });
});

describe('processImage', () => {
  it('returns fullSize and thumbnail buffers', async () => {
    const input = Buffer.from('input-image');
    const { fullSize, thumbnail } = await processImage(input);

    expect(fullSize).toEqual(Buffer.from('mock-image'));
    expect(thumbnail).toEqual(Buffer.from('mock-image'));
  });

  it('resizes full-size to max 2048x2048 (inside fit)', async () => {
    await processImage(Buffer.from('x'));
    expect(mockResize).toHaveBeenCalledWith(
      2048,
      2048,
      expect.objectContaining({ fit: 'inside', withoutEnlargement: true }),
    );
  });

  it('resizes thumbnail to 200x200 (cover fit)', async () => {
    await processImage(Buffer.from('x'));
    expect(mockResize).toHaveBeenCalledWith(200, 200, expect.objectContaining({ fit: 'cover' }));
  });
});

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { Config } from '../src/config.js';
import type { D1Client, ImageInsert } from '../src/d1.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockListObjects = jest.fn() as jest.Mock<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockGetObject = jest.fn() as jest.Mock<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockPutObject = jest.fn() as jest.Mock<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockDeleteObject = jest.fn() as jest.Mock<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockExtractExif = jest.fn() as jest.Mock<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockProcessImage = jest.fn() as jest.Mock<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockFetchExistingIds = jest.fn() as jest.Mock<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockUpsertImages = jest.fn() as jest.Mock<any>;

jest.unstable_mockModule('../src/storage.js', () => ({
  listObjects: mockListObjects,
  getObject: mockGetObject,
  putObject: mockPutObject,
  deleteObject: mockDeleteObject,
  createS3Client: jest.fn(),
}));

jest.unstable_mockModule('../src/processor.js', () => ({
  extractExif: mockExtractExif,
  processImage: mockProcessImage,
}));

jest.unstable_mockModule('../src/d1.js', () => ({
  fetchExistingIds: mockFetchExistingIds,
  upsertImages: mockUpsertImages,
  createD1Client: jest.fn(),
}));

const { runExtractor } = await import('../src/extractor.js');

const CONFIG: Config = {
  storageEndpoint: 'https://acct.r2.cloudflarestorage.com',
  storageBucket: 'spyo-map',
  storageAccessKey: 'key',
  storageSecretKey: 'secret',
  storageRegion: 'auto',
  localSourcePath: undefined,
  cloudflareAccountId: 'acct',
  cloudflareApiToken: 'token',
  d1DatabaseId: 'db',
};

const s3 = {} as never;
const d1 = {} as D1Client;

beforeEach(() => {
  jest.clearAllMocks();
  mockFetchExistingIds.mockResolvedValue(new Set());
  mockUpsertImages.mockResolvedValue(undefined);
  mockGetObject.mockResolvedValue(Buffer.from('jpeg'));
  mockExtractExif.mockResolvedValue({ latitude: 51.5, longitude: -0.12 });
  mockProcessImage.mockResolvedValue({
    fullSize: Buffer.from('full'),
    thumbnail: Buffer.from('thumb'),
  });
  mockPutObject.mockResolvedValue(undefined);
  mockDeleteObject.mockResolvedValue(undefined);
});

describe('runExtractor over the bucket source', () => {
  it('uploads a full-size image and a thumbnail per new photo', async () => {
    mockListObjects.mockResolvedValue([{ key: 'raw/a.jpg', etag: 'e1', size: 1 }]);
    await runExtractor(CONFIG, s3, d1);

    const keys = mockPutObject.mock.calls.map((c) => c[2]);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toMatch(/^images\/[0-9a-f]{32}\.jpg$/);
    expect(keys[1]).toMatch(/^images\/thumbnails\/[0-9a-f]{32}\.jpg$/);
  });

  it('upserts one metadata row per new photo', async () => {
    mockListObjects.mockResolvedValue([{ key: 'raw/a.jpg', etag: 'e1', size: 1 }]);
    await runExtractor(CONFIG, s3, d1);

    const rows = mockUpsertImages.mock.calls[0]![1] as ImageInsert[];
    expect(rows).toHaveLength(1);
    expect(rows[0]!.path).toBe('a.jpg');
    expect(rows[0]!.exif).toEqual({ latitude: 51.5, longitude: -0.12 });
  });

  it('skips photos whose id is already in D1', async () => {
    mockListObjects.mockResolvedValue([{ key: 'raw/a.jpg', etag: 'e1', size: 1 }]);
    // Run once to learn the generated id, then replay it as already-known.
    await runExtractor(CONFIG, s3, d1);
    const knownId = (mockUpsertImages.mock.calls[0]![1] as ImageInsert[])[0]!.id;

    jest.clearAllMocks();
    mockFetchExistingIds.mockResolvedValue(new Set([knownId]));
    mockListObjects.mockResolvedValue([{ key: 'raw/a.jpg', etag: 'e1', size: 1 }]);
    await runExtractor(CONFIG, s3, d1);

    expect(mockProcessImage).not.toHaveBeenCalled();
    expect(mockPutObject).not.toHaveBeenCalled();
  });

  it('still deletes the raw object for an already-known photo', async () => {
    mockListObjects.mockResolvedValue([{ key: 'raw/a.jpg', etag: 'e1', size: 1 }]);
    await runExtractor(CONFIG, s3, d1);
    const knownId = (mockUpsertImages.mock.calls[0]![1] as ImageInsert[])[0]!.id;

    jest.clearAllMocks();
    mockFetchExistingIds.mockResolvedValue(new Set([knownId]));
    mockListObjects.mockResolvedValue([{ key: 'raw/a.jpg', etag: 'e1', size: 1 }]);
    await runExtractor(CONFIG, s3, d1);

    expect(mockDeleteObject).toHaveBeenCalledWith(s3, 'spyo-map', 'raw/a.jpg');
  });

  it('commits metadata before deleting any raw object', async () => {
    const order: string[] = [];
    mockUpsertImages.mockImplementation(async () => {
      order.push('upsert');
    });
    mockDeleteObject.mockImplementation(async () => {
      order.push('delete');
    });
    mockListObjects.mockResolvedValue([{ key: 'raw/a.jpg', etag: 'e1', size: 1 }]);

    await runExtractor(CONFIG, s3, d1);
    expect(order).toEqual(['upsert', 'delete']);
  });

  it('ignores files without a supported extension', async () => {
    mockListObjects.mockResolvedValue([{ key: 'raw/notes.txt', etag: 'e1', size: 1 }]);
    await runExtractor(CONFIG, s3, d1);
    expect(mockProcessImage).not.toHaveBeenCalled();
    expect(mockUpsertImages).toHaveBeenCalledWith(d1, []);
  });

  it('skips a photo with no GPS data and leaves its raw object in place', async () => {
    mockListObjects.mockResolvedValue([{ key: 'raw/a.jpg', etag: 'e1', size: 1 }]);
    mockExtractExif.mockResolvedValue(null);
    await runExtractor(CONFIG, s3, d1);
    expect(mockUpsertImages).toHaveBeenCalledWith(d1, []);
    expect(mockDeleteObject).not.toHaveBeenCalled();
  });

  it('continues past a photo that fails to process', async () => {
    mockListObjects.mockResolvedValue([
      { key: 'raw/bad.jpg', etag: 'e1', size: 1 },
      { key: 'raw/good.jpg', etag: 'e2', size: 1 },
    ]);
    mockProcessImage
      .mockRejectedValueOnce(new Error('corrupt jpeg'))
      .mockResolvedValue({ fullSize: Buffer.from('f'), thumbnail: Buffer.from('t') });

    await runExtractor(CONFIG, s3, d1);

    const rows = mockUpsertImages.mock.calls[0]![1] as ImageInsert[];
    expect(rows).toHaveLength(1);
    expect(rows[0]!.path).toBe('good.jpg');
  });
});

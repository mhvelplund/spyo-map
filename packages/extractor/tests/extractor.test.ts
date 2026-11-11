import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { createHash } from 'node:crypto';
import type { Config } from '../src/config.js';
import type { D1Client, ImageInsert } from '../src/d1.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockListObjects = jest.fn() as jest.Mock<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockGetObjectWithMetadata = jest.fn() as jest.Mock<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockMoveObject = jest.fn() as jest.Mock<any>;
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
  getObjectWithMetadata: mockGetObjectWithMetadata,
  moveObject: mockMoveObject,
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
  sourcePrefix: 'raw/',
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
  mockGetObjectWithMetadata.mockResolvedValue({ body: Buffer.from('jpeg'), metadata: {} });
  mockMoveObject.mockResolvedValue(undefined);
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

  it('still archives the raw object for an already-known photo', async () => {
    mockListObjects.mockResolvedValue([{ key: 'raw/a.jpg', etag: 'e1', size: 1 }]);
    await runExtractor(CONFIG, s3, d1);
    const knownId = (mockUpsertImages.mock.calls[0]![1] as ImageInsert[])[0]!.id;

    jest.clearAllMocks();
    mockFetchExistingIds.mockResolvedValue(new Set([knownId]));
    mockListObjects.mockResolvedValue([{ key: 'raw/a.jpg', etag: 'e1', size: 1 }]);
    await runExtractor(CONFIG, s3, d1);

    expect(mockMoveObject).toHaveBeenCalledWith(s3, 'spyo-map', 'raw/a.jpg', 'originals/a.jpg');
    expect(mockDeleteObject).not.toHaveBeenCalled();
  });

  it('commits metadata before moving any raw object', async () => {
    const order: string[] = [];
    mockUpsertImages.mockImplementation(async () => {
      order.push('upsert');
    });
    mockMoveObject.mockImplementation(async () => {
      order.push('move');
    });
    mockListObjects.mockResolvedValue([{ key: 'raw/a.jpg', etag: 'e1', size: 1 }]);

    await runExtractor(CONFIG, s3, d1);
    expect(order).toEqual(['upsert', 'move']);
  });

  it('ignores files without a supported extension', async () => {
    mockListObjects.mockResolvedValue([{ key: 'raw/notes.txt', etag: 'e1', size: 1 }]);
    await runExtractor(CONFIG, s3, d1);
    expect(mockProcessImage).not.toHaveBeenCalled();
    expect(mockUpsertImages).toHaveBeenCalledWith(d1, []);
  });

  it('moves a photo with no GPS data to failed/', async () => {
    mockListObjects.mockResolvedValue([{ key: 'raw/a.jpg', etag: 'e1', size: 1 }]);
    mockExtractExif.mockResolvedValue(null);
    await runExtractor(CONFIG, s3, d1);
    expect(mockUpsertImages).toHaveBeenCalledWith(d1, []);
    expect(mockDeleteObject).not.toHaveBeenCalled();
    expect(mockMoveObject).toHaveBeenCalledWith(s3, 'spyo-map', 'raw/a.jpg', 'failed/a.jpg');
  });

  it('leaves the raw object in place when the download returns null', async () => {
    mockListObjects.mockResolvedValue([{ key: 'raw/a.jpg', etag: 'e1', size: 1 }]);
    mockGetObjectWithMetadata.mockResolvedValue(null);
    await runExtractor(CONFIG, s3, d1);
    expect(mockMoveObject).not.toHaveBeenCalled();
    expect(mockDeleteObject).not.toHaveBeenCalled();
  });

  it('tags the row with uploader, content hash and decoded original name', async () => {
    const body = Buffer.from('jpeg');
    const sha = createHash('sha256').update(body).digest('hex');
    mockListObjects.mockResolvedValue([{ key: `raw/${sha}.jpg`, etag: 'e1', size: 1 }]);
    mockGetObjectWithMetadata.mockResolvedValue({
      body,
      metadata: { 'uploader-id': '7', sha256: sha, 'original-name': 'N%C3%B8rrebro.jpg' },
    });
    await runExtractor(CONFIG, s3, d1);
    const rows = mockUpsertImages.mock.calls[0]![1] as ImageInsert[];
    expect(rows[0]).toMatchObject({ uploaderId: 7, contentHash: sha, path: 'N\u00f8rrebro.jpg' });
    expect(mockMoveObject).toHaveBeenCalledWith(
      s3,
      'spyo-map',
      `raw/${sha}.jpg`,
      `originals/${sha}.jpg`,
    );
  });

  it('defaults to uploader 1 and the key basename without metadata', async () => {
    mockListObjects.mockResolvedValue([{ key: 'raw/a.jpg', etag: 'e1', size: 1 }]);
    await runExtractor(CONFIG, s3, d1);
    const rows = mockUpsertImages.mock.calls[0]![1] as ImageInsert[];
    expect(rows[0]).toMatchObject({ uploaderId: 1, path: 'a.jpg' });
    expect(rows[0]!.contentHash).toBe(createHash('sha256').update('jpeg').digest('hex'));
  });

  it('falls back to the basename when original-name is malformed', async () => {
    mockListObjects.mockResolvedValue([{ key: 'raw/a.jpg', etag: 'e1', size: 1 }]);
    mockGetObjectWithMetadata.mockResolvedValue({
      body: Buffer.from('jpeg'),
      metadata: { 'original-name': '%E0%A4%A' },
    });
    await runExtractor(CONFIG, s3, d1);
    const rows = mockUpsertImages.mock.calls[0]![1] as ImageInsert[];
    expect(rows[0]!.path).toBe('a.jpg');
  });

  it('moves a sha256 mismatch to failed/ with no row and no delete', async () => {
    mockListObjects.mockResolvedValue([{ key: 'raw/x.jpg', etag: 'e1', size: 1 }]);
    mockGetObjectWithMetadata.mockResolvedValue({
      body: Buffer.from('jpeg'),
      metadata: { sha256: 'deadbeef' },
    });
    await runExtractor(CONFIG, s3, d1);
    expect(mockUpsertImages).toHaveBeenCalledWith(d1, []);
    expect(mockDeleteObject).not.toHaveBeenCalled();
    expect(mockMoveObject).toHaveBeenCalledWith(s3, 'spyo-map', 'raw/x.jpg', 'failed/x.jpg');
  });

  it('leaves the object in raw/ when putObject rejects', async () => {
    mockListObjects.mockResolvedValue([{ key: 'raw/a.jpg', etag: 'e1', size: 1 }]);
    mockPutObject.mockRejectedValue(new Error('R2 503'));
    await runExtractor(CONFIG, s3, d1);
    expect(mockMoveObject).not.toHaveBeenCalled();
    expect(mockDeleteObject).not.toHaveBeenCalled();
    expect(mockUpsertImages).toHaveBeenCalledWith(d1, []);
  });

  it('leaves the object in raw/ when the download rejects', async () => {
    mockListObjects.mockResolvedValue([{ key: 'raw/a.jpg', etag: 'e1', size: 1 }]);
    mockGetObjectWithMetadata.mockRejectedValue(new Error('network'));
    await runExtractor(CONFIG, s3, d1);
    expect(mockMoveObject).not.toHaveBeenCalled();
    expect(mockDeleteObject).not.toHaveBeenCalled();
  });

  it.each(['7abc', '0', '-3'])('falls back to uploader 1 for uploader-id %s', async (bad) => {
    mockListObjects.mockResolvedValue([{ key: 'raw/a.jpg', etag: 'e1', size: 1 }]);
    mockGetObjectWithMetadata.mockResolvedValue({
      body: Buffer.from('jpeg'),
      metadata: { 'uploader-id': bad },
    });
    await runExtractor(CONFIG, s3, d1);
    const rows = mockUpsertImages.mock.calls[0]![1] as ImageInsert[];
    expect(rows[0]!.uploaderId).toBe(1);
  });

  it('accepts an upper-case declared sha256', async () => {
    const sha = createHash('sha256').update('jpeg').digest('hex').toUpperCase();
    mockListObjects.mockResolvedValue([{ key: 'raw/a.jpg', etag: 'e1', size: 1 }]);
    mockGetObjectWithMetadata.mockResolvedValue({ body: Buffer.from('jpeg'), metadata: { sha256: sha } });
    await runExtractor(CONFIG, s3, d1);
    expect(mockMoveObject).not.toHaveBeenCalledWith(s3, 'spyo-map', 'raw/a.jpg', 'failed/a.jpg');
    expect((mockUpsertImages.mock.calls[0]![1] as ImageInsert[])).toHaveLength(1);
  });

  it('moves a photo that errors during processing to failed/', async () => {
    mockListObjects.mockResolvedValue([{ key: 'raw/a.jpg', etag: 'e1', size: 1 }]);
    mockProcessImage.mockRejectedValue(new Error('corrupt'));
    await runExtractor(CONFIG, s3, d1);
    expect(mockMoveObject).toHaveBeenCalledWith(s3, 'spyo-map', 'raw/a.jpg', 'failed/a.jpg');
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

describe('keeping originals', () => {
  it('moves a processed photo to originals/ unchanged instead of deleting it', async () => {
    mockListObjects.mockResolvedValue([{ key: 'raw/a.jpg', etag: 'e1', size: 1 }]);
    await runExtractor(CONFIG, s3, d1);
    expect(mockMoveObject).toHaveBeenCalledWith(s3, 'spyo-map', 'raw/a.jpg', 'originals/a.jpg');
    expect(mockDeleteObject).not.toHaveBeenCalled();
  });

  it('keeps going when moving to originals/ fails', async () => {
    mockListObjects.mockResolvedValue([
      { key: 'raw/a.jpg', etag: 'e1', size: 1 },
      { key: 'raw/b.jpg', etag: 'e2', size: 1 },
    ]);
    mockMoveObject.mockRejectedValueOnce(new Error('R2 503'));
    await expect(runExtractor(CONFIG, s3, d1)).resolves.toBeUndefined();
    expect(mockMoveObject).toHaveBeenCalledWith(s3, 'spyo-map', 'raw/b.jpg', 'originals/b.jpg');
  });
});

describe('runExtractor re-ingesting from originals/', () => {
  const REINGEST: Config = { ...CONFIG, sourcePrefix: 'originals/' };

  it('lists originals/ instead of raw/', async () => {
    mockListObjects.mockResolvedValue([]);
    await runExtractor(REINGEST, s3, d1);
    expect(mockListObjects).toHaveBeenCalledWith(s3, 'spyo-map', 'originals/');
  });

  it('gives an original the same id it got when first ingested from raw/', async () => {
    mockListObjects.mockResolvedValue([{ key: 'raw/a.jpg', etag: 'e1', size: 1 }]);
    await runExtractor(CONFIG, s3, d1);
    const firstId = (mockUpsertImages.mock.calls[0]![1] as ImageInsert[])[0]!.id;

    jest.clearAllMocks();
    mockListObjects.mockResolvedValue([{ key: 'originals/a.jpg', etag: 'e1', size: 1 }]);
    await runExtractor(REINGEST, s3, d1);
    const reId = (mockUpsertImages.mock.calls[0]![1] as ImageInsert[])[0]!.id;

    expect(reId).toBe(firstId);
  });

  it('never moves or deletes originals, even on failure', async () => {
    mockListObjects.mockResolvedValue([
      { key: 'originals/good.jpg', etag: 'e1', size: 1 },
      { key: 'originals/nogps.jpg', etag: 'e2', size: 1 },
    ]);
    mockExtractExif
      .mockResolvedValueOnce({ latitude: 51.5, longitude: -0.12 })
      .mockResolvedValueOnce(null);
    await runExtractor(REINGEST, s3, d1);
    expect(mockUpsertImages.mock.calls[0]![1] as ImageInsert[]).toHaveLength(1);
    expect(mockMoveObject).not.toHaveBeenCalled();
    expect(mockDeleteObject).not.toHaveBeenCalled();
  });

  it('skips originals that are already in D1 without touching them', async () => {
    mockListObjects.mockResolvedValue([{ key: 'originals/a.jpg', etag: 'e1', size: 1 }]);
    await runExtractor(REINGEST, s3, d1);
    const id = (mockUpsertImages.mock.calls[0]![1] as ImageInsert[])[0]!.id;

    jest.clearAllMocks();
    mockFetchExistingIds.mockResolvedValue(new Set([id]));
    mockListObjects.mockResolvedValue([{ key: 'originals/a.jpg', etag: 'e1', size: 1 }]);
    await runExtractor(REINGEST, s3, d1);
    expect(mockProcessImage).not.toHaveBeenCalled();
    expect(mockMoveObject).not.toHaveBeenCalled();
  });
});

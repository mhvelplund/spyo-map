import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { ImageRecord } from '@spyo-map/shared';

const mockQueryAll = jest.fn();
const mockQueryById = jest.fn();
const mockQueryNearby = jest.fn();

jest.unstable_mockModule('../src/services/database.js', () => ({
  queryAllImages: mockQueryAll,
  queryImageById: mockQueryById,
  queryNearbyImages: mockQueryNearby,
  rowToRecord: jest.fn(),
}));

const { handleApiRequest } = await import('../src/router.js');

const FIXTURE: ImageRecord = {
  id: 'abc',
  imageUrl: 'https://img.test/images/abc.jpg',
  thumbnailUrl: 'https://img.test/images/thumbnails/abc.jpg',
  latitude: 51.5,
  longitude: -0.12,
  timestamp: '2024-01-01T00:00:00.000Z',
};

const DB = { marker: 'db' };
const env = { DB, ASSETS: {}, IMAGES_BASE_URL: 'https://img.test' } as never;

function get(path: string): Request {
  return new Request(`https://app.test${path}`);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/health', () => {
  it('returns { status: "ok" }', async () => {
    const res = await handleApiRequest(get('/api/health'), env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('responds as JSON', async () => {
    const res = await handleApiRequest(get('/api/health'), env);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
  });
});

describe('GET /api/images', () => {
  it('returns the full list', async () => {
    mockQueryAll.mockResolvedValue([FIXTURE]);
    const res = await handleApiRequest(get('/api/images'), env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([FIXTURE]);
  });

  it('passes the D1 binding and images base URL through', async () => {
    mockQueryAll.mockResolvedValue([]);
    await handleApiRequest(get('/api/images'), env);
    expect(mockQueryAll).toHaveBeenCalledWith(DB, 'https://img.test');
  });
});

describe('GET /api/images/:id', () => {
  it('returns 200 with the record when found', async () => {
    mockQueryById.mockResolvedValue(FIXTURE);
    const res = await handleApiRequest(get('/api/images/abc'), env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(FIXTURE);
  });

  it('returns 404 when not found', async () => {
    mockQueryById.mockResolvedValue(null);
    const res = await handleApiRequest(get('/api/images/nope'), env);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Not found' });
  });

  it('decodes a percent-encoded id', async () => {
    mockQueryById.mockResolvedValue(FIXTURE);
    await handleApiRequest(get('/api/images/a%2Fb'), env);
    expect(mockQueryById).toHaveBeenCalledWith(DB, 'a/b', 'https://img.test');
  });
});

describe('GET /api/images/:id/nearby', () => {
  it('defaults the radius to 1 km', async () => {
    mockQueryById.mockResolvedValue(FIXTURE);
    mockQueryNearby.mockResolvedValue([FIXTURE]);
    const res = await handleApiRequest(get('/api/images/abc/nearby'), env);
    expect(res.status).toBe(200);
    expect(mockQueryNearby).toHaveBeenCalledWith(DB, 'abc', 51.5, -0.12, 1, 'https://img.test');
  });

  it('respects an explicit radius', async () => {
    mockQueryById.mockResolvedValue(FIXTURE);
    mockQueryNearby.mockResolvedValue([]);
    await handleApiRequest(get('/api/images/abc/nearby?radius=5'), env);
    expect(mockQueryNearby).toHaveBeenCalledWith(DB, 'abc', 51.5, -0.12, 5, 'https://img.test');
  });

  it('returns 404 when the origin image is unknown', async () => {
    mockQueryById.mockResolvedValue(null);
    const res = await handleApiRequest(get('/api/images/nope/nearby'), env);
    expect(res.status).toBe(404);
    expect(mockQueryNearby).not.toHaveBeenCalled();
  });

  it('returns 400 for a non-numeric radius', async () => {
    mockQueryById.mockResolvedValue(FIXTURE);
    const res = await handleApiRequest(get('/api/images/abc/nearby?radius=invalid'), env);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid radius' });
    expect(mockQueryNearby).not.toHaveBeenCalled();
  });

  it('returns 400 for a negative radius', async () => {
    mockQueryById.mockResolvedValue(FIXTURE);
    const res = await handleApiRequest(get('/api/images/abc/nearby?radius=-10'), env);
    expect(res.status).toBe(400);
    expect(mockQueryNearby).not.toHaveBeenCalled();
  });
});

describe('unknown API routes', () => {
  it('returns 404 for an unmatched /api path', async () => {
    const res = await handleApiRequest(get('/api/nonsense'), env);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Not found' });
  });

  it('returns 405 for a non-GET method', async () => {
    const res = await handleApiRequest(
      new Request('https://app.test/api/images', { method: 'POST' }),
      env,
    );
    expect(res.status).toBe(405);
  });
});

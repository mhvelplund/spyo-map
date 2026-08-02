import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import type { ImageRecord } from '@spyo-map/shared';

// Create mock functions
const mockGetAll = jest.fn();
const mockGetById = jest.fn();
const mockGetNearby = jest.fn();
const mockReload = jest.fn();

// Mock the database service module using unstable_mockModule (ESM-compatible)
jest.unstable_mockModule('../src/services/database.js', () => ({
  getAllImages: mockGetAll,
  getImageById: mockGetById,
  getNearbyImages: mockGetNearby,
  reloadDatabase: mockReload,
}));

// Import the routes module after mocking
const { imageRoutes } = await import('../src/routes/images.js');

const FIXTURE: ImageRecord = {
  id: 'abc',
  imageUrl: 'http://test/images/abc.jpg',
  thumbnailUrl: 'http://test/images/thumbnails/abc.jpg',
  latitude: 51.5,
  longitude: -0.12,
  timestamp: '2024-01-01T00:00:00.000Z',
};

let app: FastifyInstance;

beforeEach(async () => {
  app = Fastify({ logger: false });
  await app.register(imageRoutes);
  jest.clearAllMocks();
});

afterEach(async () => {
  await app.close();
});

describe('GET /api/health', () => {
  it('returns { status: "ok" }', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });
});

describe('GET /api/images', () => {
  it('returns array from database service', async () => {
    mockGetAll.mockReturnValue([FIXTURE]);
    const response = await app.inject({ method: 'GET', url: '/api/images' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([FIXTURE]);
  });
});

describe('GET /api/images/:id', () => {
  it('returns 200 with record when found', async () => {
    mockGetById.mockReturnValue(FIXTURE);
    const response = await app.inject({ method: 'GET', url: '/api/images/abc' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(FIXTURE);
  });

  it('returns 404 when not found', async () => {
    mockGetById.mockReturnValue(null);
    const response = await app.inject({ method: 'GET', url: '/api/images/nope' });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'Not found' });
  });
});

describe('GET /api/images/:id/nearby', () => {
  it('returns nearby images for known id', async () => {
    mockGetById.mockReturnValue(FIXTURE);
    mockGetNearby.mockReturnValue([FIXTURE]);
    const response = await app.inject({ method: 'GET', url: '/api/images/abc/nearby' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([FIXTURE]);
  });

  it('respects custom radius query param', async () => {
    mockGetById.mockReturnValue(FIXTURE);
    mockGetNearby.mockReturnValue([]);
    await app.inject({ method: 'GET', url: '/api/images/abc/nearby?radius=5' });
    expect(mockGetNearby).toHaveBeenCalledWith('abc', 51.5, -0.12, 5);
  });

  it('returns 404 when image not found', async () => {
    mockGetById.mockReturnValue(null);
    const response = await app.inject({ method: 'GET', url: '/api/images/nope/nearby' });
    expect(response.statusCode).toBe(404);
  });

  it('returns 400 for invalid string radius', async () => {
    mockGetById.mockReturnValue(FIXTURE);
    const response = await app.inject({ method: 'GET', url: '/api/images/abc/nearby?radius=invalid' });
    expect(response.statusCode).toBe(400);
    expect(mockGetNearby).not.toHaveBeenCalled();
  });

  it('returns 400 for negative radius', async () => {
    mockGetById.mockReturnValue(FIXTURE);
    const response = await app.inject({ method: 'GET', url: '/api/images/abc/nearby?radius=-10' });
    expect(response.statusCode).toBe(400);
    expect(mockGetNearby).not.toHaveBeenCalled();
  });
});

describe('POST /api/reload', () => {
  it('calls reloadDatabase and returns { status: "ok" }', async () => {
    mockReload.mockResolvedValue(undefined);
    const response = await app.inject({ method: 'POST', url: '/api/reload' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
    expect(mockReload).toHaveBeenCalledTimes(1);
  });
});

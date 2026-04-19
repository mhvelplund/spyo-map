import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type { ImageRecord } from '@spyro-map/shared';
import { ApiClient } from '../src/services/ApiClient.js';

const FIXTURE: ImageRecord = {
  id: 'img1',
  imageUrl: 'http://test/images/img1.jpg',
  thumbnailUrl: 'http://test/images/thumbnails/img1.jpg',
  latitude: 51.5,
  longitude: -0.12,
  timestamp: '2024-01-01T00:00:00.000Z',
};

function makeResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

let fetchSpy: ReturnType<typeof jest.spyOn>;
let client: ApiClient;

beforeEach(() => {
  fetchSpy = jest.spyOn(global, 'fetch');
  client = new ApiClient();
});

afterEach(() => {
  fetchSpy.mockRestore();
});

describe('getAllImages', () => {
  it('calls GET /api/images and returns parsed array', async () => {
    fetchSpy.mockResolvedValue(makeResponse([FIXTURE]));
    const result = await client.getAllImages();
    expect(fetchSpy).toHaveBeenCalledWith('/api/images');
    expect(result).toEqual([FIXTURE]);
  });

  it('throws on HTTP error', async () => {
    fetchSpy.mockResolvedValue(makeResponse({}, 500));
    await expect(client.getAllImages()).rejects.toThrow('Failed to fetch images: Error');
  });

  it('throws on network failure', async () => {
    fetchSpy.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(client.getAllImages()).rejects.toThrow('Failed to fetch');
  });
});

describe('getImageById', () => {
  it('calls GET /api/images/:id and returns record on 200', async () => {
    fetchSpy.mockResolvedValue(makeResponse(FIXTURE));
    const result = await client.getImageById('img1');
    expect(fetchSpy).toHaveBeenCalledWith('/api/images/img1');
    expect(result).toEqual(FIXTURE);
  });

  it('returns null on 404', async () => {
    fetchSpy.mockResolvedValue(makeResponse({}, 404));
    const result = await client.getImageById('missing');
    expect(result).toBeNull();
  });

  it('throws on HTTP 500', async () => {
    fetchSpy.mockResolvedValue(makeResponse({}, 500));
    await expect(client.getImageById('img1')).rejects.toThrow('Failed to fetch image: Error');
  });

  it('throws on network failure', async () => {
    fetchSpy.mockRejectedValue(new TypeError('Network error'));
    await expect(client.getImageById('img1')).rejects.toThrow('Network error');
  });
});

describe('getNearbyImages', () => {
  it('calls GET /api/images/:id/nearby with default radius 1', async () => {
    fetchSpy.mockResolvedValue(makeResponse([FIXTURE]));
    const result = await client.getNearbyImages('img1');
    expect(fetchSpy).toHaveBeenCalledWith('/api/images/img1/nearby?radius=1');
    expect(result).toEqual([FIXTURE]);
  });

  it('uses custom radius when provided', async () => {
    fetchSpy.mockResolvedValue(makeResponse([]));
    await client.getNearbyImages('img1', 5);
    expect(fetchSpy).toHaveBeenCalledWith('/api/images/img1/nearby?radius=5');
  });

  it('throws on HTTP error', async () => {
    fetchSpy.mockResolvedValue(makeResponse({}, 500));
    await expect(client.getNearbyImages('img1')).rejects.toThrow('Failed to fetch nearby images: Error');
  });

  it('throws on network failure', async () => {
    fetchSpy.mockRejectedValue(new TypeError('Connection refused'));
    await expect(client.getNearbyImages('img1')).rejects.toThrow('Connection refused');
  });
});

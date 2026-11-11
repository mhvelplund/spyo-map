import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type { ImageRecord } from '@spyo-map/shared';
import { ApiClient } from '../src/services/ApiClient.js';

const FIXTURE: ImageRecord = {
  id: 'img1',
  imageUrl: 'http://test/images/img1.jpg',
  thumbnailUrl: 'http://test/images/thumbnails/img1.jpg',
  uploaderName: 'MH',
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

describe('setImageLocation', () => {
  it('PUTs the encoded URL with JSON body and same-origin credentials', async () => {
    fetchSpy.mockResolvedValue(makeResponse([FIXTURE]));
    const result = await client.setImageLocation('a/b', 1.5, 2.5);
    expect(fetchSpy).toHaveBeenCalledWith('/api/images/a%2Fb/location', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ latitude: 1.5, longitude: 2.5 }),
      credentials: 'same-origin',
    });
    expect(result).toEqual([FIXTURE]);
  });

  it('rejects on 403', async () => {
    fetchSpy.mockResolvedValue(makeResponse({ error: 'Forbidden' }, 403));
    await expect(client.setImageLocation('img1', 1, 2)).rejects.toThrow();
  });
});

describe('setHidden', () => {
  it('POSTs /hide with same-origin credentials and returns the records', async () => {
    const hidden = { ...FIXTURE, hidden: true, imageUrl: 'http://test/private/x.jpg' };
    fetchSpy.mockResolvedValue(makeResponse([hidden]));
    const result = await client.setHidden('a/b', true);
    expect(fetchSpy).toHaveBeenCalledWith('/api/images/a%2Fb/hide', {
      method: 'POST',
      credentials: 'same-origin',
    });
    expect(result).toEqual([hidden]);
  });

  it('POSTs /unhide when hidden is false', async () => {
    fetchSpy.mockResolvedValue(makeResponse([FIXTURE]));
    const result = await client.setHidden('img1', false);
    expect(fetchSpy).toHaveBeenCalledWith('/api/images/img1/unhide', {
      method: 'POST',
      credentials: 'same-origin',
    });
    expect(result).toEqual([FIXTURE]);
  });

  it('rejects on 500', async () => {
    fetchSpy.mockResolvedValue(makeResponse({ error: 'boom' }, 500));
    await expect(client.setHidden('img1', true)).rejects.toThrow();
  });
});

describe('groupImages', () => {
  it('POSTs /group with the target id and returns the records', async () => {
    const grouped = { ...FIXTURE, groupId: 'g', groupedAt: '2024-01-01T00:00:00.000Z' };
    fetchSpy.mockResolvedValue(makeResponse([grouped]));
    const result = await client.groupImages('a/b', 'b');
    expect(fetchSpy).toHaveBeenCalledWith('/api/images/a%2Fb/group', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"targetId":"b"}',
      credentials: 'same-origin',
    });
    expect(result).toEqual([grouped]);
  });

  it('rejects on 409', async () => {
    fetchSpy.mockResolvedValue(makeResponse({ error: 'conflict' }, 409));
    await expect(client.groupImages('a', 'b')).rejects.toThrow();
  });
});

describe('ungroupImage', () => {
  it('POSTs /ungroup with same-origin credentials and returns the records', async () => {
    fetchSpy.mockResolvedValue(makeResponse([FIXTURE]));
    const result = await client.ungroupImage('img1');
    expect(fetchSpy).toHaveBeenCalledWith('/api/images/img1/ungroup', {
      method: 'POST',
      credentials: 'same-origin',
    });
    expect(result).toEqual([FIXTURE]);
  });

  it('rejects on 409', async () => {
    fetchSpy.mockResolvedValue(makeResponse({ error: 'conflict' }, 409));
    await expect(client.ungroupImage('img1')).rejects.toThrow();
  });
});

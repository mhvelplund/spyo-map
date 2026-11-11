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
  findContentHash: jest.fn(),
  setImageLocation: jest.fn(),
  queryImagesByContentHash: jest.fn(),
  setHidden: jest.fn(),
  findOverride: jest.fn(),
}));

const mockFindUploaderById = jest.fn<(db: unknown, id: number) => Promise<unknown>>();

jest.unstable_mockModule('../src/services/uploaders.js', () => ({
  findActiveUploaderById: mockFindUploaderById,
  findActiveUploaderByEmail: jest.fn(),
}));

const { handleApiRequest } = await import('../src/router.js');
const { signSession } = await import('../src/auth/session.js');

const FIXTURE: ImageRecord = {
  id: 'abc',
  imageUrl: 'https://img.test/images/abc.jpg',
  thumbnailUrl: 'https://img.test/images/thumbnails/abc.jpg',
  uploaderName: 'MH',
  latitude: 51.5,
  longitude: -0.12,
  timestamp: '2024-01-01T00:00:00.000Z',
};

const DB = { marker: 'db' };
const SECRET = 'test-session-secret-0123456789abcdef';
const env = {
  DB,
  ASSETS: {},
  IMAGES_BASE_URL: 'https://img.test',
  SESSION_SECRET: SECRET,
} as never;

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
    expect(mockQueryAll).toHaveBeenCalledWith(DB, 'https://img.test', { isAdmin: false });
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
    expect(mockQueryById).toHaveBeenCalledWith(DB, 'a/b', 'https://img.test', { isAdmin: false });
  });
});

describe('GET /api/images/:id/nearby', () => {
  it('defaults the radius to 1 km', async () => {
    mockQueryById.mockResolvedValue(FIXTURE);
    mockQueryNearby.mockResolvedValue([FIXTURE]);
    const res = await handleApiRequest(get('/api/images/abc/nearby'), env);
    expect(res.status).toBe(200);
    expect(mockQueryNearby).toHaveBeenCalledWith(DB, 'abc', 51.5, -0.12, 1, 'https://img.test', { isAdmin: false });
  });

  it('respects an explicit radius', async () => {
    mockQueryById.mockResolvedValue(FIXTURE);
    mockQueryNearby.mockResolvedValue([]);
    await handleApiRequest(get('/api/images/abc/nearby?radius=5'), env);
    expect(mockQueryNearby).toHaveBeenCalledWith(DB, 'abc', 51.5, -0.12, 5, 'https://img.test', { isAdmin: false });
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

describe('GET /api/me', () => {
  const nowSec = () => Math.floor(Date.now() / 1000);

  function me(cookie?: string): Request {
    return new Request('https://app.test/api/me', cookie ? { headers: { cookie } } : {});
  }

  it('returns 401 without a cookie', async () => {
    const res = await handleApiRequest(me(), env);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Not signed in' });
    expect(mockFindUploaderById).not.toHaveBeenCalled();
  });

  it('returns the display name for a valid session of an active uploader', async () => {
    mockFindUploaderById.mockResolvedValue({ id: 1, displayName: 'MH', isAdmin: true });
    const token = await signSession({ uploaderId: 1, exp: nowSec() + 60 }, SECRET);
    const res = await handleApiRequest(me(`spyo_session=${token}`), env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ displayName: 'MH', isAdmin: true });
    expect(mockFindUploaderById).toHaveBeenCalledWith(DB, 1);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('returns isAdmin false for a non-admin uploader', async () => {
    mockFindUploaderById.mockResolvedValue({ id: 2, displayName: 'Bob', isAdmin: false });
    const token = await signSession({ uploaderId: 2, exp: nowSec() + 60 }, SECRET);
    const res = await handleApiRequest(me(`spyo_session=${token}`), env);
    expect(await res.json()).toEqual({ displayName: 'Bob', isAdmin: false });
  });

  it('returns 401 for a disabled uploader', async () => {
    mockFindUploaderById.mockResolvedValue(null);
    const token = await signSession({ uploaderId: 1, exp: nowSec() + 60 }, SECRET);
    const res = await handleApiRequest(me(`spyo_session=${token}`), env);
    expect(res.status).toBe(401);
  });

  it('returns 401 for an expired or forged session', async () => {
    mockFindUploaderById.mockResolvedValue({ id: 1, displayName: 'MH', isAdmin: true });
    const expired = await signSession({ uploaderId: 1, exp: nowSec() - 1 }, SECRET);
    expect((await handleApiRequest(me(`spyo_session=${expired}`), env)).status).toBe(401);
    const forged = await signSession({ uploaderId: 1, exp: nowSec() + 60 }, 'wrong-session-secret-0123456789abcdef');
    expect((await handleApiRequest(me(`spyo_session=${forged}`), env)).status).toBe(401);
    expect(mockFindUploaderById).not.toHaveBeenCalled();
  });

  it('returns 401 when the session secret is shorter than 32 characters', async () => {
    mockFindUploaderById.mockResolvedValue({ id: 1, displayName: 'MH', isAdmin: true });
    // A token genuinely HMAC-signed with the short key, bypassing signSession's guard.
    const short = 'x'.repeat(31);
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(short),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const body = Buffer.from(JSON.stringify({ uploaderId: 1, exp: nowSec() + 60 })).toString(
      'base64url',
    );
    const sig = Buffer.from(
      await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)),
    ).toString('base64url');
    const res = await handleApiRequest(me(`spyo_session=${body}.${sig}`), {
      ...(env as object),
      SESSION_SECRET: short,
    } as never);
    expect(res.status).toBe(401);
    expect(mockFindUploaderById).not.toHaveBeenCalled();
  });

  it('returns 401 when the session secret is not configured', async () => {
    mockFindUploaderById.mockResolvedValue({ id: 1, displayName: 'MH', isAdmin: true });
    const token = await signSession({ uploaderId: 1, exp: nowSec() + 60 }, SECRET);
    const res = await handleApiRequest(me(`spyo_session=${token}`), {
      ...(env as object),
      SESSION_SECRET: '',
    } as never);
    expect(res.status).toBe(401);
  });

  it('returns 405 for POST', async () => {
    const res = await handleApiRequest(
      new Request('https://app.test/api/me', { method: 'POST' }),
      env,
    );
    expect(res.status).toBe(405);
  });
});

describe('per-route method checks', () => {
  it('returns 405 for POST /api/images', async () => {
    const res = await handleApiRequest(
      new Request('https://app.test/api/images', { method: 'POST' }),
      env,
    );
    expect(res.status).toBe(405);
    expect(mockQueryAll).not.toHaveBeenCalled();
  });

  it('returns 405 for DELETE /api/images/:id', async () => {
    const res = await handleApiRequest(
      new Request('https://app.test/api/images/abc', { method: 'DELETE' }),
      env,
    );
    expect(res.status).toBe(405);
    expect(mockQueryById).not.toHaveBeenCalled();
  });

  it('returns 404 for POST to an unknown route', async () => {
    const res = await handleApiRequest(
      new Request('https://app.test/api/nonsense', { method: 'POST' }),
      env,
    );
    expect(res.status).toBe(404);
  });
});

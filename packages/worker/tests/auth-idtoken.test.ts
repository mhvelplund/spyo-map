import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockFindByEmail = jest.fn<(db: unknown, email: string) => Promise<unknown>>();
const mockFindById = jest.fn<(db: unknown, id: number) => Promise<unknown>>();

jest.unstable_mockModule('../src/services/uploaders.js', () => ({
  findActiveUploaderByEmail: mockFindByEmail,
  findActiveUploaderById: mockFindById,
}));

const { handleAuthRequest } = await import('../src/auth/routes.js');
const { verifySession } = await import('../src/auth/session.js');

const EMAIL = 'malephex@gmail.com';
const SECRET = 'test-session-secret-0123456789abcdef';
const DB = { marker: 'db' };
const ORIGIN = 'https://app.test';
const URL_ = `${ORIGIN}/auth/google/idtoken`;
const TOKENINFO = 'https://oauth2.googleapis.com/tokeninfo';
const env = {
  DB,
  ASSETS: {},
  IMAGES_BASE_URL: 'https://img.test',
  SESSION_SECRET: SECRET,
  GOOGLE_CLIENT_ID: 'client-id',
  GOOGLE_CLIENT_SECRET: 'client-secret',
} as never;

const now = () => Math.floor(Date.now() / 1000);
type Info = Record<string, unknown>;
const goodInfo = (): Info => ({
  aud: 'client-id',
  iss: 'https://accounts.google.com',
  email: EMAIL,
  email_verified: 'true',
  exp: String(now() + 600),
});

function stubTokeninfo(info: Info, status = 200) {
  return jest.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    if (`${url.origin}${url.pathname}` === TOKENINFO && url.searchParams.get('id_token') === 'tok') {
      return new Response(JSON.stringify(info), {
        status,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response('unexpected', { status: 500 });
  });
}

function post(body: unknown, origin: string | null = ORIGIN, raw = false): Request {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (origin !== null) headers.set('origin', origin);
  return new Request(URL_, { method: 'POST', headers, body: raw ? (body as string) : JSON.stringify(body) });
}

async function call(req: Request, info: Info = goodInfo(), status = 200) {
  const fetchFn = stubTokeninfo(info, status);
  const res = await handleAuthRequest(req, env, fetchFn as unknown as typeof fetch);
  return { res, fetchFn };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFindByEmail.mockResolvedValue({ id: 7, displayName: 'Ada', isAdmin: false });
});

describe('POST /auth/google/idtoken', () => {
  it('valid token for an active uploader → 200, displayName, spyo_session cookie for that uploader', async () => {
    const { res } = await call(post({ idToken: 'tok' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ displayName: 'Ada', isAdmin: false });
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Max-Age=604800');
    expect(cookie).toContain('Path=/;');
    const token = /^spyo_session=([^;]+);/.exec(cookie)?.[1] ?? '';
    expect((await verifySession(token, SECRET, now()))?.uploaderId).toBe(7);
    expect(mockFindByEmail).toHaveBeenCalledWith(DB, EMAIL);
  });

  it('aud mismatch → 401, no set-cookie', async () => {
    const { res } = await call(post({ idToken: 'tok' }), { ...goodInfo(), aud: 'other' });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Invalid token' });
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it("iss 'accounts.google.com' (no scheme) is accepted", async () => {
    const { res } = await call(post({ idToken: 'tok' }), { ...goodInfo(), iss: 'accounts.google.com' });
    expect(res.status).toBe(200);
  });

  it("iss 'https://evil.test' → 401", async () => {
    const { res } = await call(post({ idToken: 'tok' }), { ...goodInfo(), iss: 'https://evil.test' });
    expect(res.status).toBe(401);
  });

  it('email_verified boolean true is accepted', async () => {
    const { res } = await call(post({ idToken: 'tok' }), { ...goodInfo(), email_verified: true });
    expect(res.status).toBe(200);
  });

  it("email_verified 'false' → 401", async () => {
    const { res } = await call(post({ idToken: 'tok' }), { ...goodInfo(), email_verified: 'false' });
    expect(res.status).toBe(401);
  });

  it('exp in the past → 401', async () => {
    const { res } = await call(post({ idToken: 'tok' }), { ...goodInfo(), exp: String(now() - 1) });
    expect(res.status).toBe(401);
  });

  it('tokeninfo non-200 → 401', async () => {
    const { res } = await call(post({ idToken: 'tok' }), { error: 'invalid_token' }, 400);
    expect(res.status).toBe(401);
  });

  it("valid token, not an active uploader → 403 {error:'Not allowed'}, no set-cookie", async () => {
    mockFindByEmail.mockResolvedValue(null);
    const { res } = await call(post({ idToken: 'tok' }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Not allowed' });
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it.each([[null], ['https://evil.test']])(
    "origin %p → 403 {error:'Forbidden'} and tokeninfo is never fetched",
    async (origin) => {
      const { res, fetchFn } = await call(post({ idToken: 'tok' }, origin));
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: 'Forbidden' });
      expect(fetchFn).not.toHaveBeenCalled();
    },
  );

  it.each([['not json', true], [{}, false], [{ idToken: '' }, false], [{ idToken: 5 }, false], [null, false]])(
    'bad body %p → 400',
    async (body, raw) => {
      const { res, fetchFn } = await call(post(body, ORIGIN, raw as boolean));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Bad request' });
      expect(fetchFn).not.toHaveBeenCalled();
    },
  );

  it('GET → 405', async () => {
    const { res } = await call(new Request(URL_));
    expect(res.status).toBe(405);
  });

  it('not configured → 500', async () => {
    const res = await handleAuthRequest(
      post({ idToken: 'tok' }),
      { ...(env as object), SESSION_SECRET: '' } as never,
      stubTokeninfo(goodInfo()) as unknown as typeof fetch,
    );
    expect(res.status).toBe(500);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('a D1 failure after a valid token → 500, no set-cookie', async () => {
    mockFindByEmail.mockRejectedValue(new Error('d1 down'));
    const { res } = await call(post({ idToken: 'tok' }));
    expect(res.status).toBe(500);
    expect(res.headers.get('set-cookie')).toBeNull();
  });
});

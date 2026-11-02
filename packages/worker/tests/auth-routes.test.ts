import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockFindByEmail = jest.fn<(db: unknown, email: string) => Promise<unknown>>();
const mockFindById = jest.fn<(db: unknown, id: number) => Promise<unknown>>();

jest.unstable_mockModule('../src/services/uploaders.js', () => ({
  findActiveUploaderByEmail: mockFindByEmail,
  findActiveUploaderById: mockFindById,
}));

const { handleAuthRequest, isSameOrigin } = await import('../src/auth/routes.js');
const { verifySession } = await import('../src/auth/session.js');
const { codeChallengeS256 } = await import('../src/auth/pkce.js');

const EMAIL = 'malephex@gmail.com';
const SECRET = 'test-session-secret-0123456789abcdef';
const DB = { marker: 'db' };
const env = {
  DB,
  ASSETS: {},
  IMAGES_BASE_URL: 'https://img.test',
  SESSION_SECRET: SECRET,
  GOOGLE_CLIENT_ID: 'client-id',
  GOOGLE_CLIENT_SECRET: 'client-secret',
} as never;

type Userinfo = { email?: string; email_verified?: unknown };

function stubFetch(userinfo: Userinfo) {
  return jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === 'https://oauth2.googleapis.com/token') {
      expect(init?.method).toBe('POST');
      return new Response(JSON.stringify({ access_token: 'at-123', token_type: 'Bearer' }), {
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url === 'https://openidconnect.googleapis.com/v1/userinfo') {
      return new Response(JSON.stringify(userinfo), {
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response('unexpected', { status: 500 });
  });
}

async function login(): Promise<{ res: Response; state: string; verifier: string }> {
  const res = await handleAuthRequest(
    new Request('https://app.test/auth/login/google'),
    env,
    stubFetch({}) as unknown as typeof fetch,
  );
  const setCookie = res.headers.get('set-cookie') ?? '';
  const m = /spyo_oauth=([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+);/.exec(setCookie);
  if (!m) throw new Error(`no spyo_oauth cookie in ${setCookie}`);
  return { res, state: m[1], verifier: m[2] };
}

function callback(state: string, cookie: string | null, code = 'auth-code'): Request {
  const headers = new Headers();
  if (cookie !== null) headers.set('cookie', cookie);
  return new Request(
    `https://app.test/auth/callback/google?state=${encodeURIComponent(state)}&code=${code}`,
    { headers },
  );
}

async function allText(res: Response): Promise<string> {
  const headers = [...res.headers.entries()].map(([k, v]) => `${k}: ${v}`).join('\n');
  return `${headers}\n${await res.text()}`;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFindByEmail.mockResolvedValue({ id: 1, displayName: 'MH' });
});

describe('GET /auth/login/google', () => {
  it('redirects to Google with PKCE and sets an HttpOnly spyo_oauth cookie', async () => {
    const { res, state, verifier } = await login();
    expect(res.status).toBe(302);
    const location = res.headers.get('location') ?? '';
    expect(location.startsWith('https://accounts.google.com/o/oauth2/v2/auth')).toBe(true);
    expect(location).toContain('code_challenge_method=S256');
    expect(location).toContain('redirect_uri=https%3A%2F%2Fapp.test%2Fauth%2Fcallback%2Fgoogle');
    const params = new URL(location).searchParams;
    expect(params.get('client_id')).toBe('client-id');
    expect(params.get('response_type')).toBe('code');
    expect(params.get('scope')).toBe('openid email');
    expect(params.get('state')).toBe(state);
    expect(params.get('code_challenge')).toBe(await codeChallengeS256(verifier));

    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('Secure');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toContain('Path=/auth');
    expect(setCookie).toContain('Max-Age=600');
  });

  it('uses a fresh state and verifier every time', async () => {
    const a = await login();
    const b = await login();
    expect(a.state).not.toBe(b.state);
    expect(a.verifier).not.toBe(b.verifier);
  });

  it('fails closed with 500 when the session secret is shorter than 32 characters', async () => {
    const res = await handleAuthRequest(
      new Request('https://app.test/auth/login/google'),
      { ...(env as object), SESSION_SECRET: 'x'.repeat(31) } as never,
    );
    expect(res.status).toBe(500);
    expect(res.headers.get('location')).toBeNull();
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('fails closed with 500 when the session secret is missing', async () => {
    const res = await handleAuthRequest(
      new Request('https://app.test/auth/login/google'),
      { ...(env as object), SESSION_SECRET: '' } as never,
    );
    expect(res.status).toBe(500);
    expect(res.headers.get('location')).toBeNull();
    expect(res.headers.get('set-cookie')).toBeNull();
  });
});

describe('GET /auth/callback/google', () => {
  it('signs in a verified, allowed email', async () => {
    const { state, verifier } = await login();
    const fetchFn = stubFetch({ email: EMAIL, email_verified: true });
    const res = await handleAuthRequest(
      callback(state, `spyo_oauth=${state}.${verifier}`),
      env,
      fetchFn as unknown as typeof fetch,
    );
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/#/upload');

    const cookies = res.headers.getSetCookie();
    const session = cookies.find((c) => c.startsWith('spyo_session='));
    expect(session).toBeDefined();
    expect(session).toContain('HttpOnly');
    expect(session).toContain('Secure');
    expect(session).toContain('SameSite=Lax');
    expect(session).toContain('Max-Age=604800');
    expect(session).toContain('Path=/;');
    expect(cookies.some((c) => c.startsWith('spyo_oauth=;') && c.includes('Max-Age=0'))).toBe(
      true,
    );

    const token = /^spyo_session=([^;]+);/.exec(session ?? '')?.[1] ?? '';
    const payload = await verifySession(token, SECRET, Math.floor(Date.now() / 1000));
    expect(payload?.uploaderId).toBe(1);
    expect(Object.keys(payload ?? {}).sort()).toEqual(['exp', 'uploaderId']);

    expect(mockFindByEmail).toHaveBeenCalledWith(DB, EMAIL);
    const tokenCall = fetchFn.mock.calls.find(
      ([u]) => String(u) === 'https://oauth2.googleapis.com/token',
    );
    const body = new URLSearchParams(String(tokenCall?.[1]?.body));
    expect(body.get('code')).toBe('auth-code');
    expect(body.get('code_verifier')).toBe(verifier);
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('redirect_uri')).toBe('https://app.test/auth/callback/google');
    expect(body.get('client_secret')).toBe('client-secret');

    expect(await allText(res)).not.toContain(EMAIL);
  });

  it('denies an unverified email without a session', async () => {
    const { state, verifier } = await login();
    const res = await handleAuthRequest(
      callback(state, `spyo_oauth=${state}.${verifier}`),
      env,
      stubFetch({ email: EMAIL, email_verified: false }) as unknown as typeof fetch,
    );
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/#/upload?denied=1');
    expect(res.headers.getSetCookie().some((c) => c.startsWith('spyo_session='))).toBe(false);
    expect(mockFindByEmail).not.toHaveBeenCalled();
    expect(await allText(res)).not.toContain(EMAIL);
  });

  it('denies a string "true" email_verified', async () => {
    const { state, verifier } = await login();
    const res = await handleAuthRequest(
      callback(state, `spyo_oauth=${state}.${verifier}`),
      env,
      stubFetch({ email: EMAIL, email_verified: 'true' }) as unknown as typeof fetch,
    );
    expect(res.headers.get('location')).toBe('/#/upload?denied=1');
  });

  it('denies an email not on the allow list', async () => {
    mockFindByEmail.mockResolvedValue(null);
    const { state, verifier } = await login();
    const other = 'stranger@example.com';
    const res = await handleAuthRequest(
      callback(state, `spyo_oauth=${state}.${verifier}`),
      env,
      stubFetch({ email: other, email_verified: true }) as unknown as typeof fetch,
    );
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/#/upload?denied=1');
    expect(res.headers.getSetCookie().some((c) => c.startsWith('spyo_session='))).toBe(false);
    expect(await allText(res)).not.toContain(other);
  });

  it('rejects a state mismatch without calling Google', async () => {
    const { state, verifier } = await login();
    const fetchFn = stubFetch({ email: EMAIL, email_verified: true });
    const res = await handleAuthRequest(
      callback(`${state}x`, `spyo_oauth=${state}.${verifier}`),
      env,
      fetchFn as unknown as typeof fetch,
    );
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/#/upload?error=1');
    expect(fetchFn).not.toHaveBeenCalled();
    const cookies = res.headers.getSetCookie();
    expect(cookies.some((c) => c.startsWith('spyo_session='))).toBe(false);
    expect(cookies.some((c) => c.startsWith('spyo_oauth=;') && c.includes('Max-Age=0'))).toBe(
      true,
    );
  });

  it('rejects a missing state cookie or missing code without calling Google', async () => {
    const { state, verifier } = await login();
    const fetchFn = stubFetch({ email: EMAIL, email_verified: true });
    for (const req of [
      callback(state, null),
      callback(state, `spyo_oauth=${state}`),
      callback('', `spyo_oauth=.${verifier}`),
      callback(state, `spyo_oauth=${state}.${verifier}`, ''),
    ]) {
      const res = await handleAuthRequest(req, env, fetchFn as unknown as typeof fetch);
      expect(res.headers.get('location')).toBe('/#/upload?error=1');
    }
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('gives error=1 when the token exchange throws', async () => {
    const { state, verifier } = await login();
    const fetchFn = jest.fn(async () => {
      throw new Error('network down');
    });
    const res = await handleAuthRequest(
      callback(state, `spyo_oauth=${state}.${verifier}`),
      env,
      fetchFn as unknown as typeof fetch,
    );
    expect(res.headers.get('location')).toBe('/#/upload?error=1');
  });

  it('gives denied=1 when Google rejects the code', async () => {
    const { state, verifier } = await login();
    const fetchFn = jest.fn(async () => new Response('{"error":"invalid_grant"}', { status: 400 }));
    const res = await handleAuthRequest(
      callback(state, `spyo_oauth=${state}.${verifier}`),
      env,
      fetchFn as unknown as typeof fetch,
    );
    expect(res.headers.get('location')).toBe('/#/upload?denied=1');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('gives error=1 and clears spyo_oauth when the allow-list lookup throws', async () => {
    mockFindByEmail.mockRejectedValue(new Error('D1 unavailable'));
    const { state, verifier } = await login();
    const res = await handleAuthRequest(
      callback(state, `spyo_oauth=${state}.${verifier}`),
      env,
      stubFetch({ email: EMAIL, email_verified: true }) as unknown as typeof fetch,
    );
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/#/upload?error=1');
    const cookies = res.headers.getSetCookie();
    expect(cookies.some((c) => c.startsWith('spyo_session='))).toBe(false);
    expect(cookies.some((c) => c.startsWith('spyo_oauth=;') && c.includes('Max-Age=0'))).toBe(
      true,
    );
    expect(await allText(res)).not.toContain(EMAIL);
  });

  it('fails closed when the session secret is shorter than 32 characters', async () => {
    const { state, verifier } = await login();
    const fetchFn = stubFetch({ email: EMAIL, email_verified: true });
    const res = await handleAuthRequest(
      callback(state, `spyo_oauth=${state}.${verifier}`),
      { ...(env as object), SESSION_SECRET: 'x'.repeat(31) } as never,
      fetchFn as unknown as typeof fetch,
    );
    expect(res.headers.get('location')).toBe('/#/upload?error=1');
    expect(res.headers.getSetCookie().some((c) => c.startsWith('spyo_session='))).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('fails closed when the session secret is missing', async () => {
    const { state, verifier } = await login();
    const fetchFn = stubFetch({ email: EMAIL, email_verified: true });
    const res = await handleAuthRequest(
      callback(state, `spyo_oauth=${state}.${verifier}`),
      { ...(env as object), SESSION_SECRET: undefined } as never,
      fetchFn as unknown as typeof fetch,
    );
    expect(res.headers.get('location')).toBe('/#/upload?error=1');
    expect(res.headers.getSetCookie().some((c) => c.startsWith('spyo_session='))).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe('POST /auth/logout', () => {
  it('returns 403 without an Origin header', async () => {
    const res = await handleAuthRequest(
      new Request('https://app.test/auth/logout', { method: 'POST' }),
      env,
    );
    expect(res.status).toBe(403);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('returns 403 for a cross-site Origin', async () => {
    const res = await handleAuthRequest(
      new Request('https://app.test/auth/logout', {
        method: 'POST',
        headers: { origin: 'https://evil.test' },
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it('clears the session for a same-origin request', async () => {
    const res = await handleAuthRequest(
      new Request('https://app.test/auth/logout', {
        method: 'POST',
        headers: { origin: 'https://app.test' },
      }),
      env,
    );
    expect(res.status).toBe(204);
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toMatch(/^spyo_session=;/);
    expect(setCookie).toContain('Max-Age=0');
    expect(setCookie).toContain('Path=/;');
  });

  it('rejects GET with 405', async () => {
    const res = await handleAuthRequest(new Request('https://app.test/auth/logout'), env);
    expect(res.status).toBe(405);
  });
});

describe('other /auth paths', () => {
  it('returns 404 for unknown paths', async () => {
    const res = await handleAuthRequest(new Request('https://app.test/auth/nope'), env);
    expect(res.status).toBe(404);
  });

  it('returns 405 for POST to login', async () => {
    const res = await handleAuthRequest(
      new Request('https://app.test/auth/login/google', { method: 'POST' }),
      env,
    );
    expect(res.status).toBe(405);
  });
});

describe('isSameOrigin', () => {
  it('compares the Origin header with the request origin', () => {
    const mk = (origin?: string) =>
      new Request('https://app.test/x', origin ? { headers: { origin } } : {});
    expect(isSameOrigin(mk('https://app.test'))).toBe(true);
    expect(isSameOrigin(mk('https://evil.test'))).toBe(false);
    expect(isSameOrigin(mk('null'))).toBe(false);
    expect(isSameOrigin(mk())).toBe(false);
  });
});

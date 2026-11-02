import { describe, it, expect } from '@jest/globals';
import {
  signSession,
  verifySession,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
} from '../src/auth/session.js';
import { parseCookies, serializeCookie } from '../src/auth/cookies.js';
import { randomToken, codeChallengeS256 } from '../src/auth/pkce.js';

const SECRET = 'test-secret-0123456789';
const NOW = 1_800_000_000;

function flip(s: string, i: number): string {
  const c = s[i] === 'A' ? 'B' : 'A';
  return s.slice(0, i) + c + s.slice(i + 1);
}

describe('session constants', () => {
  it('match the spec', () => {
    expect(SESSION_COOKIE).toBe('spyo_session');
    expect(SESSION_TTL_SECONDS).toBe(604800);
  });
});

describe('signSession / verifySession', () => {
  it('round-trips', async () => {
    const token = await signSession({ uploaderId: 7, exp: NOW + 60 }, SECRET);
    expect(await verifySession(token, SECRET, NOW)).toEqual({ uploaderId: 7, exp: NOW + 60 });
  });

  it('uses base64url(JSON).base64url(HMAC) with only uploaderId and exp', async () => {
    const token = await signSession({ uploaderId: 7, exp: NOW + 60 }, SECRET);
    const [payload, sig] = token.split('.');
    expect(token.split('.')).toHaveLength(2);
    expect(payload).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(sig).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    expect(json).toEqual({ uploaderId: 7, exp: NOW + 60 });
  });

  it('rejects a tampered payload', async () => {
    const token = await signSession({ uploaderId: 7, exp: NOW + 60 }, SECRET);
    const [, sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ uploaderId: 1, exp: NOW + 60 })).toString(
      'base64url',
    );
    expect(await verifySession(`${forged}.${sig}`, SECRET, NOW)).toBeNull();
    expect(await verifySession(flip(token, 2), SECRET, NOW)).toBeNull();
  });

  it('rejects a tampered signature', async () => {
    const token = await signSession({ uploaderId: 7, exp: NOW + 60 }, SECRET);
    expect(await verifySession(flip(token, token.length - 5), SECRET, NOW)).toBeNull();
  });

  it('rejects exp == now and exp in the past', async () => {
    const atNow = await signSession({ uploaderId: 7, exp: NOW }, SECRET);
    expect(await verifySession(atNow, SECRET, NOW)).toBeNull();
    const past = await signSession({ uploaderId: 7, exp: NOW - 1 }, SECRET);
    expect(await verifySession(past, SECRET, NOW)).toBeNull();
  });

  it('rejects a wrong secret', async () => {
    const token = await signSession({ uploaderId: 7, exp: NOW + 60 }, SECRET);
    expect(await verifySession(token, 'other-secret', NOW)).toBeNull();
  });

  it('rejects malformed tokens', async () => {
    for (const t of ['', '.', 'abc', 'a.b.c', '!!!.###', 'e30.']) {
      expect(await verifySession(t, SECRET, NOW)).toBeNull();
    }
  });

  it('rejects a validly signed payload of the wrong shape', async () => {
    const bad = await signSession({ uploaderId: 'x', exp: NOW + 60 } as never, SECRET);
    expect(await verifySession(bad, SECRET, NOW)).toBeNull();
  });

  it('refuses to sign or verify with an empty secret', async () => {
    await expect(signSession({ uploaderId: 7, exp: NOW + 60 }, '')).rejects.toThrow();
    const token = await signSession({ uploaderId: 7, exp: NOW + 60 }, SECRET);
    expect(await verifySession(token, '', NOW)).toBeNull();
  });
});

describe('cookies', () => {
  it('parses a Cookie header', () => {
    expect(parseCookies('a=1; spyo_session=x.y;b=2')).toEqual({
      a: '1',
      spyo_session: 'x.y',
      b: '2',
    });
    expect(parseCookies(null)).toEqual({});
    expect(parseCookies('')).toEqual({});
  });

  it('serialises with Secure and SameSite=Lax always', () => {
    const c = serializeCookie('n', 'v', { maxAge: 10, path: '/auth', httpOnly: true });
    expect(c).toMatch(/^n=v;/);
    expect(c).toContain('Max-Age=10');
    expect(c).toContain('Path=/auth');
    expect(c).toContain('HttpOnly');
    expect(c).toContain('Secure');
    expect(c).toContain('SameSite=Lax');
  });

  it('omits HttpOnly only when explicitly disabled', () => {
    expect(serializeCookie('n', 'v', { maxAge: 1, path: '/' })).toContain('HttpOnly');
    const c = serializeCookie('n', 'v', { maxAge: 1, path: '/', httpOnly: false });
    expect(c).not.toContain('HttpOnly');
    expect(c).toContain('Secure');
  });
});

describe('pkce', () => {
  it('randomToken is base64url of the requested length', () => {
    expect(randomToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomToken(16)).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(randomToken()).not.toBe(randomToken());
  });

  it('codeChallengeS256 matches the RFC 7636 appendix B vector', async () => {
    expect(await codeChallengeS256('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });
});

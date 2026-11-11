import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockCurrentUploader = jest.fn<(request: Request, env: unknown) => Promise<unknown>>();

jest.unstable_mockModule('../src/auth/currentUploader.js', () => ({
  currentUploader: mockCurrentUploader,
}));

const { requireAdmin } = await import('../src/auth/requireAdmin.js');

const env = { DB: {} } as never;
const URL_ = 'https://app.test/api/admin/x';
const admin = { id: 1, email: 'a@test', isAdmin: true };
const user = { id: 2, email: 'u@test', isAdmin: false };

describe('requireAdmin', () => {
  beforeEach(() => mockCurrentUploader.mockReset());

  it('returns the uploader for an admin GET', async () => {
    mockCurrentUploader.mockResolvedValue(admin);
    expect(await requireAdmin(new Request(URL_), env)).toBe(admin);
  });

  it('returns the uploader for an admin POST with a same-origin Origin', async () => {
    mockCurrentUploader.mockResolvedValue(admin);
    const req = new Request(URL_, { method: 'POST', headers: { origin: 'https://app.test' } });
    expect(await requireAdmin(req, env)).toBe(admin);
  });

  it.each([
    ['no Origin', {}],
    ['a foreign Origin', { origin: 'https://evil.test' }],
  ])('rejects an admin POST with %s with 403 before touching the session', async (_n, headers) => {
    mockCurrentUploader.mockResolvedValue(admin);
    const res = await requireAdmin(new Request(URL_, { method: 'POST', headers }), env);
    expect(res).toBeInstanceOf(Response);
    const r = res as Response;
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ error: 'Forbidden' });
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(mockCurrentUploader).not.toHaveBeenCalled();
  });

  it('returns 401 when there is no session', async () => {
    mockCurrentUploader.mockResolvedValue(null);
    const r = (await requireAdmin(new Request(URL_), env)) as Response;
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ error: 'Not signed in' });
    expect(r.headers.get('cache-control')).toBe('no-store');
  });

  it('returns 403 for a non-admin', async () => {
    mockCurrentUploader.mockResolvedValue(user);
    const r = (await requireAdmin(new Request(URL_), env)) as Response;
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ error: 'Not an admin' });
    expect(r.headers.get('cache-control')).toBe('no-store');
  });
});

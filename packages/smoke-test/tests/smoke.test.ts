const BASE_URL = process.env['SMOKE_BASE_URL'];
const ALB_DNS = process.env['ALB_DNS'];

if (!BASE_URL || !ALB_DNS) {
  throw new Error('SMOKE_BASE_URL and ALB_DNS environment variables must be set');
}

describe('smoke tests', () => {
  test('frontend is reachable at /app/', async () => {
    const res = await fetch(`${BASE_URL}/app/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/html/);
    const body = await res.text();
    expect(body).toContain('<div id="root">');
  });

  test('backend API returns image list at /api/images', async () => {
    const res = await fetch(`${BASE_URL}/api/images`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    const data: unknown = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  test('images are accessible via CloudFront', async () => {
    const apiRes = await fetch(`${BASE_URL}/api/images`);
    const images = (await apiRes.json()) as Array<{ thumbnailUrl: string }>;
    if (images.length === 0) {
      console.log('No images in DB — skipping image reachability check');
      return;
    }
    const imageRes = await fetch(images[0].thumbnailUrl);
    expect(imageRes.status).toBe(200);
    expect(imageRes.headers.get('content-type')).toMatch(/image\//);
    const buf = await imageRes.arrayBuffer();
    expect(buf.byteLength).toBeGreaterThan(0);
  });

  test('ALB is not directly reachable (bypass protection works)', async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => { controller.abort(); }, 5000);
    try {
      const res = await fetch(`http://${ALB_DNS}/api/images`, {
        signal: controller.signal,
      });
      // A 2xx means the SG is not blocking — this is the failure case
      if (res.status >= 200 && res.status < 300) {
        throw new Error(`ALB returned HTTP ${res.status} — direct access is not blocked`);
      }
      // Non-2xx (e.g. 403 from ALB default rule) is acceptable
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return; // timeout → pass
      if (err instanceof TypeError) return; // network error (ECONNREFUSED, ECONNRESET) → pass
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  });
});

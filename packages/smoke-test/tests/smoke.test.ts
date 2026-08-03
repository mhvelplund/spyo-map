const BASE_URL = process.env["SMOKE_BASE_URL"];

const describeIfLive = BASE_URL ? describe : describe.skip;

describeIfLive("smoke tests", () => {
  test("the SPA is reachable at the site root", async () => {
    const res = await fetch(`${BASE_URL}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
    const body = await res.text();
    expect(body).toContain('<div id="root">');
  });

  test("an unknown path falls back to the SPA shell", async () => {
    const res = await fetch(`${BASE_URL}/not-a-real-path`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('<div id="root">');
  });

  test("the health endpoint responds", async () => {
    const res = await fetch(`${BASE_URL}/api/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  test("the API returns an image list", async () => {
    const res = await fetch(`${BASE_URL}/api/images`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    const data: unknown = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  test("thumbnails are served from the images domain", async () => {
    const apiRes = await fetch(`${BASE_URL}/api/images`);
    const images = (await apiRes.json()) as Array<{ thumbnailUrl: string }>;
    if (images.length === 0) {
      console.log("No images in D1 — skipping image reachability check");
      return;
    }
    const thumbnailUrl = images[0]!.thumbnailUrl;
    expect(thumbnailUrl).toContain("spyo-img.isntall.net");

    const imageRes = await fetch(thumbnailUrl);
    expect(imageRes.status).toBe(200);
    expect(imageRes.headers.get("content-type")).toMatch(/image\//);
    const buf = await imageRes.arrayBuffer();
    expect(buf.byteLength).toBeGreaterThan(0);
  });
});

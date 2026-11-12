import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const frontendDir = existsSync(resolve(process.cwd(), 'index.html'))
  ? process.cwd()
  : resolve(process.cwd(), 'packages/frontend');
const html = readFileSync(resolve(frontendDir, 'index.html'), 'utf8');

function meta(attr: 'property' | 'name', key: string): string | undefined {
  const re = new RegExp(`<meta\\s+${attr}="${key.replace(/:/g, '\\:')}"\\s+content="([^"]*)"`);
  return html.match(re)?.[1];
}

function pngSize(path: string): { width: number; height: number } {
  const buf = readFileSync(path);
  // PNG signature (8 bytes) + IHDR length/type (8 bytes), then width and height.
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

describe('social preview meta tags', () => {
  it('uses absolute https URLs for og:url and og:image', () => {
    expect(meta('property', 'og:url')).toMatch(/^https:\/\//);
    expect(meta('property', 'og:image')).toMatch(/^https:\/\//);
    expect(meta('name', 'twitter:image')).toBe(meta('property', 'og:image'));
  });

  it('declares a 1200x630 preview image that matches the file in public/', () => {
    expect(meta('property', 'og:image:width')).toBe('1200');
    expect(meta('property', 'og:image:height')).toBe('630');

    const imagePath = new URL(meta('property', 'og:image')!).pathname;
    expect(pngSize(resolve(frontendDir, 'public', '.' + imagePath))).toEqual({ width: 1200, height: 630 });
  });

  it('uses a large twitter card', () => {
    expect(meta('name', 'twitter:card')).toBe('summary_large_image');
  });
});

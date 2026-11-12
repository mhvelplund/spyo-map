import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Font Awesome uses the `fab` class for brand icons (SocialShare). An app-level `.fab` rule
// turns every brand icon into a fixed, bottom-centre floating button.
describe('floating action button styles', () => {
  it('do not reuse the Font Awesome `fab` class name', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const css = readFileSync(join(here, '../src/index.css'), 'utf8');
    expect(css).not.toMatch(/\.fab(?![\w-])/);
    expect(css).toMatch(/\.app-fab\s*\{/);
  });
});

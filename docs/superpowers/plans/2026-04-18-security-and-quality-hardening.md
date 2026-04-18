# Security and Code Quality Hardening Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or
> superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the security, correctness, and code-quality issues identified in the April 2026 code review.

**Architecture:** Targeted surgical fixes across three areas — build/deployment security, frontend component
correctness, and tooling hygiene. No new abstractions are introduced; every change is the minimum needed to close the
finding.

**Tech Stack:** React 19, TypeScript 5.9 (strict), Vite 7, sql.js 1.13, Python 3.12+, GitHub Actions



## Chunk 1: Build and Deployment Security

### Task 1: Disable production source maps

Source maps are currently published to the deployment server, letting anyone retrieve original source and trivially
extract the embedded Google Maps API key.

**Files:**
- Modify: `vite.config.ts`

- [ ] **Step 1: Change `sourcemap: true` to `sourcemap: false`**

  In `vite.config.ts`, inside the `build:` block, change the value **and** update the comment so it doesn't stay
  misleading:

  ```ts
  // Before
  // Generate source maps for debugging
  sourcemap: true,

  // After
  // Source maps disabled in production — they expose original source and make the embedded API key trivially extractable
  sourcemap: false,
  ```

- [ ] **Step 2: Verify build still compiles**

  ```bash
  npm run build
  ```

  Expected: build succeeds, no `*.map` files in `dist/assets/`.

  ```bash
  find dist -name "*.map" | wc -l   # should print 0
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add vite.config.ts
  git commit -m "security: disable source maps in production build"
  ```



### Task 2: Self-host the SQL.js WASM binary

`DatabaseService.ts` fetches the WASM at runtime from `sql.js.org`. This is a supply-chain risk: a compromised CDN could
execute arbitrary code in the app's origin. The file should be served from the app itself.

**Files:**
- Modify: `package.json` (add `copy-wasm` + `predev` + `prebuild` scripts)
- Modify: `src/services/DatabaseService.ts`
- Modify: `.gitignore` (exclude the copied WASM from version control)

- [ ] **Step 1: Add WASM copy scripts to `package.json`**

  Add these three entries to the `"scripts"` block:

  ```json
  "copy-wasm": "node --input-type=module -e \"import{copyFileSync}from'node:fs';copyFileSync('node_modules/sql.js/dist/sql-wasm.wasm','public/sql-wasm.wasm');\"",
  "predev": "npm run copy-wasm",
  "prebuild": "npm run copy-wasm",
  ```

  `predev` and `prebuild` are npm lifecycle hooks — they run automatically before `dev` and `build`.

- [ ] **Step 2: Update `locateFile` in `DatabaseService.ts`**

  Change the `locateFile` callback so it resolves relative to the app's deployment base (handles both root deployments
  and `/spyo-map/` GitHub Pages):

  ```ts
  // Before
  const SQL = await initSqlJs({
    locateFile: (file) => `https://sql.js.org/dist/${file}`
  });

  // After
  const SQL = await initSqlJs({
    locateFile: (file) => `${import.meta.env.BASE_URL}${file}`
  });
  ```

- [ ] **Step 3: Exclude the WASM copy from git**

  Add to `.gitignore`:

  ```
  public/sql-wasm.wasm
  ```

- [ ] **Step 4: Verify dev server starts and serves the WASM**

  ```bash
  npm run dev &
  sleep 3
  curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/sql-wasm.wasm
  # Expected: 200
  kill %1
  ```

  A `200` confirms Vite is serving the file from `public/`. A `404` means the `copy-wasm` step didn't run or the path is
  wrong.

- [ ] **Step 5: Verify production build includes the WASM**

  ```bash
  npm run build
  ls dist/sql-wasm.wasm   # should exist
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add package.json src/services/DatabaseService.ts .gitignore
  git commit -m "security: self-host sql.js WASM binary instead of fetching from CDN"
  ```



### Task 3: Document required API key restrictions and add Map ID env var

The Google Maps API key is embedded in the JS bundle. The only effective protection is restricting the key to specific
HTTP referrers in Google Cloud Console. This is not currently documented. Also, `DEMO_MAP_ID` is hardcoded — it has
undocumented rate limits and should be a configurable value.

**Files:**
- Modify: `README.md`
- Modify: `.env.example`
- Modify: `src/components/MapContainer.tsx`

- [ ] **Step 1: Add `VITE_GOOGLE_MAPS_MAP_ID` to `.env.example`**

  Append after the existing `VITE_GOOGLE_MAPS_API_KEY` line:

  ```
  # Google Maps Map ID (required for AdvancedMarkerElement)
  # Create a Map ID in Google Cloud Console: https://developers.google.com/maps/documentation/javascript/map-ids
  # Use DEMO_MAP_ID only during local development - never in production
  VITE_GOOGLE_MAPS_MAP_ID=DEMO_MAP_ID
  ```

- [ ] **Step 2: Replace the hardcoded `DEMO_MAP_ID` in `MapContainer.tsx`**

  Read the Map ID from the environment variable, falling back to `DEMO_MAP_ID` in dev:

  ```ts
  // Add near the top of the file, next to GOOGLE_MAPS_API_KEY
  const GOOGLE_MAPS_MAP_ID = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID';
  ```

  Then in the `new google.maps.Map(...)` call:

  ```ts
  // Before
  mapId: 'DEMO_MAP_ID',

  // After
  mapId: GOOGLE_MAPS_MAP_ID,
  ```

- [ ] **Step 3: Add an API key security section to `README.md`**

  Find the `### Environment Variables` heading in `README.md` (under `## Build and Deployment`). Add the following block
  immediately after the `VITE_GOOGLE_MAPS_API_KEY` description:

  ```markdown
  ### ⚠️ Securing Your Google Maps API Key

  Because this is a client-side app, `VITE_GOOGLE_MAPS_API_KEY` is embedded as a
  plain string in the JavaScript bundle that browsers download. **Anyone who visits
  the site can read the key.** Billing protection depends entirely on restricting
  the key in Google Cloud Console.

  **Required steps before deploying:**

  1. Open [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials).
  2. Click your API key → **Application restrictions** → choose **HTTP referrers (websites)**.
  3. Add your deployment domain, e.g. `https://yourdomain.com/*` or
     `https://yourusername.github.io/spyo-map/*`.
  4. Under **API restrictions**, restrict the key to the APIs you actually use
     (Maps JavaScript API).
  5. Save.

  A key restricted to your domain is useless to anyone who copies it from your bundle.
  ```

- [ ] **Step 4: Lint and build**

  ```bash
  npm run lint && npm run build
  ```

  Expected: no errors.

- [ ] **Step 5: Commit**

  ```bash
  git add README.md .env.example src/components/MapContainer.tsx
  git commit -m "security: document API key restrictions, make Map ID configurable via env var"
  ```



### Task 4: Harden the CI pipeline

The GitHub Actions workflow fetches an image archive with no failure check and uses a pre-release Python version.

**Files:**
- Modify: `.github/workflows/deploy.yml`

- [ ] **Step 1: Add `--fail --location` to the `curl` command**

  ```yaml
  # Before
  curl https://www.swissarmyronin.dk/files/spyo_images.zip -o "$images/images.zip"

  # After
  curl --fail --location https://www.swissarmyronin.dk/files/spyo_images.zip -o "$images/images.zip"
  ```

  `--fail` causes curl to exit non-zero on HTTP errors (4xx/5xx) instead of saving an error page. `--location` follows
  redirects. Combined with `set -euo pipefail` already in the step, this aborts the build if the download fails.

- [ ] **Step 2: Add checksum verification of the downloaded archive**

  Store the expected SHA-256 of the archive in the workflow and verify it before unzipping. This detects a compromised
  or corrupted file before it is processed.

  First, compute the current expected hash (run this locally and paste the result into the workflow):

  ```bash
  curl --fail --location https://www.swissarmyronin.dk/files/spyo_images.zip -o spyo_images_verify.zip
  sha256sum spyo_images_verify.zip
  # Example output: a3f2...  spyo_images_verify.zip
  rm spyo_images_verify.zip
  ```

  Then add a `IMAGES_SHA256` env var and a verification step to the workflow:

  ```yaml
  - name: Generate image database
    env:
      IMAGES_SHA256: "<paste the sha256 hash here>"  # Update this when the archive changes
    run: |
      set -euo pipefail
      images=$(mktemp -d)
      curl --fail --location https://www.swissarmyronin.dk/files/spyo_images.zip -o "$images/images.zip"
      echo "${IMAGES_SHA256}  $images/images.zip" | sha256sum --check
      unzip "$images/images.zip" -d "$images"
      cd public
      uv run python ../extract_exif.py "$images"
  ```

  If the archive is ever updated, recompute the hash and update `IMAGES_SHA256` in the same commit.

  > **Note:** If the archive content changes frequently, consider hosting it as a GitHub release asset with a stable
  > per-release URL and hash instead of a mutable file at a personal domain.

- [ ] **Step 3: Pin Python to a stable release**

  ```yaml
  # Before
  python-version: "3.14"

  # After
  python-version: "3.12"
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add .github/workflows/deploy.yml
  git commit -m "ci: fail fast on download error, verify archive checksum, pin Python to stable 3.12"
  ```



## Chunk 2: Frontend Component Fixes

### Task 5: Restore TypeScript type safety in `MapContainer.tsx`

`declare const google: any` overrides `@types/google.maps`, disabling type checking for every Maps API call. Because
`tsconfig.app.json` restricts `types` to `["vite/client"]`, the package needs an explicit triple-slash reference.

**Files:**
- Modify: `src/components/MapContainer.tsx`

- [ ] **Step 1: Replace the `any` declaration with a triple-slash reference**

  Remove:
  ```ts
  // Temporary type declarations for Google Maps
  declare const google: any;
  ```

  Add at the very top of the file (before all imports):
  ```ts
  /// <reference types="google.maps" />
  ```

- [ ] **Step 2: Type the `useRef` hooks properly**

  ```ts
  // Before
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  // After
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  ```

- [ ] **Step 3: Run TypeScript type check and lint**

  ```bash
  npm run lint
  npx tsc -b --noEmit
  ```

  Fix any type errors that surface — they represent real bugs the `any` was hiding.

- [ ] **Step 4: Build**

  ```bash
  npm run build
  ```

  Expected: clean build.

- [ ] **Step 5: Commit**

  ```bash
  git add src/components/MapContainer.tsx
  git commit -m "fix: restore TypeScript type safety for Google Maps API calls"
  ```



### Task 6: Fix `setMapError` called during render

`renderMap` is used as Wrapper's `render` prop — it is called during React's render phase. Calling `setMapError` inside
it triggers a state update during render, which React 18+ warns about (and StrictMode double-invokes).

The `mapError` state is redundant: the `FAILURE` branch already renders a full error UI with a reload button; there's
nothing the external `mapError` check does that the `FAILURE` branch doesn't already handle. The fix is to remove the
state and simplify.

**Files:**
- Modify: `src/components/MapContainer.tsx`

- [ ] **Step 1: Remove the `mapError` state and its associated JSX**

  Remove:
  ```ts
  const [mapError, setMapError] = useState<string | null>(null);
  ```

  Remove the entire block:
  ```tsx
  if (mapError) {
    return (
      <div className="map-error">
        <p>{mapError}</p>
        <button type="button" onClick={() => setMapError(null)}>Retry</button>
      </div>
    );
  }
  ```

- [ ] **Step 2: Remove the `setMapError` call from the `FAILURE` case**

  ```tsx
  // Before
  case Status.FAILURE:
    setMapError('Failed to load Google Maps');
    return (
      <div className="map-error">
        <p>Failed to load Google Maps. Please check your internet connection and API key.</p>
        <button type="button" onClick={() => window.location.reload()}>Retry</button>
      </div>
    );

  // After
  case Status.FAILURE:
    return (
      <div className="map-error">
        <p>Failed to load Google Maps. Please check your internet connection and API key.</p>
        <button type="button" onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  ```

- [ ] **Step 3: Remove the unused `useState` import if it is now unused**

  Check whether `useState` is still used elsewhere in the file. If `MapContainer` no longer uses any state, remove it
  from the import.

- [ ] **Step 4: Lint and build**

  ```bash
  npm run lint && npm run build
  ```

  Expected: no errors, no unused variable warnings.

- [ ] **Step 5: Smoke-test the happy path in the browser**

  ```bash
  npm run dev
  ```

  Open `http://localhost:3000`. The map should load normally — this confirms the non-error path (the `SUCCESS` case) was
  not broken by the removal.

- [ ] **Step 6: Commit**

  ```bash
  git add src/components/MapContainer.tsx
  git commit -m "fix: remove setState call during render in MapContainer"
  ```



### Task 7: Remove duplicate Haversine formula in `ImageView.tsx`

`ImageView.tsx` contains a private `calculateDistance` that is an exact copy of `calculateHaversineDistance` in
`utils/distance.ts`. Two copies can diverge; use the shared one.

**Files:**
- Modify: `src/components/ImageView.tsx`

- [ ] **Step 1: Add the import**

  Add to the imports at the top of `ImageView.tsx`:

  ```ts
  import { calculateHaversineDistance } from '../utils/distance';
  ```

- [ ] **Step 2: Delete the local `calculateDistance` function**

  Remove the entire local function block shown below. Match it by content (don't rely on line numbers):

  ```ts
  // DELETE THIS BLOCK:
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };
  ```

- [ ] **Step 3: Replace the call site**

  ```ts
  // Before
  distance: calculateDistance(image.latitude, image.longitude, img.latitude, img.longitude)

  // After
  distance: calculateHaversineDistance(image.latitude, image.longitude, img.latitude, img.longitude)
  ```

- [ ] **Step 4: Lint**

  ```bash
  npm run lint
  ```

  Expected: no unused variable warnings, clean output.

- [ ] **Step 5: Commit**

  ```bash
  git add src/components/ImageView.tsx
  git commit -m "refactor: use shared haversine utility in ImageView, remove duplicate"
  ```



### Task 8: Remove deprecated `execCommand` fallback in `SocialShare.tsx`

`document.execCommand('copy')` is deprecated in all modern browsers. The `navigator.clipboard.writeText` path is already
the primary path; the `execCommand` fallback is dead code.

**Files:**
- Modify: `src/components/SocialShare.tsx`

- [ ] **Step 1: Replace `handleInstagramShare` with a simplified version**

  ```ts
  // Replace the entire handleInstagramShare callback:
  const handleInstagramShare = useCallback(async () => {
    try {
      const fullUrl = getFullUrl();
      await navigator.clipboard.writeText(fullUrl);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  }, [getFullUrl]);
  ```

- [ ] **Step 2: Lint**

  ```bash
  npm run lint
  ```

  Expected: clean.

- [ ] **Step 3: Commit**

  ```bash
  git add src/components/SocialShare.tsx
  git commit -m "fix: remove deprecated execCommand clipboard fallback in SocialShare"
  ```



## Chunk 3: Tooling and Scripts

### Task 9: Fix mixed ESM/CJS in `deploy.config.js`

`deploy.config.js` uses `var shell = require('shelljs')` (CommonJS) while the rest of the file is ESM. This works only
via Node's CJS interop and is inconsistent.

**Files:**
- Modify: `deploy.config.js`

- [ ] **Step 1: Replace the `require` with an ESM import**

  ```js
  // Before
  var shell = require('shelljs');

  // After
  import shell from 'shelljs';
  ```

  Place the import with the other imports at the top of the file.

- [ ] **Step 2: Verify the build scripts still work**

  ```bash
  npm run build
  ```

  Expected: build succeeds, `dist/images/` is populated.

- [ ] **Step 3: Commit**

  ```bash
  git add deploy.config.js
  git commit -m "fix: use ESM import for shelljs in deploy.config.js"
  ```



### Task 10: Fix `require()` call in the ESM `validate-build.js`

`scripts/validate-build.js` is an ESM file (it uses `import.meta.url`) but still calls `require('fs').readFileSync(...)`
on line 94. It should use the `readFileSync` that is already imported at the top.

**Files:**
- Modify: `scripts/validate-build.js`

- [ ] **Step 1: Ensure `readFileSync` is in the top-level import**

  The file already has:
  ```js
  import { existsSync, statSync, readdirSync } from 'fs';
  ```

  Add `readFileSync` to this import:
  ```js
  import { existsSync, statSync, readdirSync, readFileSync } from 'fs';
  ```

- [ ] **Step 2: Replace the inline `require` call**

  ```js
  // Before (line ~94)
  const indexContent = require('fs').readFileSync(indexPath, 'utf8');

  // After
  const indexContent = readFileSync(indexPath, 'utf8');
  ```

- [ ] **Step 3: Verify the validation script runs**

  ```bash
  npm run build && npm run build:validate
  ```

  Expected: validation passes with no runtime errors.

- [ ] **Step 4: Commit**

  ```bash
  git add scripts/validate-build.js
  git commit -m "fix: replace require() with ESM import in validate-build.js"
  ```



### Task 11: Log silently swallowed exceptions in `extract_exif.py`

The `extract_exif` method catches all exceptions and returns `None` without logging `e`, making it impossible to
diagnose why specific images are skipped. There are also three other silent `except Exception` blocks in
`create_scaled_image` and `create_thumbnail` — fix all instances at once.

**Files:**
- Modify: `extract_exif.py`

- [ ] **Step 1: Log the exception in `extract_exif` (the main finding)**

  Match by code content (not line number):

  ```python
  # Before
  except Exception as e:
      # Common issues: corrupted files, unsupported formats, permission errors
      return None

  # After
  except Exception as e:
      print(f"✗ Skipped {image_path.name}: {e}")
      return None
  ```

- [ ] **Step 2: Confirm the other exception handlers already log correctly**

  In `create_scaled_image` and `create_thumbnail`, the existing handlers should already print `e`. Verify both read:

  ```python
  # create_scaled_image
  except Exception as e:
      print(f"Error creating scaled image for {image_path}: {e}")

  # create_thumbnail
  except Exception as e:
      print(f"Error creating thumbnail for {image_path}: {e}")
  ```

  If either is missing `{e}` in the print, add it. The `scan_images` loop handler already logs correctly — no change
  needed there.

- [ ] **Step 3: Commit**

  ```bash
  git add extract_exif.py
  git commit -m "fix: log exception when EXIF extraction fails instead of silently returning None"
  ```



### Task 12: Add secret-scanning to pre-commit hooks

`.pre-commit-config.yaml` currently only checks whitespace, YAML, and large files. A developer accidentally committing a
`.env` or hard-coding a key gets no warning.

**Files:**
- Modify: `.pre-commit-config.yaml`

- [ ] **Step 1: Add `gitleaks` to `.pre-commit-config.yaml`**

  Append after the existing `pre-commit-hooks` entry:

  ```yaml
  - repo: https://github.com/gitleaks/gitleaks
    rev: v8.27.2
    hooks:
    - id: gitleaks
  ```

- [ ] **Step 2: Install/update the hooks**

  ```bash
  pre-commit autoupdate
  pre-commit install
  ```

- [ ] **Step 3: Run against the full repo to check for any existing leaks**

  ```bash
  pre-commit run gitleaks --all-files
  ```

  Expected: clean (no secrets found). If any findings surface, review and remediate before committing.

- [ ] **Step 4: Commit**

  ```bash
  git add .pre-commit-config.yaml
  git commit -m "ci: add gitleaks secret-scanning to pre-commit hooks"
  ```



## Final Verification

- [ ] **Full lint and build pass**

  ```bash
  npm run lint && npm run build:production
  ```

  Expected: all checks pass, `dist/` contains no `.map` files and includes `sql-wasm.wasm`.

- [ ] **No `.map` files in dist**

  ```bash
  find dist -name "*.map" | wc -l   # must print 0
  ```

- [ ] **WASM is served locally**

  ```bash
  ls dist/sql-wasm.wasm   # must exist
  ```

- [ ] **Create a summary PR commit**

  ```bash
  git log --oneline   # review the individual commits
  ```

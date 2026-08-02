# Cloudflare Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the whole application off AWS onto Cloudflare's free tier — a single Worker serving the React SPA and a D1-backed API, images on R2 — and rename the project from `spyro-map` to `spyo-map`.

**Architecture:** One Worker serves the built SPA as static assets and handles `/api/*` against a D1 database. Image bytes are served directly from an R2 bucket on its own custom domain, never through the Worker. Ingestion runs in GitHub Actions: the existing extractor writes processed images to R2 over the S3-compatible API and upserts metadata to D1 over Cloudflare's REST API.

**Tech Stack:** Cloudflare Workers (static assets + `fetch` handler), Cloudflare D1, Cloudflare R2, Wrangler, React 19 + Vite 7 + Leaflet, TypeScript 5.9 strict, Jest 29 + ts-jest in ESM mode, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-02-cloudflare-migration-design.md`

## Global Constraints

- **Naming:** the project is `spyo-map` (one `r`), never `spyro-map`. Workspace scope is `@spyo-map/*`. Prose name is "Spyo Map".
- **Domains:** app at `https://spyo-map.isntall.net`, images at `https://spyo-map-img.isntall.net`.
- **Cloudflare resource names:** R2 bucket `spyo-map`, D1 database `spyo-map`.
- **Node:** 22. **TypeScript:** strict mode, all packages.
- **Tests:** Jest 29 + ts-jest, ESM mode, run via `node --experimental-vm-modules`. No second test runner — do not add Vitest or `@cloudflare/vitest-pool-workers`.
- **Test location:** `packages/<pkg>/tests/**/*.test.ts`. New logic ships with tests in the same commit.
- **Commits:** conventional, using exactly `feat`, `chore`, or `feat!`. Never commit to `main`; this work happens on the `cloudflare` branch.
- **AWS:** being removed permanently. Never add an AWS dependency, reference, or fallback back in.
- **Docker:** removed permanently. Do not add Dockerfiles or compose files.
- **`npm test` at the repo root must pass** at the end of every task.

---

### Task 1: Rename the workspace from `spyro-map` to `spyo-map`

Mechanical, repo-wide, and must be atomic — every import of `@spyro-map/shared` breaks until all of them change together.

**Files:**
- Modify: `package.json:2`
- Modify: `packages/shared/package.json:2`
- Modify: `packages/backend/package.json:2,15`
- Modify: `packages/frontend/package.json:2,14`
- Modify: `packages/extractor/package.json:2`
- Modify: `packages/smoke-test/package.json:2`
- Modify: `packages/backend/jest.config.mjs:7`
- Modify: `packages/frontend/jest.config.mjs:11,26`
- Modify: `packages/extractor/jest.config.mjs:7`
- Modify: `packages/backend/src/config.ts:3,7`
- Modify: `packages/backend/src/services/database.ts:6,10`
- Modify: `packages/backend/tests/routes.test.ts:4`
- Modify: `packages/frontend/src/types/index.ts:1`
- Modify: `packages/frontend/tests/ApiClient.test.ts:2`
- Modify: `packages/frontend/tests/nearbyGroup.test.ts:2`
- Modify: `packages/extractor/src/index.ts:6`
- Modify: `docker-compose.yml:27,28,40,44,70`
- Modify: `deploy.config.js:2`
- Modify: `CLAUDE.md:9`
- Modify: `README.md:122`

**Interfaces:**
- Consumes: nothing.
- Produces: the package scope `@spyo-map/shared`, imported by every other package for the rest of the plan.

- [x] **Step 1: Confirm the full set of occurrences before changing anything**

```bash
grep -rn "spyro-map\|Spyro" --exclude-dir=node_modules --exclude-dir=.git \
  --exclude-dir=dist --exclude-dir=.terragrunt-cache --exclude-dir=docs . \
  | grep -v package-lock.json
```

Expected: 30 lines across the files listed above. If a file appears that is not in the list, include it too — the list was captured before this task ran.

Note `docs/` is excluded deliberately: the spec is a historical document and keeps its original wording.

- [x] **Step 2: Rewrite every occurrence**

```bash
grep -rl "spyro-map\|Spyro" --exclude-dir=node_modules --exclude-dir=.git \
  --exclude-dir=dist --exclude-dir=.terragrunt-cache --exclude-dir=docs . \
  | grep -v package-lock.json \
  | xargs sed -i 's/spyro-map/spyo-map/g; s/Spyro Map/Spyo Map/g; s/Spyro/Spyo/g'
```

- [x] **Step 3: Verify nothing was missed**

```bash
grep -rn "spyro\|Spyro" --exclude-dir=node_modules --exclude-dir=.git \
  --exclude-dir=dist --exclude-dir=.terragrunt-cache --exclude-dir=docs . \
  | grep -v package-lock.json
```

Expected: no output.

- [x] **Step 4: Reinstall so the workspace symlinks point at the new scope**

Run: `rm -rf node_modules && npm install`
Expected: completes without `ENOWORKSPACES` or unresolved `@spyo-map/shared` errors. `package-lock.json` is rewritten — that is expected and should be committed.

- [x] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS in all packages. If any suite fails with "Cannot find module `@spyro-map/shared`", a `jest.config.mjs` `moduleNameMapper` was missed — fix and rerun.

- [x] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: rename spyro-map to spyo-map across the workspace"
```

---

### Task 2: Remove AWS infrastructure, Docker, and the AWS deploy workflow

Deletion only. Nothing here is replaced yet, so the repo has no deployment path between this task and Task 11 — that is intended.

**Files:**
- Delete: `infra/` (whole tree, including `infra/bootstrap.sh`)
- Delete: `docker-compose.yml`
- Delete: `packages/backend/Dockerfile`
- Delete: `packages/frontend/Dockerfile`
- Delete: `packages/extractor/Dockerfile`
- Delete: `.github/workflows/deploy-app.yml`
- Delete: `docs/runbooks/aws-bootstrap.md`
- Delete: `docs/superpowers/specs/2026-04-20-aws-deployment-design.md` (the superseded AWS design spec)
- Delete: `deploy.config.js`
- Delete: `scripts/validate-build.js` (only if it references `deploy.config.js` — check first)
- Modify: `.gitignore` (drop the `# Terra*` section and `extract.sh`)
- Modify: `mise.toml` (drop the `terraform` and `terragrunt` pins)

**Interfaces:**
- Consumes: Task 1's rename (so deleted files don't reappear in a later rename sweep).
- Produces: nothing.

- [x] **Step 1: Check whether `scripts/validate-build.js` depends on `deploy.config.js`**

Run: `grep -n "deploy.config" scripts/validate-build.js`
If it matches, delete the script too. If it does not, keep it and drop it from the delete list.

- [x] **Step 2: Check whether anything else references the files being deleted**

```bash
grep -rn "docker-compose\|Dockerfile\|deploy.config\|infra/\|terragrunt\|terraform" \
  --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=infra \
  --exclude-dir=docs . | grep -v package-lock.json
```

Expected matches only in `README.md`, `CLAUDE.md`, `.gitignore`, and `mise.toml`. `README.md` and `CLAUDE.md` are rewritten in Task 12 — leave them for now and note that Task 12 depends on this.

- [x] **Step 3: Delete**

```bash
git rm -r --quiet infra docs/runbooks/aws-bootstrap.md
git rm --quiet docker-compose.yml deploy.config.js \
  packages/backend/Dockerfile packages/frontend/Dockerfile packages/extractor/Dockerfile \
  .github/workflows/deploy-app.yml
rm -f extract.sh
```

`extract.sh` is gitignored and untracked, so `rm` rather than `git rm`.

- [x] **Step 4: Trim `.gitignore`**

Remove these final lines:

```
# Terra*
.terraform*
.terragrunt*
extract.sh
```

- [x] **Step 5: Trim `mise.toml`**

Remove the `terraform` and `terragrunt` entries from `[tools]`. Leave `node` and anything else untouched.

- [x] **Step 6: Verify the workspace still builds and tests**

Run: `npm test`
Expected: PASS. Nothing deleted was imported by source code.

- [x] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: remove AWS infrastructure, Docker, and the AWS deploy workflow"
```

---

### Task 3: Convert `packages/backend` into `packages/worker` with a D1-backed query layer

The rename and the storage-layer swap are one deliverable: the package cannot compile with Fastify removed and `better-sqlite3` still in place.

The three query helpers already take their database as a parameter and are pure apart from it, so this is a narrow change: the first parameter becomes a `D1Database`, the functions become `async`, and the SQL text is unchanged. `rowToRecord` and `haversineKm` are untouched.

**Files:**
- Rename: `packages/backend/` → `packages/worker/` (via `git mv`)
- Modify: `packages/worker/package.json`
- Modify: `packages/worker/tsconfig.json`
- Modify: `packages/worker/jest.config.mjs`
- Rewrite: `packages/worker/src/services/database.ts`
- Create: `packages/worker/src/env.ts`
- Delete: `packages/worker/src/server.ts`
- Delete: `packages/worker/src/config.ts`
- Delete: `packages/worker/src/routes/images.ts` (replaced in Task 4)
- Delete: `packages/worker/tests/routes.test.ts` (replaced in Task 4)
- Create: `packages/worker/tests/database.test.ts`
- Keep unchanged: `packages/worker/src/utils.ts`

**Interfaces:**
- Consumes: `ImageRecord` from `@spyo-map/shared`; `haversineKm` from `./utils.js`.
- Produces:
  - `interface Env { DB: D1Database; ASSETS: Fetcher; IMAGES_BASE_URL: string }` from `src/env.ts`
  - `rowToRecord(row: Record<string, unknown>, baseUrl: string): ImageRecord`
  - `queryAllImages(db: D1Database, baseUrl: string): Promise<ImageRecord[]>`
  - `queryImageById(db: D1Database, id: string, baseUrl: string): Promise<ImageRecord | null>`
  - `queryNearbyImages(db: D1Database, id: string, lat: number, lon: number, radiusKm: number, baseUrl: string): Promise<ImageRecord[]>`

  Task 4 calls all four.

- [ ] **Step 1: Move the package and drop the dead files**

```bash
git mv packages/backend packages/worker
git rm --quiet packages/worker/src/server.ts packages/worker/src/config.ts \
  packages/worker/src/routes/images.ts packages/worker/tests/routes.test.ts
rmdir packages/worker/src/routes
```

- [ ] **Step 2: Rewrite `packages/worker/package.json`**

```json
{
  "name": "@spyo-map/worker",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "typecheck": "tsc --noEmit",
    "test": "node --experimental-vm-modules ../../node_modules/.bin/jest --passWithNoTests"
  },
  "dependencies": {
    "@spyo-map/shared": "*"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20250109.0",
    "@types/jest": "^29.0.0",
    "jest": "^29.0.0",
    "ts-jest": "^29.0.0",
    "typescript": "~5.9.3",
    "wrangler": "^4.0.0"
  }
}
```

`fastify`, `@fastify/cors`, `better-sqlite3`, `@types/better-sqlite3`, `@aws-sdk/client-s3`, `@types/node`, and `tsx` are all gone. There is no `build` script — `wrangler deploy` bundles the Worker itself.

- [ ] **Step 3: Rewrite `packages/worker/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "rootDir": "src",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "verbatimModuleSyntax": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noEmit": true,
    "types": ["@cloudflare/workers-types"]
  },
  "include": ["src"]
}
```

`outDir` is gone because the Worker is bundled by Wrangler, not `tsc`. `types` replaces `@types/node` — the Workers runtime is not Node.

- [ ] **Step 4: Create `packages/worker/src/env.ts`**

```typescript
import type { D1Database, Fetcher } from "@cloudflare/workers-types";

export interface Env {
  /** D1 binding declared in wrangler.toml */
  DB: D1Database;
  /** Static-assets binding declared in wrangler.toml */
  ASSETS: Fetcher;
  /** Public base URL for image objects, e.g. https://spyo-map-img.isntall.net */
  IMAGES_BASE_URL: string;
}
```

- [ ] **Step 5: Write the failing tests**

Create `packages/worker/tests/database.test.ts`. The fake mimics D1's real shape: `prepare(sql)` returns a statement, `bind(...params)` returns the same statement, and `all()` resolves to `{ results }`.

```typescript
import { describe, it, expect } from '@jest/globals';
import {
  rowToRecord,
  queryAllImages,
  queryImageById,
  queryNearbyImages,
} from '../src/services/database.js';
import type { D1Database } from '@cloudflare/workers-types';

const BASE_URL = 'https://img.test';

interface Call {
  sql: string;
  params: unknown[];
}

/** Minimal stand-in for D1Database that records calls and replays fixed rows. */
function fakeD1(rows: Array<Record<string, unknown>>): {
  db: D1Database;
  calls: Call[];
} {
  const calls: Call[] = [];
  const db = {
    prepare(sql: string) {
      const call: Call = { sql, params: [] };
      calls.push(call);
      const stmt = {
        bind(...params: unknown[]) {
          call.params = params;
          return stmt;
        },
        all: async () => ({ results: rows }),
        first: async () => rows[0] ?? null,
      };
      return stmt;
    },
  } as unknown as D1Database;
  return { db, calls };
}

const ROW_A = {
  id: 'a',
  path: 'a.jpg',
  latitude: 51.5,
  longitude: -0.12,
  timestamp: '2024-01-01T00:00:00.000Z',
  latitude_ref: 'N',
  longitude_ref: 'W',
  altitude_ref: null,
  altitude: null,
  speed_ref: null,
  speed: null,
  img_direction_ref: null,
  img_direction: null,
  dest_bearing_ref: null,
  dest_bearing: null,
  h_positioning_error: null,
};

// ~1.1 km north of ROW_A
const ROW_NEAR = { ...ROW_A, id: 'near', latitude: 51.51, longitude: -0.12 };
// ~111 km north of ROW_A
const ROW_FAR = { ...ROW_A, id: 'far', latitude: 52.5, longitude: -0.12 };

describe('rowToRecord', () => {
  it('builds absolute image URLs from the base URL and id', () => {
    const record = rowToRecord(ROW_A, BASE_URL);
    expect(record.imageUrl).toBe('https://img.test/images/a.jpg');
    expect(record.thumbnailUrl).toBe('https://img.test/images/thumbnails/a.jpg');
  });

  it('includes optional EXIF fields only when present', () => {
    const record = rowToRecord(ROW_A, BASE_URL);
    expect(record.latitudeRef).toBe('N');
    expect(record).not.toHaveProperty('altitude');
  });

  it('coerces a null timestamp to an empty string', () => {
    const record = rowToRecord({ ...ROW_A, timestamp: null }, BASE_URL);
    expect(record.timestamp).toBe('');
  });
});

describe('queryAllImages', () => {
  it('returns a record per row', async () => {
    const { db } = fakeD1([ROW_A, ROW_NEAR]);
    const records = await queryAllImages(db, BASE_URL);
    expect(records.map((r) => r.id)).toEqual(['a', 'near']);
  });

  it('selects every image', async () => {
    const { db, calls } = fakeD1([]);
    await queryAllImages(db, BASE_URL);
    expect(calls[0]!.sql).toBe('SELECT * FROM images');
  });
});

describe('queryImageById', () => {
  it('binds the id as a parameter', async () => {
    const { db, calls } = fakeD1([ROW_A]);
    await queryImageById(db, 'a', BASE_URL);
    expect(calls[0]!.sql).toBe('SELECT * FROM images WHERE id = ?');
    expect(calls[0]!.params).toEqual(['a']);
  });

  it('returns the record when found', async () => {
    const { db } = fakeD1([ROW_A]);
    expect((await queryImageById(db, 'a', BASE_URL))?.id).toBe('a');
  });

  it('returns null when not found', async () => {
    const { db } = fakeD1([]);
    expect(await queryImageById(db, 'missing', BASE_URL)).toBeNull();
  });
});

describe('queryNearbyImages', () => {
  it('excludes the origin image from the query', async () => {
    const { db, calls } = fakeD1([]);
    await queryNearbyImages(db, 'a', 51.5, -0.12, 1, BASE_URL);
    expect(calls[0]!.sql).toBe('SELECT * FROM images WHERE id != ?');
    expect(calls[0]!.params).toEqual(['a']);
  });

  it('keeps only images inside the radius', async () => {
    const { db } = fakeD1([ROW_NEAR, ROW_FAR]);
    const records = await queryNearbyImages(db, 'a', 51.5, -0.12, 5, BASE_URL);
    expect(records.map((r) => r.id)).toEqual(['near']);
  });

  it('sorts results nearest first', async () => {
    const { db } = fakeD1([ROW_FAR, ROW_NEAR]);
    const records = await queryNearbyImages(db, 'a', 51.5, -0.12, 500, BASE_URL);
    expect(records.map((r) => r.id)).toEqual(['near', 'far']);
  });
});
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `npm test --workspace=packages/worker`
Expected: FAIL — `packages/worker/src/services/database.ts` still imports `better-sqlite3` and `@aws-sdk/client-s3`, which are no longer installed.

- [ ] **Step 7: Rewrite `packages/worker/src/services/database.ts`**

Replace the file entirely. Everything above the `// --- Exported testable helpers` marker in the old file (the S3 client, `downloadDb`, `openDb`, `initDatabase`, `reloadDatabase`, `getDb`, the module-level `db` singleton) is deleted, as are the three no-argument public wrappers at the bottom.

```typescript
import type { D1Database } from "@cloudflare/workers-types";
import type { ImageRecord } from "@spyo-map/shared";
import { haversineKm } from "../utils.js";

export function rowToRecord(row: Record<string, unknown>, baseUrl: string): ImageRecord {
  const id = row.id as string;
  return {
    id,
    imageUrl: `${baseUrl}/images/${id}.jpg`,
    thumbnailUrl: `${baseUrl}/images/thumbnails/${id}.jpg`,
    latitude: row.latitude as number,
    longitude: row.longitude as number,
    timestamp: (row.timestamp as string | null) ?? "",
    ...(row.latitude_ref != null ? { latitudeRef: row.latitude_ref as string } : {}),
    ...(row.longitude_ref != null ? { longitudeRef: row.longitude_ref as string } : {}),
    ...(row.altitude_ref != null ? { altitudeRef: String(row.altitude_ref) } : {}),
    ...(row.altitude != null ? { altitude: row.altitude as number } : {}),
    ...(row.speed_ref != null ? { speedRef: row.speed_ref as string } : {}),
    ...(row.speed != null ? { speed: row.speed as number } : {}),
    ...(row.img_direction_ref != null ? { imgDirectionRef: row.img_direction_ref as string } : {}),
    ...(row.img_direction != null ? { imgDirection: row.img_direction as number } : {}),
    ...(row.dest_bearing_ref != null ? { destBearingRef: row.dest_bearing_ref as string } : {}),
    ...(row.dest_bearing != null ? { destBearing: row.dest_bearing as number } : {}),
    ...(row.h_positioning_error != null
      ? { hPositioningError: row.h_positioning_error as number }
      : {}),
  };
}

export async function queryAllImages(db: D1Database, baseUrl: string): Promise<ImageRecord[]> {
  const { results } = await db.prepare("SELECT * FROM images").all<Record<string, unknown>>();
  return results.map((row) => rowToRecord(row, baseUrl));
}

export async function queryImageById(
  db: D1Database,
  id: string,
  baseUrl: string,
): Promise<ImageRecord | null> {
  const { results } = await db
    .prepare("SELECT * FROM images WHERE id = ?")
    .bind(id)
    .all<Record<string, unknown>>();
  const row = results[0];
  return row ? rowToRecord(row, baseUrl) : null;
}

export async function queryNearbyImages(
  db: D1Database,
  id: string,
  lat: number,
  lon: number,
  radiusKm: number,
  baseUrl: string,
): Promise<ImageRecord[]> {
  const { results } = await db
    .prepare("SELECT * FROM images WHERE id != ?")
    .bind(id)
    .all<Record<string, unknown>>();

  return results
    .map((row) => ({
      record: rowToRecord(row, baseUrl),
      dist: haversineKm(lat, lon, row.latitude as number, row.longitude as number),
    }))
    .filter(({ dist }) => dist <= radiusKm)
    .sort((a, b) => a.dist - b.dist)
    .map(({ record }) => record);
}
```

- [ ] **Step 8: Update `packages/worker/jest.config.mjs`**

Only the `moduleNameMapper` needs a new entry so the fake's type import resolves at transform time. Add to the existing map:

```javascript
    '^@cloudflare/workers-types$': '<rootDir>/../../node_modules/@cloudflare/workers-types/index.d.ts',
```

If Jest still errors on that import, delete the mapping instead and change the test file's import to a local type alias — `isolatedModules: true` erases types, so the import exists only to satisfy the editor.

- [ ] **Step 9: Install the new dependency set**

Run: `npm install`
Expected: `fastify`, `better-sqlite3`, and `@aws-sdk/client-s3` disappear from `packages/worker`; `wrangler` and `@cloudflare/workers-types` appear.

- [ ] **Step 10: Run the tests to verify they pass**

Run: `npm test --workspace=packages/worker`
Expected: PASS, 11 tests.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat!: replace the Fastify backend with a D1-backed worker query layer"
```

---

### Task 4: Worker `fetch` handler and API router

**Files:**
- Create: `packages/worker/src/router.ts`
- Create: `packages/worker/src/index.ts`
- Create: `packages/worker/tests/router.test.ts`

**Interfaces:**
- Consumes: `Env` from `src/env.ts`; `queryAllImages`, `queryImageById`, `queryNearbyImages` from `src/services/database.js` (Task 3).
- Produces:
  - `handleApiRequest(request: Request, env: Env): Promise<Response>` from `src/router.ts` — Task 5's `wrangler.toml` points its `main` at `src/index.ts`, which wraps this.

**Route contract** (unchanged from the Fastify implementation, except that `POST /api/reload` no longer exists):

| Method + path                        | Response                                        |
| ------------------------------------ | ----------------------------------------------- |
| `GET /api/health`                    | 200 `{ "status": "ok" }`                        |
| `GET /api/images`                    | 200 `ImageRecord[]`                             |
| `GET /api/images/:id`                | 200 `ImageRecord`, or 404 `{ "error": "Not found" }` |
| `GET /api/images/:id/nearby?radius=` | 200 `ImageRecord[]`; 404 if the id is unknown; 400 `{ "error": "Invalid radius" }` if `radius` is not a non-negative number. Default radius 1. |
| anything else under `/api/`          | 404 `{ "error": "Not found" }`                  |

- [ ] **Step 1: Write the failing tests**

Create `packages/worker/tests/router.test.ts`:

```typescript
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
}));

const { handleApiRequest } = await import('../src/router.js');

const FIXTURE: ImageRecord = {
  id: 'abc',
  imageUrl: 'https://img.test/images/abc.jpg',
  thumbnailUrl: 'https://img.test/images/thumbnails/abc.jpg',
  latitude: 51.5,
  longitude: -0.12,
  timestamp: '2024-01-01T00:00:00.000Z',
};

const DB = { marker: 'db' };
const env = { DB, ASSETS: {}, IMAGES_BASE_URL: 'https://img.test' } as never;

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
    expect(mockQueryAll).toHaveBeenCalledWith(DB, 'https://img.test');
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
    expect(mockQueryById).toHaveBeenCalledWith(DB, 'a/b', 'https://img.test');
  });
});

describe('GET /api/images/:id/nearby', () => {
  it('defaults the radius to 1 km', async () => {
    mockQueryById.mockResolvedValue(FIXTURE);
    mockQueryNearby.mockResolvedValue([FIXTURE]);
    const res = await handleApiRequest(get('/api/images/abc/nearby'), env);
    expect(res.status).toBe(200);
    expect(mockQueryNearby).toHaveBeenCalledWith(DB, 'abc', 51.5, -0.12, 1, 'https://img.test');
  });

  it('respects an explicit radius', async () => {
    mockQueryById.mockResolvedValue(FIXTURE);
    mockQueryNearby.mockResolvedValue([]);
    await handleApiRequest(get('/api/images/abc/nearby?radius=5'), env);
    expect(mockQueryNearby).toHaveBeenCalledWith(DB, 'abc', 51.5, -0.12, 5, 'https://img.test');
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test --workspace=packages/worker -- router`
Expected: FAIL — `Cannot find module '../src/router.js'`.

- [ ] **Step 3: Write `packages/worker/src/router.ts`**

```typescript
import type { Env } from "./env.js";
import {
  queryAllImages,
  queryImageById,
  queryNearbyImages,
} from "./services/database.js";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

const notFound = (): Response => json({ error: "Not found" }, 404);

export async function handleApiRequest(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") {
    return json({ error: "Method not allowed" }, 405);
  }

  const url = new URL(request.url);
  // "/api/images/abc/nearby" -> ["api", "images", "abc", "nearby"]
  const segments = url.pathname.split("/").filter(Boolean);
  const [, resource, rawId, action] = segments;

  if (segments.length === 2 && resource === "health") {
    return json({ status: "ok" });
  }

  if (resource !== "images") return notFound();

  if (segments.length === 2) {
    return json(await queryAllImages(env.DB, env.IMAGES_BASE_URL));
  }

  if (rawId === undefined) return notFound();
  const id = decodeURIComponent(rawId);

  if (segments.length === 3) {
    const image = await queryImageById(env.DB, id, env.IMAGES_BASE_URL);
    return image ? json(image) : notFound();
  }

  if (segments.length === 4 && action === "nearby") {
    const image = await queryImageById(env.DB, id, env.IMAGES_BASE_URL);
    if (!image) return notFound();

    const radius = parseFloat(url.searchParams.get("radius") ?? "1");
    if (isNaN(radius) || radius < 0) {
      return json({ error: "Invalid radius" }, 400);
    }

    return json(
      await queryNearbyImages(
        env.DB,
        id,
        image.latitude,
        image.longitude,
        radius,
        env.IMAGES_BASE_URL,
      ),
    );
  }

  return notFound();
}
```

- [ ] **Step 4: Write `packages/worker/src/index.ts`**

Assets are served through the `ASSETS` binding rather than by Wrangler's automatic asset routing, so `/api/*` is unambiguously the Worker's and SPA fallback is unambiguously the binding's.

```typescript
import type { Env } from "./env.js";
import { handleApiRequest } from "./router.js";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      return handleApiRequest(request, env);
    }

    // Static assets; unmatched paths fall back to index.html
    // (not_found_handling = "single-page-application" in wrangler.toml).
    return env.ASSETS.fetch(request) as unknown as Promise<Response>;
  },
};
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test --workspace=packages/worker`
Expected: PASS, 25 tests across both files (11 from `database.test.ts`, 14 from `router.test.ts`).

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck --workspace=packages/worker`
Expected: no output, exit 0.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add the worker fetch handler and API router"
```

---

### Task 5: Wrangler configuration and the D1 schema migration

**Files:**
- Create: `packages/worker/wrangler.toml`
- Create: `packages/worker/migrations/0001_create_images.sql`
- Create: `packages/worker/.gitignore`
- Modify: `.gitignore` (repo root)

**Interfaces:**
- Consumes: `packages/worker/src/index.ts` (Task 4) as the Worker entrypoint.
- Produces: the bindings `DB`, `ASSETS`, and the var `IMAGES_BASE_URL` that `Env` (Task 3) declares; the `images` table schema that Task 6's extractor writes to.

- [ ] **Step 1: Create the schema migration**

`packages/worker/migrations/0001_create_images.sql` — identical to the schema the old `packages/extractor/src/database.ts` created at runtime:

```sql
CREATE TABLE IF NOT EXISTS images (
  id TEXT PRIMARY KEY,
  path TEXT,
  latitude REAL,
  longitude REAL,
  timestamp TEXT,
  latitude_ref TEXT,
  longitude_ref TEXT,
  altitude_ref TEXT,
  altitude REAL,
  speed_ref TEXT,
  speed REAL,
  img_direction_ref TEXT,
  img_direction REAL,
  dest_bearing_ref TEXT,
  dest_bearing REAL,
  h_positioning_error REAL
);

CREATE INDEX IF NOT EXISTS idx_location ON images(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_timestamp ON images(timestamp);
```

- [ ] **Step 2: Create `packages/worker/wrangler.toml`**

`database_id` is filled in during the bootstrap in Task 10; leave the placeholder string exactly as written so it is obvious when it has not been set.

```toml
name = "spyo-map"
main = "src/index.ts"
compatibility_date = "2026-08-01"
compatibility_flags = ["nodejs_compat"]

routes = [
  { pattern = "spyo-map.isntall.net", custom_domain = true }
]

[vars]
IMAGES_BASE_URL = "https://spyo-map-img.isntall.net"

[assets]
directory = "../frontend/dist"
binding = "ASSETS"
not_found_handling = "single-page-application"
# Without this, the asset router answers /api/* with index.html (SPA fallback)
# before the Worker ever runs.
run_worker_first = ["/api/*"]

[[d1_databases]]
binding = "DB"
database_name = "spyo-map"
database_id = "REPLACE_WITH_D1_DATABASE_ID"
migrations_dir = "migrations"
```

- [ ] **Step 3: Ignore Wrangler's local state**

Create `packages/worker/.gitignore`:

```
.wrangler/
```

- [ ] **Step 4: Verify the config parses and the Worker bundles**

Run: `npx wrangler deploy --dry-run --config packages/worker/wrangler.toml`
Expected: reports the bundled Worker size and the `DB` / `ASSETS` bindings, then exits without uploading. It will warn that `../frontend/dist` does not exist unless the frontend has been built — build it first with `npm run build` if so.

A `database_id` error at this stage is expected and fine; the dry run still validates the rest.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add wrangler config and the D1 schema migration"
```

---

### Task 6: Extractor — D1 HTTP client

The extractor runs in Node (GitHub Actions), not in a Worker, so it has no D1 binding. It talks to D1 over Cloudflare's REST API instead.

**Files:**
- Create: `packages/extractor/src/d1.ts`
- Create: `packages/extractor/tests/d1.test.ts`
- Delete: `packages/extractor/src/database.ts`
- Delete: `packages/extractor/tests/database.test.ts`
- Modify: `packages/extractor/src/config.ts`
- Modify: `packages/extractor/package.json`

**Interfaces:**
- Consumes: `ExifData` from `./processor.js`.
- Produces, from `src/d1.ts` — Task 7 calls all of these:
  - `interface D1Client { query(sql: string, params?: unknown[]): Promise<Array<Record<string, unknown>>> }`
  - `createD1Client(config: Config): D1Client`
  - `fetchExistingIds(client: D1Client): Promise<Set<string>>`
  - `interface ImageInsert { id: string; path: string; exif: ExifData }`
  - `upsertImages(client: D1Client, rows: ImageInsert[]): Promise<void>`
- Also produces, from `src/config.ts`: `Config` gains `cloudflareAccountId: string`, `cloudflareApiToken: string`, `d1DatabaseId: string` — all required.

**API shape.** `POST https://api.cloudflare.com/client/v4/accounts/{accountId}/d1/database/{databaseId}/query` with header `Authorization: Bearer {token}` and body `{ "sql": "...", "params": [...] }`. A success response is `{ "success": true, "result": [ { "results": [...], "success": true } ] }`; a failure is `{ "success": false, "errors": [ { "code": n, "message": "..." } ] }`.

- [ ] **Step 1: Write the failing tests**

Create `packages/extractor/tests/d1.test.ts`:

```typescript
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import {
  createD1Client,
  fetchExistingIds,
  upsertImages,
  type D1Client,
  type ImageInsert,
} from '../src/d1.js';
import type { Config } from '../src/config.js';
import type { ExifData } from '../src/processor.js';

const CONFIG: Config = {
  storageEndpoint: 'https://acct.r2.cloudflarestorage.com',
  storageBucket: 'spyo-map',
  storageAccessKey: 'key',
  storageSecretKey: 'secret',
  storageRegion: 'auto',
  localSourcePath: undefined,
  cloudflareAccountId: 'acct123',
  cloudflareApiToken: 'token123',
  d1DatabaseId: 'db123',
};

const EXIF: ExifData = { latitude: 51.5, longitude: -0.12 };

function okResponse(results: unknown[]): Response {
  return new Response(
    JSON.stringify({ success: true, result: [{ results, success: true }] }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

/** Records every query a client makes, and replays canned row sets. */
function fakeClient(rows: Array<Record<string, unknown>> = []): {
  client: D1Client;
  calls: Array<{ sql: string; params: unknown[] }>;
} {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const client: D1Client = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      return rows;
    },
  };
  return { client, calls };
}

describe('createD1Client', () => {
  let mockFetch: jest.Mock;

  beforeEach(() => {
    mockFetch = jest.fn();
    globalThis.fetch = mockFetch as unknown as typeof fetch;
  });

  it('posts to the account and database specific endpoint', async () => {
    mockFetch.mockResolvedValue(okResponse([]));
    await createD1Client(CONFIG).query('SELECT 1');
    expect(mockFetch.mock.calls[0]![0]).toBe(
      'https://api.cloudflare.com/client/v4/accounts/acct123/d1/database/db123/query',
    );
  });

  it('sends the API token as a bearer credential', async () => {
    mockFetch.mockResolvedValue(okResponse([]));
    await createD1Client(CONFIG).query('SELECT 1');
    const init = mockFetch.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer token123');
    expect(init.method).toBe('POST');
  });

  it('sends sql and params in the body', async () => {
    mockFetch.mockResolvedValue(okResponse([]));
    await createD1Client(CONFIG).query('SELECT * FROM images WHERE id = ?', ['abc']);
    const init = mockFetch.mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({
      sql: 'SELECT * FROM images WHERE id = ?',
      params: ['abc'],
    });
  });

  it('returns the rows from the first result block', async () => {
    mockFetch.mockResolvedValue(okResponse([{ id: 'a' }, { id: 'b' }]));
    const rows = await createD1Client(CONFIG).query('SELECT id FROM images');
    expect(rows).toEqual([{ id: 'a' }, { id: 'b' }]);
  });

  it('throws with the API error message when the call fails', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({ success: false, errors: [{ code: 7500, message: 'no such table' }] }),
        { status: 400 },
      ),
    );
    await expect(createD1Client(CONFIG).query('SELECT 1')).rejects.toThrow('no such table');
  });

  it('throws on a non-JSON transport failure', async () => {
    mockFetch.mockResolvedValue(new Response('gateway timeout', { status: 504 }));
    await expect(createD1Client(CONFIG).query('SELECT 1')).rejects.toThrow('504');
  });
});

describe('fetchExistingIds', () => {
  it('selects only the id column', async () => {
    const { client, calls } = fakeClient([]);
    await fetchExistingIds(client);
    expect(calls[0]!.sql).toBe('SELECT id FROM images');
  });

  it('returns the ids as a set', async () => {
    const { client } = fakeClient([{ id: 'a' }, { id: 'b' }]);
    expect(await fetchExistingIds(client)).toEqual(new Set(['a', 'b']));
  });

  it('returns an empty set for an empty table', async () => {
    const { client } = fakeClient([]);
    expect((await fetchExistingIds(client)).size).toBe(0);
  });
});

describe('upsertImages', () => {
  const row = (id: string): ImageInsert => ({ id, path: `${id}.jpg`, exif: EXIF });

  it('issues no query for an empty batch', async () => {
    const { client, calls } = fakeClient();
    await upsertImages(client, []);
    expect(calls).toHaveLength(0);
  });

  it('writes all rows of a small batch in one statement', async () => {
    const { client, calls } = fakeClient();
    await upsertImages(client, [row('a'), row('b')]);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.sql).toMatch(/^INSERT INTO images/);
    expect(calls[0]!.sql).toMatch(/ON CONFLICT\(id\) DO UPDATE/);
  });

  it('binds sixteen parameters per row, id first', async () => {
    const { client, calls } = fakeClient();
    await upsertImages(client, [row('a'), row('b')]);
    expect(calls[0]!.params).toHaveLength(32);
    expect(calls[0]!.params[0]).toBe('a');
    expect(calls[0]!.params[16]).toBe('b');
  });

  it('maps absent EXIF fields to null rather than undefined', async () => {
    const { client, calls } = fakeClient();
    await upsertImages(client, [row('a')]);
    // [id, path, latitude, longitude, timestamp, ...]
    expect(calls[0]!.params[4]).toBeNull();
    expect(calls[0]!.params.every((p) => p !== undefined)).toBe(true);
  });

  it('splits batches larger than twenty rows', async () => {
    const { client, calls } = fakeClient();
    await upsertImages(
      client,
      Array.from({ length: 45 }, (_, i) => row(`id${i}`)),
    );
    expect(calls).toHaveLength(3);
    expect(calls[0]!.params).toHaveLength(20 * 16);
    expect(calls[2]!.params).toHaveLength(5 * 16);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test --workspace=packages/extractor -- d1`
Expected: FAIL — `Cannot find module '../src/d1.js'`.

- [ ] **Step 3: Add the Cloudflare fields to `packages/extractor/src/config.ts`**

Extend the interface and `loadConfig`. `requireEnv` already exists in the file; reuse it. Change the `storageRegion` default from `'us-east-1'` to `'auto'` — R2's region is always `auto`.

```typescript
export interface Config {
  storageEndpoint: string | undefined;
  storageBucket: string;
  storageAccessKey: string | undefined;
  storageSecretKey: string | undefined;
  storageRegion: string;
  localSourcePath: string | undefined;
  cloudflareAccountId: string;
  cloudflareApiToken: string;
  d1DatabaseId: string;
}

export function loadConfig(): Config {
  return {
    storageEndpoint: process.env['STORAGE_ENDPOINT'] || undefined,
    storageBucket: requireEnv('STORAGE_BUCKET'),
    storageAccessKey: process.env['STORAGE_ACCESS_KEY'] || undefined,
    storageSecretKey: process.env['STORAGE_SECRET_KEY'] || undefined,
    storageRegion: process.env['STORAGE_REGION'] ?? 'auto',
    localSourcePath: process.env['LOCAL_SOURCE_PATH'] || undefined,
    cloudflareAccountId: requireEnv('CLOUDFLARE_ACCOUNT_ID'),
    cloudflareApiToken: requireEnv('CLOUDFLARE_API_TOKEN'),
    d1DatabaseId: requireEnv('D1_DATABASE_ID'),
  };
}
```

- [ ] **Step 4: Write `packages/extractor/src/d1.ts`**

```typescript
import type { Config } from './config.js';
import type { ExifData } from './processor.js';

/** Rows are written in chunks; 20 x 16 = 320 bind parameters, well under SQLite's limit. */
const BATCH_SIZE = 20;

const COLUMNS = [
  'id',
  'path',
  'latitude',
  'longitude',
  'timestamp',
  'latitude_ref',
  'longitude_ref',
  'altitude_ref',
  'altitude',
  'speed_ref',
  'speed',
  'img_direction_ref',
  'img_direction',
  'dest_bearing_ref',
  'dest_bearing',
  'h_positioning_error',
] as const;

export interface D1Client {
  query(sql: string, params?: unknown[]): Promise<Array<Record<string, unknown>>>;
}

export interface ImageInsert {
  id: string;
  path: string;
  exif: ExifData;
}

interface D1Response {
  success?: boolean;
  errors?: Array<{ code: number; message: string }>;
  result?: Array<{ results?: Array<Record<string, unknown>> }>;
}

export function createD1Client(config: Config): D1Client {
  const url =
    `https://api.cloudflare.com/client/v4/accounts/${config.cloudflareAccountId}` +
    `/d1/database/${config.d1DatabaseId}/query`;

  return {
    async query(sql, params = []) {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.cloudflareApiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sql, params }),
      });

      let body: D1Response;
      try {
        body = (await response.json()) as D1Response;
      } catch {
        throw new Error(`D1 request failed with HTTP ${response.status}`);
      }

      if (!body.success) {
        const message = body.errors?.map((e) => e.message).join('; ') ?? `HTTP ${response.status}`;
        throw new Error(`D1 query failed: ${message}`);
      }

      return body.result?.[0]?.results ?? [];
    },
  };
}

export async function fetchExistingIds(client: D1Client): Promise<Set<string>> {
  const rows = await client.query('SELECT id FROM images');
  return new Set(rows.map((row) => row['id'] as string));
}

function toParams(row: ImageInsert): unknown[] {
  const { exif } = row;
  return [
    row.id,
    row.path,
    exif.latitude,
    exif.longitude,
    exif.timestamp ?? null,
    exif.latitudeRef ?? null,
    exif.longitudeRef ?? null,
    exif.altitudeRef ?? null,
    exif.altitude ?? null,
    exif.speedRef ?? null,
    exif.speed ?? null,
    exif.imgDirectionRef ?? null,
    exif.imgDirection ?? null,
    exif.destBearingRef ?? null,
    exif.destBearing ?? null,
    exif.hPositioningError ?? null,
  ];
}

export async function upsertImages(client: D1Client, rows: ImageInsert[]): Promise<void> {
  const updates = COLUMNS.filter((c) => c !== 'id')
    .map((c) => `${c} = excluded.${c}`)
    .join(', ');
  const placeholders = `(${COLUMNS.map(() => '?').join(', ')})`;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const sql =
      `INSERT INTO images (${COLUMNS.join(', ')}) VALUES ` +
      chunk.map(() => placeholders).join(', ') +
      ` ON CONFLICT(id) DO UPDATE SET ${updates}`;
    await client.query(sql, chunk.flatMap(toParams));
  }
}
```

- [ ] **Step 5: Remove the SQLite database module and its tests**

```bash
git rm --quiet packages/extractor/src/database.ts packages/extractor/tests/database.test.ts
```

They are replaced by `d1.ts` and `d1.test.ts`. Task 7 removes the last imports of `database.js`.

- [ ] **Step 6: Drop `better-sqlite3` from the extractor**

In `packages/extractor/package.json`, remove `better-sqlite3` from `dependencies` and `@types/better-sqlite3` from `devDependencies`. Keep `sharp`, `exifr`, and `@aws-sdk/client-s3`.

Run: `npm install`

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm test --workspace=packages/extractor -- d1`
Expected: PASS, 14 tests. The extractor's other suites will fail to compile until Task 7 — that is expected and why this step scopes to `d1`.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add a D1 HTTP client to the extractor"
```

---

### Task 7: Extractor — write to D1 and R2 instead of SQLite and S3

`runExtractor` currently downloads `images.db`, opens it with `better-sqlite3`, inserts row by row, uploads the file, and then deletes the consumed `raw/` objects. It becomes: fetch the known ids, accumulate new rows in memory, upsert them, then delete.

The ordering invariant is preserved exactly — **metadata is committed before any `raw/` object is deleted**, so a failure never loses a photo.

**Files:**
- Modify: `packages/extractor/src/extractor.ts`
- Modify: `packages/extractor/src/index.ts`
- Modify: `packages/extractor/tests/storage.test.ts` (only if it asserts the old region default)
- Create: `packages/extractor/tests/extractor.test.ts`

**Interfaces:**
- Consumes: `createD1Client`, `fetchExistingIds`, `upsertImages`, `ImageInsert`, `D1Client` from `./d1.js` (Task 6); `Config` from `./config.js`; the existing `getObject`, `putObject`, `deleteObject`, `listObjects` from `./storage.js`; `extractExif`, `processImage` from `./processor.js`.
- Produces: `runExtractor(config: Config, s3: S3Client, d1: D1Client): Promise<void>` — note the added third parameter.

- [ ] **Step 1: Write the failing tests**

Create `packages/extractor/tests/extractor.test.ts`. This covers the orchestration contract that has no coverage today, which is where the regression risk lives.

```typescript
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { Config } from '../src/config.js';
import type { D1Client, ImageInsert } from '../src/d1.js';

const mockListObjects = jest.fn();
const mockGetObject = jest.fn();
const mockPutObject = jest.fn();
const mockDeleteObject = jest.fn();
const mockExtractExif = jest.fn();
const mockProcessImage = jest.fn();
const mockFetchExistingIds = jest.fn();
const mockUpsertImages = jest.fn();

jest.unstable_mockModule('../src/storage.js', () => ({
  listObjects: mockListObjects,
  getObject: mockGetObject,
  putObject: mockPutObject,
  deleteObject: mockDeleteObject,
  createS3Client: jest.fn(),
}));

jest.unstable_mockModule('../src/processor.js', () => ({
  extractExif: mockExtractExif,
  processImage: mockProcessImage,
}));

jest.unstable_mockModule('../src/d1.js', () => ({
  fetchExistingIds: mockFetchExistingIds,
  upsertImages: mockUpsertImages,
  createD1Client: jest.fn(),
}));

const { runExtractor } = await import('../src/extractor.js');

const CONFIG: Config = {
  storageEndpoint: 'https://acct.r2.cloudflarestorage.com',
  storageBucket: 'spyo-map',
  storageAccessKey: 'key',
  storageSecretKey: 'secret',
  storageRegion: 'auto',
  localSourcePath: undefined,
  cloudflareAccountId: 'acct',
  cloudflareApiToken: 'token',
  d1DatabaseId: 'db',
};

const s3 = {} as never;
const d1 = {} as D1Client;

beforeEach(() => {
  jest.clearAllMocks();
  mockFetchExistingIds.mockResolvedValue(new Set());
  mockUpsertImages.mockResolvedValue(undefined);
  mockGetObject.mockResolvedValue(Buffer.from('jpeg'));
  mockExtractExif.mockResolvedValue({ latitude: 51.5, longitude: -0.12 });
  mockProcessImage.mockResolvedValue({
    fullSize: Buffer.from('full'),
    thumbnail: Buffer.from('thumb'),
  });
  mockPutObject.mockResolvedValue(undefined);
  mockDeleteObject.mockResolvedValue(undefined);
});

describe('runExtractor over the bucket source', () => {
  it('uploads a full-size image and a thumbnail per new photo', async () => {
    mockListObjects.mockResolvedValue([{ key: 'raw/a.jpg', etag: 'e1', size: 1 }]);
    await runExtractor(CONFIG, s3, d1);

    const keys = mockPutObject.mock.calls.map((c) => c[2]);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toMatch(/^images\/[0-9a-f]{32}\.jpg$/);
    expect(keys[1]).toMatch(/^images\/thumbnails\/[0-9a-f]{32}\.jpg$/);
  });

  it('upserts one metadata row per new photo', async () => {
    mockListObjects.mockResolvedValue([{ key: 'raw/a.jpg', etag: 'e1', size: 1 }]);
    await runExtractor(CONFIG, s3, d1);

    const rows = mockUpsertImages.mock.calls[0]![1] as ImageInsert[];
    expect(rows).toHaveLength(1);
    expect(rows[0]!.path).toBe('a.jpg');
    expect(rows[0]!.exif).toEqual({ latitude: 51.5, longitude: -0.12 });
  });

  it('skips photos whose id is already in D1', async () => {
    mockListObjects.mockResolvedValue([{ key: 'raw/a.jpg', etag: 'e1', size: 1 }]);
    // Run once to learn the generated id, then replay it as already-known.
    await runExtractor(CONFIG, s3, d1);
    const knownId = (mockUpsertImages.mock.calls[0]![1] as ImageInsert[])[0]!.id;

    jest.clearAllMocks();
    mockFetchExistingIds.mockResolvedValue(new Set([knownId]));
    mockListObjects.mockResolvedValue([{ key: 'raw/a.jpg', etag: 'e1', size: 1 }]);
    await runExtractor(CONFIG, s3, d1);

    expect(mockProcessImage).not.toHaveBeenCalled();
    expect(mockPutObject).not.toHaveBeenCalled();
  });

  it('still deletes the raw object for an already-known photo', async () => {
    mockListObjects.mockResolvedValue([{ key: 'raw/a.jpg', etag: 'e1', size: 1 }]);
    await runExtractor(CONFIG, s3, d1);
    const knownId = (mockUpsertImages.mock.calls[0]![1] as ImageInsert[])[0]!.id;

    jest.clearAllMocks();
    mockFetchExistingIds.mockResolvedValue(new Set([knownId]));
    mockListObjects.mockResolvedValue([{ key: 'raw/a.jpg', etag: 'e1', size: 1 }]);
    await runExtractor(CONFIG, s3, d1);

    expect(mockDeleteObject).toHaveBeenCalledWith(s3, 'spyo-map', 'raw/a.jpg');
  });

  it('commits metadata before deleting any raw object', async () => {
    const order: string[] = [];
    mockUpsertImages.mockImplementation(async () => {
      order.push('upsert');
    });
    mockDeleteObject.mockImplementation(async () => {
      order.push('delete');
    });
    mockListObjects.mockResolvedValue([{ key: 'raw/a.jpg', etag: 'e1', size: 1 }]);

    await runExtractor(CONFIG, s3, d1);
    expect(order).toEqual(['upsert', 'delete']);
  });

  it('ignores files without a supported extension', async () => {
    mockListObjects.mockResolvedValue([{ key: 'raw/notes.txt', etag: 'e1', size: 1 }]);
    await runExtractor(CONFIG, s3, d1);
    expect(mockProcessImage).not.toHaveBeenCalled();
    expect(mockUpsertImages).toHaveBeenCalledWith(d1, []);
  });

  it('skips a photo with no GPS data and leaves its raw object in place', async () => {
    mockListObjects.mockResolvedValue([{ key: 'raw/a.jpg', etag: 'e1', size: 1 }]);
    mockExtractExif.mockResolvedValue(null);
    await runExtractor(CONFIG, s3, d1);
    expect(mockUpsertImages).toHaveBeenCalledWith(d1, []);
    expect(mockDeleteObject).not.toHaveBeenCalled();
  });

  it('continues past a photo that fails to process', async () => {
    mockListObjects.mockResolvedValue([
      { key: 'raw/bad.jpg', etag: 'e1', size: 1 },
      { key: 'raw/good.jpg', etag: 'e2', size: 1 },
    ]);
    mockProcessImage
      .mockRejectedValueOnce(new Error('corrupt jpeg'))
      .mockResolvedValue({ fullSize: Buffer.from('f'), thumbnail: Buffer.from('t') });

    await runExtractor(CONFIG, s3, d1);

    const rows = mockUpsertImages.mock.calls[0]![1] as ImageInsert[];
    expect(rows).toHaveLength(1);
    expect(rows[0]!.path).toBe('good.jpg');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test --workspace=packages/extractor -- extractor`
Expected: FAIL — `runExtractor` still takes two parameters and imports the deleted `./database.js`.

- [ ] **Step 3: Rewrite `packages/extractor/src/extractor.ts`**

Keep `SUPPORTED_EXTENSIONS`, `generateIdFromS3`, `generateIdFromLocal`, and `collectLocalImages` exactly as they are. Delete `DB_KEY`, `TMP_DB_PATH`, `LOCAL_DB_PATH`, `downloadExistingDb`, and every `node:fs` import that only existed to juggle the database file. Replace the imports and the three functions below:

```typescript
import { S3Client } from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import type { Config } from "./config.js";
import {
  fetchExistingIds,
  upsertImages,
  type D1Client,
  type ImageInsert,
} from "./d1.js";
import { extractExif, processImage } from "./processor.js";
import { deleteObject, getObject, listObjects, putObject } from "./storage.js";
```

```typescript
export async function runExtractor(
  config: Config,
  s3: S3Client,
  d1: D1Client,
): Promise<void> {
  console.log("Fetching known image ids from D1...");
  const existingIds = await fetchExistingIds(d1);
  console.log(`D1 holds ${existingIds.size} image(s).`);

  if (config.localSourcePath) {
    const rows = await processLocalSource(config, s3, existingIds);
    await upsertImages(d1, rows);
    console.log(`Wrote ${rows.length} new row(s) to D1.`);
    console.log("Extractor complete.");
    return;
  }

  const { rows, keysToDelete } = await processBucketSource(config, s3, existingIds);

  // Commit metadata before deleting anything, so a failure never loses a photo.
  await upsertImages(d1, rows);
  console.log(`Wrote ${rows.length} new row(s) to D1.`);

  for (const key of keysToDelete) {
    try {
      await deleteObject(s3, config.storageBucket, key);
      console.log(`Deleted raw file: ${key}`);
    } catch (err) {
      console.warn(`Warning: could not delete ${key} from raw/:`, err);
    }
  }

  console.log("Extractor complete.");
}

async function processLocalSource(
  config: Config,
  s3: S3Client,
  existingIds: Set<string>,
): Promise<ImageInsert[]> {
  const sourceDir = config.localSourcePath!;
  console.log(`Scanning local source: ${sourceDir}`);
  const files = await collectLocalImages(sourceDir);
  console.log(`Found ${files.length} image(s).`);

  const rows: ImageInsert[] = [];
  let skipped = 0;

  for (let i = 0; i < files.length; i++) {
    const fullPath = files[i]!;
    const relPath = relative(sourceDir, fullPath);
    const fileStat = await stat(fullPath);
    const id = generateIdFromLocal(relPath, String(fileStat.mtimeMs));

    console.log(`Processing ${i + 1}/${files.length}: ${relPath}`);

    if (existingIds.has(id)) {
      console.log(`  Skipping (already processed).`);
      skipped++;
      continue;
    }

    try {
      const buffer = await readFile(fullPath);
      const exif = await extractExif(buffer);
      if (!exif) {
        console.warn(`  Warning: no GPS data — skipping.`);
        continue;
      }

      const { fullSize, thumbnail } = await processImage(buffer);
      await putObject(s3, config.storageBucket, `images/${id}.jpg`, fullSize, "image/jpeg");
      await putObject(
        s3,
        config.storageBucket,
        `images/thumbnails/${id}.jpg`,
        thumbnail,
        "image/jpeg",
      );
      rows.push({ id, path: relPath, exif });
    } catch (err) {
      console.error(`  Error processing ${relPath}:`, err);
    }
  }

  console.log(`Done: ${rows.length} processed, ${skipped} skipped.`);
  return rows;
}

async function processBucketSource(
  config: Config,
  s3: S3Client,
  existingIds: Set<string>,
): Promise<{ rows: ImageInsert[]; keysToDelete: string[] }> {
  console.log(`Scanning bucket ${config.storageBucket}/raw/ ...`);
  const objects = await listObjects(s3, config.storageBucket, "raw/");
  const imageObjects = objects.filter((o) => {
    const lower = o.key.toLowerCase();
    return SUPPORTED_EXTENSIONS.has(lower.slice(lower.lastIndexOf(".")));
  });
  console.log(`Found ${imageObjects.length} image(s) in raw/.`);

  const rows: ImageInsert[] = [];
  const keysToDelete: string[] = [];
  let skipped = 0;

  for (let i = 0; i < imageObjects.length; i++) {
    const obj = imageObjects[i]!;
    const id = generateIdFromS3(obj.key, obj.etag);
    const filename = obj.key.split("/").pop() ?? obj.key;

    console.log(`Processing ${i + 1}/${imageObjects.length}: ${obj.key}`);

    if (existingIds.has(id)) {
      console.log(`  Skipping (already processed).`);
      skipped++;
      keysToDelete.push(obj.key);
      continue;
    }

    try {
      const buffer = await getObject(s3, config.storageBucket, obj.key);
      if (!buffer) {
        console.warn(`  Warning: could not download ${obj.key} — skipping.`);
        continue;
      }

      const exif = await extractExif(buffer);
      if (!exif) {
        console.warn(`  Warning: no GPS data — skipping.`);
        continue;
      }

      const { fullSize, thumbnail } = await processImage(buffer);
      await putObject(s3, config.storageBucket, `images/${id}.jpg`, fullSize, "image/jpeg");
      await putObject(
        s3,
        config.storageBucket,
        `images/thumbnails/${id}.jpg`,
        thumbnail,
        "image/jpeg",
      );
      rows.push({ id, path: filename, exif });
      keysToDelete.push(obj.key);
    } catch (err) {
      console.error(`  Error processing ${obj.key}:`, err);
    }
  }

  console.log(`Done: ${rows.length} processed, ${skipped} skipped.`);
  return { rows, keysToDelete };
}
```

- [ ] **Step 4: Update `packages/extractor/src/index.ts`**

```typescript
import { loadConfig } from './config.js';
import { createS3Client } from './storage.js';
import { createD1Client } from './d1.js';
import { runExtractor } from './extractor.js';

async function main(): Promise<void> {
  console.log('Spyo Map Extractor');
  console.log('==================');

  const config = loadConfig();
  const s3 = createS3Client(config);
  const d1 = createD1Client(config);

  await runExtractor(config, s3, d1);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
```

- [ ] **Step 5: Check `packages/extractor/tests/storage.test.ts` for the region default**

Run: `grep -n "us-east-1" packages/extractor/tests/storage.test.ts`
If it matches, update those assertions to `auto`. If it does not, leave the file alone.

- [ ] **Step 6: Run the extractor suite**

Run: `npm test --workspace=packages/extractor`
Expected: PASS across `d1.test.ts`, `extractor.test.ts`, `processor.test.ts`, and `storage.test.ts`.

- [ ] **Step 7: Build the extractor to confirm it still compiles**

Run: `npm run build --workspace=packages/extractor`
Expected: exit 0, `packages/extractor/dist/` populated.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat!: write extractor output to D1 and R2 instead of SQLite and S3"
```

---

### Task 8: Frontend — serve from the site root and proxy to `wrangler dev`

**Files:**
- Modify: `packages/frontend/vite.config.ts`

**Interfaces:**
- Consumes: the Worker's `/api/*` routes (Task 4) on port 8787 in development.
- Produces: `packages/frontend/dist/` with root-relative asset URLs — the directory Task 5's `[assets]` block points at.

- [ ] **Step 1: Change the base path**

In `packages/frontend/vite.config.ts`, replace:

```typescript
  base: process.env.VITE_BASE_PATH ?? './',
```

with:

```typescript
  // The Worker serves the SPA from the site root.
  base: '/',
```

- [ ] **Step 2: Repoint the dev proxy**

Replace:

```typescript
    proxy: {
      '/api': 'http://localhost:3001'
    }
```

with:

```typescript
    proxy: {
      '/api': 'http://localhost:8787'
    }
```

- [ ] **Step 3: Build and confirm the asset URLs are root-relative**

```bash
npm run build --workspace=packages/frontend
grep -o 'src="[^"]*"' packages/frontend/dist/index.html
```

Expected: paths beginning `/assets/`, not `./assets/` or `/app/assets/`.

- [ ] **Step 4: Run the frontend tests**

Run: `npm test --workspace=packages/frontend`
Expected: PASS. Nothing in the test suite depends on the base path.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: serve the SPA from the site root and proxy dev requests to wrangler"
```

---

### Task 9: Retarget the smoke tests

**Files:**
- Modify: `packages/smoke-test/tests/smoke.test.ts`

**Interfaces:**
- Consumes: the deployed Worker at `SMOKE_BASE_URL`.
- Produces: the smoke suite Task 11's deploy workflow runs.

The current suite gates on both `SMOKE_BASE_URL` and `ALB_DNS` and asserts the app lives at `/app/`. There is no ALB any more, and the app is at `/`.

- [ ] **Step 1: Read the current file in full**

Run: `cat packages/smoke-test/tests/smoke.test.ts`
Note every test and which of them reference `ALB_DNS` or `/app/`.

- [ ] **Step 2: Rewrite the file**

```typescript
const BASE_URL = process.env['SMOKE_BASE_URL'];

const describeIfLive = BASE_URL ? describe : describe.skip;

describeIfLive('smoke tests', () => {
  test('the SPA is reachable at the site root', async () => {
    const res = await fetch(`${BASE_URL}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/html/);
    const body = await res.text();
    expect(body).toContain('<div id="root">');
  });

  test('an unknown path falls back to the SPA shell', async () => {
    const res = await fetch(`${BASE_URL}/not-a-real-path`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('<div id="root">');
  });

  test('the health endpoint responds', async () => {
    const res = await fetch(`${BASE_URL}/api/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  test('the API returns an image list', async () => {
    const res = await fetch(`${BASE_URL}/api/images`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    const data: unknown = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  test('thumbnails are served from the images domain', async () => {
    const apiRes = await fetch(`${BASE_URL}/api/images`);
    const images = (await apiRes.json()) as Array<{ thumbnailUrl: string }>;
    if (images.length === 0) {
      console.log('No images in D1 — skipping image reachability check');
      return;
    }
    const thumbnailUrl = images[0]!.thumbnailUrl;
    expect(thumbnailUrl).toContain('spyo-map-img.isntall.net');

    const imageRes = await fetch(thumbnailUrl);
    expect(imageRes.status).toBe(200);
    expect(imageRes.headers.get('content-type')).toMatch(/image\//);
  });
});
```

If Step 1 revealed tests not represented above (beyond the ALB origin-lockdown check, which is deliberately dropped), port them too.

- [ ] **Step 3: Confirm the suite skips cleanly when unconfigured**

Run: `npm test --workspace=packages/smoke-test`
Expected: PASS with all tests reported as skipped — `SMOKE_BASE_URL` is unset locally.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: retarget smoke tests at the Cloudflare deployment"
```

---

### Task 10: Cloudflare bootstrap runbook

Documentation of the one-time manual setup. Written before the CI workflows because those depend on the secrets this runbook creates.

**Files:**
- Create: `docs/runbooks/cloudflare-bootstrap.md`

**Interfaces:**
- Consumes: `packages/worker/wrangler.toml` and `packages/worker/migrations/` (Task 5).
- Produces: the GitHub secrets Task 11's workflows read, and the `database_id` value that fills the placeholder in `wrangler.toml`.

- [ ] **Step 1: Write the runbook**

Create `docs/runbooks/cloudflare-bootstrap.md`:

````markdown
# Cloudflare Bootstrap

One-time setup for the `spyo-map` Cloudflare deployment. Everything here is done once,
by hand. Day-to-day deploys and ingestion run from GitHub Actions.

Prerequisites: a Cloudflare account, and `isntall.net` added to it as a zone with its
nameservers delegated. Confirm delegation before starting — custom domains cannot be
attached to a zone that is not active.

```bash
npx wrangler login
```

## 1. Create the R2 bucket

```bash
npx wrangler r2 bucket create spyo-map
```

## 2. Attach the images custom domain

In the dashboard: **R2 → spyo-map → Settings → Public access → Custom domains → Connect
domain**, and enter `spyo-map-img.isntall.net`. Cloudflare creates the DNS record and
issues the certificate.

Do **not** enable the `r2.dev` subdomain. It is rate-limited and not meant for production.

Verify once the certificate is live:

```bash
curl -I https://spyo-map-img.isntall.net/images/thumbnails/anything.jpg
```

Expect 404 (the bucket is empty) rather than a TLS or DNS error.

## 3. Create the D1 database

```bash
npx wrangler d1 create spyo-map
```

Copy the `database_id` from the output into `packages/worker/wrangler.toml`, replacing
`REPLACE_WITH_D1_DATABASE_ID`. Commit that change — the id is not a secret.

## 4. Apply the schema

```bash
npx wrangler d1 migrations apply spyo-map --remote --config packages/worker/wrangler.toml
```

Verify:

```bash
npx wrangler d1 execute spyo-map --remote --config packages/worker/wrangler.toml \
  --command "SELECT name FROM sqlite_master WHERE type='table'"
```

Expect a row for `images`.

## 5. Create R2 S3-compatible credentials

Dashboard: **R2 → Manage R2 API Tokens → Create API token**. Permission **Object Read &
Write**, scoped to the `spyo-map` bucket only.

Record the Access Key ID, the Secret Access Key, and the S3 endpoint
(`https://<account-id>.r2.cloudflarestorage.com`). The secret is shown once.

## 6. Create a Cloudflare API token

Dashboard: **My Profile → API Tokens → Create Token → Custom token**, with:

- Account · Workers Scripts · Edit
- Account · D1 · Edit
- Account · Workers R2 Storage · Edit
- Zone · Workers Routes · Edit — zone `isntall.net`

Record the token. It is shown once.

## 7. Add the GitHub repository secrets

**Settings → Secrets and variables → Actions → New repository secret**:

| Secret                  | Value                                           |
| ----------------------- | ----------------------------------------------- |
| `CLOUDFLARE_ACCOUNT_ID` | Account ID from the dashboard sidebar           |
| `CLOUDFLARE_API_TOKEN`  | Token from step 6                               |
| `D1_DATABASE_ID`        | `database_id` from step 3                       |
| `R2_ACCESS_KEY_ID`      | Access Key ID from step 5                       |
| `R2_SECRET_ACCESS_KEY`  | Secret Access Key from step 5                   |
| `R2_ENDPOINT`           | `https://<account-id>.r2.cloudflarestorage.com` |

## 8. First deploy

```bash
npm ci
npm run build --workspace=packages/frontend
npx wrangler deploy --config packages/worker/wrangler.toml
```

The custom domain `spyo-map.isntall.net` is created by the `routes` entry in
`wrangler.toml` on first deploy. Certificate issuance takes a few minutes.

```bash
curl https://spyo-map.isntall.net/api/health
```

Expect `{"status":"ok"}`.

## Uploading source photos

Photos are ingested from the `raw/` prefix of the bucket. Upload with rclone or the
dashboard, then run the **Ingest Photos** workflow.

```bash
npx wrangler r2 object put spyo-map/raw/IMG_1234.jpg --file ./IMG_1234.jpg
```

The extractor deletes each `raw/` object once its metadata is committed to D1.

## Checking free-tier usage

There are no automatic alerts. Check periodically:

- **R2 → spyo-map → Metrics** — storage against the 10 GB limit
- **Workers & Pages → spyo-map → Metrics** — requests against 100k/day
- **D1 → spyo-map → Metrics** — rows read against 5M/day

## Local development

```bash
npx wrangler d1 migrations apply spyo-map --local --config packages/worker/wrangler.toml
npm run dev --workspace=packages/worker   # wrangler dev, port 8787
npm run dev --workspace=packages/frontend # vite, port 3000, proxies /api to 8787
```

Seed the local database with a few rows so the map renders:

```bash
npx wrangler d1 execute spyo-map --local --config packages/worker/wrangler.toml \
  --command "INSERT INTO images (id, path, latitude, longitude, timestamp) \
             VALUES ('demo', 'demo.jpg', 51.5, -0.12, '2024-01-01T00:00:00.000Z')"
```
````

- [ ] **Step 2: Verify every command in the runbook is syntactically valid**

Run: `npx wrangler d1 --help` and `npx wrangler r2 bucket --help`
Confirm the subcommands used above exist in the installed Wrangler version. If the CLI has moved a command, correct the runbook rather than leaving a command that will fail for the operator.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: add the Cloudflare bootstrap runbook"
```

---

### Task 11: GitHub Actions workflows for deploy and ingest

**Files:**
- Create: `.github/workflows/deploy.yml`
- Create: `.github/workflows/ingest.yml`

**Interfaces:**
- Consumes: the secrets created in Task 10; `packages/worker/wrangler.toml` (Task 5); the extractor build (Task 7); the frontend build (Task 8); the smoke tests (Task 9).
- Produces: the deployment path that replaces `deploy-app.yml`.

- [ ] **Step 1: Create `.github/workflows/deploy.yml`**

```yaml
name: Deploy

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read

jobs:
  deploy:
    name: Test, build & deploy
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Lint
        run: npm run lint

      - name: Test
        run: npm test

      - name: Build frontend
        run: npm run build --workspace=packages/frontend

      - name: Deploy worker
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: deploy --config packages/worker/wrangler.toml

      - name: Smoke test
        env:
          SMOKE_BASE_URL: https://spyo-map.isntall.net
        run: npm test --workspace=packages/smoke-test
```

- [ ] **Step 2: Create `.github/workflows/ingest.yml`**

```yaml
name: Ingest Photos

on:
  workflow_dispatch:
  schedule:
    # Sundays at 03:00 UTC
    - cron: '0 3 * * 0'

permissions:
  contents: read

jobs:
  ingest:
    name: Process raw/ into R2 and D1
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build extractor
        run: npm run build --workspace=packages/extractor

      - name: Run extractor
        env:
          STORAGE_ENDPOINT: ${{ secrets.R2_ENDPOINT }}
          STORAGE_BUCKET: spyo-map
          STORAGE_ACCESS_KEY: ${{ secrets.R2_ACCESS_KEY_ID }}
          STORAGE_SECRET_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}
          STORAGE_REGION: auto
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          D1_DATABASE_ID: ${{ secrets.D1_DATABASE_ID }}
        run: npm start --workspace=packages/extractor
```

- [ ] **Step 3: Validate both workflows parse**

```bash
npx --yes yaml-lint .github/workflows/deploy.yml .github/workflows/ingest.yml
```

If `yaml-lint` is unavailable, use `python3 -c "import yaml,sys; [yaml.safe_load(open(f)) for f in sys.argv[1:]]" .github/workflows/deploy.yml .github/workflows/ingest.yml` instead. Expected: no output.

- [ ] **Step 4: Confirm no AWS workflow survives**

```bash
ls .github/workflows
grep -rn "aws\|AWS\|ecr\|ECR" .github/workflows
```

Expected: exactly `deploy.yml` and `ingest.yml`, and no matches.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add Cloudflare deploy and ingest workflows"
```

---

### Task 12: Rewrite `README.md` and `CLAUDE.md`

Both still describe Fastify, MinIO, Docker, ECS, and `images.db`. Every one of those is now wrong.

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: the final state of every preceding task.
- Produces: the documentation a future contributor reads first.

- [ ] **Step 1: Inventory the stale claims**

```bash
grep -n "MinIO\|minio\|docker\|Docker\|Fastify\|fastify\|S3\|ECS\|Fargate\|CloudFront\|images.db\|better-sqlite3\|3001\|reload\|backend\|/app/\|terragrunt\|terraform" README.md CLAUDE.md
```

Every match is either rewritten or deleted. Nothing on that list survives the migration.

- [ ] **Step 2: Rewrite the `CLAUDE.md` Overview**

```markdown
Spyo Map is a browser-based app that displays geo-tagged images on an interactive map
(React + Leaflet/OpenStreetMap frontend). It runs entirely on Cloudflare's free tier: one
Worker serves the SPA as static assets and a `/api/*` JSON API backed by D1, and images
are served directly from an R2 bucket on its own domain. Photos are ingested by a one-shot
extractor job that runs in GitHub Actions, reads EXIF GPS data, writes processed images to
R2, and upserts metadata into D1.
```

- [ ] **Step 3: Rewrite the `CLAUDE.md` Commands section**

```markdown
- `npm run dev --workspace=packages/worker` — `wrangler dev` on port 8787 (Worker + local D1).
- `npm run dev --workspace=packages/frontend` — Vite dev server on port 3000, proxies `/api` to 8787.
- `npm run lint` — ESLint across all workspace packages.
- `npm run build --workspace=packages/frontend` — builds the SPA into `packages/frontend/dist/`.
- `npm run build --workspace=packages/extractor` — compiles the extractor job.
- `npx wrangler deploy --config packages/worker/wrangler.toml` — deploys the Worker and assets.
- `npm test` — runs all workspace tests. Run this before pushing a PR; all tests must pass.
- `npm test --workspace=packages/worker` / `packages/extractor` / `packages/frontend` — single package.

See `docs/runbooks/cloudflare-bootstrap.md` for one-time setup and for running the
extractor.
```

- [ ] **Step 4: Rewrite the `CLAUDE.md` Architecture section**

Replace the package list and the object-storage layout block with:

````markdown
npm workspaces monorepo, four runtime packages plus a smoke-test package:

- **`packages/shared`** — Shared TypeScript types (`ImageRecord`, `GeoLocation`, `AppState`,
  component prop types). No build step (`main`/`exports` point straight at `src/types.ts`).
- **`packages/frontend`** — React + Vite + Leaflet SPA. Fetches image metadata from the
  Worker's REST API via `ApiClient`, and loads images directly from R2 via `<img src>`
  using absolute URLs the API returns.
- **`packages/worker`** — Cloudflare Worker (`src/index.ts`, routing in `src/router.ts`).
  Serves the built SPA through the `ASSETS` binding and answers `/api/*` from the `DB`
  (D1) binding via `src/services/database.ts`. Never proxies image bytes; constructs
  `imageUrl`/`thumbnailUrl` from the `IMAGES_BASE_URL` var. Config lives in
  `wrangler.toml`; the D1 schema lives in `migrations/`.
- **`packages/extractor`** — One-shot CLI ingestion job, run by GitHub Actions. Reads
  photos from `raw/` in R2 or a local folder (`LOCAL_SOURCE_PATH`), extracts GPS EXIF with
  `exifr`, resizes with `sharp` (`src/processor.ts`), uploads to `images/` and
  `images/thumbnails/` (`src/storage.ts`), then upserts metadata into D1 (`src/d1.ts`).
- **`packages/smoke-test`** — standalone Jest package, no source, just tests. Runs against
  a deployed `SMOKE_BASE_URL` and skips when that is unset.

R2 bucket layout:
```
spyo-map/
├── raw/                 ← upload source photos here (private; deleted after ingest)
├── images/              ← processed full-size (public via spyo-map-img.isntall.net)
│   └── thumbnails/      ← thumbnails (public)
```
````

- [ ] **Step 5: Update the `CLAUDE.md` Key conventions and Infra sections**

Replace the `forcePathStyle` convention line with:

```markdown
- The extractor's S3 client targets R2: region `auto`, the account's
  `*.r2.cloudflarestorage.com` endpoint, and credentials from an R2 API token.
```

Replace the whole `### Infra` section with:

```markdown
### Infra

There is no Terraform. Cloudflare resources are declared in
`packages/worker/wrangler.toml` and created once by CLI — see
`docs/runbooks/cloudflare-bootstrap.md`. `mise.toml` pins `node`.
```

- [ ] **Step 6: Rewrite `README.md`**

Apply the same substitutions. In particular the environment-variable table becomes:

```markdown
### Worker (`wrangler.toml`)

| Name               | Kind    | Value                                |
| ------------------ | ------- | ------------------------------------ |
| `IMAGES_BASE_URL`  | var     | `https://spyo-map-img.isntall.net`   |
| `DB`               | binding | D1 database `spyo-map`               |
| `ASSETS`           | binding | `packages/frontend/dist`             |

### Extractor (environment)

| Name                    | Required | Description                                     |
| ----------------------- | -------- | ----------------------------------------------- |
| `STORAGE_ENDPOINT`      | yes      | `https://<account-id>.r2.cloudflarestorage.com` |
| `STORAGE_BUCKET`        | yes      | `spyo-map`                                      |
| `STORAGE_ACCESS_KEY`    | yes      | R2 API token access key id                      |
| `STORAGE_SECRET_KEY`    | yes      | R2 API token secret                             |
| `STORAGE_REGION`        | no       | Defaults to `auto`                              |
| `CLOUDFLARE_ACCOUNT_ID` | yes      | Cloudflare account id                           |
| `CLOUDFLARE_API_TOKEN`  | yes      | Token with D1 Edit                              |
| `D1_DATABASE_ID`        | yes      | Database id from `wrangler d1 create`           |
| `LOCAL_SOURCE_PATH`     | no       | Ingest from a local folder instead of `raw/`    |
```

Delete any `docker compose`, MinIO, `POST /api/reload`, `DB_REFRESH_INTERVAL_MS`, and
`/app/` references outright rather than adapting them.

- [ ] **Step 7: Verify no stale references remain**

```bash
grep -n "MinIO\|minio\|docker\|Docker\|Fastify\|fastify\|ECS\|Fargate\|CloudFront\|images.db\|better-sqlite3\|3001\|/api/reload\|terragrunt" README.md CLAUDE.md
```

Expected: no output.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: rewrite README and CLAUDE.md for the Cloudflare architecture"
```

---

### Task 13: Cutover

Operator-run, not agent-run. Every step touches live infrastructure or real photo data, and several are irreversible.

**Files:**
- Create: `docs/runbooks/aws-decommission.md`

**Interfaces:**
- Consumes: everything above, plus the bootstrap from Task 10.
- Produces: a decommissioned AWS account and a live Cloudflare deployment.

- [ ] **Step 1: Write the decommission runbook**

Create `docs/runbooks/aws-decommission.md`:

````markdown
# AWS Decommission

Run **after** `spyo-map.isntall.net` is confirmed serving from Cloudflare. Steps 4 and 5
are irreversible.

## 1. Copy the photo data out of S3

Both the processed images and anything still waiting in `raw/`.

```bash
aws s3 sync s3://<old-bucket>/images/ ./migration/images/
aws s3 sync s3://<old-bucket>/raw/    ./migration/raw/
```

Record the object count so it can be checked against R2:

```bash
aws s3 ls s3://<old-bucket>/images/ --recursive | wc -l
```

## 2. Upload into R2

Configure rclone with the R2 credentials from the bootstrap runbook, then:

```bash
rclone copy ./migration/images/ r2:spyo-map/images/ --progress
rclone copy ./migration/raw/    r2:spyo-map/raw/    --progress
rclone size r2:spyo-map/images/
```

The object count must match step 1.

## 3. Populate D1

The image ids in R2 were derived from the old S3 keys and ETags, so they cannot be
recomputed from the copied files. Export the metadata from the old `images.db` instead.

```bash
aws s3 cp s3://<old-bucket>/images.db ./migration/images.db
sqlite3 ./migration/images.db ".dump images" > ./migration/images.sql
```

Edit `images.sql` to drop the `CREATE TABLE` and `CREATE INDEX` statements — the schema is
already applied by the migration — leaving only `INSERT` statements. Then:

```bash
npx wrangler d1 execute spyo-map --remote \
  --config packages/worker/wrangler.toml --file ./migration/images.sql
```

Verify the row count matches the image count from step 2:

```bash
npx wrangler d1 execute spyo-map --remote \
  --config packages/worker/wrangler.toml --command "SELECT COUNT(*) FROM images"
```

## 4. Verify the live site before destroying anything

- `https://spyo-map.isntall.net/` loads and the map renders markers
- `https://spyo-map.isntall.net/api/health` returns `{"status":"ok"}`
- `https://spyo-map.isntall.net/api/images` returns the expected number of records
- A deep link such as `https://spyo-map.isntall.net/#/image/<id>` opens the modal
- A thumbnail loads from `spyo-map-img.isntall.net`
- The **Ingest Photos** workflow succeeds on a test photo placed in `raw/`

Do not continue until all six pass.

## 5. Destroy the AWS resources

The `infra/` tree was deleted from the repository, so recover it from git history to run
the destroy:

```bash
git checkout <commit-before-infra-deletion> -- infra/
cd infra/live && terragrunt run-all destroy
```

Then confirm in the console that all of these are gone: the ALB, the ECS cluster and
services, both ECR repositories, the CloudFront distribution, the S3 bucket, the
EventBridge schedule, the CloudWatch log groups, and the VPC with its NAT gateway.

Discard the recovered tree afterwards — it is not coming back:

```bash
git checkout -- . && rm -rf infra
```

## 6. Delete the leftover credentials

- **IAM → Users → Access keys:** delete the long-lived key pair that `extract.sh` used.
  It is useless once the bucket is gone, and leaving an active key is pointless risk.
- **IAM → Roles:** delete the GitHub OIDC role the old deploy workflow assumed, and the
  ECS task and execution roles.
- **IAM → Identity providers:** delete the GitHub OIDC provider if nothing else uses it.

## 7. Confirm the bill is zero

Check **Billing → Bills** at the start of the following month. Route 53 hosted zones and
retained EBS snapshots are the usual survivors of a "complete" teardown.
````

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "chore: add the AWS decommission runbook"
```

- [ ] **Step 3: Final verification of the whole branch**

```bash
npm ci
npm run lint
npm test
npm run build --workspace=packages/frontend
npm run build --workspace=packages/extractor
npx wrangler deploy --dry-run --config packages/worker/wrangler.toml
```

Expected: all six succeed. The dry run reports the `DB` and `ASSETS` bindings.

- [ ] **Step 4: Open the pull request**

```bash
gh pr create --base main --title "feat!: migrate from AWS to Cloudflare Workers, D1, and R2" \
  --body "Implements docs/superpowers/specs/2026-08-02-cloudflare-migration-design.md"
```

---

## Execution notes

Tasks 1 and 2 are prerequisites for everything after them. Tasks 3→4→5 are a chain. Tasks
6→7 are a chain. Task 8 depends only on Task 1. Once Tasks 1–5 are done, the 6→7 chain and
Task 8 can run in parallel.

Task 13 is operator-run. Do not dispatch it to a sub-agent — it destroys live
infrastructure and moves irreplaceable photo data.

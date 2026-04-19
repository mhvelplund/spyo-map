# Jest Unit Tests Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Jest unit tests to `packages/backend`, `packages/extractor`, and `packages/frontend` so regressions are caught before every PR.

**Architecture:** Each package gets its own `jest.config.ts` and `tests/` subfolder. Backend's database query functions are extracted to testable helpers that accept `(db, baseUrl)` parameters. Frontend's `API_BASE_URL` is moved to a dedicated `src/config.ts` so it can be mocked in tests without touching `import.meta.env` at runtime.

**Tech Stack:** Jest 29, ts-jest 29, @types/jest 29, better-sqlite3 (in-memory), Fastify inject()

---

## Chunk 1: Jest Infrastructure

Set up Jest in all three packages — dependencies, configs, tsconfigs for test compilation. No tests yet.

### Task 1.1: Add Jest deps + test scripts to packages

**Files:**
- Modify: `packages/backend/package.json`
- Modify: `packages/extractor/package.json`
- Modify: `packages/frontend/package.json`
- Modify: `package.json` (root)

- [ ] **Step 1: Add jest/ts-jest/@types/jest to backend devDependencies and test script**

Edit `packages/backend/package.json`:

```json
{
  "name": "@spyro-map/backend",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "test": "node --experimental-vm-modules node_modules/.bin/jest"
  },
  "dependencies": {
    "@aws-sdk/client-s3": "^3.0.0",
    "@fastify/cors": "^11.0.0",
    "@spyro-map/shared": "*",
    "better-sqlite3": "^12.0.0",
    "fastify": "^5.0.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.0.0",
    "@types/jest": "^29.0.0",
    "@types/node": "^24.6.0",
    "jest": "^29.0.0",
    "ts-jest": "^29.0.0",
    "tsx": "^4.0.0",
    "typescript": "~5.9.3"
  }
}
```

- [ ] **Step 2: Add jest/ts-jest/@types/jest to extractor devDependencies and test script**

Edit `packages/extractor/package.json`:

```json
{
  "name": "@spyro-map/extractor",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "tsx src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "node --experimental-vm-modules node_modules/.bin/jest"
  },
  "dependencies": {
    "@aws-sdk/client-s3": "^3.0.0",
    "better-sqlite3": "^12.0.0",
    "exifr": "^7.0.0",
    "sharp": "^0.34.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.0.0",
    "@types/jest": "^29.0.0",
    "@types/node": "^24.6.0",
    "jest": "^29.0.0",
    "ts-jest": "^29.0.0",
    "tsx": "^4.0.0",
    "typescript": "~5.9.3"
  }
}
```

- [ ] **Step 3: Add jest/ts-jest/@types/jest to frontend devDependencies and test script**

Edit `packages/frontend/package.json` — add to `scripts` and `devDependencies`:

```json
"scripts": {
  "dev": "vite",
  "build": "tsc -b && vite build",
  "preview": "vite preview",
  "test": "node --experimental-vm-modules node_modules/.bin/jest"
},
```

Add to `devDependencies`:
```json
"@types/jest": "^29.0.0",
"jest": "^29.0.0",
"ts-jest": "^29.0.0"
```

- [ ] **Step 4: Add root-level test script**

Edit root `package.json` — add `test` to `scripts`:

```json
"scripts": {
  "test": "npm run test --workspaces --if-present"
}
```

- [ ] **Step 5: Install dependencies**

```bash
cd /home/mhvelplund/projects/spyro-map/.worktrees/v2
npm install
```

Expected: lockfile updated, jest/ts-jest/@types/jest installed.

### Task 1.2: Create Jest config files

**Files:**
- Create: `packages/backend/jest.config.ts`
- Create: `packages/extractor/jest.config.ts`
- Create: `packages/frontend/jest.config.ts`

- [ ] **Step 1: Create `packages/backend/jest.config.ts`**

```typescript
import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^@spyro-map/shared$': '<rootDir>/../shared/src/types.ts',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { useESM: true, tsconfig: 'tsconfig.test.json' }],
  },
};

export default config;
```

- [ ] **Step 2: Create `packages/extractor/jest.config.ts`**

```typescript
import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^@spyro-map/shared$': '<rootDir>/../shared/src/types.ts',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { useESM: true, tsconfig: 'tsconfig.test.json' }],
  },
};

export default config;
```

- [ ] **Step 3: Create `packages/frontend/jest.config.ts`**

The frontend requires a second `moduleNameMapper` entry to intercept the `config.js` import and replace it with a mock that doesn't use `import.meta.env`:

```typescript
import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  moduleNameMapper: {
    '^@spyro-map/shared$': '<rootDir>/../shared/src/types.ts',
    // Intercept ApiClient's '../config.js' before the generic .js-strip mapper
    '^\\.\\./config\\.js$': '<rootDir>/tests/__mocks__/config.ts',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { useESM: true, tsconfig: 'tsconfig.test.json' }],
  },
};

export default config;
```

### Task 1.3: Create test-specific tsconfigs

**Files:**
- Create: `packages/backend/tsconfig.test.json`
- Create: `packages/extractor/tsconfig.test.json`
- Create: `packages/frontend/tsconfig.test.json`

- [ ] **Step 1: Create `packages/backend/tsconfig.test.json`**

Extends the main tsconfig but widens `rootDir` to include `tests/` and disables emit:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "rootDir": ".",
    "noEmit": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 2: Create `packages/extractor/tsconfig.test.json`**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "rootDir": ".",
    "noEmit": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 3: Create `packages/frontend/tsconfig.test.json`**

Cannot extend `tsconfig.app.json` directly (it uses vite/client types and allowImportingTsExtensions which aren't appropriate for Jest). Create standalone:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "NodeNext",
    "skipLibCheck": true,
    "esModuleInterop": true,
    "verbatimModuleSyntax": true,
    "strict": true,
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM"],
    "noEmit": true,
    "types": ["node", "jest"]
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 4: Create placeholder tests directory structure**

```bash
mkdir -p packages/backend/tests
mkdir -p packages/extractor/tests
mkdir -p packages/frontend/tests/__mocks__
```

- [ ] **Step 5: Verify Jest loads (no tests yet)**

```bash
(cd packages/backend && npm test -- --passWithNoTests)
(cd packages/extractor && npm test -- --passWithNoTests)
(cd packages/frontend && npm test -- --passWithNoTests)
```

Expected: "Test Suites: 0 skipped, 0 total" for each. No config errors.

- [ ] **Step 6: Commit infrastructure**

```bash
cd /home/mhvelplund/projects/spyro-map/.worktrees/v2
git add packages/*/package.json packages/*/jest.config.ts packages/*/tsconfig.test.json package.json
git commit -m "chore: add Jest test infrastructure to all packages"
```

---

## Chunk 2: Source Refactors

Refactor `backend/src/services/database.ts` to export testable query helpers. Create `frontend/src/config.ts`. No logic changes — only structure.

### Task 2.1: Extract haversineKm to backend utils

**Files:**
- Create: `packages/backend/src/utils.ts`
- Modify: `packages/backend/src/services/database.ts`

- [ ] **Step 1: Create `packages/backend/src/utils.ts`**

```typescript
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
```

- [ ] **Step 2: Update `packages/backend/src/services/database.ts` — remove private haversine, import from utils, export testable query helpers**

Replace the entire file with:

```typescript
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import BetterSqlite3 from "better-sqlite3";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";
import type { ImageRecord } from "@spyro-map/shared";
import { config } from "../config.js";
import { haversineKm } from "../utils.js";

const DB_PATH = "/tmp/spyro-map-images.db";
const DB_KEY = "images.db";

function buildS3Client(): S3Client {
  return new S3Client({
    region: config.storage.region,
    credentials: {
      accessKeyId: config.storage.accessKey,
      secretAccessKey: config.storage.secretKey,
    },
    ...(config.storage.endpoint
      ? { endpoint: config.storage.endpoint, forcePathStyle: true }
      : {}),
  });
}

const s3 = buildS3Client();
let db: BetterSqlite3.Database | null = null;

async function downloadDb(): Promise<void> {
  const response = await s3.send(
    new GetObjectCommand({ Bucket: config.storage.bucket, Key: DB_KEY }),
  );
  const body = response.Body as Readable;
  await pipeline(body, createWriteStream(DB_PATH));
}

function openDb(): void {
  db?.close();
  db = new BetterSqlite3(DB_PATH, { readonly: true });
}

export async function initDatabase(): Promise<void> {
  await downloadDb();
  openDb();

  if (config.dbRefreshIntervalMs > 0) {
    setInterval(async () => {
      await reloadDatabase();
    }, config.dbRefreshIntervalMs);
  }
}

export async function reloadDatabase(): Promise<void> {
  await downloadDb();
  openDb();
}

function getDb(): BetterSqlite3.Database {
  if (!db) throw new Error("Database not initialized");
  return db;
}

// --- Exported testable helpers (accept db and baseUrl as params) ---

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
    ...(row.h_positioning_error != null ? { hPositioningError: row.h_positioning_error as number } : {}),
  };
}

export function queryAllImages(db: BetterSqlite3.Database, baseUrl: string): ImageRecord[] {
  const rows = db.prepare("SELECT * FROM images").all() as Record<string, unknown>[];
  return rows.map((row) => rowToRecord(row, baseUrl));
}

export function queryImageById(
  db: BetterSqlite3.Database,
  id: string,
  baseUrl: string,
): ImageRecord | null {
  const row = db.prepare("SELECT * FROM images WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? rowToRecord(row, baseUrl) : null;
}

export function queryNearbyImages(
  db: BetterSqlite3.Database,
  id: string,
  lat: number,
  lon: number,
  radiusKm: number,
  baseUrl: string,
): ImageRecord[] {
  const rows = db
    .prepare("SELECT * FROM images WHERE id != ?")
    .all(id) as Record<string, unknown>[];

  return rows
    .map((row) => ({
      record: rowToRecord(row, baseUrl),
      dist: haversineKm(lat, lon, row.latitude as number, row.longitude as number),
    }))
    .filter(({ dist }) => dist <= radiusKm)
    .sort((a, b) => a.dist - b.dist)
    .map(({ record }) => record);
}

// --- Public API (unchanged signatures — call helpers with module-level state) ---

export function getAllImages(): ImageRecord[] {
  return queryAllImages(getDb(), config.imagesBaseUrl);
}

export function getImageById(id: string): ImageRecord | null {
  return queryImageById(getDb(), id, config.imagesBaseUrl);
}

export function getNearbyImages(
  id: string,
  lat: number,
  lon: number,
  radiusKm: number,
): ImageRecord[] {
  return queryNearbyImages(getDb(), id, lat, lon, radiusKm, config.imagesBaseUrl);
}
```

- [ ] **Step 3: Verify backend still builds**

```bash
cd packages/backend && npm run build
```

Expected: no TypeScript errors, `dist/` updated.

### Task 2.2: Extract API_BASE_URL to frontend config module

**Files:**
- Create: `packages/frontend/src/config.ts`
- Modify: `packages/frontend/src/services/ApiClient.ts`

- [ ] **Step 1: Create `packages/frontend/src/config.ts`**

```typescript
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';
```

- [ ] **Step 2: Update `packages/frontend/src/services/ApiClient.ts` to import from config**

Replace the `import.meta.env` inline reference:

```typescript
import type { ImageRecord } from '../types/index.js';
import { API_BASE_URL } from '../config.js';

export class ApiClient {
  async getAllImages(): Promise<ImageRecord[]> {
    const response = await fetch(`${API_BASE_URL}/api/images`);
    if (!response.ok) {
      throw new Error(`Failed to fetch images: ${response.statusText}`);
    }
    return response.json() as Promise<ImageRecord[]>;
  }

  async getImageById(id: string): Promise<ImageRecord | null> {
    const response = await fetch(`${API_BASE_URL}/api/images/${encodeURIComponent(id)}`);
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }
    return response.json() as Promise<ImageRecord>;
  }

  async getNearbyImages(id: string, radius = 1): Promise<ImageRecord[]> {
    const response = await fetch(
      `${API_BASE_URL}/api/images/${encodeURIComponent(id)}/nearby?radius=${radius}`
    );
    if (!response.ok) {
      throw new Error(`Failed to fetch nearby images: ${response.statusText}`);
    }
    return response.json() as Promise<ImageRecord[]>;
  }
}

export const apiClient = new ApiClient();
```

- [ ] **Step 3: Verify frontend still builds**

```bash
cd packages/frontend && npm run build
```

Expected: no errors.

- [ ] **Step 4: Commit refactors**

```bash
cd /home/mhvelplund/projects/spyro-map/.worktrees/v2
git add packages/backend/src/utils.ts packages/backend/src/services/database.ts \
        packages/frontend/src/config.ts packages/frontend/src/services/ApiClient.ts
git commit -m "refactor: extract haversineKm util, testable DB query helpers, frontend API_BASE_URL config"
```

---

## Chunk 3: Backend Tests

Three test files: `utils.test.ts` (haversineKm), `database.test.ts` (query helpers with in-memory SQLite), `routes.test.ts` (Fastify inject with mocked DB service).

### Task 3.1: Haversine unit tests

**Files:**
- Create: `packages/backend/tests/utils.test.ts`

- [ ] **Step 1: Write failing test**

Create `packages/backend/tests/utils.test.ts`:

```typescript
import { haversineKm } from '../src/utils.js';

describe('haversineKm', () => {
  it('returns 0 for the same point', () => {
    expect(haversineKm(51.5, -0.12, 51.5, -0.12)).toBe(0);
  });

  it('calculates London to Paris within 5% of 340 km', () => {
    const dist = haversineKm(51.5074, -0.1278, 48.8566, 2.3522);
    expect(dist).toBeGreaterThan(323);
    expect(dist).toBeLessThan(357);
  });

  it('calculates approximately half Earth circumference for antipodal points', () => {
    const dist = haversineKm(0, 0, 0, 180);
    expect(dist).toBeGreaterThan(20000);
    expect(dist).toBeLessThan(20100);
  });
});
```

- [ ] **Step 2: Run and verify it fails (module not found)**

```bash
cd packages/backend && npm test -- tests/utils.test.ts
```

Expected: FAIL — `haversineKm` not yet exported. (If `src/utils.ts` was already created in Chunk 2, this should actually PASS — that's fine, proceed.)

- [ ] **Step 3: Run after Chunk 2 refactor and verify passes**

```bash
cd packages/backend && npm test -- tests/utils.test.ts
```

Expected: 3 tests pass.

### Task 3.2: Backend database query helper tests

**Files:**
- Create: `packages/backend/tests/database.test.ts`

- [ ] **Step 1: Write the tests**

Create `packages/backend/tests/database.test.ts`:

```typescript
import BetterSqlite3 from 'better-sqlite3';
import { rowToRecord, queryAllImages, queryImageById, queryNearbyImages } from '../src/services/database.js';

const BASE_URL = 'http://test';

const SCHEMA = `
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
)`;

function makeDb(): BetterSqlite3.Database {
  const db = new BetterSqlite3(':memory:');
  db.exec(SCHEMA);
  return db;
}

function insertRow(
  db: BetterSqlite3.Database,
  id: string,
  lat: number,
  lon: number,
): void {
  db.prepare(
    `INSERT INTO images (id, path, latitude, longitude, timestamp) VALUES (?, ?, ?, ?, ?)`,
  ).run(id, `${id}.jpg`, lat, lon, '2024-01-01T00:00:00.000Z');
}

describe('rowToRecord', () => {
  it('maps a row to ImageRecord with constructed URLs', () => {
    const row = {
      id: 'abc123',
      latitude: 51.5,
      longitude: -0.12,
      timestamp: '2024-01-01T00:00:00.000Z',
    };
    const record = rowToRecord(row, BASE_URL);
    expect(record.id).toBe('abc123');
    expect(record.imageUrl).toBe('http://test/images/abc123.jpg');
    expect(record.thumbnailUrl).toBe('http://test/images/thumbnails/abc123.jpg');
    expect(record.latitude).toBe(51.5);
    expect(record.longitude).toBe(-0.12);
  });

  it('includes optional fields when present', () => {
    const row = {
      id: 'x',
      latitude: 0,
      longitude: 0,
      timestamp: null,
      altitude: 100,
      speed: 5.5,
    };
    const record = rowToRecord(row, BASE_URL);
    expect(record.altitude).toBe(100);
    expect(record.speed).toBe(5.5);
    expect(record.timestamp).toBe('');
  });
});

describe('queryAllImages', () => {
  it('returns all rows as ImageRecords', () => {
    const db = makeDb();
    insertRow(db, 'img1', 51.5, -0.12);
    insertRow(db, 'img2', 48.86, 2.35);
    const results = queryAllImages(db, BASE_URL);
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.id)).toEqual(expect.arrayContaining(['img1', 'img2']));
    db.close();
  });

  it('returns empty array when no images', () => {
    const db = makeDb();
    expect(queryAllImages(db, BASE_URL)).toEqual([]);
    db.close();
  });
});

describe('queryImageById', () => {
  it('returns correct record for known id', () => {
    const db = makeDb();
    insertRow(db, 'img1', 51.5, -0.12);
    const result = queryImageById(db, 'img1', BASE_URL);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('img1');
    expect(result!.latitude).toBe(51.5);
    db.close();
  });

  it('returns null for unknown id', () => {
    const db = makeDb();
    expect(queryImageById(db, 'nope', BASE_URL)).toBeNull();
    db.close();
  });
});

describe('queryNearbyImages', () => {
  it('returns images within radius, sorted by distance', () => {
    const db = makeDb();
    // London
    insertRow(db, 'london', 51.5074, -0.1278);
    // Paris (~340 km from London)
    insertRow(db, 'paris', 48.8566, 2.3522);
    // Berlin (~930 km from London)
    insertRow(db, 'berlin', 52.52, 13.405);

    const nearby = queryNearbyImages(db, 'london', 51.5074, -0.1278, 500, BASE_URL);
    expect(nearby.map((r) => r.id)).toEqual(['paris']);
    db.close();
  });

  it('excludes the source image itself from results', () => {
    const db = makeDb();
    insertRow(db, 'a', 51.5, -0.12);
    insertRow(db, 'b', 51.501, -0.12);

    const nearby = queryNearbyImages(db, 'a', 51.5, -0.12, 100, BASE_URL);
    expect(nearby.every((r) => r.id !== 'a')).toBe(true);
    db.close();
  });

  it('returns empty array when no images are within radius', () => {
    const db = makeDb();
    insertRow(db, 'london', 51.5074, -0.1278);
    insertRow(db, 'berlin', 52.52, 13.405);

    const nearby = queryNearbyImages(db, 'london', 51.5074, -0.1278, 100, BASE_URL);
    expect(nearby).toEqual([]);
    db.close();
  });
});
```

- [ ] **Step 2: Run and verify tests pass**

```bash
cd packages/backend && npm test -- tests/database.test.ts
```

Expected: All tests pass. If you see "not exported" errors, the Chunk 2 refactor has not been applied yet.

### Task 3.3: Backend API route tests

**Files:**
- Create: `packages/backend/tests/routes.test.ts`

- [ ] **Step 1: Write the route tests**

Create `packages/backend/tests/routes.test.ts`:

```typescript
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import type { ImageRecord } from '@spyro-map/shared';
import { imageRoutes } from '../src/routes/images.js';

// Mock the database service module before any import resolves
jest.mock('../src/services/database.js', () => ({
  getAllImages: jest.fn(),
  getImageById: jest.fn(),
  getNearbyImages: jest.fn(),
  reloadDatabase: jest.fn(),
}));

// Import the mocked module for type-safe access
import * as dbService from '../src/services/database.js';

const mockGetAll = dbService.getAllImages as jest.MockedFunction<typeof dbService.getAllImages>;
const mockGetById = dbService.getImageById as jest.MockedFunction<typeof dbService.getImageById>;
const mockGetNearby = dbService.getNearbyImages as jest.MockedFunction<typeof dbService.getNearbyImages>;
const mockReload = dbService.reloadDatabase as jest.MockedFunction<typeof dbService.reloadDatabase>;

const FIXTURE: ImageRecord = {
  id: 'abc',
  imageUrl: 'http://test/images/abc.jpg',
  thumbnailUrl: 'http://test/images/thumbnails/abc.jpg',
  latitude: 51.5,
  longitude: -0.12,
  timestamp: '2024-01-01T00:00:00.000Z',
};

let app: FastifyInstance;

beforeEach(async () => {
  app = Fastify({ logger: false });
  await app.register(imageRoutes);
  jest.clearAllMocks();
});

afterEach(async () => {
  await app.close();
});

describe('GET /api/health', () => {
  it('returns { status: "ok" }', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });
});

describe('GET /api/images', () => {
  it('returns array from database service', async () => {
    mockGetAll.mockReturnValue([FIXTURE]);
    const response = await app.inject({ method: 'GET', url: '/api/images' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([FIXTURE]);
  });
});

describe('GET /api/images/:id', () => {
  it('returns 200 with record when found', async () => {
    mockGetById.mockReturnValue(FIXTURE);
    const response = await app.inject({ method: 'GET', url: '/api/images/abc' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(FIXTURE);
  });

  it('returns 404 when not found', async () => {
    mockGetById.mockReturnValue(null);
    const response = await app.inject({ method: 'GET', url: '/api/images/nope' });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'Not found' });
  });
});

describe('GET /api/images/:id/nearby', () => {
  it('returns nearby images for known id', async () => {
    mockGetById.mockReturnValue(FIXTURE);
    mockGetNearby.mockReturnValue([FIXTURE]);
    const response = await app.inject({ method: 'GET', url: '/api/images/abc/nearby' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([FIXTURE]);
  });

  it('respects custom radius query param', async () => {
    mockGetById.mockReturnValue(FIXTURE);
    mockGetNearby.mockReturnValue([]);
    await app.inject({ method: 'GET', url: '/api/images/abc/nearby?radius=5' });
    expect(mockGetNearby).toHaveBeenCalledWith('abc', 51.5, -0.12, 5);
  });

  it('returns 404 when image not found', async () => {
    mockGetById.mockReturnValue(null);
    const response = await app.inject({ method: 'GET', url: '/api/images/nope/nearby' });
    expect(response.statusCode).toBe(404);
  });
});

describe('POST /api/reload', () => {
  it('calls reloadDatabase and returns { status: "ok" }', async () => {
    mockReload.mockResolvedValue(undefined);
    const response = await app.inject({ method: 'POST', url: '/api/reload' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
    expect(mockReload).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run and verify all route tests pass**

```bash
cd packages/backend && npm test -- tests/routes.test.ts
```

Expected: All 8 tests pass.

- [ ] **Step 3: Run the full backend test suite**

```bash
cd packages/backend && npm test
```

Expected: All tests in utils, database, and routes pass.

- [ ] **Step 4: Commit backend tests**

```bash
cd /home/mhvelplund/projects/spyro-map/.worktrees/v2
git add packages/backend/tests/
git commit -m "test: add backend unit tests (haversine, db queries, routes)"
```

---

## Chunk 4: Extractor Tests

Two test files: `database.test.ts` (SQLite helpers with in-memory DB), `processor.test.ts` (EXIF extraction and image processing with mocked exifr/sharp).

### Task 4.1: Extractor SQLite helper tests

**Files:**
- Create: `packages/extractor/tests/database.test.ts`

- [ ] **Step 1: Write the tests**

Create `packages/extractor/tests/database.test.ts`:

```typescript
import { openDatabase, imageExists, insertImage, getAllImageIds } from '../src/database.js';
import type { ExifData } from '../src/processor.js';

const EXIF_FIXTURE: ExifData = {
  latitude: 51.5074,
  longitude: -0.1278,
  timestamp: '2024-06-15T10:30:00.000Z',
  latitudeRef: 'N',
  longitudeRef: 'W',
  altitudeRef: undefined,
  altitude: 12.5,
  speedRef: undefined,
  speed: undefined,
  imgDirectionRef: undefined,
  imgDirection: undefined,
  destBearingRef: undefined,
  destBearing: undefined,
  hPositioningError: undefined,
};

describe('openDatabase', () => {
  it('creates a database with the images table', () => {
    const db = openDatabase(':memory:');
    const result = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='images'")
      .get();
    expect(result).toBeDefined();
    db.close();
  });

  it('creates lat/lon and timestamp indexes', () => {
    const db = openDatabase(':memory:');
    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index'")
      .all() as Array<{ name: string }>;
    const names = indexes.map((i) => i.name);
    expect(names).toContain('idx_location');
    expect(names).toContain('idx_timestamp');
    db.close();
  });
});

describe('imageExists', () => {
  it('returns false for an unknown id', () => {
    const db = openDatabase(':memory:');
    expect(imageExists(db, 'missing')).toBe(false);
    db.close();
  });

  it('returns true after inserting the image', () => {
    const db = openDatabase(':memory:');
    insertImage(db, 'img1', 'photo.jpg', EXIF_FIXTURE);
    expect(imageExists(db, 'img1')).toBe(true);
    db.close();
  });
});

describe('insertImage', () => {
  it('inserts a row with all EXIF fields', () => {
    const db = openDatabase(':memory:');
    insertImage(db, 'img1', 'photos/test.jpg', EXIF_FIXTURE);
    const row = db.prepare('SELECT * FROM images WHERE id = ?').get('img1') as Record<string, unknown>;
    expect(row.id).toBe('img1');
    expect(row.path).toBe('photos/test.jpg');
    expect(row.latitude).toBe(51.5074);
    expect(row.longitude).toBe(-0.1278);
    expect(row.timestamp).toBe('2024-06-15T10:30:00.000Z');
    expect(row.latitude_ref).toBe('N');
    expect(row.altitude).toBe(12.5);
    db.close();
  });

  it('stores null for missing optional fields', () => {
    const db = openDatabase(':memory:');
    const minimalExif: ExifData = {
      latitude: 51.5,
      longitude: -0.12,
      timestamp: undefined,
      latitudeRef: undefined,
      longitudeRef: undefined,
      altitudeRef: undefined,
      altitude: undefined,
      speedRef: undefined,
      speed: undefined,
      imgDirectionRef: undefined,
      imgDirection: undefined,
      destBearingRef: undefined,
      destBearing: undefined,
      hPositioningError: undefined,
    };
    insertImage(db, 'minimal', 'x.jpg', minimalExif);
    const row = db.prepare('SELECT * FROM images WHERE id = ?').get('minimal') as Record<string, unknown>;
    expect(row.timestamp).toBeNull();
    expect(row.altitude).toBeNull();
    db.close();
  });
});

describe('getAllImageIds', () => {
  it('returns an empty set for an empty database', () => {
    const db = openDatabase(':memory:');
    expect(getAllImageIds(db).size).toBe(0);
    db.close();
  });

  it('returns all inserted ids', () => {
    const db = openDatabase(':memory:');
    insertImage(db, 'a', 'a.jpg', EXIF_FIXTURE);
    insertImage(db, 'b', 'b.jpg', EXIF_FIXTURE);
    const ids = getAllImageIds(db);
    expect(ids.has('a')).toBe(true);
    expect(ids.has('b')).toBe(true);
    expect(ids.size).toBe(2);
    db.close();
  });
});
```

- [ ] **Step 2: Run and verify tests pass**

```bash
cd packages/extractor && npm test -- tests/database.test.ts
```

Expected: All tests pass.

### Task 4.2: Extractor processor tests

**Files:**
- Create: `packages/extractor/tests/processor.test.ts`

- [ ] **Step 1: Write the tests with exifr and sharp mocks**

Create `packages/extractor/tests/processor.test.ts`:

```typescript
import { jest } from '@jest/globals';

// Mock exifr before any imports resolve
jest.mock('exifr', () => ({
  default: {
    parse: jest.fn(),
  },
}));

// Mock sharp entirely inline inside the factory to avoid TDZ errors.
// jest.mock() is hoisted before static imports, so any const defined in
// module scope would be in TDZ when the factory runs. Define everything here.
jest.mock('sharp', () => {
  const mockToBuffer = jest.fn().mockResolvedValue(Buffer.from('mock-image'));
  const mockInstance = {
    resize: jest.fn().mockReturnThis(),
    jpeg: jest.fn().mockReturnThis(),
    toBuffer: mockToBuffer,
  };
  return { default: jest.fn().mockReturnValue(mockInstance) };
});

import exifr from 'exifr';
import sharp from 'sharp';
import { extractExif, processImage } from '../src/processor.js';

const mockParse = exifr.parse as jest.MockedFunction<typeof exifr.parse>;
const mockSharp = sharp as jest.MockedFunction<typeof sharp>;

// Retrieve mock instance references after import
function getMockInstance() {
  return mockSharp.mock.results[0]?.value ?? mockSharp(Buffer.alloc(0));
}

beforeEach(() => {
  jest.clearAllMocks();
  // Re-stub toBuffer after clearAllMocks resets it
  const mockToBuffer = jest.fn().mockResolvedValue(Buffer.from('mock-image'));
  const mockInstance = {
    resize: jest.fn().mockReturnThis(),
    jpeg: jest.fn().mockReturnThis(),
    toBuffer: mockToBuffer,
  };
  mockSharp.mockReturnValue(mockInstance as unknown as ReturnType<typeof sharp>);
});

describe('extractExif', () => {
  it('returns ExifData when GPS fields are present', async () => {
    mockParse.mockResolvedValue({
      latitude: 51.5074,
      longitude: -0.1278,
      DateTimeOriginal: new Date('2024-06-15T10:30:00Z'),
      GPSLatitudeRef: 'N',
      GPSLongitudeRef: 'W',
      GPSAltitude: 12.5,
    });

    const result = await extractExif(Buffer.from('fake-jpeg'));

    expect(result).not.toBeNull();
    expect(result!.latitude).toBe(51.5074);
    expect(result!.longitude).toBe(-0.1278);
    expect(result!.latitudeRef).toBe('N');
    expect(result!.altitude).toBe(12.5);
    expect(result!.timestamp).toBe('2024-06-15T10:30:00.000Z');
  });

  it('returns null when no GPS data', async () => {
    mockParse.mockResolvedValue({ Make: 'Canon' });
    const result = await extractExif(Buffer.from('no-gps'));
    expect(result).toBeNull();
  });

  it('returns null when exifr.parse returns null', async () => {
    mockParse.mockResolvedValue(null);
    const result = await extractExif(Buffer.from('empty'));
    expect(result).toBeNull();
  });
});

describe('processImage', () => {
  it('returns fullSize and thumbnail buffers', async () => {
    const input = Buffer.from('input-image');
    const { fullSize, thumbnail } = await processImage(input);

    expect(fullSize).toEqual(Buffer.from('mock-image'));
    expect(thumbnail).toEqual(Buffer.from('mock-image'));
  });

  it('resizes full-size to max 2048x2048 (inside fit)', async () => {
    await processImage(Buffer.from('x'));
    const instance = getMockInstance();
    expect(instance.resize).toHaveBeenCalledWith(
      2048,
      2048,
      expect.objectContaining({ fit: 'inside' }),
    );
  });

  it('resizes thumbnail to 200x200 (cover fit)', async () => {
    await processImage(Buffer.from('x'));
    const instance = getMockInstance();
    expect(instance.resize).toHaveBeenCalledWith(200, 200, expect.objectContaining({ fit: 'cover' }));
  });
});
```

- [ ] **Step 2: Run and verify tests pass**

```bash
cd packages/extractor && npm test -- tests/processor.test.ts
```

Expected: All tests pass.

- [ ] **Step 3: Run full extractor test suite**

```bash
cd packages/extractor && npm test
```

Expected: All database and processor tests pass.

- [ ] **Step 4: Commit extractor tests**

```bash
cd /home/mhvelplund/projects/spyro-map/.worktrees/v2
git add packages/extractor/tests/
git commit -m "test: add extractor unit tests (database helpers, processor EXIF/image)"
```

---

## Chunk 5: Frontend Tests and Documentation

ApiClient test with mocked fetch, config mock file, and copilot-instructions update.

### Task 5.1: Frontend ApiClient tests

**Files:**
- Create: `packages/frontend/tests/__mocks__/config.ts`
- Create: `packages/frontend/tests/ApiClient.test.ts`

- [ ] **Step 1: Create config mock file**

Create `packages/frontend/tests/__mocks__/config.ts`:

```typescript
export const API_BASE_URL = '';
```

This file is mapped in by `jest.config.ts` whenever `ApiClient.ts` imports `'../config.js'`, preventing `import.meta.env` from being evaluated in Node.

- [ ] **Step 2: Write the ApiClient tests**

Create `packages/frontend/tests/ApiClient.test.ts`:

```typescript
import type { ImageRecord } from '@spyro-map/shared';
import { ApiClient } from '../src/services/ApiClient.js';

const FIXTURE: ImageRecord = {
  id: 'img1',
  imageUrl: 'http://test/images/img1.jpg',
  thumbnailUrl: 'http://test/images/thumbnails/img1.jpg',
  latitude: 51.5,
  longitude: -0.12,
  timestamp: '2024-01-01T00:00:00.000Z',
};

function makeResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

let fetchSpy: jest.SpyInstance;
let client: ApiClient;

beforeEach(() => {
  fetchSpy = jest.spyOn(global, 'fetch');
  client = new ApiClient();
});

afterEach(() => {
  fetchSpy.mockRestore();
});

describe('getAllImages', () => {
  it('calls GET /api/images and returns parsed array', async () => {
    fetchSpy.mockResolvedValue(makeResponse([FIXTURE]));
    const result = await client.getAllImages();
    expect(fetchSpy).toHaveBeenCalledWith('/api/images');
    expect(result).toEqual([FIXTURE]);
  });

  it('throws on HTTP error', async () => {
    fetchSpy.mockResolvedValue(makeResponse({}, 500));
    await expect(client.getAllImages()).rejects.toThrow('Failed to fetch images');
  });

  it('throws on network failure', async () => {
    fetchSpy.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(client.getAllImages()).rejects.toThrow('Failed to fetch');
  });
});

describe('getImageById', () => {
  it('calls GET /api/images/:id and returns record on 200', async () => {
    fetchSpy.mockResolvedValue(makeResponse(FIXTURE));
    const result = await client.getImageById('img1');
    expect(fetchSpy).toHaveBeenCalledWith('/api/images/img1');
    expect(result).toEqual(FIXTURE);
  });

  it('returns null on 404', async () => {
    fetchSpy.mockResolvedValue(makeResponse({}, 404));
    const result = await client.getImageById('missing');
    expect(result).toBeNull();
  });

  it('throws on HTTP 500', async () => {
    fetchSpy.mockResolvedValue(makeResponse({}, 500));
    await expect(client.getImageById('img1')).rejects.toThrow('Failed to fetch image');
  });

  it('throws on network failure', async () => {
    fetchSpy.mockRejectedValue(new TypeError('Network error'));
    await expect(client.getImageById('img1')).rejects.toThrow('Network error');
  });
});

describe('getNearbyImages', () => {
  it('calls GET /api/images/:id/nearby with default radius 1', async () => {
    fetchSpy.mockResolvedValue(makeResponse([FIXTURE]));
    const result = await client.getNearbyImages('img1');
    expect(fetchSpy).toHaveBeenCalledWith('/api/images/img1/nearby?radius=1');
    expect(result).toEqual([FIXTURE]);
  });

  it('uses custom radius when provided', async () => {
    fetchSpy.mockResolvedValue(makeResponse([]));
    await client.getNearbyImages('img1', 5);
    expect(fetchSpy).toHaveBeenCalledWith('/api/images/img1/nearby?radius=5');
  });

  it('throws on HTTP error', async () => {
    fetchSpy.mockResolvedValue(makeResponse({}, 500));
    await expect(client.getNearbyImages('img1')).rejects.toThrow('Failed to fetch nearby images');
  });

  it('throws on network failure', async () => {
    fetchSpy.mockRejectedValue(new TypeError('Connection refused'));
    await expect(client.getNearbyImages('img1')).rejects.toThrow('Connection refused');
  });
});
```

- [ ] **Step 3: Run and verify tests pass**

```bash
cd packages/frontend && npm test -- tests/ApiClient.test.ts
```

Expected: All 11 tests pass. If `import.meta.env` error appears, verify the `moduleNameMapper` in `jest.config.ts` is correct and `tests/__mocks__/config.ts` exists.

- [ ] **Step 4: Run full frontend test suite**

```bash
cd packages/frontend && npm test
```

Expected: All tests pass.

### Task 5.2: Update copilot instructions

**Files:**
- Modify: `.github/copilot-instructions.md`

- [ ] **Step 1: Add testing requirements to copilot instructions**

In `.github/copilot-instructions.md`, find the `## Build, lint, and data-prep commands` section and add `npm test` to the command list, then add a new `## Testing` section after the existing build commands section:

Under `## Build, lint, and data-prep commands`, add:
```
- `npm test` runs all unit tests across all workspace packages.
- `npm test --workspace=packages/backend` runs only the backend tests.
- `npm test --workspace=packages/extractor` runs only the extractor tests.
- `npm test --workspace=packages/frontend` runs only the frontend tests.
- Automated tests are in `packages/<pkg>/tests/`.
```

Add a new section after the build commands section:

```markdown
## Testing requirements

- **Before pushing a PR:** run `npm test` from the repo root. All tests must pass. Do not open a PR with failing tests.
- **When adding new logic:** add or update the regression tests in `packages/<pkg>/tests/` as part of the same commit or PR. Do not merge code that adds logic without accompanying test coverage.
- **Test framework:** Jest 29 + ts-jest (ESM mode). Run with `node --experimental-vm-modules`.
- **Test location:** `packages/<pkg>/tests/**/*.test.ts`. Tests for a module live in the same package, not in a shared test folder.
```

- [ ] **Step 2: Verify the instructions file looks correct**

```bash
grep -A 10 "## Testing requirements" .github/copilot-instructions.md
```

Expected: Section present with the four bullet points.

### Task 5.3: Final verification and commit

- [ ] **Step 1: Run all tests from the root**

```bash
cd /home/mhvelplund/projects/spyro-map/.worktrees/v2
npm test
```

Expected: All packages pass. Summary should show tests from backend, extractor, and frontend.

- [ ] **Step 2: Run the full lint check**

```bash
npm run lint
```

Expected: No new errors introduced.

- [ ] **Step 3: Verify all packages still build**

```bash
npm run build --workspace=packages/backend
npm run build --workspace=packages/extractor
npm run build --workspace=packages/frontend
```

Expected: All three build cleanly.

- [ ] **Step 4: Commit tests and documentation**

```bash
cd /home/mhvelplund/projects/spyro-map/.worktrees/v2
git add packages/frontend/tests/ .github/copilot-instructions.md
git commit -m "test: add frontend ApiClient tests and testing requirements to copilot instructions"
```

- [ ] **Step 5: Push the branch**

```bash
git push
```

Expected: Branch updated on remote. All tests visible in PR checks.

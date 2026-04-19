# Jest Unit Tests — Design Spec

**Date:** 2026-04-19
**Status:** Approved

## Problem

The v2 monorepo (`feat/v2-architecture`) has no automated tests. Regressions cannot be caught before merging PRs.

## Goals

- Add Jest unit tests to `packages/backend`, `packages/extractor`, and `packages/frontend`.
- Tests live in `packages/<pkg>/tests/` sub-folders.
- Every package can be built (`npm run build`) and tested (`npm test`) independently.
- A root-level `npm test` runs all workspace tests.
- Copilot instructions updated to require tests on every PR.

## Non-Goals

- Component tests (React, jsdom, React Testing Library) — deferred.
- E2E / integration tests against real S3 or Docker.
- `packages/shared` tests — types only, no runtime logic.

## Test Framework

**Jest with ts-jest (ESM mode).** All packages use `"type": "module"` and strict TypeScript with `.js` import extensions. `ts-jest` with `useESM: true` handles this natively.

- Runtime: `NODE_OPTIONS='--experimental-vm-modules' jest` (stable since Node 18).
- `moduleNameMapper`: strip `.js` from relative imports so Jest resolves TypeScript files correctly.
- `transformIgnorePatterns`: exclude `node_modules` except ESM-only packages that need transpiling.

## Source Refactor

`packages/backend/src/database.ts` contains a private `haversineKm` function used by `getNearbyImages`. To enable direct unit testing, extract it to `packages/backend/src/utils.ts` and export it.

No other source changes are required.

## Per-Package Jest Config

Each package gets:

```
packages/<pkg>/
  jest.config.ts          ← per-package config
  tsconfig.json           ← updated to include tests/**/*.ts
  tests/
    *.test.ts
```

Shared config pattern (`jest.config.ts`):

```ts
import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { useESM: true }],
  },
};
export default config;
```

## Test Coverage

### `packages/backend`

**`tests/utils.test.ts`** — `haversineKm` (extracted from database.ts):
- Same point → 0 km
- Known point pairs (e.g., London–Paris ≈ 340 km ±5%)
- Antipodal points → ≈ 20,015 km

**`tests/database.test.ts`** — `getAllImages`, `getImageById`, `getNearbyImages`:
- Create a real SQLite `:memory:` database via the same schema as the extractor.
- Insert fixture rows.
- Assert getAllImages returns correct ImageRecord shape with constructed URLs.
- Assert getImageById returns correct record / null for unknown ID.
- Assert getNearbyImages filters by radius and sorts by distance.

**`tests/routes.test.ts`** — API endpoints via Fastify `inject()`:
- Mock the `database` service module with `jest.mock`.
- `GET /api/health` → `{ status: "ok" }`.
- `GET /api/images` → array from mock.
- `GET /api/images/:id` → record / 404.
- `GET /api/images/:id/nearby` → nearby array / 404.
- `POST /api/reload` → `{ status: "ok" }`.

### `packages/extractor`

**`tests/database.test.ts`** — SQLite helpers:
- `openDatabase(':memory:')` creates schema and indexes.
- `imageExists` returns false before insert, true after.
- `insertImage` inserts a row with all EXIF fields.
- `getAllImageIds` returns correct set.

**`tests/processor.test.ts`** — EXIF extraction and image processing:
- Mock `exifr` module; test `extractExif` with GPS data → correct `ExifData` shape.
- `extractExif` with no GPS → returns `null`.
- Mock `sharp` module; test `processImage` calls resize correctly and returns `{ fullSize, thumbnail }`.

### `packages/frontend`

**`tests/ApiClient.test.ts`** — REST client:
- Mock global `fetch`.
- `fetchAllImages()` calls `GET /api/images` → parses response.
- `fetchImageById(id)` calls `GET /api/images/:id` → parses record / null on 404.
- `fetchNearbyImages(id, radius)` calls `GET /api/images/:id/nearby?radius=...` → parses array.
- HTTP error (500) → throws.

## Root Workspace Integration

`package.json` (root) gains:

```json
"scripts": {
  "test": "npm run test --workspaces --if-present"
}
```

## Copilot Instructions Update

Add to `.github/copilot-instructions.md`:

> **Before pushing a PR:** run `npm test` from the repo root. All tests must pass.
> **When adding new code:** add or update the regression tests in `packages/<pkg>/tests/`. Do not merge code that lacks test coverage for new logic.

## Dependencies Added

| Package | Location | Purpose |
|---|---|---|
| `jest` | all tested packages (devDep) | Test runner |
| `ts-jest` | all tested packages (devDep) | TypeScript transform |
| `@types/jest` | all tested packages (devDep) | Jest type defs |

`better-sqlite3` already in backend/extractor deps — used directly in tests with `:memory:`.
No additional mocking libraries needed — Jest's built-in `jest.mock` is sufficient.

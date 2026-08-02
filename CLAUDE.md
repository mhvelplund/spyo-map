# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> REQUIRED: Use superpowers:using-superpowers (if it is available).

## Overview

Spyro Map is a browser-based app that displays geo-tagged images on an interactive map (React + Leaflet/OpenStreetMap
frontend, Fastify API backend, MinIO/S3 object storage). Photos are ingested by a one-shot extractor job that reads
EXIF GPS data and writes a SQLite `images.db` to object storage; the backend downloads and serves that DB as JSON.

## Commands

- `npm run dev` — Vite dev server on port 3000, proxies `/api` to `localhost:3001`.
- `npm run lint` — ESLint across all workspace packages.
- `npm run build` — builds the frontend (`packages/frontend/dist/`).
- `npm run build --workspace=packages/backend` — compiles the Fastify backend to `packages/backend/dist/`.
- `npm run build --workspace=packages/extractor` — compiles the extractor job.
- `npm test` — runs all workspace tests. Run this before pushing a PR; all tests must pass.
- `npm test --workspace=packages/backend` / `packages/extractor` / `packages/frontend` — run a single package's tests.
- `docker compose up` — starts MinIO + backend + frontend for local development.
- `docker compose run --rm extractor` — runs the extractor against the MinIO `raw/` folder.
- `docker compose run --rm -e LOCAL_SOURCE_PATH=/photos -v /path/to/photos:/photos extractor` — ingests from a local folder instead of the bucket.
- `POST http://localhost:3001/api/reload` — force the backend to re-download `images.db` immediately (otherwise it refreshes every `DB_REFRESH_INTERVAL_MS`, default 300000ms).

Test framework is Jest 29 + ts-jest in ESM mode (`node --experimental-vm-modules`). Tests live in
`packages/<pkg>/tests/**/*.test.ts` — colocated per package, not in a shared test folder.

- **When adding new logic:** add or update regression tests in `packages/<pkg>/tests/` as part of the same commit/PR.
  Do not merge code that adds logic without accompanying test coverage.
- Use mise for tool version management; install all pinned tools with `mise install`.

## Architecture

npm workspaces monorepo, four runtime packages plus a smoke-test package:

- **`packages/shared`** — Shared TypeScript types (`ImageRecord`, `GeoLocation`, `AppState`, component prop types).
  Both frontend and backend import from here; it has no build step (`main`/`exports` point straight at `src/types.ts`).
- **`packages/frontend`** — React + Vite + Leaflet SPA. Fetches image metadata from the backend REST API via
  `ApiClient`, and loads images directly from S3/MinIO via `<img src>` using absolute URLs the API returns. No
  SQL.js, no Google Maps, no API key in the browser.
- **`packages/backend`** — Fastify REST API (`src/server.ts`, routes in `src/routes/images.ts`). Downloads
  `images.db` from S3/MinIO at startup via `@aws-sdk/client-s3`, reads it with `better-sqlite3`
  (`src/services/database.ts`), and serves JSON at `/api/images`. Never proxies image bytes; constructs
  `imageUrl`/`thumbnailUrl` from the `IMAGES_BASE_URL` env var.
- **`packages/extractor`** — One-shot CLI ingestion job. Reads photos from `raw/` in the bucket or a local folder
  (`LOCAL_SOURCE_PATH`), extracts GPS EXIF with `exifr`, resizes with `sharp` (`src/processor.ts`), uploads to
  `images/` and `images/thumbnails/` (`src/storage.ts`), then atomically replaces `images.db` in the bucket
  (`src/database.ts`).
- **`packages/smoke-test`** — standalone Jest package, no source, just tests.

Object storage layout:
```
bucket/
├── raw/                 ← upload source photos here
├── images/              ← processed full-size (public read)
│   └── thumbnails/      ← thumbnails (public read)
└── images.db            ← SQLite DB (private; backend + extractor only)
```

### Frontend routing/component flow

- Routing is hash-based (`/#/image/:imageId`) for static-hosting compatibility — preserved by `generateImageUrl()`
  and `SocialShare`.
- `MainMapView` loads all images via `apiClient.getAllImages()` and passes them to `MapView`.
- `MapView` (`src/components/MapView.tsx`) owns Leaflet integration: circular thumbnail markers via `DivIcon`,
  clustering via `leaflet.markercluster`, reports selection back to the router layer.
- `ImageView` handles deep-linked routes, fetches nearby images via `apiClient.getNearbyImages()`, opens
  `ImageModal`.
- `ImageModal` handles full-image viewing, keyboard/touch navigation, and social sharing.
- Normalize image identifiers with `extractImageId()` (`src/utils/urlUtils.ts`) wherever routes, selection
  handlers, or shared URLs are involved.

### Key conventions

- `ImageRecord` carries `imageUrl`/`thumbnailUrl` as absolute URLs already resolved by the API — never derive image
  paths from IDs in the frontend.
- Both S3 clients (backend and extractor) must set `forcePathStyle: true` for MinIO compatibility.
- TypeScript strict mode across all packages; follow the typed `ImageRecord`/props patterns already in use.

### Infra

`infra/` is Terragrunt/Terraform (`infra/live/<component>` + `infra/modules/<component>`) covering networking, IAM,
storage, ECR, compute (Lightsail), CDN, and a scheduler for the extractor. `mise.toml` pins `terraform`/`terragrunt`
versions; shell aliases `tf`/`tg`/`dc` map to `terraform`/`terragrunt`/`docker compose`.

## Planning

When planning a feature spanning multiple packages, sequence the work: shared interface changes first, then
backend and frontend work can proceed in parallel branches without merge conflicts.

## Source control

- Conventional commits only: `<type>: <description>`, using exactly `feat`, `chore`, or `feat!` (breaking changes).
- Never commit to `main` directly — always a feature branch + PR.
- Keep PRs focused; don't bundle unrelated changes.
- For multi-stage features, PR into the feature branch rather than `main` until the whole feature is ready.

## Communication style

- Be terse and direct. No filler, no preamble, no summaries unless asked.
- State the answer or action, then stop. This applies to chat responses only, not generated code/comments.

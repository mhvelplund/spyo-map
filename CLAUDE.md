# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> REQUIRED: Use superpowers:using-superpowers (if it is available).

## Overview

Spyo Map is a browser-based app that displays geo-tagged images on an interactive map (React + Leaflet/OpenStreetMap
frontend). It runs entirely on Cloudflare's free tier: one Worker serves the SPA as static assets and a `/api/*` JSON
API backed by D1, and images are served directly from an R2 bucket on its own domain. Photos are ingested by a one-shot
extractor job that runs in GitHub Actions, reads EXIF GPS data, writes processed images to R2, and upserts metadata into
D1.

## Commands

- `npm run dev --workspace=packages/worker` — `wrangler dev` on port 8787 (Worker + local D1).
- `npm run dev --workspace=packages/frontend` — Vite dev server on port 3000, proxies `/api` to 8787.
- `npm run lint` — ESLint across all workspace packages.
- `npm run build --workspace=packages/frontend` — builds the SPA into `packages/frontend/dist/`.
- `npm run build --workspace=packages/extractor` — compiles the extractor job.
- `npx wrangler deploy --config packages/worker/wrangler.toml` — deploys the Worker and assets.
- `npm test` — runs all workspace tests. Run this before pushing a PR; all tests must pass.
- `npm test --workspace=packages/worker` / `packages/extractor` / `packages/frontend` — single package.

See `docs/runbooks/cloudflare-bootstrap.md` for one-time setup and for running the extractor.

Test framework is Jest 29 + ts-jest in ESM mode (`node --experimental-vm-modules`). Tests live in
`packages/<pkg>/tests/**/*.test.ts` — colocated per package, not in a shared test folder.

- **When adding new logic:** add or update regression tests in `packages/<pkg>/tests/` as part of the same commit/PR. Do
  not merge code that adds logic without accompanying test coverage.
- Use mise for tool version management; install all pinned tools with `mise install`.

## Architecture

npm workspaces monorepo, four runtime packages plus a smoke-test package:

- **`packages/shared`** — Shared TypeScript types (`ImageRecord`, `GeoLocation`, `AppState`, component prop types). No
  build step (`main`/`exports` point straight at `src/types.ts`).
- **`packages/frontend`** — React + Vite + Leaflet SPA. Fetches image metadata from the Worker's REST API via
  `ApiClient`, and loads images directly from R2 via `<img src>` using absolute URLs the API returns. No SQL.js, no
  Google Maps, no API key in the browser.
- **`packages/worker`** — Cloudflare Worker (`src/index.ts`, routing in `src/router.ts`). Serves the built SPA through
  the `ASSETS` binding and answers `/api/*` from the `DB` (D1) binding via `src/services/database.ts`. Never proxies
  image bytes; constructs `imageUrl`/`thumbnailUrl` from the `IMAGES_BASE_URL` var. Config lives in `wrangler.toml`; the
  D1 schema lives in `migrations/`.
- **`packages/extractor`** — One-shot CLI ingestion job, run by GitHub Actions. Reads photos from `raw/` in R2 or a
  local folder (`LOCAL_SOURCE_PATH`), extracts GPS EXIF with `exifr`, resizes with `sharp` (`src/processor.ts`), uploads
  to `images/` and `images/thumbnails/` (`src/storage.ts`), then upserts metadata into D1 (`src/d1.ts`).
- **`packages/smoke-test`** — standalone Jest package, no source, just tests. Runs against a deployed `SMOKE_BASE_URL`
  and skips when that is unset.

R2 bucket layout:
```
spyo-map/
├── raw/                 ← upload source photos here (private; deleted after ingest)
├── images/              ← processed full-size (public via spyo-img.isntall.net)
│   └── thumbnails/      ← thumbnails (public)
```

### Frontend routing/component flow

- Routing is hash-based (`/#/image/:imageId`) for static-hosting compatibility — preserved by `generateImageUrl()` and
  `SocialShare`.
- `MainMapView` loads all images via `apiClient.getAllImages()` and passes them to `MapView`.
- `MapView` (`src/components/MapView.tsx`) owns Leaflet integration: circular thumbnail markers via `DivIcon`,
  clustering via `leaflet.markercluster`, reports selection back to the router layer.
- `ImageView` handles deep-linked routes, fetches nearby images via `apiClient.getNearbyImages()`, opens `ImageModal`.
- `ImageModal` handles full-image viewing, keyboard/touch navigation, and social sharing.
- Normalize image identifiers with `extractImageId()` (`src/utils/urlUtils.ts`) wherever routes, selection handlers, or
  shared URLs are involved.

### Key conventions

- `ImageRecord` carries `imageUrl`/`thumbnailUrl` as absolute URLs already resolved by the API — never derive image
  paths from IDs in the frontend.
- The extractor's S3 client targets R2: region `auto`, the account's `*.r2.cloudflarestorage.com` endpoint, and
  credentials from an R2 API token.
- TypeScript strict mode across all packages; follow the typed `ImageRecord`/props patterns already in use.

### Infra

There is no Terraform. Cloudflare resources are declared in `packages/worker/wrangler.toml` and created once by CLI —
see `docs/runbooks/cloudflare-bootstrap.md`. `mise.toml` pins `node`.

## Planning

When planning a feature spanning multiple packages, sequence the work: shared interface changes first, then worker and
frontend work can proceed in parallel branches without merge conflicts.

## Source control

- Conventional commits only: `<type>: <description>`, using exactly `feat`, `chore`, or `feat!` (breaking changes).
- Never commit to `main` directly — always a feature branch + PR.
- Keep PRs focused; don't bundle unrelated changes.
- For multi-stage features, PR into the feature branch rather than `main` until the whole feature is ready.

## Communication style

- Be terse and direct. No filler, no preamble, no summaries unless asked.
- State the answer or action, then stop. This applies to chat responses only, not generated code/comments.

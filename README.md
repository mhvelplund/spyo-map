# Spyo Map

A browser-based web application that displays geo-tagged images on an interactive map. Browse photos by location, view
in a modal lightbox, navigate between nearby images, and share on social media.

Built with a React + Leaflet (OpenStreetMap) frontend, running entirely on Cloudflare: a Worker serves the SPA and a
JSON API backed by D1, and images are served directly from an R2 bucket.

## Development story

This app was created by an old-fashioned developer using the dreaded vibe coding. It's a form physical log of my
experiment. This app was created with [Kiro](https://kiro.dev/) using this initial prompt below. It is not my first
attempt at creating a full app with Kiro, but it was the first _partially_ successful.

**The process is described in the [blog post](https://www.swissarmyronin.dk/blog/kiro/).**

## Architecture

```text
Browser (React + Leaflet)
  │
  ├─ GET /api/images  ──▶  Cloudflare Worker  ──▶  D1 (spyo-map)
  │
  └─ <img src="...">  ──▶  R2 (spyo-img.isntall.net, direct, no proxy)
                              ├── raw/          ← drop photos here
                              ├── images/       ← processed full-size
                              └── thumbnails/
```

The frontend never touches R2 directly except for loading images via `<img>` tags. Image metadata (coordinates, URLs)
comes from the Worker's REST API, which reads D1 directly on every request.

## Local development

### Prerequisites

- [Node.js 22+](https://nodejs.org/)
- [mise](https://mise.jdx.dev/) (optional, for tool version management)
- A Cloudflare account is only needed for deploying; local dev uses `wrangler`'s local D1 emulation.

See `docs/runbooks/cloudflare-bootstrap.md` for one-time Cloudflare setup (R2 bucket, D1 database, API tokens) and for
running the extractor against a live bucket.

### Start the Worker and frontend

```shell
npm install
npx wrangler d1 migrations apply spyo-map --local --config packages/worker/wrangler.toml
npm run dev --workspace=packages/worker    # wrangler dev at http://localhost:8787
npm run dev --workspace=packages/frontend  # Vite dev server at http://localhost:3000, proxies /api to 8787
```

### Ingest photos

Photos are ingested from the `raw/` prefix of the R2 bucket, or from a local folder via `LOCAL_SOURCE_PATH`. See
`docs/runbooks/cloudflare-bootstrap.md` for uploading to `raw/` and running the extractor.

## Monorepo structure

```text
packages/
├── shared/      # Shared TypeScript types (ImageRecord, etc.)
├── frontend/    # React + Vite + Leaflet SPA
├── worker/      # Cloudflare Worker: serves the SPA and the /api/* JSON API
└── extractor/   # Image ingestion job (runs in GitHub Actions)
```

## Commands

```shell
# Install all workspace dependencies
npm install

# Frontend dev server (hot reload)
npm run dev

# Build frontend for production
npm run build

# Lint all packages
npm run lint

# Build extractor
npm run build --workspace=packages/extractor

# Deploy the Worker (builds the frontend first)
npm run build --workspace=packages/frontend
npx wrangler deploy --config packages/worker/wrangler.toml
```

## Environment variables

### Worker (`wrangler.toml`)

| Name               | Kind    | Value                                |
| ------------------ | ------- | ------------------------------------- |
| `IMAGES_BASE_URL`  | var     | `https://spyo-img.isntall.net`   |
| `DB`               | binding | D1 database `spyo-map`               |
| `ASSETS`           | binding | `packages/frontend/dist`             |

### Extractor (environment)

| Name                    | Required | Description                                     |
| ----------------------- | -------- | ------------------------------------------------ |
| `STORAGE_ENDPOINT`      | yes      | `https://<account-id>.r2.cloudflarestorage.com` |
| `STORAGE_BUCKET`        | yes      | `spyo-map`                                      |
| `STORAGE_ACCESS_KEY`    | yes      | R2 API token access key id                      |
| `STORAGE_SECRET_KEY`    | yes      | R2 API token secret                             |
| `STORAGE_REGION`        | no       | Defaults to `auto`                              |
| `CLOUDFLARE_ACCOUNT_ID` | yes      | Cloudflare account id                           |
| `CLOUDFLARE_API_TOKEN`  | yes      | Token with D1 Edit                              |
| `D1_DATABASE_ID`        | yes      | Database id from `wrangler d1 create`           |
| `LOCAL_SOURCE_PATH`     | no       | Ingest from a local folder instead of `raw/`    |

## Production deployment

Deploys run from GitHub Actions on push to `main` (`.github/workflows/deploy.yml`): install, lint, test, build the
frontend, then `wrangler deploy`. Photo ingestion runs on a schedule and on demand (`.github/workflows/ingest.yml`). See
`docs/runbooks/cloudflare-bootstrap.md` for one-time setup (R2 bucket, D1 database, custom domains, API tokens, and
GitHub repository secrets).

The `raw/` prefix should remain private; only `images/` and `images/thumbnails/` need public read.

## API

| Method | Endpoint                          | Description                                            |
|--------|------------------------------------|----------------------------------------------------------|
| `GET`  | `/api/images`                     | All images (with absolute `imageUrl` + `thumbnailUrl`) |
| `GET`  | `/api/images/:id`                 | Single image                                           |
| `GET`  | `/api/images/:id/nearby?radius=1` | Nearby images within radius (km)                       |
| `GET`  | `/api/health`                     | `{ status: "ok" }`                                     |

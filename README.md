# Spyo Map

A browser-based web application that displays geo-tagged images on an interactive map. Browse photos by location,
view in a modal lightbox, navigate between nearby images, and share on social media.

Built with React + Leaflet (OpenStreetMap) frontend, a Fastify API backend, and MinIO/S3 object storage for images.

## Development story

This app was created by an old-fashioned developer using the dreaded vibe coding. It's a form physical log of my
experiment. This app was created with [Kiro](https://kiro.dev/) using this initial prompt below. It is not my first
attempt at creating a full app with Kiro, but it was the first _partially_ successful.

**The process is described in the [blog post](https://www.swissarmyronin.dk/blog/kiro/).**

## Architecture

```
Browser (React + Leaflet)
  │
  ├─ GET /api/images  ──▶  Fastify backend  ──▶  downloads images.db from S3/MinIO
  │
  └─ <img src="...">  ──▶  S3/MinIO (direct, no proxy)
                              ├── raw/          ← drop photos here
                              ├── images/       ← processed full-size
                              │   └── thumbnails/
                              └── images.db     ← written by extractor job
```

The frontend never touches the object store directly except for loading images via `<img>` tags. Image metadata
(coordinates, URLs) comes from the backend REST API. The backend downloads `images.db` from object storage at startup
and refreshes it periodically.

## Local development

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose
- [Node.js 22+](https://nodejs.org/) (for `npm run dev` hot-reload workflow)
- [mise](https://mise.jdx.dev/) (optional, for tool version management)

### Start all services

```shell
docker compose up
```

This starts:
- **MinIO** at `http://localhost:9000` (API) and `http://localhost:9001` (web console)
- **Backend** at `http://localhost:3001`
- **Frontend** (nginx) at `http://localhost:80`

MinIO credentials: `minioadmin` / `minioadmin`

### Ingest photos

Drop photos into the MinIO `raw/` folder via the web console (`http://localhost:9001`), then run the extractor:

```shell
docker compose run --rm extractor
```

To ingest from a local folder (e.g. an SD card):

```shell
docker compose run --rm -e LOCAL_SOURCE_PATH=/photos -v /path/to/photos:/photos extractor
```

After the extractor finishes, the backend picks up the new `images.db` automatically within 30 seconds (or call
`POST http://localhost:3001/api/reload` to reload immediately).

### Hot-reload frontend development

```shell
npm install
npm run dev   # starts Vite dev server at http://localhost:3000, proxies /api to localhost:3001
```

## Monorepo structure

```
packages/
├── shared/      # Shared TypeScript types (ImageRecord, etc.)
├── frontend/    # React + Vite + Leaflet SPA
├── backend/     # Fastify REST API server
└── extractor/   # Image ingestion job (replaces extract_exif.py)
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

# Build backend
npm run build --workspace=packages/backend

# Build extractor
npm run build --workspace=packages/extractor
```

## Environment variables

**Backend** (`packages/backend/`):

| Variable | Default | Description |
|---|---|---|
| `STORAGE_ENDPOINT` | — | S3/MinIO endpoint (e.g. `http://minio:9000`) |
| `STORAGE_BUCKET` | — | Bucket name |
| `STORAGE_ACCESS_KEY` | — | Access key ID |
| `STORAGE_SECRET_KEY` | — | Secret access key |
| `STORAGE_REGION` | `us-east-1` | AWS region (MinIO ignores this) |
| `IMAGES_BASE_URL` | — | Public base URL for images (e.g. `http://localhost:9000/spyro-map`) |
| `DB_REFRESH_INTERVAL_MS` | `300000` | DB re-download interval ms (`0` = startup only) |
| `PORT` | `3001` | HTTP port |

**Extractor** (`packages/extractor/`): same `STORAGE_*` vars plus:

| Variable | Default | Description |
|---|---|---|
| `LOCAL_SOURCE_PATH` | — | Read from local path instead of `raw/` in bucket |

## Production deployment

1. Push images to the `raw/` prefix of your S3 bucket
2. Run the extractor as an ECS scheduled task (or one-off container)
3. Deploy the backend container (ECS service, Fly.io, etc.) with `STORAGE_*` and `IMAGES_BASE_URL` env vars
4. Build the frontend (`npm run build --workspace=packages/frontend`) and upload `packages/frontend/dist/` to S3/CDN
5. Configure your CDN/load balancer to route `/api/*` to the backend

The `raw/` prefix and `images.db` should remain private. Only `images/` and `images/thumbnails/` need public read.

## API

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/images` | All images (with absolute `imageUrl` + `thumbnailUrl`) |
| `GET` | `/api/images/:id` | Single image |
| `GET` | `/api/images/:id/nearby?radius=1` | Nearby images within radius (km) |
| `POST` | `/api/reload` | Re-download `images.db` from object storage |
| `GET` | `/api/health` | `{ status: "ok" }` |

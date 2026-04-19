# Plan: Migrate to Leaflet + Fastify Backend

## Problem

The current app exposes the Google Maps API key in client-side JavaScript. The entire app is static — the browser
fetches `images.db` and opens it with SQL.js, and the Google Maps JS SDK is loaded with the key visible in the DOM.

## Approach

Replace Google Maps with Leaflet + OpenStreetMap (no API key needed). Add a Fastify backend that reads the SQLite
database server-side and serves image metadata via a REST API. Replace the Python `extract_exif.py` script with a
TypeScript extractor package that reads from/writes to object storage and can run as a scheduled job. Structure as an
npm workspaces monorepo with shared types.

### Target architecture

```
Static hosting (S3)        Backend (Docker/ECS)       Object storage (S3 / MinIO)
┌─────────────────┐        ┌─────────────────────┐    ┌────────────────────────────┐
│ React + Leaflet │──API──▶│ Fastify             │    │  bucket/                   │
│ (HTML/JS/CSS)   │        │ ├─ /api/images      │    │  ├─ raw/          ← upload │
│                 │◀─JSON──│ ├─ /api/images/:id  │    │  ├─ images/       ← job    │
│                 │        │ ├─ /api/images/:id/ │    │  │   └─ thumbnails/        │
│                 │        │ │    nearby         │    │  └─ images.db     ← job    │
│                 │        │ ├─ /api/reload      │    │                            │
│                 │        │ ├─ /api/health      │◀───┤  (backend downloads DB)    │
│                 │        │ └─ better-sqlite3   │    │                            │
│                 │──img─────────────────────────────▶│  images/ public read       │
└─────────────────┘        └─────────────────────┘    └────────────────────────────┘
                                                                 ▲
                                                       ┌─────────────────────┐
                                                       │ Extractor job       │
                                                       │ (TypeScript/Docker) │
                                                       │                     │
                                                       │ raw/ ──process──▶   │
                                                       │   images/, thumbs   │
                                                       │   images.db (tmp→)  │
                                                       └─────────────────────┘
```

**Object storage bucket layout:**
```
bucket/
├── raw/                    # Drop raw photos here; extractor reads from here
│   └── photo.jpg           # (or any supported format)
├── images/                 # Processed full-size images (max 2048×2048)
│   ├── abc123.jpg
│   └── thumbnails/         # Thumbnails (200×200)
│       └── abc123.jpg
└── images.db               # SQLite database — written by extractor, read by backend
```

Images and thumbnails are served **directly from object storage** by the browser. The backend never proxies image files
— it only serves JSON metadata. The API response includes absolute `imageUrl` and `thumbnailUrl` fields (pointing to
S3/MinIO) which the frontend uses directly in `<img>` tags. The nginx container that hosts the frontend static files has
**no `/images/*` proxy rule** — image requests go straight from the browser to object storage. At startup the backend
downloads `images.db` from object storage and caches it locally; it can refresh it via `POST /api/reload` or on a
configurable interval.

### Monorepo layout

```
/
├── packages/
│   ├── shared/              # Shared TypeScript types
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/types.ts     # ImageRecord, GeoLocation, etc.
│   │
│   ├── extractor/           # Image ingestion job (replaces extract_exif.py)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── Dockerfile
│   │   └── src/
│   │       ├── index.ts       # CLI entry point
│   │       ├── config.ts      # env vars: STORAGE_*, LOCAL_SOURCE_PATH
│   │       ├── storage.ts     # S3/MinIO client (AWS SDK v3)
│   │       ├── processor.ts   # Image resize + thumbnail (sharp)
│   │       ├── database.ts    # SQLite operations (better-sqlite3)
│   │       └── extractor.ts   # Main orchestration logic
│   │
│   ├── backend/             # Fastify API server (metadata only)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── Dockerfile
│   │   └── src/
│   │       ├── server.ts
│   │       ├── config.ts    # STORAGE_*, IMAGES_BASE_URL, DB_REFRESH_INTERVAL_MS
│   │       ├── routes/images.ts
│   │       └── services/database.ts  # Downloads images.db from S3/MinIO
│   │
│   └── frontend/            # React + Vite + Leaflet
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── Dockerfile       # nginx serving static build
│       ├── index.html
│       └── src/
│           ├── components/
│           │   ├── MapContainer.tsx   # Leaflet rewrite
│           │   └── ...
│           ├── services/
│           │   └── ApiClient.ts      # Replaces DatabaseService
│           └── utils/
│
├── docker-compose.yml       # MinIO + backend + frontend for local dev
├── package.json             # Root workspace config
├── extract_exif.py          # Deprecated — superseded by packages/extractor/
├── pyproject.toml           # Can be removed after extractor is migrated
└── (no data/ directory — images.db and images live in object storage)
```

### API design

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/images` | All images with metadata (includes absolute `imageUrl` and `thumbnailUrl`) |
| `GET` | `/api/images/:id` | Single image by ID |
| `GET` | `/api/images/:id/nearby?radius=1` | Nearby images within radius (km) |
| `POST` | `/api/reload` | Re-download `images.db` from object storage |
| `GET` | `/api/health` | Health check for container orchestration |

Image and thumbnail URLs are constructed server-side from `IMAGES_BASE_URL`:

```
imageUrl:      ${IMAGES_BASE_URL}/images/${id}.jpg
thumbnailUrl:  ${IMAGES_BASE_URL}/images/thumbnails/${id}.jpg
```

In production `IMAGES_BASE_URL` points to the S3 bucket public URL (e.g. `https://my-bucket.s3.amazonaws.com`). Locally
it points to the MinIO container (e.g. `http://localhost:9000/spyro-map`).

### Environment variables

**Shared (extractor + backend):**

| Variable | Description |
|---|---|
| `STORAGE_ENDPOINT` | S3/MinIO endpoint URL (e.g. `http://minio:9000`) |
| `STORAGE_BUCKET` | Bucket name (e.g. `spyro-map`) |
| `STORAGE_ACCESS_KEY` | Access key / AWS access key ID |
| `STORAGE_SECRET_KEY` | Secret key / AWS secret access key |
| `STORAGE_REGION` | AWS region (default: `us-east-1`; MinIO ignores this but the SDK requires it) |

**Backend only:**

| Variable | Description |
|---|---|
| `IMAGES_BASE_URL` | Public base URL for images (e.g. `http://localhost:9000/spyro-map`) |
| `DB_REFRESH_INTERVAL_MS` | Re-download interval (default: `300000` = 5 min; `0` = startup only) |
| `PORT` | Server port (default: `3001`) |

**Extractor only:**

| Variable | Description |
|---|---|
| `LOCAL_SOURCE_PATH` | If set, read images from this local path instead of `raw/` in bucket |

### Key changes

- **Remove**: `@googlemaps/react-wrapper`, `@googlemaps/markerclusterer`, `sql.js`, `@types/google.maps`,
  `VITE_GOOGLE_MAPS_API_KEY`
- **Deprecate**: `extract_exif.py`, `pyproject.toml` (replaced by `packages/extractor/`)
- **Add frontend**: `leaflet`, `react-leaflet`, `leaflet.markercluster`, `@types/leaflet`,
  `@types/leaflet.markercluster`
- **Add backend**: `fastify`, `@fastify/cors`, `better-sqlite3`, `@aws-sdk/client-s3`
- **Add extractor**: `exifr` (EXIF/GPS reading), `sharp` (image resize/thumbnail),
  `better-sqlite3`, `@aws-sdk/client-s3`
- **Move**: `src/types/index.ts` → `packages/shared/src/types.ts`
- **Replace**: `DatabaseService.ts` (SQL.js in browser) → `ApiClient.ts` (fetch from backend)
- **Rewrite**: `MapContainer.tsx` from Google Maps to Leaflet/react-leaflet
- **New**: MinIO container in `docker-compose.yml` for local object storage

## Todos

### Phase 0: Monorepo scaffolding (must be first)

- `monorepo-scaffold`: Set up npm workspaces, root `package.json`, shared types package. Move existing frontend code
  into `packages/frontend/`.

### Phase 1a: Backend (parallel with 1b after Phase 0)

- `backend-scaffold`: Create `packages/backend/` with Fastify, TypeScript config, and dev scripts. Include `config.ts`
  that reads `STORAGE_*`, `IMAGES_BASE_URL`, `DB_REFRESH_INTERVAL_MS`, `PORT` from environment. The S3 client must use
  `forcePathStyle: true` (same as the extractor) for MinIO compatibility.
- `backend-database`: Implement `DatabaseService` using `better-sqlite3`. At startup, download `images.db` from object
  storage to a local temp file using `@aws-sdk/client-s3`. Provide `getAllImages()`, `getImageById(id)`,
  `getNearbyImages(lat, lng, radius)`. All responses include `imageUrl` and `thumbnailUrl` from `IMAGES_BASE_URL`.
  Support periodic refresh via `DB_REFRESH_INTERVAL_MS` and manual reload.
- `backend-routes`: Implement REST routes for `/api/images`, `/api/images/:id`, `/api/images/:id/nearby`,
  `POST /api/reload`, `/api/health`. No static file serving — images are in S3/MinIO.
- `backend-docker`: Write `Dockerfile` for backend. Alpine Node image, copy built JS. No file volume mounts —
  `images.db` is downloaded from object storage at startup. Accepts all `STORAGE_*` and `IMAGES_BASE_URL` env vars.

### Phase 1b: Frontend migration (parallel with 1a after Phase 0)

- `frontend-leaflet`: Replace Google Maps with Leaflet + react-leaflet. Rewrite `MapContainer.tsx` to use
  `<MapContainer>` from react-leaflet (note: the react-leaflet component shares the name — consider renaming the file
  to `MapView.tsx` to avoid import confusion), OSM tile layer, and `leaflet.markercluster` for clustering. Preserve
  thumbnail-in-marker UI using `DivIcon`.
- `frontend-api-client`: Replace `DatabaseService.ts` with `ApiClient.ts` that fetches from backend REST API. Update
  all consumers (`MainMapView`, `ImageView`). Update `ImageRecord` in `packages/shared/src/types.ts`: replace
  `path`/`thumbnailPath` with `imageUrl`/`thumbnailUrl` (absolute URLs from API). Update all component references.
- `frontend-cleanup`: Remove Google Maps dependencies, `VITE_GOOGLE_MAPS_API_KEY` references, Google Maps preconnect
  links from `index.html`, and `sql.js` dependency. Update `vite.config.ts` (remove `maps` manual chunk, remove
  `database` chunk, add dev proxy to backend).
- `frontend-docker`: Write `Dockerfile` for frontend. Multi-stage: build with Node, serve with nginx. Nginx proxies
  `/api/*` to the backend only. There is **no** `/images/*` proxy — the browser fetches images and thumbnails directly
  from object storage (S3/MinIO) using the URLs returned by the API.

### Phase 1c: Extractor (parallel with 1a/1b after Phase 0)

- `extractor-scaffold`: Create `packages/extractor/` with TypeScript config and dev scripts. Implement `config.ts` and
  `storage.ts` (AWS SDK v3 S3 client, works with both MinIO and AWS S3 via `STORAGE_ENDPOINT` override). Set
  `forcePathStyle: true` on the S3 client — required for MinIO's path-style URLs (e.g.
  `http://minio:9000/bucket/key`); harmless on real AWS S3.
- `extractor-implement`: Port logic from `extract_exif.py` to TypeScript. Use `exifr` for GPS/EXIF
  extraction and `sharp` for image resize/thumbnail generation. Orchestration in `extractor.ts`:
  1. Download existing `images.db` from `bucket/images.db` (if present)
  2. Create `images.db.tmp` with copied schema + existing records
  3. Scan source — either `LOCAL_SOURCE_PATH` (local folder) or `raw/` prefix in bucket
  4. For each unprocessed image: read GPS EXIF with `exifr`; resize (max 2048×2048) + thumbnail
     (200×200) with `sharp`; upload to `images/` and `images/thumbnails/`
  5. Insert record in `images.db.tmp`
  6. `PutObject` to replace `bucket/images.db` with `images.db.tmp` (atomic S3 replace)
  7. Clean up temp files

  Image ID: `md5(sourceKey + etag)` for bucket source; `md5(relativePath + mtime)` for local source.
- `extractor-docker`: Write `Dockerfile` for extractor. Use `node:XX-alpine` — `sharp` ships
  prebuilt musl binaries so no native build tools required. Runs as a one-shot job (exits after
  completion). Can be run via ECS scheduled task or `docker-compose run extractor`.

### Phase 2: Integration (after 1a, 1b, 1c)

- `docker-compose`: Write `docker-compose.yml` with three services:
  - **minio**: MinIO with `spyro-map` bucket, public read on `images/` prefix, CORS configured. Exposes ports `9000`
    (API) and `9001` (web console). Init script creates bucket and sets policy via `mc`.
  - **backend**: Fastify API with `STORAGE_*` env vars pointing to MinIO, `IMAGES_BASE_URL` pointing to
    `http://localhost:9000/spyro-map`.
  - **frontend**: nginx serving the built React app, proxying `/api/*` to backend.
  - **extractor** is defined as a service but not started by default (`profiles: [ingest]`); run with
    `docker-compose run extractor` or `docker-compose --profile ingest up extractor`.
- `deploy-config-update`: Update `deploy.config.js` and build scripts in root `package.json`. Remove
  `VITE_GOOGLE_MAPS_API_KEY` from deploy validation. Document S3 bucket setup for production.

### Phase 3: Documentation

- `update-docs`: Update `README.md`, `docs/design.md`, and `.github/copilot-instructions.md` to reflect the new
  architecture, build commands, and local dev workflow (docker-compose + extractor run).

## Notes

- `extract_exif.py` is deprecated and can be removed once `packages/extractor/` is complete.
- **Local dev workflow**:
  1. `docker-compose up` — starts MinIO, backend, frontend
  2. Open MinIO console at `http://localhost:9001`, upload raw photos to `raw/`
  3. `docker-compose run --rm extractor` — processes `raw/`, writes to `images/` and `images.db` in MinIO
  4. Frontend available at `http://localhost` (or `vite dev` at `http://localhost:3000` for hot reload)
- The `LOCAL_SOURCE_PATH` env var on the extractor supports direct local ingest (e.g. from a mounted SD card):
  `docker-compose run --rm -e LOCAL_SOURCE_PATH=/photos -v /mnt/sdcard:/photos extractor`
- **Image serving**: The browser fetches images and thumbnails directly from object storage. The API returns absolute
  `imageUrl` and `thumbnailUrl` in every `ImageRecord` response. The frontend uses these URLs verbatim (e.g.
  `<img src={image.imageUrl}>`). Neither the backend nor the nginx frontend container proxies image requests. This is
  intentional — images are static assets and should be delivered at CDN/object-store speed without going through the
  API.
- Backend downloads `images.db` at startup from `bucket/images.db`. After running the extractor, trigger
  `POST /api/reload` or wait for the next refresh interval. In ECS, restarting the task also works.
- Hash-based routing (`/#/image/:imageId`) is preserved — it's a frontend concern and works the same with Leaflet.
- The `distance.ts` utility stays in the frontend for client-side nearby computation. The backend does its own
  calculation in `getNearbyImages`.
- Leaflet markers don't have native thumbnail-in-circle support. We'll use Leaflet's `DivIcon` with the same HTML/CSS
  approach — nearly identical to the current `AdvancedMarkerElement` implementation.
- S3 bucket must have **public read** on `images/` and `images/thumbnails/` prefixes. The `raw/` prefix should remain
  private. CORS on the bucket must allow the frontend origin.
- The `ImageRecord` type gains `imageUrl` and `thumbnailUrl` fields (absolute URLs). The derived-path pattern in
  `DatabaseService.ts` (`/images/${id}.jpg`) is replaced by URLs from the API response.

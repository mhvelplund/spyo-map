# Cloudflare Migration Design

**Date:** 2026-08-02 **Status:** Approved **Supersedes:** the AWS deployment described in
`docs/runbooks/aws-bootstrap.md`

## Goal

Move the entire application off AWS onto Cloudflare's free tier, at a strict $0/month running cost, and rename the
project from `spyro-map` to `spyo-map` in the same effort.

AWS is removed outright rather than run in parallel. There is no rollback path and none is wanted.

## Current state

| Concern        | Today                                                        |
|----------------|--------------------------------------------------------------|
| Frontend       | Static bundle in S3 under `app/`, served via CloudFront      |
| API            | Fastify on ECS Fargate behind an ALB, fronted by CloudFront  |
| Metadata       | `images.db` (SQLite) in S3; backend downloads it every 300 s |
| Images         | S3 `images/` and `images/thumbnails/`, public via CloudFront |
| Ingestion      | One-shot Fargate task on an EventBridge schedule             |
| Infrastructure | Terragrunt/Terraform in `infra/` (7 components)              |
| Local dev      | `docker compose` with MinIO                                  |

## Target state

```plaintext
                    ┌─ spyo-map.isntall.net ──► Worker "spyo-map"
                    │                             ├─ static assets: built React SPA
                    │                             └─ fetch handler: /api/*
Cloudflare (free)   │                                      │ D1 binding
                    │                                      ▼
                    │                                 D1: spyo-map (images table)
                    │                                      ▲
                    └─ spyo-img.isntall.net ──► R2 bucket "spyo-map"
                                                     ├─ raw/            (private)
                                                     ├─ images/
                                                     └─ images/thumbnails/
                                                          ▲
GitHub Actions ────► extractor job ───────────────────────┘ + D1 HTTP API upserts
```

### Request paths

Page loads and `/api/*` hit the Worker. Image bytes never do — they resolve on `spyo-img.isntall.net`, an R2 custom
domain served from Cloudflare's cache with zero egress cost and no Worker invocation. This keeps Worker usage far below
the 100k requests/day free limit no matter how image-heavy a session is, and preserves the existing invariant that
`ImageRecord.imageUrl` is an absolute URL resolved by the API.

Static assets served by a Worker are free and unmetered, so only `/api/*` counts against the request quota.

### Free-tier headroom

At the stated scale (under ~5 GB, low thousands of photos, occasional ingest):

| Resource        | Free limit | Expected usage   |
|-----------------|------------|------------------|
| R2 storage      | 10 GB      | < 5 GB           |
| R2 Class A ops  | 1M/month   | thousands/month  |
| R2 egress       | unlimited  | —                |
| D1 storage      | 5 GB       | a few MB         |
| D1 rows read    | 5M/day     | thousands/day    |
| D1 rows written | 100k/day   | hundreds per run |
| Worker requests | 100k/day   | hundreds/day     |
| Worker assets   | unmetered  | —                |

Every dimension has at least an order of magnitude of slack. The first constraint to bind as the library grows is R2
storage, not requests.

## Naming

The project is renamed `spyro-map` → `spyo-map` throughout: `package.json` names, npm workspace scopes (`@spyro-map/*` →
`@spyo-map/*`), bucket and database names, documentation, and prose ("Spyro Map" → "Spyo Map"). The infrastructure
already used `spyo-map` in places, which is what surfaced the inconsistency.

The repository directory itself (`~/projects/spyro-map`) and the GitHub repository name are **out of scope** — renaming
those is a manual step for the operator, noted here so it is not forgotten.

## Component design

### `packages/worker` (was `packages/backend`)

Renamed with `git mv` to preserve history. Dependencies removed: `fastify`, `@fastify/cors`, `better-sqlite3`,
`@aws-sdk/client-s3`. Added: `wrangler` (dev dependency) and `@cloudflare/workers-types`.

The module exports a default object with a `fetch(request, env, ctx)` handler. Routing is a path switch, not a framework
— there are four routes and no middleware needs.

**Routes.** Unchanged in shape and response bodies:

- `GET /api/health` → `{ status: "ok" }`
- `GET /api/images` → `ImageRecord[]`
- `GET /api/images/:id` → `ImageRecord` or 404
- `GET /api/images/:id/nearby?radius=<km>` → `ImageRecord[]`, 400 on invalid radius

`POST /api/reload` is **removed**. It existed only to force a re-download of `images.db`; D1 reads are always live, so
it has no meaning. `DB_REFRESH_INTERVAL_MS` and the whole download-and-cache lifecycle in `services/database.ts` go with
it.

**Database layer.** `services/database.ts` already separates pure query helpers (`rowToRecord`, `queryAllImages`,
`queryImageById`, `queryNearbyImages`) from module-level state. The helpers keep their signatures except that the first
parameter becomes a `D1Database` and they become `async`; the SQL text is unchanged. `rowToRecord` and `haversineKm` are
untouched. The module-level singleton, `initDatabase`, `reloadDatabase`, and `getDb` are deleted — the binding arrives
on `env` per request.

**Configuration.** `IMAGES_BASE_URL` remains, declared as a `vars` entry in `wrangler.toml` pointing at
`https://spyo-img.isntall.net`. It is read from `env` rather than `process.env`.

**`wrangler.toml`** declares: the Worker name, compatibility date, the static-assets directory (the frontend's `dist/`)
with SPA fallback, the D1 binding, the `IMAGES_BASE_URL` var, and the custom domain route. No R2 binding is needed — the
Worker never touches image bytes.

### `packages/extractor`

Keeps `sharp`, `exifr`, and its S3 client. R2 is S3-compatible, so `storage.ts` changes only its endpoint (the R2 S3 API
endpoint), credentials (R2 access key pair), and region (`auto`). `forcePathStyle` is no longer required but is harmless
and stays for consistency with the documented convention.

`processor.ts` is unchanged.

`database.ts` is rewritten. `better-sqlite3` is removed and replaced with a small D1 HTTP client hitting Cloudflare's
REST API:

- `fetchExistingIds()` replaces `downloadExistingDb` + `imageExists` — one query returning the full set of known IDs,
  held in memory for the run.
- `upsertImages(rows)` batches `INSERT ... ON CONFLICT(id) DO UPDATE` statements. Batched so a run of N new photos costs
  a handful of API calls, not N.
- The schema (`CREATE TABLE` + two indexes) moves to a migration applied at bootstrap rather than being created on every
  run.

Incremental behaviour is preserved exactly: photos whose ID is already in D1 are skipped, and re-running is safe.

`LOCAL_SOURCE_PATH` mode is retained — it is how photos are seeded from a local folder without staging into `raw/`
first.

### `packages/frontend`

The Vite dev proxy target changes from `localhost:3001` to the `wrangler dev` port. The `VITE_API_BASE_URL` build arg is
dropped; the API is always same-origin in production.

The app moves from `/app/` to the site root, since the Worker serves assets from `/`. `base` in `vite.config.ts` becomes
`/` (the `VITE_BASE_PATH` override is dropped), and the CloudFront function that redirected `/` to `/app/` disappears
with the rest of the AWS infrastructure. Hash routing (`/#/image/:id`) is unaffected, so shared links keep working apart
from their host and the dropped `/app` segment.

Nothing else changes: components, `extractImageId`, `SocialShare`, and `ApiClient`'s request shapes are untouched.

### `packages/shared`

Unchanged apart from its package name.

## Ingestion pipeline

`.github/workflows/ingest.yml`, triggered by `workflow_dispatch` and a weekly cron. Steps: checkout, setup Node,
`npm ci`, build the extractor, run it. Credentials come from repository secrets: `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `D1_DATABASE_ID`.

Source photos reach `raw/` out of band, via rclone or the R2 dashboard. This is the same manual step that exists today
with S3.

## Deployment pipeline

`.github/workflows/deploy.yml`, on push to `main`. Steps: checkout, setup Node, `npm ci`, `npm test`, build the
frontend, `wrangler deploy`. Wrangler uploads changed static assets and the Worker in a single operation.

The existing `.github/workflows/deploy-app.yml` (AWS) is deleted.

## One-time bootstrap

Dropping Terraform means the durable resources are created once by CLI. These commands are documented in
`docs/runbooks/cloudflare-bootstrap.md` so they are not tribal knowledge:

1. Create the R2 bucket `spyo-map`.
2. Attach the custom domain `spyo-img.isntall.net` to it and enable public access.
3. Create the D1 database `spyo-map` and record its ID.
4. Apply the schema migration.
5. Create an R2 API token (S3 credentials) scoped to the bucket.
6. Create a Cloudflare API token with Workers Scripts:Edit, D1:Edit, and Workers Routes:Edit.
7. Add all secrets to the GitHub repository.
8. Add `isntall.net` to Cloudflare as a subdomain zone if it is not already there, and confirm the `NS` delegation from
   the parent `isntall.net` zone.

## Testing

Test framework stays Jest 29 + ts-jest in ESM mode across all packages — no second runner is introduced.
`@cloudflare/vitest-pool-workers` would be more idiomatic for the Worker, but the D1 query surface is three statements,
so a hand-written `D1Database` stub is cheaper than maintaining two test runners.

- **Worker:** existing `tests/routes.test.ts` is rewritten against a fake `D1Database` exposing
  `prepare().bind().all()/first()`. Query-helper tests port directly since the helpers keep their signatures. Route
  tests exercise the `fetch` handler with `Request` objects rather than Fastify's `inject`.
- **Extractor:** `processor.ts` tests unaffected. `database.ts` tests are rewritten against a mocked `fetch`, asserting
  batch shape and upsert SQL. `storage.ts` tests adjust to the R2 endpoint.
- **Frontend:** unchanged.
- **Smoke-test:** kept and retargeted. It already runs against a live `SMOKE_BASE_URL` and skips when unset. The
  `ALB_DNS` variable and the origin-lockdown assertion that uses it are removed, `/app/` becomes `/`, and the "images
  via CloudFront" test asserts reachability of `spyo-img.isntall.net` instead.

New logic ships with tests in the same commit, per `CLAUDE.md`.

## Removals

Deleted outright, with no deprecation period:

- `infra/` — the entire Terragrunt/Terraform tree (networking, iam, ecr, compute, cdn, scheduler, storage) and
  `infra/bootstrap.sh`
- `docker-compose.yml` and the MinIO service
- `packages/backend/Dockerfile`, `packages/frontend/Dockerfile`, `packages/extractor/Dockerfile`
- `.github/workflows/deploy-app.yml`
- `docs/runbooks/aws-bootstrap.md`
- `deploy.config.js` — describes an nginx/ECS deployment that will not exist
- `extract.sh` — a local convenience wrapper around `docker compose run`
- All AWS references in `README.md` and `CLAUDE.md`

**AWS teardown**, performed by the operator: `terragrunt destroy` across all components, then confirm in the console
that the ALB, Fargate services, ECR repositories, CloudFront distribution, S3 bucket, and EventBridge schedule are gone.
Photos in `raw/` and `images/` must be copied to R2 *before* destroying storage.

**Credentials.** `extract.sh` holds a long-lived AWS access key pair. It is gitignored and was never committed, so this
is not a leak — but the key becomes useless once AWS is gone and should be deleted in IAM during teardown rather than
left active.

## Local development

`wrangler dev` runs the Worker locally with a file-backed local D1 and serves the built SPA from `dist/`. One command,
no containers, and the closest available approximation of production. `npm run dev` (Vite with HMR) remains available
for frontend iteration, proxying `/api` to `wrangler dev`.

Local D1 is seeded from a SQL fixture so a fresh clone has data to render.

Docker is no longer used anywhere in the project.

## Risks

- **Domain delegation.** `isntall.net` must be on Cloudflare, delegated via `NS` records from the parent `isntall.net`
  zone, before custom domains can be attached. If it is not, this blocks the cutover — verify first.
- **R2 growth.** The free tier ends at 10 GB. At the current rate this is years away, but there is no automatic alert;
  the runbook notes where to check usage.
- **No rollback.** AWS is destroyed rather than parked. The mitigation is ordering: Cloudflare is verified serving the
  real domain before anything is destroyed.
- **Workspace rename churn.** Renaming `@spyro-map/*` to `@spyo-map/*` touches every import. It is mechanical but must
  be a single atomic commit with a clean `npm ci` and a green test run, not spread across phases.

## Phasing

The implementation plan sequences the work so each phase is independently verifiable and scoped to a single sub-agent:

1. Rename `spyro-map` → `spyo-map` across the workspace.
2. Purge AWS: delete `infra/`, Dockerfiles, compose, AWS workflow and docs.
3. Cloudflare bootstrap runbook and `wrangler.toml`.
4. `packages/backend` → `packages/worker`; D1-backed query layer and `fetch` handler.
5. Extractor: R2 storage endpoint and D1 HTTP writes.
6. Frontend dev-proxy and build wiring.
7. CI: deploy and ingest workflows.
8. Cutover: data copy, deploy, verify, AWS teardown, key revocation.

Phases 1 and 2 are prerequisites for everything else. Phases 4, 5, and 6 are independent of one another once 3 is
complete.

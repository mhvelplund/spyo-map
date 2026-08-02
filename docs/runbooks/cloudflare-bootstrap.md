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

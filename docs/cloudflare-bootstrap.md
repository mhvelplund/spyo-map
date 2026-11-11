# Cloudflare Bootstrap

One-time setup for the `spyo-map` Cloudflare deployment. Everything here is done once, by hand. Day-to-day deploys and
ingestion run from GitHub Actions.

Prerequisites: a Cloudflare account, and the subdomain `isntall.net` added to it as a zone with delegation from the
parent `isntall.net` zone active. Confirm delegation before starting — custom domains cannot be attached to a zone that
is not active.

```bash
npx wrangler login
```

## Delegating the subdomain

`isntall.net` itself stays on its existing DNS provider; only the `isntall.net` subdomain moves to Cloudflare. This is a
partial (subdomain) zone delegation, not a full nameserver switch:

1. In the Cloudflare dashboard: **Add a domain**, enter `isntall.net`, and choose it as a new zone. Cloudflare will
   offer two `NS` records (e.g. `xxx.ns.cloudflare.com`, `yyy.ns.cloudflare.com`) for this zone.
2. At the DNS provider that hosts the parent `isntall.net` zone, add an `NS` record delegating the `spyo-map` subdomain
   to those two Cloudflare nameservers:

   ```plaintext
   isntall.net.  NS  xxx.ns.cloudflare.com.
   isntall.net.  NS  yyy.ns.cloudflare.com.
   ```

3. Wait for Cloudflare to detect the delegation (usually a few minutes; the zone status flips from **Pending** to
   **Active**). Verify with:

   ```bash
   dig NS isntall.net
   ```

   Expect the two Cloudflare nameservers in the answer.

## 1. Create the R2 bucket

```bash
npx wrangler r2 bucket create spyo-map
```

## 2. Attach the images custom domain

In the dashboard: **R2 → spyo-map → Settings → Public access → Custom domains → Connect domain**, and enter
`spyo-img.isntall.net`. Cloudflare creates the DNS record and issues the certificate.

Do **not** enable the `r2.dev` subdomain. It is rate-limited and not meant for production.

Verify once the certificate is live:

```bash
curl -I https://spyo-img.isntall.net/images/thumbnails/anything.jpg
```

Expect 404 (the bucket is empty) rather than a TLS or DNS error.

A custom domain serves **every** object in the bucket, not just `images/`. `raw/`, `failed/` and `originals/` hold
untouched photos with their full EXIF, so block everything else on this host. Go to **Security → WAF → Custom rules →
Create rule** on the `isntall.net` zone, and set the expression to
`(http.host eq "spyo-img.isntall.net" and not starts_with(http.request.uri.path, "/images/"))`, with action **Block**.
Verify:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://spyo-img.isntall.net/originals/anything.jpg   # expect 403
```

## 3. Create the D1 database

```bash
npx wrangler d1 create spyo-map
```

Copy the `database_id` from the output into `packages/worker/wrangler.toml`, replacing `REPLACE_WITH_D1_DATABASE_ID`.
Commit that change — the id is not a secret.

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

Dashboard: **R2 → Manage R2 API Tokens → Create API token**. Permission **Object Read & Write**, scoped to the
`spyo-map` bucket only.

Record the Access Key ID, the Secret Access Key, and the S3 endpoint (`https://<account-id>.r2.cloudflarestorage.com`).
The secret is shown once.

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
|-------------------------|-------------------------------------------------|
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

The custom domain `spyo-map.isntall.net` is created by the `routes` entry in `wrangler.toml` on first deploy.
Certificate issuance takes a few minutes.

```bash
curl https://spyo-map.isntall.net/api/health
```

Expect `{"status":"ok"}`.

## 9. Google OAuth client

Sign-in for the upload page uses Google. In the Google Cloud console: **APIs & Services → OAuth consent screen**, then
**Credentials → Create credentials → OAuth client ID** (type **Web application**).

- Consent screen privacy policy URL: `https://spyo-map.isntall.net/privacy.html`
- Scope: `email` only
- Authorized redirect URIs:
  - `https://spyo-map.isntall.net/auth/callback/google`
  - `http://localhost:8787/auth/callback/google`

Record the client ID and client secret.

## 10. Worker secrets

```bash
openssl rand -base64 48 | npx wrangler secret put SESSION_SECRET --config packages/worker/wrangler.toml
npx wrangler secret put GOOGLE_CLIENT_ID --config packages/worker/wrangler.toml
npx wrangler secret put GOOGLE_CLIENT_SECRET --config packages/worker/wrangler.toml
```

`SESSION_SECRET` must be at least 32 characters; shorter (or empty) turns sign-in off. For local dev, create
`packages/worker/.dev.vars` (git-ignored) with the same three names:

```plaintext
SESSION_SECRET=<output of openssl rand -base64 48>
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

## 11. Migration 0002 (uploaders and uploads)

Apply the schema again after pulling the upload system; it applies only pending migrations:

```bash
npx wrangler d1 migrations apply spyo-map --remote --config packages/worker/wrangler.toml
```

It adds the `uploaders`, `uploader_emails` and `uploads` tables and the `uploader_id` and `content_hash` columns on
`images`, and seeds uploader 1 (`MH`).

## Managing uploaders

Only people on the allow list can sign in and upload. Manage them with the admin CLI (`packages/admin`). Commands act
on the local D1 by default; add `--remote` to act on production.

```bash
npm run uploaders -- list --remote
npm run uploaders -- add <name> <email> --remote
npm run uploaders -- add-email <id> <email> --remote
npm run uploaders -- rename <id> <name> --remote
npm run uploaders -- disable <id> --remote
npm run uploaders -- enable <id> --remote
npm run uploads -- forget <sha256> --remote
npm run images -- remove <imageId> --remote
```

`images remove` deletes the D1 row and the R2 objects `images/<imageId>.jpg` and `images/thumbnails/<imageId>.jpg`.

## Uploading photos

Sign in at `https://spyo-map.isntall.net/#/upload` with an allow-listed Google account and drop JPEG or TIFF photos
(up to 50 MB each). The Worker writes them to `raw/` in R2 with the uploader and a SHA-256 as object metadata; then run
the **Ingest Photos** workflow to process them onto the map.

The manual route stays as a fallback (rclone, the dashboard, or wrangler). Objects without metadata are attributed to
uploader 1:

```bash
npx wrangler r2 object put spyo-map/raw/IMG_1234.jpg --file ./IMG_1234.jpg --remote
```

Once its metadata is committed to D1, the extractor moves each `raw/` object, byte for byte and with its metadata, to
`originals/` (same file name). `originals/` is the private archive that a re-ingest replays (see
[Re-ingesting from originals](#re-ingesting-from-originals)). If the move fails, the object stays in `raw/`, and the
next run moves it without processing it again.

### `failed/`

The extractor moves an object from `raw/` to `failed/` (same file name) when it can never succeed as it stands:

- its content does not match the declared `sha256`
- it has no GPS EXIF data
- it cannot be processed (corrupt or unreadable image)

Transient errors (download or upload failures) leave the object in `raw/`, so the next run retries it.

To retry a `failed/` object, move it back to `raw/` (download, then `wrangler r2 object put` to `raw/`, then delete the
`failed/` copy) and re-run **Ingest Photos**. To give up on it, delete it from `failed/`. If it was a duplicate-blocked
upload you want to accept again, also run `npm run uploads -- forget <sha256> --remote` so the upload page stops
rejecting its hash.

### Android (pending)

The upload page refuses photos without GPS data and says so in a message. MH will test with Android Chrome before
release; no result has been recorded yet.

## Release reset

Run once, on **PRODUCTION**, to start the public site from an empty gallery. **This wipes the D1 `images` and `uploads`
tables and every R2 object under `raw/`, `failed/` and `images/`. It is irreversible.** Uploaders are kept.

1. Clear the tables:

   ```bash
   npx wrangler d1 execute spyo-map --remote --config packages/worker/wrangler.toml --command "DELETE FROM images; DELETE FROM uploads;"
   ```

2. Delete everything under `raw/`, `failed/` and `images/` with `npx wrangler r2 object delete --remote
   spyo-map/<key>` per object, or use the dashboard bulk delete (**R2 → spyo-map → Objects**).
3. Re-upload through `/#/upload`.
4. Run the **Ingest Photos** workflow.

## Re-ingesting from originals

To rebuild the gallery after a wipe, without uploading again:

1. Clear the image rows and the processed images:

   ```bash
   npx wrangler d1 execute spyo-map --remote --config packages/worker/wrangler.toml --command "DELETE FROM images;"
   ```

   Delete everything under `images/` in the dashboard (**R2 → spyo-map → Objects**). Leave `originals/` alone.
2. Run **Ingest Photos** manually with **source = originals**.

In this mode the extractor reads `originals/` and never moves or deletes anything there. Failures are only logged. Each
original gets the same image id it had when first ingested from `raw/`, so shared `/#/image/<id>` links keep working.

## Release checklist

0. Apply migration 0002 remotely before merging any upload layer above upload/schema to main (deploy.yml now does
   this automatically on push; verify the CI token has D1 edit permission).
1. Do the manual Google sign-in check, local (`http://localhost:8787`) and production.
2. Confirm that uploads from a browser over HTTP/2 reach the Worker with `Content-Length`. If they do not, every
   upload gets 413.
3. Run the end-to-end check:
   1. Sign in with Google.
   2. Drop 5 photos, including 1 duplicate and 1 without GPS, and check the Added, Duplicates and Rejected lists.
   3. Try an account that is not on the allow list; it is refused.
   4. Run **Ingest Photos**; the lightbox shows "Uploaded by MH".
   5. Grep the built `dist/` and `curl https://spyo-map.isntall.net/api/images` for `@`; there are none.
   6. Perform the [release reset](#release-reset).

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

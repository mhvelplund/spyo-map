import type { D1Database, Fetcher, R2Bucket } from "@cloudflare/workers-types";

export interface Env {
  /** D1 binding declared in wrangler.toml */
  DB: D1Database;
  /** Static-assets binding declared in wrangler.toml */
  ASSETS: Fetcher;
  /** Private R2 bucket (raw/ upload target, never publicly served) declared in wrangler.toml */
  BUCKET: R2Bucket;
  /** Public base URL for image objects, e.g. https://spyo-img.isntall.net */
  IMAGES_BASE_URL: string;
  /** HMAC key for the spyo_session cookie (secret; `wrangler secret put`). Empty means sign-in is off. */
  SESSION_SECRET: string;
  /** Google OAuth client id (secret). */
  GOOGLE_CLIENT_ID: string;
  /** Google OAuth client secret (secret). */
  GOOGLE_CLIENT_SECRET: string;
}

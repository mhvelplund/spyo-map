import type { D1Database, Fetcher } from "@cloudflare/workers-types";

export interface Env {
  /** D1 binding declared in wrangler.toml */
  DB: D1Database;
  /** Static-assets binding declared in wrangler.toml */
  ASSETS: Fetcher;
  /** Public base URL for image objects, e.g. https://spyo-img.isntall.net */
  IMAGES_BASE_URL: string;
}

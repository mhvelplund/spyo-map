import type { Env } from "./env.js";
import { handleApiRequest } from "./router.js";
import { handleAuthRequest } from "./auth/routes.js";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      return handleApiRequest(request, env);
    }

    if (url.pathname === "/auth" || url.pathname.startsWith("/auth/")) {
      return handleAuthRequest(request, env);
    }

    // Static assets; unmatched paths fall back to index.html
    // (not_found_handling = "single-page-application" in wrangler.toml).
    return env.ASSETS.fetch(request) as unknown as Promise<Response>;
  },
};

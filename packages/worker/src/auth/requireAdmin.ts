import type { Env } from "../env.js";
import type { Uploader } from "../services/uploaders.js";
import { currentUploader } from "./currentUploader.js";
import { isSameOrigin } from "./routes.js";

const deny = (status: number, error: string): Response =>
  new Response(JSON.stringify({ error }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

/**
 * Guard for admin endpoints: the signed-in uploader if they are an admin, else an error Response.
 * Usage: `const r = await requireAdmin(request, env); if (r instanceof Response) return r;`
 */
export async function requireAdmin(request: Request, env: Env): Promise<Uploader | Response> {
  // Origin first, so a cross-site request never reaches D1.
  if (request.method !== "GET" && !isSameOrigin(request)) return deny(403, "Forbidden");
  const uploader = await currentUploader(request, env);
  if (!uploader) return deny(401, "Not signed in");
  if (!uploader.isAdmin) return deny(403, "Not an admin");
  return uploader;
}

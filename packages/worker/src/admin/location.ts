import type { Env } from "../env.js";
import { requireAdmin } from "../auth/requireAdmin.js";
import {
  findContentHash,
  queryImagesByContentHash,
  setImageLocation,
} from "../services/database.js";

const respond = (body: unknown, status: number): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

const isCoord = (v: unknown, max: number): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= -max && v <= max;

export async function handleSetLocation(
  request: Request,
  env: Env,
  id: string,
): Promise<Response> {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return respond({ error: "Invalid location" }, 400);
  }
  const { latitude, longitude } = (body ?? {}) as { latitude?: unknown; longitude?: unknown };
  if (!isCoord(latitude, 90) || !isCoord(longitude, 180)) {
    return respond({ error: "Invalid location" }, 400);
  }

  const { found, contentHash } = await findContentHash(env.DB, id);
  if (!found) return respond({ error: "Not found" }, 404);
  if (contentHash === null) return respond({ error: "Image cannot be edited" }, 409);

  await setImageLocation(env.DB, contentHash, latitude, longitude, new Date().toISOString());
  return respond(await queryImagesByContentHash(env.DB, contentHash, env.IMAGES_BASE_URL, { isAdmin: true }), 200);
}

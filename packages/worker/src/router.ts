import type { MeResponse } from "@spyo-map/shared";
import type { Env } from "./env.js";
import { handleUploadCheck, handleUploadPut } from "./uploads/handlers.js";
import { handleSetLocation } from "./admin/location.js";
import { currentUploader } from "./auth/currentUploader.js";
import {
  queryAllImages,
  queryImageById,
  queryNearbyImages,
  type Viewer,
} from "./services/database.js";

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

const notFound = (): Response => json({ error: "Not found" }, 404);
const methodNotAllowed = (): Response => json({ error: "Method not allowed" }, 405);

async function handleMe(request: Request, env: Env): Promise<Response> {
  const noStore = { "cache-control": "no-store" };
  const uploader = await currentUploader(request, env);
  if (!uploader) return json({ error: "Not signed in" }, 401, noStore);
  const body: MeResponse = { displayName: uploader.displayName, isAdmin: uploader.isAdmin };
  return json(body, 200, noStore);
}

export async function handleApiRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const isGet = request.method === "GET";
  // "/api/images/abc/nearby" -> ["api", "images", "abc", "nearby"]
  const segments = url.pathname.split("/").filter(Boolean);
  const [, resource, rawId, action] = segments;

  if (segments.length === 2 && resource === "health") {
    return isGet ? json({ status: "ok" }) : methodNotAllowed();
  }

  if (segments.length === 2 && resource === "me") {
    return isGet ? handleMe(request, env) : methodNotAllowed();
  }

  if (resource === "uploads" && segments.length === 3 && rawId !== undefined) {
    if (rawId === "check") {
      return request.method === "POST" ? handleUploadCheck(request, env) : methodNotAllowed();
    }
    if (request.method !== "PUT") return methodNotAllowed();
    // A malformed escape can never be a valid hash; pass it through so the handler's
    // origin/session checks still run first and it then answers 400 bad-hash.
    let hash = rawId;
    try {
      hash = decodeURIComponent(rawId);
    } catch {
      // keep rawId
    }
    return handleUploadPut(request, env, hash);
  }

  if (resource !== "images") return notFound();
  // Every /api/images route is read-only except PUT /api/images/:id/location.
  if (segments.length === 4 && action === "location" && rawId !== undefined) {
    if (request.method !== "PUT") return methodNotAllowed();
    let id = rawId;
    try {
      id = decodeURIComponent(rawId);
    } catch {
      // keep rawId; lookup will 404
    }
    return handleSetLocation(request, env, id);
  }
  if (!isGet) return methodNotAllowed();

  // Responses vary by viewer (admins also get hidden images), so never cache them.
  const noStore = { "cache-control": "private, no-store" };
  const uploader = await currentUploader(request, env);
  const viewer: Viewer = { isAdmin: uploader?.isAdmin === true };

  if (segments.length === 2) {
    return json(await queryAllImages(env.DB, env.IMAGES_BASE_URL, viewer), 200, noStore);
  }

  if (rawId === undefined) return json({ error: "Not found" }, 404, noStore);
  const id = decodeURIComponent(rawId);

  if (segments.length === 3) {
    const image = await queryImageById(env.DB, id, env.IMAGES_BASE_URL, viewer);
    return image ? json(image, 200, noStore) : json({ error: "Not found" }, 404, noStore);
  }

  if (segments.length === 4 && action === "nearby") {
    const image = await queryImageById(env.DB, id, env.IMAGES_BASE_URL, viewer);
    if (!image) return json({ error: "Not found" }, 404, noStore);

    const radius = parseFloat(url.searchParams.get("radius") ?? "1");
    if (isNaN(radius) || radius < 0) {
      return json({ error: "Invalid radius" }, 400, noStore);
    }

    return json(
      await queryNearbyImages(
        env.DB,
        id,
        image.latitude,
        image.longitude,
        radius,
        env.IMAGES_BASE_URL,
        viewer,
      ),
      200,
      noStore,
    );
  }

  return json({ error: "Not found" }, 404, noStore);
}

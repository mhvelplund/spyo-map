import type { Env } from "./env.js";
import {
  queryAllImages,
  queryImageById,
  queryNearbyImages,
} from "./services/database.js";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

const notFound = (): Response => json({ error: "Not found" }, 404);

export async function handleApiRequest(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") {
    return json({ error: "Method not allowed" }, 405);
  }

  const url = new URL(request.url);
  // "/api/images/abc/nearby" -> ["api", "images", "abc", "nearby"]
  const segments = url.pathname.split("/").filter(Boolean);
  const [, resource, rawId, action] = segments;

  if (segments.length === 2 && resource === "health") {
    return json({ status: "ok" });
  }

  if (resource !== "images") return notFound();

  if (segments.length === 2) {
    return json(await queryAllImages(env.DB, env.IMAGES_BASE_URL));
  }

  if (rawId === undefined) return notFound();
  const id = decodeURIComponent(rawId);

  if (segments.length === 3) {
    const image = await queryImageById(env.DB, id, env.IMAGES_BASE_URL);
    return image ? json(image) : notFound();
  }

  if (segments.length === 4 && action === "nearby") {
    const image = await queryImageById(env.DB, id, env.IMAGES_BASE_URL);
    if (!image) return notFound();

    const radius = parseFloat(url.searchParams.get("radius") ?? "1");
    if (isNaN(radius) || radius < 0) {
      return json({ error: "Invalid radius" }, 400);
    }

    return json(
      await queryNearbyImages(
        env.DB,
        id,
        image.latitude,
        image.longitude,
        radius,
        env.IMAGES_BASE_URL,
      ),
    );
  }

  return notFound();
}

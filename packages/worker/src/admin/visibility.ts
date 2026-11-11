import type { R2Bucket } from "@cloudflare/workers-types";
import type { Env } from "../env.js";
import { requireAdmin } from "../auth/requireAdmin.js";
import {
  findContentHash,
  findOverride,
  queryImagesByContentHash,
  setHidden,
} from "../services/database.js";

const respond = (body: unknown, status: number): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

export function randomPrivateName(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// Copy inside the bucket; a missing source (e.g. no thumbnail) is skipped.
async function copy(bucket: R2Bucket, from: string, to: string): Promise<void> {
  const obj = await bucket.get(from);
  if (!obj) return;
  await bucket.put(to, await obj.arrayBuffer(), { httpMetadata: obj.httpMetadata });
}

async function handleVisibility(
  request: Request,
  env: Env,
  id: string,
  hide: boolean,
): Promise<Response> {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;

  const { found, contentHash } = await findContentHash(env.DB, id);
  if (!found) return respond({ error: "Not found" }, 404);
  if (contentHash === null) return respond({ error: "Image cannot be edited" }, 409);

  const override = await findOverride(env.DB, contentHash);
  const isHidden = override?.hidden === true;
  if (hide && isHidden) return respond({ error: "Already hidden" }, 409);
  if (!hide && (!isHidden || override?.privateName == null)) {
    return respond({ error: "Not hidden" }, 409);
  }

  const rows = await queryImagesByContentHash(env.DB, contentHash, env.IMAGES_BASE_URL, {
    isAdmin: true,
  });
  const bucket = env.PUBLIC_BUCKET;
  const name = hide ? randomPrivateName() : (override!.privateName as string);
  const privateKey = `private/${name}.jpg`;
  const privateThumb = `private/thumbnails/${name}.jpg`;
  const publicKeys = (rowId: string): [string, string] => [
    `images/${rowId}.jpg`,
    `images/thumbnails/${rowId}.jpg`,
  ];

  // Copy first, flip the flag, delete last: a failure part-way never loses a file.
  if (hide) {
    for (const row of rows) {
      const [full, thumb] = publicKeys(row.id);
      await copy(bucket, full, privateKey);
      await copy(bucket, thumb, privateThumb);
    }
    await setHidden(env.DB, contentHash, name, new Date().toISOString());
    for (const row of rows) {
      for (const key of publicKeys(row.id)) await bucket.delete(key);
    }
  } else {
    for (const row of rows) {
      const [full, thumb] = publicKeys(row.id);
      await copy(bucket, privateKey, full);
      await copy(bucket, privateThumb, thumb);
    }
    await setHidden(env.DB, contentHash, null, new Date().toISOString());
    await bucket.delete(privateKey);
    await bucket.delete(privateThumb);
  }

  return respond(
    await queryImagesByContentHash(env.DB, contentHash, env.IMAGES_BASE_URL, { isAdmin: true }),
    200,
  );
}

export const handleHide = (request: Request, env: Env, id: string): Promise<Response> =>
  handleVisibility(request, env, id, true);

export const handleUnhide = (request: Request, env: Env, id: string): Promise<Response> =>
  handleVisibility(request, env, id, false);

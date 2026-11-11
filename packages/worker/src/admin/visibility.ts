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

// Copy inside the bucket; a missing source (e.g. no thumbnail) is skipped. Returns whether it wrote.
async function copy(bucket: R2Bucket, from: string, to: string): Promise<boolean> {
  const obj = await bucket.get(from);
  if (!obj) return false;
  await bucket.put(to, await obj.arrayBuffer(), { httpMetadata: obj.httpMetadata });
  return true;
}

const publicKeys = (rowId: string): [string, string] => [
  `images/${rowId}.jpg`,
  `images/thumbnails/${rowId}.jpg`,
];
const privateKeys = (name: string): [string, string] => [
  `private/${name}.jpg`,
  `private/thumbnails/${name}.jpg`,
];

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

  const viewer = { isAdmin: true };
  const records = (): ReturnType<typeof queryImagesByContentHash> =>
    queryImagesByContentHash(env.DB, contentHash, env.IMAGES_BASE_URL, viewer);
  const bucket = env.PUBLIC_BUCKET;

  try {
    const override = await findOverride(env.DB, contentHash);
    const rows = await records();

    // Delete the public copies of a hide. Idempotent, so a half-finished hide can be re-run.
    // Only valid once the private copy is confirmed to exist.
    const finishHide = async (name: string): Promise<Response> => {
      if (!(await bucket.head(privateKeys(name)[0]))) {
        return respond({ error: "Already hidden" }, 409);
      }
      for (const row of rows) {
        for (const key of publicKeys(row.id)) await bucket.delete(key);
      }
      return respond(await records(), 200);
    };

    if (hide) {
      if (override?.hidden === true && override.privateName !== null) {
        return await finishHide(override.privateName);
      }
      const name = randomPrivateName();
      const [privateKey, privateThumb] = privateKeys(name);
      // Copy first, flip the flag, delete last: a failure part-way never loses a file.
      let wroteFull = false;
      for (const row of rows) {
        const [full, thumb] = publicKeys(row.id);
        if (await copy(bucket, full, privateKey)) wroteFull = true;
        await copy(bucket, thumb, privateThumb);
      }
      if (!wroteFull) {
        await bucket.delete(privateThumb);
        return respond({ error: "Image files missing" }, 409);
      }
      if (!(await setHidden(env.DB, contentHash, name, new Date().toISOString()))) {
        // Another hide won the race: drop our copies and treat the image as already hidden.
        await bucket.delete(privateKey);
        await bucket.delete(privateThumb);
        const winner = await findOverride(env.DB, contentHash);
        if (winner?.hidden === true && winner.privateName !== null) {
          return await finishHide(winner.privateName);
        }
        return respond({ error: "Already hidden" }, 409);
      }
      return await finishHide(name);
    }

    const name = override?.hidden === true ? override.privateName : null;
    if (name === null) return respond({ error: "Not hidden" }, 409);
    const [privateKey, privateThumb] = privateKeys(name);
    for (const row of rows) {
      const [full, thumb] = publicKeys(row.id);
      await copy(bucket, privateKey, full);
      await copy(bucket, privateThumb, thumb);
    }
    await setHidden(env.DB, contentHash, null, new Date().toISOString());
    await bucket.delete(privateKey);
    await bucket.delete(privateThumb);
    return respond(await records(), 200);
  } catch {
    return respond({ error: "Couldn't change visibility" }, 500);
  }
}

export const handleHide = (request: Request, env: Env, id: string): Promise<Response> =>
  handleVisibility(request, env, id, true);

export const handleUnhide = (request: Request, env: Env, id: string): Promise<Response> =>
  handleVisibility(request, env, id, false);

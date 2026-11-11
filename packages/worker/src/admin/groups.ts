import type { Env } from "../env.js";
import { requireAdmin } from "../auth/requireAdmin.js";
import {
  findContentHash,
  findGroupMembers,
  findGroupState,
  queryGroupRecords,
  queryImagesByContentHashes,
  writeGroup,
  writeUngroup,
  type GroupWrite,
} from "../services/database.js";

const respond = (body: unknown, status: number): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

export function randomGroupId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const viewer = { isAdmin: true };

/** POST /api/images/:id/group `{ targetId }` — the photo (and its whole group, if any) joins the target's group. */
export async function handleGroup(request: Request, env: Env, id: string): Promise<Response> {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return respond({ error: "Invalid target" }, 400);
  }
  const targetId = (body as { targetId?: unknown } | null)?.targetId;
  if (typeof targetId !== "string") return respond({ error: "Invalid target" }, 400);

  const source = await findContentHash(env.DB, id);
  const target = await findContentHash(env.DB, targetId);
  if (!source.found || !target.found) return respond({ error: "Not found" }, 404);
  if (id === targetId) return respond({ error: "Cannot group a photo with itself" }, 409);
  if (source.contentHash === null || target.contentHash === null) {
    return respond({ error: "Image cannot be edited" }, 409);
  }
  if (source.contentHash === target.contentHash) {
    return respond({ error: "Cannot group a photo with itself" }, 409);
  }

  const sourceState = await findGroupState(env.DB, source.contentHash);
  const targetState = await findGroupState(env.DB, target.contentHash);
  if (!sourceState || !targetState) return respond({ error: "Not found" }, 404);
  if (sourceState.groupId !== null && sourceState.groupId === targetState.groupId) {
    return respond({ error: "Already grouped" }, 409);
  }

  // The target keeps an existing grouped_at; a new group's target gets the request time and joiners a later one.
  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  const joinedAt = new Date(nowMs + 1).toISOString();
  const groupId = targetState.groupId ?? randomGroupId();
  const { latitude, longitude } = targetState;

  const joiners =
    sourceState.groupId === null
      ? [{ contentHash: source.contentHash, latitude: sourceState.latitude, longitude: sourceState.longitude }]
      : await findGroupMembers(env.DB, sourceState.groupId);

  const joinerWrites: GroupWrite[] = joiners.map((m) => ({
    contentHash: m.contentHash,
    latitude,
    longitude,
    groupId,
    groupedAt: joinedAt,
    preGroupLatitude: m.latitude,
    preGroupLongitude: m.longitude,
  }));
  const targetWrite: GroupWrite | null =
    targetState.groupId === null
      ? {
          contentHash: target.contentHash,
          latitude,
          longitude,
          groupId,
          groupedAt: now,
          preGroupLatitude: latitude,
          preGroupLongitude: longitude,
        }
      : null;
  // A concurrent request changed the target's group between our read and write: nothing was written.
  const joined = await writeGroup(env.DB, targetWrite, target.contentHash, joinerWrites, now);
  if (joined === 0) return respond({ error: "Conflict" }, 409);

  return respond(await queryGroupRecords(env.DB, groupId, env.IMAGES_BASE_URL, viewer), 200);
}

/** POST /api/images/:id/ungroup — the photo leaves its group; a group left with one member dissolves. */
export async function handleUngroup(request: Request, env: Env, id: string): Promise<Response> {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;

  const { found, contentHash } = await findContentHash(env.DB, id);
  if (!found) return respond({ error: "Not found" }, 404);
  if (contentHash === null) return respond({ error: "Image cannot be edited" }, 409);

  const state = await findGroupState(env.DB, contentHash);
  if (!state || state.groupId === null) return respond({ error: "Not grouped" }, 409);

  const others = (await findGroupMembers(env.DB, state.groupId)).filter(
    (m) => m.contentHash !== contentHash,
  );
  const dissolve = others.length === 1 ? others[0].contentHash : null;
  await writeUngroup(env.DB, contentHash, dissolve, new Date().toISOString());

  const hashes = dissolve === null ? [contentHash] : [contentHash, dissolve];
  return respond(await queryImagesByContentHashes(env.DB, hashes, env.IMAGES_BASE_URL, viewer), 200);
}

import type { D1Database } from "@cloudflare/workers-types";
import type { ImageRecord } from "@spyo-map/shared";
import { haversineKm } from "../utils.js";

// Effective position = admin override (keyed by content hash) else EXIF. Aliased to eff_* because
// duplicate column names are ambiguous in D1 result objects.
const IMAGE_SELECT =
  "SELECT images.*, COALESCE(o.latitude, images.latitude) AS eff_latitude, COALESCE(o.longitude, images.longitude) AS eff_longitude, o.hidden AS hidden, o.private_name AS private_name, o.group_id AS group_id, o.grouped_at AS grouped_at, uploaders.display_name AS uploader_name FROM images LEFT JOIN uploaders ON uploaders.id = images.uploader_id LEFT JOIN image_overrides o ON o.content_hash = images.content_hash";

export interface Viewer {
  isAdmin: boolean;
}

// Non-admins never see hidden rows; admins see everything.
const visibility = (viewer: Viewer): string => (viewer.isAdmin ? "" : " AND COALESCE(o.hidden, 0) = 0");

export function rowToRecord(row: Record<string, unknown>, baseUrl: string): ImageRecord {
  const id = row.id as string;
  const hidden = row.hidden === 1 && typeof row.private_name === "string";
  return {
    id,
    imageUrl: hidden ? `${baseUrl}/private/${row.private_name}.jpg` : `${baseUrl}/images/${id}.jpg`,
    thumbnailUrl: hidden
      ? `${baseUrl}/private/thumbnails/${row.private_name}.jpg`
      : `${baseUrl}/images/thumbnails/${id}.jpg`,
    ...(row.hidden === 1 ? { hidden: true } : {}),
    ...(typeof row.group_id === "string" ? { groupId: row.group_id } : {}),
    ...(typeof row.grouped_at === "string" ? { groupedAt: row.grouped_at } : {}),
    latitude: (row.eff_latitude ?? row.latitude) as number,
    longitude: (row.eff_longitude ?? row.longitude) as number,
    timestamp: (row.timestamp as string | null) ?? "",
    uploaderName: (row.uploader_name as string | null) ?? "",
    ...(row.content_hash === null ? { editable: false } : {}),
    ...(row.latitude_ref != null ? { latitudeRef: row.latitude_ref as string } : {}),
    ...(row.longitude_ref != null ? { longitudeRef: row.longitude_ref as string } : {}),
    ...(row.altitude_ref != null ? { altitudeRef: String(row.altitude_ref) } : {}),
    ...(row.altitude != null ? { altitude: row.altitude as number } : {}),
    ...(row.speed_ref != null ? { speedRef: row.speed_ref as string } : {}),
    ...(row.speed != null ? { speed: row.speed as number } : {}),
    ...(row.img_direction_ref != null ? { imgDirectionRef: row.img_direction_ref as string } : {}),
    ...(row.img_direction != null ? { imgDirection: row.img_direction as number } : {}),
    ...(row.dest_bearing_ref != null ? { destBearingRef: row.dest_bearing_ref as string } : {}),
    ...(row.dest_bearing != null ? { destBearing: row.dest_bearing as number } : {}),
    ...(row.h_positioning_error != null
      ? { hPositioningError: row.h_positioning_error as number }
      : {}),
  };
}

export async function queryAllImages(
  db: D1Database,
  baseUrl: string,
  viewer: Viewer,
): Promise<ImageRecord[]> {
  const { results } = await db
    .prepare(`${IMAGE_SELECT} WHERE 1 = 1${visibility(viewer)}`)
    .all<Record<string, unknown>>();
  return results.map((row) => rowToRecord(row, baseUrl));
}

export async function queryImageById(
  db: D1Database,
  id: string,
  baseUrl: string,
  viewer: Viewer,
): Promise<ImageRecord | null> {
  const { results } = await db
    .prepare(`${IMAGE_SELECT} WHERE images.id = ?${visibility(viewer)}`)
    .bind(id)
    .all<Record<string, unknown>>();
  const row = results[0];
  return row ? rowToRecord(row, baseUrl) : null;
}

export async function queryNearbyImages(
  db: D1Database,
  id: string,
  lat: number,
  lon: number,
  radiusKm: number,
  baseUrl: string,
  viewer: Viewer,
): Promise<ImageRecord[]> {
  const { results } = await db
    .prepare(`${IMAGE_SELECT} WHERE images.id != ?${visibility(viewer)}`)
    .bind(id)
    .all<Record<string, unknown>>();

  return results
    .map((row) => rowToRecord(row, baseUrl))
    .map((record) => ({
      record,
      dist: haversineKm(lat, lon, record.latitude, record.longitude),
    }))
    .filter(({ dist }) => dist <= radiusKm)
    .sort((a, b) => a.dist - b.dist)
    .map(({ record }) => record);
}

export async function findContentHash(
  db: D1Database,
  id: string,
): Promise<{ found: boolean; contentHash: string | null }> {
  const row = await db
    .prepare("SELECT content_hash FROM images WHERE id = ?")
    .bind(id)
    .first<{ content_hash: string | null }>();
  return row ? { found: true, contentHash: row.content_hash } : { found: false, contentHash: null };
}

export async function setImageLocation(
  db: D1Database,
  contentHash: string,
  latitude: number,
  longitude: number,
  now: string,
): Promise<void> {
  // One batch (a transaction): upsert this hash, then move every override sharing its group.
  await db.batch([
    db
      .prepare(
        "INSERT INTO image_overrides (content_hash, latitude, longitude, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(content_hash) DO UPDATE SET latitude = excluded.latitude, longitude = excluded.longitude, updated_at = excluded.updated_at",
      )
      .bind(contentHash, latitude, longitude, now),
    db
      .prepare(
        "UPDATE image_overrides SET latitude = ?, longitude = ?, pre_group_latitude = NULL, pre_group_longitude = NULL, updated_at = ? WHERE group_id IS NOT NULL AND group_id = (SELECT group_id FROM image_overrides WHERE content_hash = ?)",
      )
      .bind(latitude, longitude, now, contentHash),
  ]);
}

export async function findGroupId(db: D1Database, contentHash: string): Promise<string | null> {
  const row = await db
    .prepare("SELECT group_id FROM image_overrides WHERE content_hash = ?")
    .bind(contentHash)
    .first<{ group_id: string | null }>();
  return row?.group_id ?? null;
}

export async function queryGroupRecords(
  db: D1Database,
  groupId: string,
  baseUrl: string,
  viewer: Viewer,
): Promise<ImageRecord[]> {
  const { results } = await db
    .prepare(`${IMAGE_SELECT} WHERE o.group_id = ?${visibility(viewer)}`)
    .bind(groupId)
    .all<Record<string, unknown>>();
  return results.map((row) => rowToRecord(row, baseUrl));
}

/**
 * Upsert hidden state. Hiding (non-null name) only wins while the row is not already hidden, so of two concurrent
 * hides exactly one sets the name. Returns whether a row was written.
 */
export async function setHidden(
  db: D1Database,
  contentHash: string,
  privateName: string | null,
  now: string,
): Promise<boolean> {
  const guard = privateName === null ? "" : " WHERE image_overrides.hidden = 0";
  const result = await db
    .prepare(
      `INSERT INTO image_overrides (content_hash, hidden, private_name, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(content_hash) DO UPDATE SET hidden = excluded.hidden, private_name = excluded.private_name, updated_at = excluded.updated_at${guard}`,
    )
    .bind(contentHash, privateName === null ? 0 : 1, privateName, now)
    .run();
  return (result.meta?.changes ?? 0) > 0;
}

export async function findOverride(
  db: D1Database,
  contentHash: string,
): Promise<{ hidden: boolean; privateName: string | null } | null> {
  const row = await db
    .prepare("SELECT hidden, private_name FROM image_overrides WHERE content_hash = ?")
    .bind(contentHash)
    .first<{ hidden: number; private_name: string | null }>();
  return row ? { hidden: row.hidden === 1, privateName: row.private_name } : null;
}

export async function queryImagesByContentHash(
  db: D1Database,
  contentHash: string,
  baseUrl: string,
  viewer: Viewer,
): Promise<ImageRecord[]> {
  const { results } = await db
    .prepare(`${IMAGE_SELECT} WHERE images.content_hash = ?${visibility(viewer)}`)
    .bind(contentHash)
    .all<Record<string, unknown>>();
  return results.map((row) => rowToRecord(row, baseUrl));
}

export interface GroupState {
  groupId: string | null;
  groupedAt: string | null;
  latitude: number;
  longitude: number;
}

/** Group fields and effective position (override else EXIF of the first row) of a content hash; null if no row. */
export async function findGroupState(db: D1Database, contentHash: string): Promise<GroupState | null> {
  const row = await db
    .prepare(
      "SELECT COALESCE(o.latitude, images.latitude) AS lat, COALESCE(o.longitude, images.longitude) AS lon, o.group_id AS group_id, o.grouped_at AS grouped_at FROM images LEFT JOIN image_overrides o ON o.content_hash = images.content_hash WHERE images.content_hash = ? ORDER BY images.id LIMIT 1",
    )
    .bind(contentHash)
    .first<{ lat: number; lon: number; group_id: string | null; grouped_at: string | null }>();
  return row
    ? { groupId: row.group_id, groupedAt: row.grouped_at, latitude: row.lat, longitude: row.lon }
    : null;
}

/** Content hashes in a group with their effective positions. */
export async function findGroupMembers(
  db: D1Database,
  groupId: string,
): Promise<Array<{ contentHash: string; latitude: number; longitude: number }>> {
  const { results } = await db
    .prepare(
      "SELECT o.content_hash AS content_hash, COALESCE(o.latitude, (SELECT latitude FROM images WHERE content_hash = o.content_hash ORDER BY id LIMIT 1)) AS lat, COALESCE(o.longitude, (SELECT longitude FROM images WHERE content_hash = o.content_hash ORDER BY id LIMIT 1)) AS lon FROM image_overrides o WHERE o.group_id = ? AND EXISTS (SELECT 1 FROM images WHERE images.content_hash = o.content_hash) ORDER BY o.content_hash",
    )
    .bind(groupId)
    .all<{ content_hash: string; lat: number; lon: number }>();
  return results.map((r) => ({ contentHash: r.content_hash, latitude: r.lat, longitude: r.lon }));
}

export interface GroupWrite {
  contentHash: string;
  latitude: number;
  longitude: number;
  groupId: string;
  groupedAt: string;
  preGroupLatitude: number;
  preGroupLongitude: number;
}

const GROUP_COLUMNS =
  "content_hash, latitude, longitude, updated_at, group_id, grouped_at, pre_group_latitude, pre_group_longitude";
const GROUP_UPDATE =
  "ON CONFLICT(content_hash) DO UPDATE SET latitude = excluded.latitude, longitude = excluded.longitude, updated_at = excluded.updated_at, group_id = excluded.group_id, grouped_at = excluded.grouped_at, pre_group_latitude = excluded.pre_group_latitude, pre_group_longitude = excluded.pre_group_longitude";

const groupValues = (r: GroupWrite, now: string) => [
  r.contentHash,
  r.latitude,
  r.longitude,
  now,
  r.groupId,
  r.groupedAt,
  r.preGroupLatitude,
  r.preGroupLongitude,
];

/**
 * Write group membership in one batch (a transaction). `target` (a new group's first member) is claimed only while it
 * is still ungrouped; each joiner is written only if the target then carries `targetHash`/`groupId`. So of two
 * concurrent requests onto the same ungrouped target, the loser writes nothing. Returns the joiner rows changed.
 */
export async function writeGroup(
  db: D1Database,
  target: GroupWrite | null,
  targetHash: string,
  joiners: GroupWrite[],
  now: string,
): Promise<number> {
  const results = await db.batch([
    ...(target === null
      ? []
      : [
          db
            .prepare(
              `INSERT INTO image_overrides (${GROUP_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ${GROUP_UPDATE} WHERE image_overrides.group_id IS NULL`,
            )
            .bind(...groupValues(target, now)),
        ]),
    ...joiners.map((r) =>
      db
        .prepare(
          `INSERT INTO image_overrides (${GROUP_COLUMNS}) SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM image_overrides WHERE content_hash = ? AND group_id = ?) ${GROUP_UPDATE}`,
        )
        .bind(...groupValues(r, now), targetHash, r.groupId),
    ),
  ]);
  return results
    .slice(target === null ? 0 : 1)
    .reduce((sum, r) => sum + ((r as { meta?: { changes?: number } }).meta?.changes ?? 0), 0);
}

/**
 * Remove a hash from its group in one batch: it returns to its pre-group position when one is recorded (a group move
 * clears it). `dissolveHash` is the last remaining member, which leaves the group in place.
 */
export async function writeUngroup(
  db: D1Database,
  contentHash: string,
  dissolveHash: string | null,
  now: string,
): Promise<void> {
  const leave = (restore: boolean) =>
    `UPDATE image_overrides SET ${
      restore
        ? "latitude = CASE WHEN pre_group_latitude IS NOT NULL AND pre_group_longitude IS NOT NULL THEN pre_group_latitude ELSE latitude END, longitude = CASE WHEN pre_group_latitude IS NOT NULL AND pre_group_longitude IS NOT NULL THEN pre_group_longitude ELSE longitude END, "
        : ""
    }group_id = NULL, grouped_at = NULL, pre_group_latitude = NULL, pre_group_longitude = NULL, updated_at = ? WHERE content_hash = ?`;
  await db.batch([
    db.prepare(leave(true)).bind(now, contentHash),
    ...(dissolveHash === null ? [] : [db.prepare(leave(false)).bind(now, dissolveHash)]),
  ]);
}

export async function queryImagesByContentHashes(
  db: D1Database,
  contentHashes: string[],
  baseUrl: string,
  viewer: Viewer,
): Promise<ImageRecord[]> {
  if (contentHashes.length === 0) return [];
  const { results } = await db
    .prepare(
      `${IMAGE_SELECT} WHERE images.content_hash IN (${contentHashes.map(() => "?").join(", ")})${visibility(viewer)}`,
    )
    .bind(...contentHashes)
    .all<Record<string, unknown>>();
  return results.map((row) => rowToRecord(row, baseUrl));
}

import type { D1Database } from "@cloudflare/workers-types";
import type { ImageRecord } from "@spyo-map/shared";
import { haversineKm } from "../utils.js";

// Effective position = admin override (keyed by content hash) else EXIF. Aliased to eff_* because
// duplicate column names are ambiguous in D1 result objects.
const IMAGE_SELECT =
  "SELECT images.*, COALESCE(o.latitude, images.latitude) AS eff_latitude, COALESCE(o.longitude, images.longitude) AS eff_longitude, o.hidden AS hidden, o.private_name AS private_name, uploaders.display_name AS uploader_name FROM images LEFT JOIN uploaders ON uploaders.id = images.uploader_id LEFT JOIN image_overrides o ON o.content_hash = images.content_hash";

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
  await db
    .prepare(
      "INSERT INTO image_overrides (content_hash, latitude, longitude, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(content_hash) DO UPDATE SET latitude = excluded.latitude, longitude = excluded.longitude, updated_at = excluded.updated_at",
    )
    .bind(contentHash, latitude, longitude, now)
    .run();
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

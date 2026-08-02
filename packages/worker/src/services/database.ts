import type { D1Database } from "@cloudflare/workers-types";
import type { ImageRecord } from "@spyo-map/shared";
import { haversineKm } from "../utils.js";

export function rowToRecord(row: Record<string, unknown>, baseUrl: string): ImageRecord {
  const id = row.id as string;
  return {
    id,
    imageUrl: `${baseUrl}/images/${id}.jpg`,
    thumbnailUrl: `${baseUrl}/images/thumbnails/${id}.jpg`,
    latitude: row.latitude as number,
    longitude: row.longitude as number,
    timestamp: (row.timestamp as string | null) ?? "",
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

export async function queryAllImages(db: D1Database, baseUrl: string): Promise<ImageRecord[]> {
  const { results } = await db.prepare("SELECT * FROM images").all<Record<string, unknown>>();
  return results.map((row) => rowToRecord(row, baseUrl));
}

export async function queryImageById(
  db: D1Database,
  id: string,
  baseUrl: string,
): Promise<ImageRecord | null> {
  const { results } = await db
    .prepare("SELECT * FROM images WHERE id = ?")
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
): Promise<ImageRecord[]> {
  const { results } = await db
    .prepare("SELECT * FROM images WHERE id != ?")
    .bind(id)
    .all<Record<string, unknown>>();

  return results
    .map((row) => ({
      record: rowToRecord(row, baseUrl),
      dist: haversineKm(lat, lon, row.latitude as number, row.longitude as number),
    }))
    .filter(({ dist }) => dist <= radiusKm)
    .sort((a, b) => a.dist - b.dist)
    .map(({ record }) => record);
}

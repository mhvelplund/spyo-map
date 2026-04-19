import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import BetterSqlite3 from "better-sqlite3";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";
import type { ImageRecord } from "@spyro-map/shared";
import { config } from "../config.js";
import { haversineKm } from "../utils.js";

const DB_PATH = "/tmp/spyro-map-images.db";
const DB_KEY = "images.db";

function buildS3Client(): S3Client {
  return new S3Client({
    region: config.storage.region,
    credentials: {
      accessKeyId: config.storage.accessKey,
      secretAccessKey: config.storage.secretKey,
    },
    ...(config.storage.endpoint
      ? { endpoint: config.storage.endpoint, forcePathStyle: true }
      : {}),
  });
}

const s3 = buildS3Client();
let db: BetterSqlite3.Database | null = null;

async function downloadDb(): Promise<void> {
  const response = await s3.send(
    new GetObjectCommand({ Bucket: config.storage.bucket, Key: DB_KEY }),
  );
  const body = response.Body as Readable;
  await pipeline(body, createWriteStream(DB_PATH));
}

function openDb(): void {
  db?.close();
  db = new BetterSqlite3(DB_PATH, { readonly: true });
}

export async function initDatabase(): Promise<void> {
  await downloadDb();
  openDb();

  if (config.dbRefreshIntervalMs > 0) {
    setInterval(async () => {
      await reloadDatabase();
    }, config.dbRefreshIntervalMs);
  }
}

export async function reloadDatabase(): Promise<void> {
  await downloadDb();
  openDb();
}

function getDb(): BetterSqlite3.Database {
  if (!db) throw new Error("Database not initialized");
  return db;
}

// --- Exported testable helpers (accept db and baseUrl as params) ---

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
    ...(row.h_positioning_error != null ? { hPositioningError: row.h_positioning_error as number } : {}),
  };
}

export function queryAllImages(db: BetterSqlite3.Database, baseUrl: string): ImageRecord[] {
  const rows = db.prepare("SELECT * FROM images").all() as Record<string, unknown>[];
  return rows.map((row) => rowToRecord(row, baseUrl));
}

export function queryImageById(
  db: BetterSqlite3.Database,
  id: string,
  baseUrl: string,
): ImageRecord | null {
  const row = db.prepare("SELECT * FROM images WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? rowToRecord(row, baseUrl) : null;
}

export function queryNearbyImages(
  db: BetterSqlite3.Database,
  id: string,
  lat: number,
  lon: number,
  radiusKm: number,
  baseUrl: string,
): ImageRecord[] {
  const rows = db
    .prepare("SELECT * FROM images WHERE id != ?")
    .all(id) as Record<string, unknown>[];

  return rows
    .map((row) => ({
      record: rowToRecord(row, baseUrl),
      dist: haversineKm(lat, lon, row.latitude as number, row.longitude as number),
    }))
    .filter(({ dist }) => dist <= radiusKm)
    .sort((a, b) => a.dist - b.dist)
    .map(({ record }) => record);
}

// --- Public API (unchanged signatures — call helpers with module-level state) ---

export function getAllImages(): ImageRecord[] {
  return queryAllImages(getDb(), config.imagesBaseUrl);
}

export function getImageById(id: string): ImageRecord | null {
  return queryImageById(getDb(), id, config.imagesBaseUrl);
}

export function getNearbyImages(
  id: string,
  lat: number,
  lon: number,
  radiusKm: number,
): ImageRecord[] {
  return queryNearbyImages(getDb(), id, lat, lon, radiusKm, config.imagesBaseUrl);
}

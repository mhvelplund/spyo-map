import type { Config } from './config.js';
import type { ExifData } from './processor.js';

/** Rows are written in chunks; 20 x 16 = 320 bind parameters, well under SQLite's limit. */
const BATCH_SIZE = 20;

const COLUMNS = [
  'id',
  'path',
  'latitude',
  'longitude',
  'timestamp',
  'latitude_ref',
  'longitude_ref',
  'altitude_ref',
  'altitude',
  'speed_ref',
  'speed',
  'img_direction_ref',
  'img_direction',
  'dest_bearing_ref',
  'dest_bearing',
  'h_positioning_error',
] as const;

export interface D1Client {
  query(sql: string, params?: unknown[]): Promise<Array<Record<string, unknown>>>;
}

export interface ImageInsert {
  id: string;
  path: string;
  exif: ExifData;
}

interface D1Response {
  success?: boolean;
  errors?: Array<{ code: number; message: string }>;
  result?: Array<{ results?: Array<Record<string, unknown>> }>;
}

export function createD1Client(config: Config): D1Client {
  const url =
    `https://api.cloudflare.com/client/v4/accounts/${config.cloudflareAccountId}` +
    `/d1/database/${config.d1DatabaseId}/query`;

  return {
    async query(sql, params = []) {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.cloudflareApiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sql, params }),
      });

      let body: D1Response;
      try {
        body = (await response.json()) as D1Response;
      } catch {
        throw new Error(`D1 request failed with HTTP ${response.status}`);
      }

      if (!body.success) {
        const message = body.errors?.map((e) => e.message).join('; ') ?? `HTTP ${response.status}`;
        throw new Error(`D1 query failed: ${message}`);
      }

      return body.result?.[0]?.results ?? [];
    },
  };
}

export async function fetchExistingIds(client: D1Client): Promise<Set<string>> {
  const rows = await client.query('SELECT id FROM images');
  return new Set(rows.map((row) => row['id'] as string));
}

function toParams(row: ImageInsert): unknown[] {
  const { exif } = row;
  return [
    row.id,
    row.path,
    exif.latitude,
    exif.longitude,
    exif.timestamp ?? null,
    exif.latitudeRef ?? null,
    exif.longitudeRef ?? null,
    exif.altitudeRef ?? null,
    exif.altitude ?? null,
    exif.speedRef ?? null,
    exif.speed ?? null,
    exif.imgDirectionRef ?? null,
    exif.imgDirection ?? null,
    exif.destBearingRef ?? null,
    exif.destBearing ?? null,
    exif.hPositioningError ?? null,
  ];
}

export async function upsertImages(client: D1Client, rows: ImageInsert[]): Promise<void> {
  const updates = COLUMNS.filter((c) => c !== 'id')
    .map((c) => `${c} = excluded.${c}`)
    .join(', ');
  const placeholders = `(${COLUMNS.map(() => '?').join(', ')})`;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const sql =
      `INSERT INTO images (${COLUMNS.join(', ')}) VALUES ` +
      chunk.map(() => placeholders).join(', ') +
      ` ON CONFLICT(id) DO UPDATE SET ${updates}`;
    await client.query(sql, chunk.flatMap(toParams));
  }
}

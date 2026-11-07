import type { D1Database } from "@cloudflare/workers-types";

const CHUNK = 90;

/** Which of these content hashes already have an uploads row. */
export async function findKnownHashes(db: D1Database, hashes: string[]): Promise<string[]> {
  const known: string[] = [];
  for (let i = 0; i < hashes.length; i += CHUNK) {
    const chunk = hashes.slice(i, i + CHUNK);
    const placeholders = chunk.map(() => "?").join(", ");
    const { results } = await db
      .prepare(`SELECT content_hash FROM uploads WHERE content_hash IN (${placeholders})`)
      .bind(...chunk)
      .all<{ content_hash: string }>();
    for (const row of results) known.push(row.content_hash);
  }
  return known;
}

export async function recordUpload(
  db: D1Database,
  r: { contentHash: string; uploaderId: number; originalFilename: string; rawKey: string },
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO uploads (content_hash, uploader_id, original_filename, raw_key, uploaded_at) VALUES (?, ?, ?, ?, datetime('now')) ON CONFLICT(content_hash) DO NOTHING",
    )
    .bind(r.contentHash, r.uploaderId, r.originalFilename, r.rawKey)
    .run();
}

import type { D1Database } from "@cloudflare/workers-types";

export interface Uploader {
  id: number;
  displayName: string;
  isAdmin: boolean;
}

interface UploaderRow {
  id: number;
  display_name: string;
  is_admin: number;
}

const toUploader = (row: UploaderRow | null): Uploader | null =>
  row ? { id: row.id, displayName: row.display_name, isAdmin: row.is_admin === 1 } : null;

export async function findActiveUploaderByEmail(
  db: D1Database,
  email: string,
): Promise<Uploader | null> {
  const row = await db
    .prepare(
      "SELECT uploaders.id AS id, uploaders.display_name AS display_name, uploaders.is_admin AS is_admin FROM uploader_emails JOIN uploaders ON uploaders.id = uploader_emails.uploader_id WHERE uploader_emails.email = ? AND uploaders.disabled_at IS NULL",
    )
    .bind(email.trim().toLowerCase())
    .first<UploaderRow>();
  return toUploader(row);
}

export async function findActiveUploaderById(
  db: D1Database,
  id: number,
): Promise<Uploader | null> {
  const row = await db
    .prepare("SELECT id, display_name, is_admin FROM uploaders WHERE id = ? AND disabled_at IS NULL")
    .bind(id)
    .first<UploaderRow>();
  return toUploader(row);
}

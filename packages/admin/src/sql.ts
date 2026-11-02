export function sqlString(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

export function normaliseEmail(s: string): string {
  const e = s.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+$/.test(e)) throw new Error('invalid email');
  return e;
}

function intId(id: number): number {
  if (!Number.isInteger(id)) throw new Error('invalid id');
  return id;
}

export function addUploaderSql(name: string, email: string): string {
  const e = normaliseEmail(email);
  return (
    `INSERT INTO uploaders (display_name, created_at, disabled_at) VALUES (${sqlString(name)}, datetime('now'), NULL); ` +
    `INSERT INTO uploader_emails (email, uploader_id) VALUES (${sqlString(e)}, last_insert_rowid());`
  );
}

export function addEmailSql(id: number, email: string): string {
  return `INSERT INTO uploader_emails (email, uploader_id) VALUES (${sqlString(normaliseEmail(email))}, ${intId(id)});`;
}

export function listUploadersSql(): string {
  return (
    'SELECT u.id, u.display_name, u.disabled_at, group_concat(e.email) AS emails ' +
    'FROM uploaders u LEFT JOIN uploader_emails e ON e.uploader_id = u.id GROUP BY u.id ORDER BY u.id;'
  );
}

export function renameSql(id: number, name: string): string {
  return `UPDATE uploaders SET display_name = ${sqlString(name)} WHERE id = ${intId(id)};`;
}

export function setDisabledSql(id: number, disabled: boolean): string {
  return disabled
    ? `UPDATE uploaders SET disabled_at = datetime('now') WHERE id = ${intId(id)};`
    : `UPDATE uploaders SET disabled_at = NULL WHERE id = ${intId(id)};`;
}

export function forgetUploadSql(sha256: string): string {
  return `DELETE FROM uploads WHERE content_hash = ${sqlString(sha256)};`;
}

export function removeImageSql(imageId: string): string {
  return `DELETE FROM images WHERE id = ${sqlString(imageId)};`;
}

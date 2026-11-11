export interface Config {
  storageEndpoint: string | undefined;
  /** Public bucket: processed images/ and images/thumbnails/. */
  storageBucket: string;
  /** Private bucket (no public domain): raw/, failed/ and originals/. */
  storagePrivateBucket: string;
  storageAccessKey: string | undefined;
  storageSecretKey: string | undefined;
  storageRegion: string;
  localSourcePath: string | undefined;
  /** Bucket prefix to ingest from: `raw/` (normal) or `originals/` (re-ingest after a wipe). */
  sourcePrefix: SourcePrefix;
  cloudflareAccountId: string;
  cloudflareApiToken: string;
  d1DatabaseId: string;
}

export type SourcePrefix = 'raw/' | 'originals/';

export function parseSourcePrefix(value: string | undefined): SourcePrefix {
  const normalized = (value ?? '').trim().replace(/\/+$/, '');
  if (normalized === '' || normalized === 'raw') return 'raw/';
  if (normalized === 'originals') return 'originals/';
  throw new Error(`Invalid SOURCE_PREFIX "${value}": expected "raw/" or "originals/"`);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function loadConfig(): Config {
  return {
    storageEndpoint: process.env['STORAGE_ENDPOINT'] || undefined,
    storageBucket: requireEnv('STORAGE_BUCKET'),
    storagePrivateBucket: requireEnv('STORAGE_PRIVATE_BUCKET'),
    storageAccessKey: process.env['STORAGE_ACCESS_KEY'] || undefined,
    storageSecretKey: process.env['STORAGE_SECRET_KEY'] || undefined,
    storageRegion: process.env['STORAGE_REGION'] ?? 'auto',
    localSourcePath: process.env['LOCAL_SOURCE_PATH'] || undefined,
    sourcePrefix: parseSourcePrefix(process.env['SOURCE_PREFIX']),
    cloudflareAccountId: requireEnv('CLOUDFLARE_ACCOUNT_ID'),
    cloudflareApiToken: requireEnv('CLOUDFLARE_API_TOKEN'),
    d1DatabaseId: requireEnv('D1_DATABASE_ID'),
  };
}

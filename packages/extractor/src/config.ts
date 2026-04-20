export interface Config {
  storageEndpoint: string | undefined;
  storageBucket: string;
  storageAccessKey: string | undefined;
  storageSecretKey: string | undefined;
  storageRegion: string;
  localSourcePath: string | undefined;
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
    storageAccessKey: process.env['STORAGE_ACCESS_KEY'] || undefined,
    storageSecretKey: process.env['STORAGE_SECRET_KEY'] || undefined,
    storageRegion: process.env['STORAGE_REGION'] ?? 'us-east-1',
    localSourcePath: process.env['LOCAL_SOURCE_PATH'] || undefined,
  };
}

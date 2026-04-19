export interface Config {
  storageEndpoint: string | undefined;
  storageBucket: string;
  storageAccessKey: string;
  storageSecretKey: string;
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
    storageAccessKey: requireEnv('STORAGE_ACCESS_KEY'),
    storageSecretKey: requireEnv('STORAGE_SECRET_KEY'),
    storageRegion: process.env['STORAGE_REGION'] ?? 'us-east-1',
    localSourcePath: process.env['LOCAL_SOURCE_PATH'] || undefined,
  };
}

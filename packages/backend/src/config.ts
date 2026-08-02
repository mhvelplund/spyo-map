export const config = {
  port: parseInt(process.env.PORT ?? "3001", 10),
  imagesBaseUrl: process.env.IMAGES_BASE_URL ?? "http://localhost:9000/spyo-map",
  dbRefreshIntervalMs: parseInt(process.env.DB_REFRESH_INTERVAL_MS ?? "300000", 10),
  storage: {
    endpoint: process.env.STORAGE_ENDPOINT,
    bucket: process.env.STORAGE_BUCKET ?? "spyo-map",
    accessKey: process.env.STORAGE_ACCESS_KEY || undefined,
    secretKey: process.env.STORAGE_SECRET_KEY || undefined,
    region: process.env.STORAGE_REGION ?? "us-east-1",
  },
} as const;

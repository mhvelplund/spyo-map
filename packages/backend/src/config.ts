export const config = {
  port: parseInt(process.env.PORT ?? "3001", 10),
  imagesBaseUrl: process.env.IMAGES_BASE_URL ?? "http://localhost:9000/spyro-map",
  dbRefreshIntervalMs: parseInt(process.env.DB_REFRESH_INTERVAL_MS ?? "300000", 10),
  storage: {
    endpoint: process.env.STORAGE_ENDPOINT,
    bucket: process.env.STORAGE_BUCKET ?? "spyro-map",
    accessKey: process.env.STORAGE_ACCESS_KEY ?? "",
    secretKey: process.env.STORAGE_SECRET_KEY ?? "",
    region: process.env.STORAGE_REGION ?? "us-east-1",
  },
} as const;

import Fastify from "fastify";
import cors from "@fastify/cors";
import { config } from "./config.js";
import { initDatabase } from "./services/database.js";
import { imageRoutes } from "./routes/images.js";

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });
await app.register(imageRoutes);

try {
  await initDatabase();
} catch (err) {
  app.log.warn({ err }, "Could not load database on startup — will retry on next reload interval");
}
await app.listen({ port: config.port, host: "0.0.0.0" });

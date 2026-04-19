import Fastify from "fastify";
import cors from "@fastify/cors";
import { config } from "./config.js";
import { initDatabase } from "./services/database.js";
import { imageRoutes } from "./routes/images.js";

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });
await app.register(imageRoutes);

await initDatabase();
await app.listen({ port: config.port, host: "0.0.0.0" });

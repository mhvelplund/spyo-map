import type { FastifyInstance } from "fastify";
import {
  getAllImages,
  getImageById,
  getNearbyImages,
  reloadDatabase,
} from "../services/database.js";

export async function imageRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/health", async () => ({ status: "ok" }));

  app.get("/api/images", async () => getAllImages());

  app.get<{ Params: { id: string } }>("/api/images/:id", async (request, reply) => {
    const image = getImageById(request.params.id);
    if (!image) return reply.status(404).send({ error: "Not found" });
    return image;
  });

  app.get<{
    Params: { id: string };
    Querystring: { radius?: string };
  }>("/api/images/:id/nearby", async (request, reply) => {
    const image = getImageById(request.params.id);
    if (!image) return reply.status(404).send({ error: "Not found" });
    const radius = parseFloat(request.query.radius ?? "1");
    if (isNaN(radius) || radius < 0) {
      return reply.status(400).send({ error: "Invalid radius" });
    }
    return getNearbyImages(request.params.id, image.latitude, image.longitude, radius);
  });

  app.post("/api/reload", async () => {
    await reloadDatabase();
    return { status: "ok" };
  });
}

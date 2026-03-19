import "dotenv/config";
import Fastify from "fastify";
import formbody from "@fastify/formbody";
import websocket from "@fastify/websocket";
import { registerWebhookRoutes } from "./telephony/webhooks.js";
import { loadBusinessConfig } from "./config/loader.js";

const port = Number(process.env["PORT"] ?? 3001);
const host = process.env["HOST"] ?? "0.0.0.0";

const app = Fastify({ logger: true });

// CRITICAL: formbody must be registered first
await app.register(formbody);
await app.register(websocket);

// Load business config at startup
const businessConfig = loadBusinessConfig();
app.log.info(`Business config loaded: ${businessConfig.businessName}`);

// Health check
app.get("/", async () => {
  return { status: "ok" };
});

// Twilio webhook routes
registerWebhookRoutes(app);

// Placeholder WebSocket route for Twilio Media Streams
app.register(async (fastify) => {
  fastify.get(
    "/media-stream",
    { websocket: true },
    (socket, _request) => {
      app.log.info("WebSocket client connected to /media-stream");

      socket.on("close", () => {
        app.log.info("WebSocket client disconnected from /media-stream");
      });
    }
  );
});

try {
  await app.listen({ port, host });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

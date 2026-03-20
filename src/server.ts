import "dotenv/config";
import Fastify from "fastify";
import formbody from "@fastify/formbody";
import websocket from "@fastify/websocket";
import { registerWebhookRoutes } from "./telephony/webhooks.js";
import { registerMediaStreamRoute } from "./telephony/media-stream.js";

const port = Number(process.env["PORT"] ?? 3001);
const host = process.env["HOST"] ?? "0.0.0.0";

const app = Fastify({ logger: true });

// CRITICAL: formbody must be registered first
await app.register(formbody);
await app.register(websocket);

// Health check
app.get("/", async () => {
  return { status: "ok" };
});

// Twilio webhook routes
registerWebhookRoutes(app);

// Twilio Media Streams WebSocket route (bridges to OpenAI Realtime API)
registerMediaStreamRoute(app);

try {
  await app.listen({ port, host });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

import "dotenv/config";
import Fastify from "fastify";
import formbody from "@fastify/formbody";
import { registerVapiWebhookRoute } from "./api/vapi-webhook.js";

const port = Number(process.env["PORT"] ?? 3001);
const host = process.env["HOST"] ?? "0.0.0.0";

const app = Fastify({ logger: true });

await app.register(formbody);

// Health check
app.get("/", async () => {
  return { status: "ok" };
});

// Vapi webhook (replaces Twilio routes)
registerVapiWebhookRoute(app);

try {
  await app.listen({ port, host });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

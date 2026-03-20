import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import twilio from "twilio";
import { realtime } from "@openai/agents";
import { TwilioRealtimeTransportLayer } from "@openai/agents-extensions";
import { createRealtimeAgent } from "../ai/realtime.js";
import { SessionManager } from "../ai/session.js";
import type { BusinessConfig } from "../config/schema.js";

const { RealtimeSession } = realtime;

const SILENCE_CHECK_MS = 10_000;
const SILENCE_GOODBYE_MS = 15_000;

const sessionManager = new SessionManager();

export function registerMediaStreamRoute(
  app: FastifyInstance,
  config: BusinessConfig,
): void {
  app.register(async (fastify) => {
    fastify.get(
      "/media-stream",
      { websocket: true },
      (socket: WebSocket, _request) => {
        app.log.info("WebSocket client connected to /media-stream");

        let streamSid: string | null = null;
        let callSid: string | null = null;
        let silenceTimer: ReturnType<typeof setTimeout> | null = null;
        let goodbyeTimer: ReturnType<typeof setTimeout> | null = null;
        let isCleanedUp = false;

        // Create transport and session immediately so the transport's message
        // listener is registered BEFORE any Twilio events arrive. The transport
        // needs to see the `start` event to extract the streamSid for outgoing audio.
        const agent = createRealtimeAgent(config);
        const transport = new TwilioRealtimeTransportLayer({
          twilioWebSocket: socket,
        });
        const session = new RealtimeSession(agent, {
          transport,
          model: "gpt-realtime",
        });

        function resetSilenceTimers() {
          if (silenceTimer) {
            clearTimeout(silenceTimer);
            silenceTimer = null;
          }
          if (goodbyeTimer) {
            clearTimeout(goodbyeTimer);
            goodbyeTimer = null;
          }

          silenceTimer = setTimeout(() => {
            app.log.info(
              { streamSid },
              "Silence detected (10s), asking if still there",
            );
            session.sendMessage(
              "The caller has been silent for 10 seconds. Ask if they are still there.",
              {},
            );

            goodbyeTimer = setTimeout(() => {
              app.log.info(
                { streamSid },
                "Extended silence (15s more), saying goodbye",
              );
              session.sendMessage(
                "The caller is still silent. Say goodbye and end the call.",
                {},
              );
            }, SILENCE_GOODBYE_MS);
          }, SILENCE_CHECK_MS);
        }

        function cleanup() {
          if (isCleanedUp) return;
          isCleanedUp = true;

          if (silenceTimer) clearTimeout(silenceTimer);
          if (goodbyeTimer) clearTimeout(goodbyeTimer);

          try {
            session.close();
          } catch (err) {
            app.log.warn({ err }, "Error closing realtime session");
          }

          if (streamSid) {
            sessionManager.removeSession(streamSid);
          }

          app.log.info(
            { streamSid, callSid },
            "Media stream session cleaned up",
          );
        }

        // Listen for tool calls to handle end_call
        session.on("agent_tool_end", (_ctx, _agent, toolDef, _result) => {
          if (toolDef.name === "end_call" && callSid) {
            app.log.info({ callSid }, "Ending call via Twilio API");
            const accountSid = process.env["TWILIO_ACCOUNT_SID"] ?? "";
            const authToken = process.env["TWILIO_AUTH_TOKEN"] ?? "";
            if (accountSid && authToken) {
              const client = twilio(accountSid, authToken);
              client
                .calls(callSid)
                .update({ status: "completed" })
                .catch((err: unknown) => {
                  app.log.error(
                    { err, callSid },
                    "Failed to end call via Twilio API",
                  );
                });
            }
          }
        });

        // Log transcripts
        session.on("history_updated", (history) => {
          if (!streamSid) return;
          for (const item of history) {
            if (item.type === "message" && item.role && item.content) {
              const content =
                typeof item.content === "string"
                  ? item.content
                  : JSON.stringify(item.content);
              sessionManager.logMessage(streamSid, item.role, content);
            }
          }
        });

        // Handle errors
        session.on("error", (error) => {
          app.log.error({ error, streamSid }, "Realtime session error");
        });

        // Use transport events to track Twilio session metadata.
        // The transport handles all audio bridging, we just need streamSid/callSid.
        session.on("transport_event", (event: Record<string, unknown>) => {
          if (event["type"] !== "twilio_message") return;
          const msg = event["message"] as Record<string, unknown>;
          if (!msg) return;

          switch (msg["event"]) {
            case "start": {
              const start = msg["start"] as Record<string, unknown>;
              streamSid = start["streamSid"] as string;
              callSid = start["callSid"] as string;
              const params = (start["customParameters"] as Record<string, string>) ?? {};
              const from = params["From"] ?? "unknown";
              const to = params["To"] ?? "unknown";

              app.log.info(
                { streamSid, callSid, from, to },
                "Twilio media stream started",
              );
              sessionManager.createSession(streamSid, callSid, from, to);
              resetSilenceTimers();
              break;
            }
            case "media": {
              resetSilenceTimers();
              break;
            }
            case "stop": {
              app.log.info({ streamSid }, "Twilio media stream stopped");
              cleanup();
              break;
            }
          }
        });

        // Connect to OpenAI immediately. The transport will queue events
        // until the OpenAI connection is ready.
        const apiKey = process.env["OPENAI_API_KEY"] ?? "";
        session
          .connect({ apiKey })
          .then(() => {
            app.log.info("Realtime session connected to OpenAI");
            // Trigger the agent to greet the caller
            session.sendMessage(
              "A new caller has just connected. Greet them now.",
              {},
            );
            app.log.info("Sent greeting trigger to agent");
          })
          .catch((err: unknown) => {
            app.log.error({ err }, "Failed to connect realtime session");
            cleanup();
          });

        socket.on("close", () => {
          app.log.info({ streamSid }, "WebSocket client disconnected");
          cleanup();
        });

        socket.on("error", (err) => {
          app.log.error({ err, streamSid }, "WebSocket error");
          cleanup();
        });
      },
    );
  });
}

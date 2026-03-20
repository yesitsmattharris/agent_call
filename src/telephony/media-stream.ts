import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import twilio from "twilio";
import { realtime } from "@openai/agents";
import { TwilioRealtimeTransportLayer } from "@openai/agents-extensions";
import { createRealtimeAgent } from "../ai/realtime.js";
import { SessionManager } from "../ai/session.js";
import { pendingConfigs } from "./webhooks.js";

const { RealtimeSession } = realtime;

const SILENCE_CHECK_MS = 10_000;
const SILENCE_GOODBYE_MS = 15_000;

const sessionManager = new SessionManager();

export function registerMediaStreamRoute(app: FastifyInstance): void {
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

        // Create transport immediately so its message listener is registered
        // BEFORE any Twilio events arrive. The transport needs to see the
        // `start` event to extract the streamSid for outgoing audio.
        const transport = new TwilioRealtimeTransportLayer({
          twilioWebSocket: socket,
        });

        // Session and agent are created after we get the callSid from the
        // start event, since we need the tenant config from pendingConfigs.
        let session: InstanceType<typeof RealtimeSession> | null = null;

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
            session?.sendMessage(
              "The caller has been silent for 10 seconds. Ask if they are still there.",
              {},
            );

            goodbyeTimer = setTimeout(() => {
              app.log.info(
                { streamSid },
                "Extended silence (15s more), saying goodbye",
              );
              session?.sendMessage(
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
            session?.close();
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

        function setupSessionListeners(
          sess: InstanceType<typeof RealtimeSession>,
        ) {
          // Listen for tool calls to handle end_call
          sess.on("agent_tool_end", (_ctx, _agent, toolDef, _result) => {
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
          sess.on("history_updated", (history) => {
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
          sess.on("error", (error) => {
            app.log.error({ error, streamSid }, "Realtime session error");
          });
        }

        // Use transport events to track Twilio session metadata and
        // initialize the agent once we have the callSid for config lookup.
        // The transport emits all Twilio messages on the "*" handler with
        // { type: "twilio_message", message: <twilio-data> } structure.
        transport.on("*", (event: Record<string, unknown>) => {
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

              // Retrieve tenant config stored by the incoming-call webhook
              const config = pendingConfigs.get(callSid);
              pendingConfigs.delete(callSid);

              if (!config) {
                app.log.error(
                  { callSid },
                  "No pending config found for call, closing socket",
                );
                socket.close();
                return;
              }

              // Now create the agent and session with tenant-specific config
              const agent = createRealtimeAgent(config);
              session = new RealtimeSession(agent, {
                transport,
                model: "gpt-realtime",
              });

              setupSessionListeners(session);

              // Connect to OpenAI and trigger greeting
              const apiKey = process.env["OPENAI_API_KEY"] ?? "";
              session
                .connect({ apiKey })
                .then(() => {
                  app.log.info("Realtime session connected to OpenAI");
                  session!.sendMessage(
                    "A new caller has just connected. Greet them now.",
                    {},
                  );
                  app.log.info("Sent greeting trigger to agent");
                })
                .catch((err: unknown) => {
                  app.log.error(
                    { err },
                    "Failed to connect realtime session",
                  );
                  cleanup();
                });

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

import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import twilio from "twilio";
import { realtime } from "@openai/agents";
import { TwilioRealtimeTransportLayer } from "@openai/agents-extensions";
import { createRealtimeAgent } from "../ai/realtime.js";
import { SessionManager } from "../ai/session.js";
import type { BusinessConfig } from "../config/schema.js";

const { RealtimeSession } = realtime;

// Twilio Media Stream message types
interface TwilioStartMessage {
  event: "start";
  start: {
    streamSid: string;
    callSid: string;
    customParameters: Record<string, string>;
  };
}

interface TwilioMediaMessage {
  event: "media";
  media: { payload: string };
}

interface TwilioStopMessage {
  event: "stop";
}

interface TwilioMarkMessage {
  event: "mark";
  mark: { name: string };
}

type TwilioMessage =
  | TwilioStartMessage
  | TwilioMediaMessage
  | TwilioStopMessage
  | TwilioMarkMessage
  | { event: "connected" }
  | { event: string };

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
        let realtimeSession: InstanceType<typeof RealtimeSession> | null = null;
        let silenceTimer: ReturnType<typeof setTimeout> | null = null;
        let goodbyeTimer: ReturnType<typeof setTimeout> | null = null;
        let isCleanedUp = false;

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
            if (realtimeSession) {
              realtimeSession.sendMessage(
                "The caller has been silent for 10 seconds. Ask if they are still there.",
                {},
              );
            }

            goodbyeTimer = setTimeout(() => {
              app.log.info(
                { streamSid },
                "Extended silence (15s more), saying goodbye",
              );
              if (realtimeSession) {
                realtimeSession.sendMessage(
                  "The caller is still silent. Say goodbye and end the call.",
                  {},
                );
              }
            }, SILENCE_GOODBYE_MS);
          }, SILENCE_CHECK_MS);
        }

        function cleanup() {
          if (isCleanedUp) return;
          isCleanedUp = true;

          if (silenceTimer) clearTimeout(silenceTimer);
          if (goodbyeTimer) clearTimeout(goodbyeTimer);

          if (realtimeSession) {
            try {
              realtimeSession.close();
            } catch (err) {
              app.log.warn({ err }, "Error closing realtime session");
            }
            realtimeSession = null;
          }

          if (streamSid) {
            sessionManager.removeSession(streamSid);
          }

          app.log.info(
            { streamSid, callSid },
            "Media stream session cleaned up",
          );
        }

        // We listen to raw Twilio messages ourselves only for the `start` and `stop` events.
        // The TwilioRealtimeTransportLayer handles media, mark, etc. automatically.
        socket.on("message", (data) => {
          try {
            const msg = JSON.parse(data.toString()) as TwilioMessage;

            switch (msg.event) {
              case "start": {
                const startMsg = msg as TwilioStartMessage;
                streamSid = startMsg.start.streamSid;
                callSid = startMsg.start.callSid;

                const from =
                  startMsg.start.customParameters["From"] ?? "unknown";
                const to = startMsg.start.customParameters["To"] ?? "unknown";

                app.log.info(
                  { streamSid, callSid, from, to },
                  "Twilio media stream started",
                );

                sessionManager.createSession(streamSid, callSid, from, to);

                // Create realtime agent and session
                const agent = createRealtimeAgent(config);
                const transport = new TwilioRealtimeTransportLayer({
                  twilioWebSocket: socket,
                });

                realtimeSession = new RealtimeSession(agent, {
                  transport,
                  model: "gpt-realtime",
                });

                // Listen for tool calls to handle end_call
                realtimeSession.on(
                  "agent_tool_end",
                  (_ctx, _agent, toolDef, _result) => {
                    if (toolDef.name === "end_call" && callSid) {
                      app.log.info({ callSid }, "Ending call via Twilio API");
                      const accountSid =
                        process.env["TWILIO_ACCOUNT_SID"] ?? "";
                      const authToken =
                        process.env["TWILIO_AUTH_TOKEN"] ?? "";
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
                  },
                );

                // Log transcripts
                realtimeSession.on("history_updated", (history) => {
                  if (!streamSid) return;
                  for (const item of history) {
                    if (item.type === "message" && item.role && item.content) {
                      const content =
                        typeof item.content === "string"
                          ? item.content
                          : JSON.stringify(item.content);
                      sessionManager.logMessage(
                        streamSid,
                        item.role,
                        content,
                      );
                    }
                  }
                });

                // Handle errors
                realtimeSession.on("error", (error) => {
                  app.log.error(
                    { error, streamSid },
                    "Realtime session error",
                  );
                });

                // Connect the session
                const apiKey = process.env["OPENAI_API_KEY"] ?? "";
                realtimeSession
                  .connect({ apiKey })
                  .then(() => {
                    app.log.info(
                      { streamSid },
                      "Realtime session connected to OpenAI",
                    );
                    resetSilenceTimers();
                  })
                  .catch((err: unknown) => {
                    app.log.error(
                      { err, streamSid },
                      "Failed to connect realtime session",
                    );
                    cleanup();
                  });

                break;
              }
              case "media": {
                // Audio is being received from the caller, reset silence timers
                resetSilenceTimers();
                // The TwilioRealtimeTransportLayer handles forwarding media to OpenAI
                break;
              }
              case "stop": {
                app.log.info({ streamSid }, "Twilio media stream stopped");
                cleanup();
                break;
              }
              // connected, mark, etc. are handled by TwilioRealtimeTransportLayer
            }
          } catch (err) {
            app.log.error({ err }, "Error processing media stream message");
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

import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import twilio from "twilio";
import { realtime } from "@openai/agents";
import { TwilioRealtimeTransportLayer } from "@openai/agents-extensions";
import { createRealtimeAgent } from "../ai/realtime.js";
import { SessionManager } from "../ai/session.js";
import { pendingConfigs } from "./webhooks.js";
import {
  createCallLog,
  finalizeCallLog,
  extractTranscript,
  determineOutcome,
} from "../ai/call-logger.js";
import type { CallContext } from "../config/schema.js";

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
        let callLogId: string | null = null;
        let startHandled = false;
        const outcomeFlags = { messageTaken: false, bookingMade: false };
        let lastHistory: unknown[] = [];

        // Create transport up front. Note: its Twilio message listener is
        // only registered inside connect(), so it will miss the `start` event.
        // We save the raw start message and re-emit it after connect() resolves.
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

        async function cleanup() {
          if (isCleanedUp) return;
          isCleanedUp = true;

          if (silenceTimer) clearTimeout(silenceTimer);
          if (goodbyeTimer) clearTimeout(goodbyeTimer);

          try {
            session?.close();
          } catch (err) {
            app.log.warn({ err }, "Error closing realtime session");
          }

          if (callLogId && streamSid) {
            const callSession = sessionManager.getSession(streamSid);
            if (callSession) {
              const durationSec = Math.round(
                (Date.now() - callSession.startedAt.getTime()) / 1000,
              );
              const transcript = extractTranscript(lastHistory);
              const outcome = determineOutcome(outcomeFlags);
              try {
                await finalizeCallLog(callLogId, durationSec, outcome, transcript);
                app.log.info(
                  { callLogId, durationSec, outcome },
                  "Call log finalized",
                );
              } catch (err) {
                app.log.error({ err, callLogId }, "Failed to finalize call log");
              }
            }
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

          // Capture latest history snapshot for persistence on cleanup
          sess.on("history_updated", (history) => {
            lastHistory = history;
          });

          // Handle errors
          sess.on("error", (error) => {
            app.log.error({ error, streamSid }, "Realtime session error");
          });
        }

        // Listen to raw socket messages to capture the Twilio `start` event.
        // The transport's message listener is only registered during connect(),
        // but we need the callSid from the start event to look up tenant config
        // before we can create the session and call connect(). After connect()
        // resolves, we re-emit the saved start message so the transport captures
        // the streamSid it needs to send audio back to Twilio.
        let savedStartData: Buffer | string | null = null;

        socket.on("message", async (data: Buffer | string) => {
          let msg: Record<string, unknown>;
          try {
            msg = JSON.parse(typeof data === "string" ? data : data.toString());
          } catch {
            return;
          }

          switch (msg["event"]) {
            case "start": {
              // Guard against re-processing when we re-emit below
              if (startHandled) break;
              startHandled = true;
              savedStartData = data;

              const start = msg["start"] as Record<string, unknown>;
              streamSid = start["streamSid"] as string;
              callSid = start["callSid"] as string;
              const params = (start["customParameters"] as Record<string, string>) ?? {};
              const from = params["From"] ?? "unknown";
              const to = params["To"] ?? "unknown";

              // Retrieve tenant config stored by the incoming-call webhook
              const config = pendingConfigs.get(callSid);
              pendingConfigs.delete(callSid);

              app.log.info(
                { streamSid, callSid, from, to },
                "Twilio media stream started",
              );
              sessionManager.createSession(streamSid, callSid, from, to);

              if (!config) {
                app.log.error(
                  { callSid },
                  "No pending config found for call, closing socket",
                );
                socket.close();
                return;
              }

              // Create the call log record at call start
              try {
                const callLog = await createCallLog(config.id, callSid, from);
                callLogId = callLog.id;
              } catch (err) {
                app.log.error({ err, callSid }, "Failed to create call log");
              }

              // Now create the agent and session with tenant-specific config
              const agent = createRealtimeAgent(config);
              session = new RealtimeSession(agent, {
                transport,
                model: "gpt-realtime",
                context: {
                  tenantId: config.id,
                  callLogId: callLogId!,
                  googleCalendarId: config.googleCalendarId,
                  googleCredentials: config.googleCredentials,
                  timezone: config.timezone ?? "America/New_York",
                  callSid: callSid!,
                  streamSid: streamSid!,
                  outcomeFlagsRef: outcomeFlags,
                } satisfies CallContext,
              });

              setupSessionListeners(session);

              // Connect to OpenAI, replay the start event for the transport,
              // then trigger the greeting.
              const apiKey = process.env["OPENAI_API_KEY"] ?? "";
              session
                .connect({ apiKey })
                .then(() => {
                  app.log.info("Realtime session connected to OpenAI");

                  // Re-emit the start message so the transport's listener
                  // captures the streamSid for outgoing audio.
                  if (savedStartData) {
                    socket.emit("message", savedStartData, false);
                    savedStartData = null;
                    app.log.info({ streamSid }, "Replayed start event to transport");
                  }

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

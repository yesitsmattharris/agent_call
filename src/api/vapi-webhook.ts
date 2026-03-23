import type { FastifyInstance } from "fastify";
import { loadTenantConfig } from "../config/loader.js";
import { buildSystemPrompt } from "../config/prompt-builder.js";
import {
  createCallLog,
  finalizeCallLogWithReport,
  determineOutcome,
} from "../ai/call-logger.js";
import { executeToolCall, type OutcomeFlags, type ToolContext } from "../ai/tools.js";
import { getToolDefsForTenant } from "../ai/tools/definitions.js";
import { prisma } from "../db/prisma.js";

// In-memory outcome flags per call, shared between tool-calls and end-of-call-report events
const outcomeFlagsMap = new Map<string, OutcomeFlags>();

function getOrCreateFlags(callId: string): OutcomeFlags {
  let flags = outcomeFlagsMap.get(callId);
  if (!flags) {
    flags = { messageTaken: false, bookingMade: false };
    outcomeFlagsMap.set(callId, flags);
  }
  return flags;
}

export async function handleAssistantRequest(
  message: Record<string, any>,
): Promise<Record<string, any>> {
  const phoneNumber: string = message.call.phoneNumber.number;
  const callerNumber: string = message.call.customer.number;
  const callId: string = message.call.id;

  let tenant;
  try {
    tenant = await loadTenantConfig(phoneNumber);
  } catch (err: any) {
    return { error: err.message };
  }

  await createCallLog(tenant.id, callId, callerNumber);

  // Initialize outcome flags for this call
  getOrCreateFlags(callId);

  const systemPrompt = buildSystemPrompt(tenant);
  const toolDefs = getToolDefsForTenant(!!tenant.googleCalendarId);

  return {
    assistant: {
      name: tenant.agentName,
      firstMessage: tenant.greeting,
      model: {
        provider: "openai",
        model: "gpt-4o",
        messages: [{ role: "system", content: systemPrompt }],
        tools: toolDefs,
      },
      voice: {
        provider: tenant.voiceProvider ?? "11labs",
        voiceId: tenant.voiceId,
      },
      silenceTimeoutSeconds: 15,
      maxDurationSeconds: 600,
      serverUrl: process.env["PUBLIC_URL"] + "/api/vapi/webhook",
    },
  };
}

export async function handleToolCalls(
  message: Record<string, any>,
): Promise<Record<string, any>> {
  const phoneNumber: string = message.call.phoneNumber.number;
  const callId: string = message.call.id;
  const toolCallList: Array<{ id: string; name: string; arguments: Record<string, unknown> }> =
    message.toolCallList;

  const tenant = await loadTenantConfig(phoneNumber);

  const callLog = await prisma.callLog.findUnique({
    where: { callId },
    select: { id: true },
  });
  const callLogId = callLog?.id ?? "";

  const outcomeFlags = getOrCreateFlags(callId);

  const ctx: ToolContext = { tenant, callLogId, outcomeFlags };

  const results = await Promise.all(
    toolCallList.map(async (tc) => {
      const result = await executeToolCall(tc.name, tc.arguments, ctx);
      return { toolCallId: tc.id, result };
    }),
  );

  return { results };
}

export async function handleEndOfCallReport(
  message: Record<string, any>,
): Promise<Record<string, any>> {
  const callId: string = message.call.id;
  const durationSeconds: number = message.durationSeconds;
  const recordingUrl: string | null = message.recordingUrl ?? null;
  const messages: Array<{ role: string; message: string }> = message.messages ?? [];

  // Convert Vapi messages to transcript format (bot -> assistant)
  const transcript = messages.map((m) => ({
    role: m.role === "bot" ? "assistant" : m.role,
    content: m.message,
  }));

  const flags = outcomeFlagsMap.get(callId) ?? { messageTaken: false, bookingMade: false };
  const outcome = determineOutcome(flags);

  await finalizeCallLogWithReport(callId, durationSeconds, outcome, transcript, recordingUrl);

  // Clean up
  outcomeFlagsMap.delete(callId);

  return {};
}

export function registerVapiWebhookRoute(app: FastifyInstance) {
  app.post("/api/vapi/webhook", async (request, reply) => {
    const body = request.body as Record<string, any>;
    const message = body.message;

    if (!message || !message.type) {
      return reply.status(400).send({ error: "Missing message.type" });
    }

    switch (message.type) {
      case "assistant-request":
        return handleAssistantRequest(message);
      case "tool-calls":
        return handleToolCalls(message);
      case "end-of-call-report":
        return handleEndOfCallReport(message);
      case "status-update":
        // Acknowledge but no action needed
        return {};
      default:
        return {};
    }
  });
}

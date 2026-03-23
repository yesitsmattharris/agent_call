import { prisma } from "../db/prisma.js";
import type { TenantConfig } from "../config/schema.js";
import { executeCheckAvailability, executeBookAppointment } from "./tools/calendar.js";

export type OutcomeFlags = { messageTaken: boolean; bookingMade: boolean };

export interface ToolContext {
  tenant: TenantConfig;
  callLogId: string;
  outcomeFlags: OutcomeFlags;
}

export async function executeTakeMessage(
  args: { callerName: string; callbackNumber: string; reason: string; preferredTime?: string },
  ctx: ToolContext,
): Promise<string> {
  await prisma.message.create({
    data: {
      tenantId: ctx.tenant.id,
      callLogId: ctx.callLogId ?? null,
      callerName: args.callerName,
      callbackNumber: args.callbackNumber,
      reason: args.reason,
      preferredTime: args.preferredTime ?? null,
    },
  });

  ctx.outcomeFlags.messageTaken = true;
  console.log("[tool:take_message]", JSON.stringify({
    type: "message_taken",
    callerName: args.callerName,
    callbackNumber: args.callbackNumber,
    tenantId: ctx.tenant.id,
    callLogId: ctx.callLogId,
  }));

  return `Message recorded for ${args.callerName}. We will call back at ${args.callbackNumber}.`;
}

// Tool router: maps tool names to executor functions
export async function executeToolCall(
  toolName: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  switch (toolName) {
    case "take_message":
      return executeTakeMessage(args as any, ctx);
    case "check_availability":
      return executeCheckAvailability(args as any, ctx.tenant);
    case "book_appointment":
      return executeBookAppointment(args as any, ctx);
    default:
      return `Unknown tool: ${toolName}`;
  }
}

import { z } from "zod";
import { tool } from "@openai/agents";
import type { FunctionTool } from "@openai/agents";
import { prisma } from "../db/prisma.js";
import type { CallContext } from "../config/schema.js";

const takeMessageTool = tool({
  name: "take_message",
  description: "Record a message from the caller for a callback",
  parameters: z.object({
    callerName: z.string(),
    callbackNumber: z.string(),
    reason: z.string(),
    preferredTime: z.string().optional(),
  }),
  execute: async (input, context) => {
    const { tenantId, callLogId, outcomeFlagsRef } =
      context!.context as unknown as CallContext;

    await prisma.message.create({
      data: {
        tenantId,
        callLogId: callLogId ?? null,
        callerName: input.callerName,
        callbackNumber: input.callbackNumber,
        reason: input.reason,
        preferredTime: input.preferredTime ?? null,
      },
    });

    outcomeFlagsRef.messageTaken = true;
    console.log("[tool:take_message]", JSON.stringify({
      type: "message_taken",
      callerName: input.callerName,
      callbackNumber: input.callbackNumber,
      tenantId,
      callLogId,
    }));

    return `Message recorded for ${input.callerName}. We will call back at ${input.callbackNumber}.`;
  },
});

const endCallTool = tool({
  name: "end_call",
  description: "End the current phone call",
  parameters: z.object({}),
  execute: async () => {
    console.log("[tool:end_call] Agent requested call end");
    return "Call ending.";
  },
});

// Export as an array for easy consumption by the RealtimeAgent
export const agentTools: FunctionTool<any, any, any>[] = [
  takeMessageTool,
  endCallTool,
];

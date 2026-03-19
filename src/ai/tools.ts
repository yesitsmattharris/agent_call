import { z } from "zod";
import { tool } from "@openai/agents";
import type { FunctionTool } from "@openai/agents";

const takeMessageTool = tool({
  name: "take_message",
  description: "Record a message from the caller for a callback",
  parameters: z.object({
    callerName: z.string(),
    callbackNumber: z.string(),
    reason: z.string(),
    preferredTime: z.string().optional(),
  }),
  execute: async (input) => {
    const record = {
      type: "message_taken",
      callerName: input.callerName,
      callbackNumber: input.callbackNumber,
      reason: input.reason,
      preferredTime: input.preferredTime ?? null,
      timestamp: new Date().toISOString(),
    };
    console.log("[tool:take_message]", JSON.stringify(record));
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

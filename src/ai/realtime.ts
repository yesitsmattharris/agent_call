import { realtime } from "@openai/agents";
import { buildSystemPrompt } from "../config/prompt-builder.js";
import { agentTools } from "./tools.js";
import type { BusinessConfig } from "../config/schema.js";

const { RealtimeAgent } = realtime;

export function createRealtimeAgent(config: BusinessConfig) {
  const agent = new RealtimeAgent({
    name: config.agentName,
    instructions: buildSystemPrompt(config),
    voice: config.voiceId,
    tools: agentTools,
  });

  return agent;
}

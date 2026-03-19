import { z } from "zod";

export const businessConfigSchema = z.object({
  businessName: z.string(),
  agentName: z.string(),
  greeting: z.string(),
  businessDescription: z.string(),
  escalationMessage: z.string(),
  voiceId: z.string(),
});

export type BusinessConfig = z.infer<typeof businessConfigSchema>;

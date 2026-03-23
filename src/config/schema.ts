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

// Schemas for DB-backed tenant config (Phase 2)

export const faqSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  question: z.string(),
  answer: z.string(),
  createdAt: z.date(),
});

export const serviceSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  name: z.string(),
  description: z.string(),
  startingAt: z.string().nullable(),
  createdAt: z.date(),
});

export const businessHoursSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  dayOfWeek: z.number().int().min(0).max(6),
  openTime: z.string().nullable(),
  closeTime: z.string().nullable(),
});

export const tenantConfigSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  businessName: z.string(),
  agentName: z.string(),
  greeting: z.string(),
  description: z.string(),
  escalationMessage: z.string(),
  afterHoursMessage: z.string().nullable(),
  voiceId: z.string(),
  phoneNumber: z.string(),
  voiceProvider: z.string(),
  googleCalendarId: z.string().nullable(),
  googleCredentials: z.unknown().nullable(),
  timezone: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  faqs: z.array(faqSchema),
  services: z.array(serviceSchema),
  businessHours: z.array(businessHoursSchema),
});

export type Faq = z.infer<typeof faqSchema>;
export type Service = z.infer<typeof serviceSchema>;
export type BusinessHoursEntry = z.infer<typeof businessHoursSchema>;
export type TenantConfig = z.infer<typeof tenantConfigSchema>;

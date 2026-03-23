import { describe, it, expect } from "vitest";
import type { TenantConfig, BusinessHoursEntry } from "./schema.js";
import { buildSystemPrompt, isCurrentlyOpen } from "./prompt-builder.js";

const baseTenant: TenantConfig = {
  id: "tenant-1",
  email: "owner@example.com",
  businessName: "Test Salon",
  agentName: "Luna",
  greeting: "Thanks for calling Test Salon!",
  description: "A full-service hair salon.",
  escalationMessage: "I'll have someone call you back.",
  afterHoursMessage: "We're currently closed. Leave a message!",
  voiceId: "ash",
  phoneNumber: "+15551234567",
  voiceProvider: "vapi",
  googleCalendarId: null,
  googleCredentials: null,
  timezone: "America/New_York",
  createdAt: new Date(),
  updatedAt: new Date(),
  faqs: [],
  services: [],
  businessHours: [],
};

describe("buildSystemPrompt with TenantConfig", () => {
  it("injects FAQ content into prompt string (CALL-03)", () => {
    const config: TenantConfig = {
      ...baseTenant,
      faqs: [
        { id: "faq-1", tenantId: "tenant-1", question: "Do you accept walk-ins?", answer: "Yes, walk-ins are welcome!", createdAt: new Date() },
        { id: "faq-2", tenantId: "tenant-1", question: "What are your prices?", answer: "Haircuts start at $30.", createdAt: new Date() },
      ],
      // Make it "open" so we get the normal greeting path
      businessHours: [
        { id: "bh-1", tenantId: "tenant-1", dayOfWeek: new Date().getDay(), openTime: "00:00", closeTime: "23:59" },
      ],
    };

    const prompt = buildSystemPrompt(config);
    expect(prompt).toContain("FREQUENTLY ASKED QUESTIONS");
    expect(prompt).toContain("Do you accept walk-ins?");
    expect(prompt).toContain("Yes, walk-ins are welcome!");
    expect(prompt).toContain("What are your prices?");
    expect(prompt).toContain("Haircuts start at $30.");
  });

  it("injects service names and prices into prompt string (CALL-03)", () => {
    const config: TenantConfig = {
      ...baseTenant,
      services: [
        { id: "svc-1", tenantId: "tenant-1", name: "Haircut", description: "Standard haircut", startingAt: "$30", createdAt: new Date() },
        { id: "svc-2", tenantId: "tenant-1", name: "Color", description: "Full color treatment", startingAt: null, createdAt: new Date() },
      ],
      businessHours: [
        { id: "bh-1", tenantId: "tenant-1", dayOfWeek: new Date().getDay(), openTime: "00:00", closeTime: "23:59" },
      ],
    };

    const prompt = buildSystemPrompt(config);
    expect(prompt).toContain("SERVICES OFFERED");
    expect(prompt).toContain("Haircut");
    expect(prompt).toContain("$30");
    expect(prompt).toContain("Color");
    expect(prompt).toContain("Full color treatment");
  });

  it("excludes FAQ section when FAQs are empty", () => {
    const config: TenantConfig = {
      ...baseTenant,
      faqs: [],
      businessHours: [
        { id: "bh-1", tenantId: "tenant-1", dayOfWeek: new Date().getDay(), openTime: "00:00", closeTime: "23:59" },
      ],
    };

    const prompt = buildSystemPrompt(config);
    expect(prompt).not.toContain("FREQUENTLY ASKED QUESTIONS");
  });

  it("includes after-hours messaging when closed (CALL-04)", () => {
    const config: TenantConfig = {
      ...baseTenant,
      businessHours: [], // No hours = closed
    };

    const prompt = buildSystemPrompt(config);
    expect(prompt).toContain("currently closed");
    expect(prompt).toContain(baseTenant.afterHoursMessage!);
  });

  it("includes after-hours messaging with custom afterHoursMessage when closed (CALL-04)", () => {
    const config: TenantConfig = {
      ...baseTenant,
      afterHoursMessage: "Please call back during business hours.",
      businessHours: [],
    };

    const prompt = buildSystemPrompt(config);
    expect(prompt).toContain("currently closed");
    expect(prompt).toContain("Please call back during business hours.");
  });

  it("generates after-hours message from hours when afterHoursMessage is null (CALL-04)", () => {
    const config: TenantConfig = {
      ...baseTenant,
      afterHoursMessage: null,
      businessHours: [
        { id: "bh-1", tenantId: "tenant-1", dayOfWeek: 1, openTime: "09:00", closeTime: "17:00" },
      ],
    };

    const prompt = buildSystemPrompt(config);
    expect(prompt).toContain("currently closed");
    // Should mention next opening
    expect(prompt).toMatch(/Monday/i);
  });

  it("excludes services section when services are empty", () => {
    const config: TenantConfig = {
      ...baseTenant,
      services: [],
      businessHours: [
        { id: "bh-1", tenantId: "tenant-1", dayOfWeek: new Date().getDay(), openTime: "00:00", closeTime: "23:59" },
      ],
    };

    const prompt = buildSystemPrompt(config);
    expect(prompt).not.toContain("SERVICES OFFERED");
  });

  it("includes hallucination guardrail instruction", () => {
    const config: TenantConfig = {
      ...baseTenant,
      faqs: [
        { id: "faq-1", tenantId: "tenant-1", question: "Q?", answer: "A!", createdAt: new Date() },
      ],
      businessHours: [
        { id: "bh-1", tenantId: "tenant-1", dayOfWeek: new Date().getDay(), openTime: "00:00", closeTime: "23:59" },
      ],
    };

    const prompt = buildSystemPrompt(config);
    expect(prompt).toContain("Only use facts from");
  });

  it("includes 'schedule a visit' guidance for services without prices", () => {
    const config: TenantConfig = {
      ...baseTenant,
      services: [
        { id: "svc-1", tenantId: "tenant-1", name: "Color", description: "Full color treatment", startingAt: null, createdAt: new Date() },
      ],
      businessHours: [
        { id: "bh-1", tenantId: "tenant-1", dayOfWeek: new Date().getDay(), openTime: "00:00", closeTime: "23:59" },
      ],
    };

    const prompt = buildSystemPrompt(config);
    expect(prompt).toMatch(/contact us for pricing/i);
  });
});

describe("buildSystemPrompt booking instructions", () => {
  it("includes booking instructions when googleCalendarId is set", () => {
    const config: TenantConfig = {
      ...baseTenant,
      googleCalendarId: "cal-123@group.calendar.google.com",
      businessHours: [
        { id: "bh-1", tenantId: "tenant-1", dayOfWeek: new Date().getDay(), openTime: "00:00", closeTime: "23:59" },
      ],
    };

    const prompt = buildSystemPrompt(config);
    expect(prompt).toContain("APPOINTMENT BOOKING");
    expect(prompt).toContain("check_availability");
    expect(prompt).toContain("book_appointment");
  });

  it("does NOT include booking instructions when googleCalendarId is null", () => {
    const config: TenantConfig = {
      ...baseTenant,
      googleCalendarId: null,
      businessHours: [
        { id: "bh-1", tenantId: "tenant-1", dayOfWeek: new Date().getDay(), openTime: "00:00", closeTime: "23:59" },
      ],
    };

    const prompt = buildSystemPrompt(config);
    expect(prompt).not.toContain("APPOINTMENT BOOKING");
    expect(prompt).not.toContain("check_availability");
    expect(prompt).not.toContain("book_appointment");
  });

  it("booking instructions include confirmation requirement (BOOK-03)", () => {
    const config: TenantConfig = {
      ...baseTenant,
      googleCalendarId: "cal-123@group.calendar.google.com",
      businessHours: [
        { id: "bh-1", tenantId: "tenant-1", dayOfWeek: new Date().getDay(), openTime: "00:00", closeTime: "23:59" },
      ],
    };

    const prompt = buildSystemPrompt(config);
    expect(prompt).toContain("CONFIRM");
    expect(prompt).toContain("AFTER the caller confirms");
  });
});

describe("isCurrentlyOpen", () => {
  it("returns true during open hours (CALL-04)", () => {
    // Use a fixed date: Wednesday at 10:00 AM
    const now = new Date("2026-03-18T10:00:00");
    const dayOfWeek = now.getDay(); // 3 = Wednesday

    const hours: BusinessHoursEntry[] = [
      { id: "bh-1", tenantId: "tenant-1", dayOfWeek, openTime: "09:00", closeTime: "17:00" },
    ];

    const result = isCurrentlyOpen(hours, now);
    expect(result).toBe(true);
  });

  it("returns false outside hours (CALL-04)", () => {
    // Use a fixed date: Wednesday at 18:00 (6 PM)
    const now = new Date("2026-03-18T18:00:00");
    const dayOfWeek = now.getDay(); // 3 = Wednesday

    const hours: BusinessHoursEntry[] = [
      { id: "bh-1", tenantId: "tenant-1", dayOfWeek, openTime: "09:00", closeTime: "17:00" },
    ];

    const result = isCurrentlyOpen(hours, now);
    expect(result).toBe(false);
  });

  it("returns false when no hours configured for today (CALL-04)", () => {
    const hours: BusinessHoursEntry[] = [];

    const result = isCurrentlyOpen(hours);
    expect(result).toBe(false);
  });

  it("returns false when openTime or closeTime is null", () => {
    const now = new Date("2026-03-18T10:00:00");
    const dayOfWeek = now.getDay();

    const hours: BusinessHoursEntry[] = [
      { id: "bh-1", tenantId: "tenant-1", dayOfWeek, openTime: null, closeTime: null },
    ];

    const result = isCurrentlyOpen(hours, now);
    expect(result).toBe(false);
  });
});

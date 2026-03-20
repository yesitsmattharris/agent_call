import { describe, it, expect } from "vitest";
import type { TenantConfig, Faq, Service, BusinessHoursEntry } from "./schema.js";

// Remove .skip when Plan 02 implements TenantConfig support in prompt-builder
describe.skip("buildSystemPrompt with TenantConfig", () => {
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
    twilioPhoneNumber: "+15551234567",
    googleCalendarId: null,
    googleCredentials: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    faqs: [],
    services: [],
    businessHours: [],
  };

  it("injects FAQ content into prompt string (CALL-03)", () => {
    const faqs: Faq[] = [
      { id: "faq-1", tenantId: "tenant-1", question: "Do you accept walk-ins?", answer: "Yes, walk-ins are welcome!", createdAt: new Date() },
      { id: "faq-2", tenantId: "tenant-1", question: "What are your prices?", answer: "Haircuts start at $30.", createdAt: new Date() },
    ];
    const config = { ...baseTenant, faqs };

    // buildSystemPrompt will be imported from prompt-builder once updated
    // const prompt = buildSystemPrompt(config);
    // expect(prompt).toContain("Do you accept walk-ins?");
    // expect(prompt).toContain("Yes, walk-ins are welcome!");
    // expect(prompt).toContain("What are your prices?");
    // expect(prompt).toContain("Haircuts start at $30.");
    expect(true).toBe(true); // placeholder
  });

  it("injects service names and prices into prompt string (CALL-03)", () => {
    const services: Service[] = [
      { id: "svc-1", tenantId: "tenant-1", name: "Haircut", description: "Standard haircut", startingAt: "$30", createdAt: new Date() },
      { id: "svc-2", tenantId: "tenant-1", name: "Color", description: "Full color treatment", startingAt: null, createdAt: new Date() },
    ];
    const config = { ...baseTenant, services };

    // const prompt = buildSystemPrompt(config);
    // expect(prompt).toContain("Haircut");
    // expect(prompt).toContain("$30");
    // expect(prompt).toContain("Color");
    // expect(prompt).toContain("Full color treatment");
    expect(true).toBe(true); // placeholder
  });

  it("excludes FAQ section when FAQs are empty", () => {
    const config = { ...baseTenant, faqs: [] };

    // const prompt = buildSystemPrompt(config);
    // expect(prompt).not.toContain("FREQUENTLY ASKED QUESTIONS");
    expect(true).toBe(true); // placeholder
  });

  it("includes after-hours messaging when closed (CALL-04)", () => {
    const config = { ...baseTenant, businessHours: [] };

    // When no hours are configured, business is considered closed
    // const prompt = buildSystemPrompt(config);
    // expect(prompt).toContain("currently closed");
    // expect(prompt).toContain(baseTenant.afterHoursMessage);
    expect(true).toBe(true); // placeholder
  });
});

// Remove .skip when Plan 02 implements isCurrentlyOpen
describe.skip("isCurrentlyOpen", () => {
  it("returns true during open hours (CALL-04)", () => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const earlyOpen = "00:00";
    const lateClose = "23:59";

    const hours: BusinessHoursEntry[] = [
      { id: "bh-1", tenantId: "tenant-1", dayOfWeek, openTime: earlyOpen, closeTime: lateClose },
    ];

    // const result = isCurrentlyOpen(hours);
    // expect(result).toBe(true);
    expect(true).toBe(true); // placeholder
  });

  it("returns false outside hours (CALL-04)", () => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    // Set hours to a window that has already passed
    const hours: BusinessHoursEntry[] = [
      { id: "bh-2", tenantId: "tenant-1", dayOfWeek, openTime: "00:00", closeTime: "00:01" },
    ];

    // const result = isCurrentlyOpen(hours);
    // If current time is past 00:01, this should be false
    // expect(result).toBe(false);
    expect(true).toBe(true); // placeholder
  });

  it("returns false when no hours configured for today (CALL-04)", () => {
    const hours: BusinessHoursEntry[] = [];

    // const result = isCurrentlyOpen(hours);
    // expect(result).toBe(false);
    expect(true).toBe(true); // placeholder
  });
});

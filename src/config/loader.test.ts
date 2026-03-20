import { describe, it, expect, vi } from "vitest";

// Remove .skip when Plan 02 implements loadTenantConfig with DB backing
describe.skip("loadTenantConfig", () => {
  it("returns tenant with all relations for valid phone number (CFG-06)", async () => {
    const mockTenant = {
      id: "tenant-1",
      email: "owner@example.com",
      businessName: "Test Salon",
      agentName: "Luna",
      greeting: "Thanks for calling Test Salon!",
      description: "A full-service hair salon.",
      escalationMessage: "I'll have someone call you back.",
      afterHoursMessage: null,
      voiceId: "ash",
      twilioPhoneNumber: "+15551234567",
      googleCalendarId: null,
      googleCredentials: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      faqs: [
        { id: "faq-1", tenantId: "tenant-1", question: "Walk-ins?", answer: "Yes!", createdAt: new Date() },
      ],
      services: [
        { id: "svc-1", tenantId: "tenant-1", name: "Haircut", description: "Standard cut", startingAt: "$30", createdAt: new Date() },
      ],
      businessHours: [
        { id: "bh-1", tenantId: "tenant-1", dayOfWeek: 1, openTime: "09:00", closeTime: "17:00" },
      ],
    };

    // vi.mock("../db/prisma.js", () => ({
    //   prisma: {
    //     tenant: {
    //       findUnique: vi.fn().mockResolvedValue(mockTenant),
    //     },
    //   },
    // }));
    //
    // const { loadTenantConfig } = await import("./loader.js");
    // const result = await loadTenantConfig("+15551234567");
    //
    // expect(result).toEqual(mockTenant);
    // expect(result.faqs).toHaveLength(1);
    // expect(result.services).toHaveLength(1);
    // expect(result.businessHours).toHaveLength(1);
    expect(true).toBe(true); // placeholder
  });

  it("throws for unknown phone number (CFG-06)", async () => {
    // vi.mock("../db/prisma.js", () => ({
    //   prisma: {
    //     tenant: {
    //       findUnique: vi.fn().mockResolvedValue(null),
    //     },
    //   },
    // }));
    //
    // const { loadTenantConfig } = await import("./loader.js");
    // await expect(loadTenantConfig("+10000000000")).rejects.toThrow("No tenant for number");
    expect(true).toBe(true); // placeholder
  });
});

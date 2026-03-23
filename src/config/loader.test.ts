import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockFindUnique } = vi.hoisted(() => {
  const mockFindUnique = vi.fn();
  return { mockFindUnique };
});

vi.mock("../db/prisma.js", () => ({
  prisma: {
    tenant: {
      findUnique: mockFindUnique,
    },
  },
}));

import { loadTenantConfig } from "./loader.js";

describe("loadTenantConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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
      phoneNumber: "+15551234567",
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

    mockFindUnique.mockResolvedValue(mockTenant);

    const result = await loadTenantConfig("pn-abc-123");

    expect(result).toEqual(mockTenant);
    expect(result.faqs).toHaveLength(1);
    expect(result.services).toHaveLength(1);
    expect(result.businessHours).toHaveLength(1);
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { vapiPhoneNumberId: "pn-abc-123" },
      include: { faqs: true, services: true, businessHours: true },
    });
  });

  it("throws for unknown phone number (CFG-06)", async () => {
    mockFindUnique.mockResolvedValue(null);

    await expect(loadTenantConfig("pn-unknown")).rejects.toThrow(
      "No tenant for Vapi phone number ID: pn-unknown"
    );
  });
});

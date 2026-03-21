import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockCreateCalendarClient, mockCheckAvailability, mockBookAppointment } =
  vi.hoisted(() => ({
    mockCreateCalendarClient: vi.fn(() => "mock-calendar-instance"),
    mockCheckAvailability: vi.fn(),
    mockBookAppointment: vi.fn(),
  }));

vi.mock("../../calendar/client.js", () => ({
  createCalendarClient: mockCreateCalendarClient,
  checkAvailability: mockCheckAvailability,
  bookAppointment: mockBookAppointment,
}));

import {
  checkAvailabilityTool,
  bookAppointmentTool,
  executeCheckAvailability,
  executeBookAppointment,
} from "./calendar.js";

function makeContext(overrides: Partial<{
  googleCalendarId: string | null;
  googleCredentials: unknown | null;
  timezone: string;
  outcomeFlagsRef: { messageTaken: boolean; bookingMade: boolean };
}> = {}) {
  return {
    context: {
      tenantId: "tenant-1",
      callLogId: "call-log-1",
      googleCalendarId: "googleCalendarId" in overrides
        ? overrides.googleCalendarId
        : "cal-123",
      googleCredentials: "googleCredentials" in overrides
        ? overrides.googleCredentials
        : {
            client_email: "test@project.iam.gserviceaccount.com",
            private_key: "fake-key",
            project_id: "test-project",
          },
      timezone: overrides.timezone ?? "America/New_York",
      callSid: "CA123",
      streamSid: "MZ456",
      outcomeFlagsRef: overrides.outcomeFlagsRef ?? {
        messageTaken: false,
        bookingMade: false,
      },
    },
  };
}

describe("checkAvailabilityTool", () => {
  beforeEach(() => {
    mockCreateCalendarClient.mockReset();
    mockCheckAvailability.mockReset();
    mockBookAppointment.mockReset();
    mockCreateCalendarClient.mockReturnValue("mock-calendar-instance");
  });

  it("exports a tool with name check_availability", () => {
    expect(checkAvailabilityTool.name).toBe("check_availability");
  });

  it("extracts credentials from context and calls checkAvailability", async () => {
    const busySlots = [
      { start: "2026-03-25T10:00:00Z", end: "2026-03-25T11:00:00Z" },
    ];
    mockCheckAvailability.mockResolvedValue(busySlots);

    const ctx = makeContext();
    const result = await executeCheckAvailability(
      { date: "2026-03-25" },
      ctx,
    );

    expect(mockCreateCalendarClient).toHaveBeenCalledWith({
      client_email: "test@project.iam.gserviceaccount.com",
      private_key: "fake-key",
      project_id: "test-project",
    });
    expect(mockCheckAvailability).toHaveBeenCalledWith(
      "mock-calendar-instance",
      "cal-123",
      "2026-03-25",
      "America/New_York",
    );
    expect(typeof result).toBe("string");
    expect(result).toContain("10:00:00");
  });

  it("returns error message when googleCalendarId is not configured", async () => {
    const ctx = makeContext({ googleCalendarId: null });
    const result = await executeCheckAvailability(
      { date: "2026-03-25" },
      ctx,
    );

    expect(result).toContain("not configured");
    expect(mockCreateCalendarClient).not.toHaveBeenCalled();
  });

  it("returns error message when googleCredentials is null", async () => {
    const ctx = makeContext({ googleCredentials: null });
    const result = await executeCheckAvailability(
      { date: "2026-03-25" },
      ctx,
    );

    expect(result).toContain("not configured");
    expect(mockCreateCalendarClient).not.toHaveBeenCalled();
  });
});

describe("bookAppointmentTool", () => {
  beforeEach(() => {
    mockCreateCalendarClient.mockReset();
    mockCheckAvailability.mockReset();
    mockBookAppointment.mockReset();
    mockCreateCalendarClient.mockReturnValue("mock-calendar-instance");
  });

  it("exports a tool with name book_appointment", () => {
    expect(bookAppointmentTool.name).toBe("book_appointment");
  });

  it("sets outcomeFlagsRef.bookingMade to true on success", async () => {
    mockBookAppointment.mockResolvedValue({
      success: true,
      eventId: "event-1",
      htmlLink: "https://calendar.google.com/event/1",
    });

    const flags = { messageTaken: false, bookingMade: false };
    const ctx = makeContext({ outcomeFlagsRef: flags });

    await executeBookAppointment(
      {
        date: "2026-03-25",
        startTime: "10:00",
        callerName: "Jane Doe",
        callerPhone: "+15551234567",
        reason: "Consultation",
      },
      ctx,
    );

    expect(flags.bookingMade).toBe(true);
  });

  it("returns error when slot is no longer available", async () => {
    mockBookAppointment.mockResolvedValue({
      success: false,
      reason: "Slot is no longer available",
    });

    const flags = { messageTaken: false, bookingMade: false };
    const ctx = makeContext({ outcomeFlagsRef: flags });

    const result = await executeBookAppointment(
      {
        date: "2026-03-25",
        startTime: "10:00",
        callerName: "Jane Doe",
        callerPhone: "+15551234567",
      },
      ctx,
    );

    expect(result).toContain("no longer available");
    expect(flags.bookingMade).toBe(false);
  });

  it("constructs correct start/end times with 60-minute duration", async () => {
    mockBookAppointment.mockResolvedValue({
      success: true,
      eventId: "event-1",
      htmlLink: "https://calendar.google.com/event/1",
    });

    const ctx = makeContext();

    await executeBookAppointment(
      {
        date: "2026-03-25",
        startTime: "14:30",
        callerName: "Jane Doe",
        callerPhone: "+15551234567",
      },
      ctx,
    );

    expect(mockBookAppointment).toHaveBeenCalledWith(
      "mock-calendar-instance",
      "cal-123",
      expect.stringContaining("2026-03-25T14:30"),
      expect.stringContaining("2026-03-25T15:30"),
      expect.stringContaining("Jane Doe"),
      expect.stringContaining("+15551234567"),
    );
  });
});

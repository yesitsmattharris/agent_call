import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockJWT, mockCalendar, mockGoogle } = vi.hoisted(() => {
  const mockFreebusyQuery = vi.fn();
  const mockEventsInsert = vi.fn();
  const mockCalendar = {
    freebusy: { query: mockFreebusyQuery },
    events: { insert: mockEventsInsert },
  };
  const mockJWT = vi.fn();
  const mockGoogle = {
    calendar: vi.fn(() => mockCalendar),
  };
  return { mockJWT, mockCalendar, mockGoogle };
});

vi.mock("google-auth-library", () => ({
  JWT: mockJWT,
}));

vi.mock("googleapis", () => ({
  google: mockGoogle,
}));

import {
  createCalendarClient,
  checkAvailability,
  bookAppointment,
} from "./client.js";

const testCredentials = {
  client_email: "test@project.iam.gserviceaccount.com",
  private_key: "-----BEGIN RSA PRIVATE KEY-----\nfake\n-----END RSA PRIVATE KEY-----\n",
  project_id: "test-project",
};

describe("createCalendarClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a JWT auth client and returns a calendar instance", () => {
    const result = createCalendarClient(testCredentials);

    expect(mockJWT).toHaveBeenCalledWith({
      email: testCredentials.client_email,
      key: testCredentials.private_key,
      scopes: ["https://www.googleapis.com/auth/calendar"],
    });
    expect(mockGoogle.calendar).toHaveBeenCalledWith({
      version: "v3",
      auth: expect.anything(),
    });
    expect(result).toBe(mockCalendar);
  });
});

describe("checkAvailability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls freebusy.query with correct calendarId, timeMin/timeMax, and timezone", async () => {
    mockCalendar.freebusy.query.mockResolvedValue({
      data: {
        calendars: {
          "cal-123": {
            busy: [
              { start: "2026-03-25T10:00:00Z", end: "2026-03-25T11:00:00Z" },
            ],
          },
        },
      },
    });

    await checkAvailability(mockCalendar as any, "cal-123", "2026-03-25", "America/New_York");

    expect(mockCalendar.freebusy.query).toHaveBeenCalledWith({
      requestBody: {
        timeMin: expect.stringContaining("2026-03-25"),
        timeMax: expect.stringContaining("2026-03-25"),
        timeZone: "America/New_York",
        items: [{ id: "cal-123" }],
      },
    });
  });

  it("returns busy slots array from freebusy response", async () => {
    const busySlots = [
      { start: "2026-03-25T10:00:00Z", end: "2026-03-25T11:00:00Z" },
      { start: "2026-03-25T14:00:00Z", end: "2026-03-25T15:00:00Z" },
    ];

    mockCalendar.freebusy.query.mockResolvedValue({
      data: {
        calendars: {
          "cal-123": { busy: busySlots },
        },
      },
    });

    const result = await checkAvailability(mockCalendar as any, "cal-123", "2026-03-25", "America/New_York");
    expect(result).toEqual(busySlots);
  });

  it("returns empty array when no busy periods", async () => {
    mockCalendar.freebusy.query.mockResolvedValue({
      data: {
        calendars: {
          "cal-123": { busy: [] },
        },
      },
    });

    const result = await checkAvailability(mockCalendar as any, "cal-123", "2026-03-25", "America/New_York");
    expect(result).toEqual([]);
  });
});

describe("bookAppointment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("re-checks availability before inserting", async () => {
    mockCalendar.freebusy.query.mockResolvedValue({
      data: { calendars: { "cal-123": { busy: [] } } },
    });
    mockCalendar.events.insert.mockResolvedValue({
      data: { id: "event-1", htmlLink: "https://calendar.google.com/event/1" },
    });

    await bookAppointment(
      mockCalendar as any,
      "cal-123",
      "2026-03-25T10:00:00-04:00",
      "2026-03-25T11:00:00-04:00",
      "Appointment: Jane Doe",
      "Phone: +15551234567",
    );

    expect(mockCalendar.freebusy.query).toHaveBeenCalledWith({
      requestBody: {
        timeMin: "2026-03-25T10:00:00-04:00",
        timeMax: "2026-03-25T11:00:00-04:00",
        items: [{ id: "cal-123" }],
      },
    });
  });

  it("returns success false when slot has conflict on re-check", async () => {
    mockCalendar.freebusy.query.mockResolvedValue({
      data: {
        calendars: {
          "cal-123": {
            busy: [{ start: "2026-03-25T10:00:00Z", end: "2026-03-25T11:00:00Z" }],
          },
        },
      },
    });

    const result = await bookAppointment(
      mockCalendar as any,
      "cal-123",
      "2026-03-25T10:00:00-04:00",
      "2026-03-25T11:00:00-04:00",
      "Appointment: Jane Doe",
      "Phone: +15551234567",
    );

    expect(result).toEqual({ success: false, reason: "Slot is no longer available" });
    expect(mockCalendar.events.insert).not.toHaveBeenCalled();
  });

  it("inserts event and returns success with eventId and htmlLink when slot is free", async () => {
    mockCalendar.freebusy.query.mockResolvedValue({
      data: { calendars: { "cal-123": { busy: [] } } },
    });
    mockCalendar.events.insert.mockResolvedValue({
      data: { id: "event-1", htmlLink: "https://calendar.google.com/event/1" },
    });

    const result = await bookAppointment(
      mockCalendar as any,
      "cal-123",
      "2026-03-25T10:00:00-04:00",
      "2026-03-25T11:00:00-04:00",
      "Appointment: Jane Doe",
      "Phone: +15551234567\nReason: Consultation",
    );

    expect(result).toEqual({
      success: true,
      eventId: "event-1",
      htmlLink: "https://calendar.google.com/event/1",
    });
    expect(mockCalendar.events.insert).toHaveBeenCalledWith({
      calendarId: "cal-123",
      requestBody: {
        summary: "Appointment: Jane Doe",
        description: "Phone: +15551234567\nReason: Consultation",
        start: { dateTime: "2026-03-25T10:00:00-04:00" },
        end: { dateTime: "2026-03-25T11:00:00-04:00" },
      },
    });
  });
});

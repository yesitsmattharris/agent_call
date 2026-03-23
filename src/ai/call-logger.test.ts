import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockCreate, mockUpdate } = vi.hoisted(() => {
  const mockCreate = vi.fn();
  const mockUpdate = vi.fn();
  return { mockCreate, mockUpdate };
});

vi.mock("../db/prisma.js", () => ({
  prisma: {
    callLog: {
      create: mockCreate,
      update: mockUpdate,
    },
  },
}));

import {
  createCallLog,
  finalizeCallLogWithReport,
  determineOutcome,
} from "./call-logger.js";

describe("createCallLog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a CallLog record with tenantId, callId, callerNumber, startedAt, outcome=in_progress", async () => {
    const fakeLog = { id: "cl-1", tenantId: "t-1", callId: "call-uuid-123", outcome: "in_progress" };
    mockCreate.mockResolvedValue(fakeLog);

    const result = await createCallLog("t-1", "call-uuid-123", "+15551234567");

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: "t-1",
        callId: "call-uuid-123",
        callerNumber: "+15551234567",
        durationSeconds: 0,
        outcome: "in_progress",
        transcript: [],
      }),
    });
    // startedAt should be a Date
    const callData = mockCreate.mock.calls[0][0].data;
    expect(callData.startedAt).toBeInstanceOf(Date);
    expect(result).toEqual(fakeLog);
  });
});

describe("finalizeCallLogWithReport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates by callId with duration, outcome, transcript, and recordingUrl", async () => {
    const transcript = [{ role: "user", content: "Hello" }];
    mockUpdate.mockResolvedValue({ id: "cl-1" });

    await finalizeCallLogWithReport("call-uuid-123", 120, "completed", transcript, "https://storage.vapi.ai/recording.wav");

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { callId: "call-uuid-123" },
      data: {
        durationSeconds: 120,
        outcome: "completed",
        transcript,
        recordingUrl: "https://storage.vapi.ai/recording.wav",
      },
    });
  });
});

describe("determineOutcome", () => {
  it("returns 'booking_made' when bookingMade flag is true", () => {
    expect(determineOutcome({ messageTaken: false, bookingMade: true })).toBe(
      "booking_made",
    );
  });

  it("returns 'message_taken' when messageTaken flag is true", () => {
    expect(determineOutcome({ messageTaken: true, bookingMade: false })).toBe(
      "message_taken",
    );
  });

  it("returns 'completed' when neither flag is set", () => {
    expect(determineOutcome({ messageTaken: false, bookingMade: false })).toBe(
      "completed",
    );
  });
});

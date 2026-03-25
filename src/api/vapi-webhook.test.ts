import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockLoadTenantConfig,
  mockCreateCallLog,
  mockFinalizeCallLogWithReport,
  mockExecuteToolCall,
  mockDetermineOutcome,
  mockBuildSystemPrompt,
  mockGetToolDefsForTenant,
  mockFindUnique,
} = vi.hoisted(() => {
  return {
    mockLoadTenantConfig: vi.fn(),
    mockCreateCallLog: vi.fn(),
    mockFinalizeCallLogWithReport: vi.fn(),
    mockExecuteToolCall: vi.fn(),
    mockDetermineOutcome: vi.fn(),
    mockBuildSystemPrompt: vi.fn(),
    mockGetToolDefsForTenant: vi.fn(),
    mockFindUnique: vi.fn(),
  };
});

vi.mock("../config/loader.js", () => ({
  loadTenantConfig: mockLoadTenantConfig,
}));

vi.mock("../ai/call-logger.js", () => ({
  createCallLog: mockCreateCallLog,
  finalizeCallLogWithReport: mockFinalizeCallLogWithReport,
  determineOutcome: mockDetermineOutcome,
}));

vi.mock("../ai/tools.js", () => ({
  executeToolCall: mockExecuteToolCall,
}));

vi.mock("../config/prompt-builder.js", () => ({
  buildSystemPrompt: mockBuildSystemPrompt,
}));

vi.mock("../ai/tools/definitions.js", () => ({
  getToolDefsForTenant: mockGetToolDefsForTenant,
}));

vi.mock("../db/prisma.js", () => ({
  prisma: {
    callLog: {
      findUnique: mockFindUnique,
    },
  },
}));

import {
  handleAssistantRequest,
  handleToolCalls,
  handleEndOfCallReport,
} from "./vapi-webhook.js";

const fakeTenant = {
  id: "t-1",
  businessName: "Test Biz",
  agentName: "TestBot",
  greeting: "Hello!",
  voiceProvider: "11labs",
  voiceId: "voice-123",
  googleCalendarId: null,
  phoneNumber: "+15550001111",
  description: "A test business",
  escalationMessage: "We will call you back.",
  afterHoursMessage: null,
  timezone: "America/New_York",
  email: "test@test.com",
  googleCredentials: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  faqs: [],
  services: [],
  businessHours: [],
};

describe("handleAssistantRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["PUBLIC_URL"] = "https://example.com";
  });

  it("returns transient assistant config with system prompt and tools", async () => {
    mockLoadTenantConfig.mockResolvedValue(fakeTenant);
    mockCreateCallLog.mockResolvedValue({ id: "cl-1" });
    mockBuildSystemPrompt.mockReturnValue("You are TestBot...");
    mockGetToolDefsForTenant.mockReturnValue([{ type: "function", function: { name: "take_message" } }]);

    const message = {
      type: "assistant-request",
      call: {
        id: "call-1",
        phoneNumberId: "pn-abc-123",
        customer: { number: "+15559999999" },
      },
    };

    const result = await handleAssistantRequest(message);

    expect(mockLoadTenantConfig).toHaveBeenCalledWith("pn-abc-123");
    expect(mockCreateCallLog).toHaveBeenCalledWith("t-1", "call-1", "+15559999999");
    expect(mockBuildSystemPrompt).toHaveBeenCalledWith(fakeTenant);
    expect(mockGetToolDefsForTenant).toHaveBeenCalledWith(false);

    expect(result).toEqual({
      assistant: {
        name: "TestBot",
        firstMessage: "Hello!",
        model: {
          provider: "openai",
          model: "gpt-4o",
          messages: [{ role: "system", content: "You are TestBot..." }],
          tools: [{ type: "function", function: { name: "take_message" } }],
        },
        voice: { provider: "11labs", voiceId: "voice-123" },
        fillerInjectionEnabled: true,
        backchannel: true,
        backgroundDenoisingEnabled: true,
        startSpeakingPlan: {
          waitSeconds: 0.4,
          smartEndpointingPlan: { provider: "livekit" },
        },
        stopSpeakingPlan: {
          numWords: 0,
          voiceSeconds: 0.2,
          backoffSeconds: 1.0,
        },
        silenceTimeoutSeconds: 15,
        maxDurationSeconds: 600,
        serverUrl: "https://example.com/api/vapi/webhook",
      },
    });
  });

  it("creates call log on assistant-request", async () => {
    mockLoadTenantConfig.mockResolvedValue(fakeTenant);
    mockCreateCallLog.mockResolvedValue({ id: "cl-1" });
    mockBuildSystemPrompt.mockReturnValue("prompt");
    mockGetToolDefsForTenant.mockReturnValue([]);

    const message = {
      type: "assistant-request",
      call: {
        id: "call-2",
        phoneNumberId: "pn-abc-123",
        customer: { number: "+15558888888" },
      },
    };

    await handleAssistantRequest(message);

    expect(mockCreateCallLog).toHaveBeenCalledWith("t-1", "call-2", "+15558888888");
  });

  it("returns error when tenant not found", async () => {
    mockLoadTenantConfig.mockRejectedValue(new Error("No tenant for number: +15550009999"));

    const message = {
      type: "assistant-request",
      call: {
        id: "call-3",
        phoneNumber: { number: "+15550009999" },
        customer: { number: "+15551111111" },
      },
    };

    const result = await handleAssistantRequest(message);

    expect(result).toEqual({ error: "No tenant for number: +15550009999" });
  });
});

describe("handleToolCalls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("executes tool and returns results array with matching toolCallId", async () => {
    mockLoadTenantConfig.mockResolvedValue(fakeTenant);
    mockFindUnique.mockResolvedValue({ id: "cl-1" });
    mockExecuteToolCall.mockResolvedValue("Message recorded for John.");

    const message = {
      type: "tool-calls",
      call: {
        id: "call-1",
        phoneNumberId: "pn-abc-123",
        customer: { number: "+15559999999" },
      },
      toolCallList: [
        {
          id: "tc-1",
          name: "take_message",
          arguments: { callerName: "John", callbackNumber: "+15551234567", reason: "Inquiry" },
        },
      ],
    };

    const result = await handleToolCalls(message);

    expect(mockLoadTenantConfig).toHaveBeenCalledWith("pn-abc-123");
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { callId: "call-1" },
      select: { id: true },
    });
    expect(mockExecuteToolCall).toHaveBeenCalledWith(
      "take_message",
      { callerName: "John", callbackNumber: "+15551234567", reason: "Inquiry" },
      expect.objectContaining({
        tenant: fakeTenant,
        callLogId: "cl-1",
      }),
    );
    expect(result).toEqual({
      results: [{ toolCallId: "tc-1", result: "Message recorded for John." }],
    });
  });
});

describe("handleEndOfCallReport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("finalizes call log with duration, transcript (with bot->assistant mapping), and recording URL", async () => {
    mockDetermineOutcome.mockReturnValue("completed");
    mockFinalizeCallLogWithReport.mockResolvedValue({ id: "cl-1" });

    const message = {
      type: "end-of-call-report",
      call: { id: "call-1" },
      durationSeconds: 180,
      recordingUrl: "https://storage.vapi.ai/recording.wav",
      messages: [
        { role: "user", message: "Hello" },
        { role: "bot", message: "Hi there, how can I help?" },
        { role: "user", message: "I need info" },
        { role: "bot", message: "Sure, let me help." },
      ],
    };

    const result = await handleEndOfCallReport(message);

    expect(mockDetermineOutcome).toHaveBeenCalledWith({
      messageTaken: false,
      bookingMade: false,
    });
    expect(mockFinalizeCallLogWithReport).toHaveBeenCalledWith(
      "call-1",
      180,
      "completed",
      [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there, how can I help?" },
        { role: "user", content: "I need info" },
        { role: "assistant", content: "Sure, let me help." },
      ],
      "https://storage.vapi.ai/recording.wav",
    );
    expect(result).toEqual({});
  });
});

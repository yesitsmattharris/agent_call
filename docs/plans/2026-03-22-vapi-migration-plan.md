# Vapi Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the Twilio transport layer with Vapi-managed agent. The voice server becomes a stateless webhook backend that handles tool execution, dynamic assistant configuration, and call logging.

**Architecture:** Single `POST /api/vapi/webhook` endpoint dispatches on `message.type`. On `assistant-request`, load tenant config and return a transient Vapi assistant. On `tool-calls`, execute business logic and return results. On `end-of-call-report`, finalize call logs. No WebSocket, no audio handling, no in-memory sessions.

**Tech Stack:** Fastify 5, @vapi-ai/server-sdk, Prisma 7, vitest, existing Google Calendar and prompt builder modules.

---

### Task 1: Update Prisma Schema

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `admin/prisma/schema.prisma` (mirror changes)

**Step 1: Rename Twilio-specific fields and add Vapi fields**

In `prisma/schema.prisma`, update the `Tenant` model:

```prisma
model Tenant {
  id                 String          @id @default(cuid())
  email              String          @unique
  businessName       String
  agentName          String          @default("Assistant")
  greeting           String
  description        String
  escalationMessage  String          @default("I'll have someone call you back.")
  afterHoursMessage  String?
  voiceId            String          @default("ash")
  phoneNumber        String          @unique
  googleCalendarId   String?
  googleCredentials  Json?
  timezone           String          @default("America/New_York")
  voiceProvider      String          @default("11labs")
  createdAt          DateTime        @default(now())
  updatedAt          DateTime        @updatedAt

  businessHours      BusinessHours[]
  callLogs           CallLog[]
  faqs               Faq[]
  messages           Message[]
  services           Service[]
}
```

Changes: `twilioPhoneNumber` renamed to `phoneNumber`, added `voiceProvider`.

Update the `CallLog` model:

```prisma
model CallLog {
  id              String   @id @default(cuid())
  tenantId        String
  tenant          Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  callId          String   @unique
  callerNumber    String
  startedAt       DateTime
  durationSeconds Int
  outcome         String
  transcript      Json
  recordingUrl    String?
  createdAt       DateTime @default(now())

  messages        Message[]

  @@index([tenantId, startedAt])
}
```

Changes: `callSid` renamed to `callId`, added `recordingUrl`.

**Step 2: Mirror changes in admin schema**

Apply identical Tenant and CallLog changes to `admin/prisma/schema.prisma`.

**Step 3: Generate Prisma client**

Run: `npx prisma generate`

Expected: Prisma client regenerated without errors.

**Step 4: Commit**

```bash
git add prisma/schema.prisma admin/prisma/schema.prisma
git commit -m "refactor: rename Twilio-specific schema fields for Vapi migration"
```

---

### Task 2: Update Config Types and Loader

**Files:**
- Modify: `src/config/schema.ts`
- Modify: `src/config/loader.ts`
- Modify: `src/config/loader.test.ts`

**Step 1: Update the tenant config schema and CallContext type**

In `src/config/schema.ts`:

Replace `twilioPhoneNumber` with `phoneNumber` in `tenantConfigSchema`:

```typescript
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
  googleCalendarId: z.string().nullable(),
  googleCredentials: z.unknown().nullable(),
  timezone: z.string(),
  voiceProvider: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  faqs: z.array(faqSchema),
  services: z.array(serviceSchema),
  businessHours: z.array(businessHoursSchema),
});
```

Replace `CallContext` type (drop `streamSid`, rename `callSid` to `callId`):

```typescript
export type CallContext = {
  tenantId: string;
  callLogId: string;
  googleCalendarId: string | null;
  googleCredentials: unknown | null;
  timezone: string;
  callId: string;
  outcomeFlagsRef: { messageTaken: boolean; bookingMade: boolean };
};
```

**Step 2: Update loader to use `phoneNumber`**

Replace `src/config/loader.ts` entirely:

```typescript
import { prisma } from "../db/prisma.js";
import type { TenantConfig } from "./schema.js";

export async function loadTenantConfig(
  phoneNumber: string,
): Promise<TenantConfig> {
  const tenant = await prisma.tenant.findUnique({
    where: { phoneNumber },
    include: { faqs: true, services: true, businessHours: true },
  });

  if (!tenant) {
    throw new Error(`No tenant for number: ${phoneNumber}`);
  }

  return tenant as unknown as TenantConfig;
}
```

**Step 3: Update loader test**

In `src/config/loader.test.ts`, update the mock tenant to use `phoneNumber` instead of `twilioPhoneNumber`, and update the assertion:

Replace `twilioPhoneNumber: "+15551234567"` with `phoneNumber: "+15551234567"` in the mock tenant object.

Replace the `findUnique` assertion:
```typescript
expect(mockFindUnique).toHaveBeenCalledWith({
  where: { phoneNumber: "+15551234567" },
  include: { faqs: true, services: true, businessHours: true },
});
```

Update the error test message:
```typescript
await expect(loadTenantConfig("+10000000000")).rejects.toThrow(
  "No tenant for number: +10000000000"
);
```

**Step 4: Run tests**

Run: `npx vitest run src/config/loader.test.ts --reporter=dot`

Expected: All tests pass.

**Step 5: Commit**

```bash
git add src/config/schema.ts src/config/loader.ts src/config/loader.test.ts
git commit -m "refactor: update config types and loader for provider-agnostic phone number"
```

---

### Task 3: Update Call Logger

**Files:**
- Modify: `src/ai/call-logger.ts`
- Modify: `src/ai/call-logger.test.ts`

**Step 1: Rename callSid to callId in call-logger.ts**

Update `createCallLog` signature and implementation:

```typescript
export async function createCallLog(
  tenantId: string,
  callId: string,
  callerNumber: string,
) {
  return prisma.callLog.create({
    data: {
      tenantId,
      callId,
      callerNumber,
      startedAt: new Date(),
      durationSeconds: 0,
      outcome: "in_progress",
      transcript: [],
    },
  });
}
```

Add `finalizeCallLogWithRecording` function for Vapi's end-of-call-report which provides transcript and recording URL:

```typescript
export async function finalizeCallLogWithReport(
  callId: string,
  durationSeconds: number,
  outcome: string,
  transcript: Array<{ role: string; content: string }>,
  recordingUrl: string | null,
) {
  return prisma.callLog.update({
    where: { callId },
    data: {
      durationSeconds,
      outcome,
      transcript,
      recordingUrl,
    },
  });
}
```

Keep the existing `finalizeCallLog`, `extractTranscript`, and `determineOutcome` functions.

**Step 2: Update tests**

In `src/ai/call-logger.test.ts`:

Update the `createCallLog` test to use `callId` instead of `callSid`:

```typescript
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
  const callData = mockCreate.mock.calls[0][0].data;
  expect(callData.startedAt).toBeInstanceOf(Date);
  expect(result).toEqual(fakeLog);
});
```

Add test for `finalizeCallLogWithReport`:

```typescript
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
```

**Step 3: Run tests**

Run: `npx vitest run src/ai/call-logger.test.ts --reporter=dot`

Expected: All tests pass.

**Step 4: Commit**

```bash
git add src/ai/call-logger.ts src/ai/call-logger.test.ts
git commit -m "refactor: rename callSid to callId in call logger, add finalizeCallLogWithReport"
```

---

### Task 4: Rewrite Tools as Plain Functions with JSON Schema Definitions

**Files:**
- Modify: `src/ai/tools.ts`
- Modify: `src/ai/tools/calendar.ts`
- Create: `src/ai/tools/definitions.ts`
- Modify: `src/ai/tools/calendar.test.ts`

**Step 1: Create JSON Schema tool definitions**

Create `src/ai/tools/definitions.ts`:

```typescript
// Vapi tool definitions in JSON Schema format
// These are included in the transient assistant config returned by assistant-request

export const takeMessageDef = {
  type: "function" as const,
  function: {
    name: "take_message",
    description: "Record a message from the caller for a callback",
    parameters: {
      type: "object",
      properties: {
        callerName: { type: "string", description: "Caller's full name" },
        callbackNumber: { type: "string", description: "Phone number to call back" },
        reason: { type: "string", description: "Reason for calling" },
        preferredTime: { type: "string", description: "Preferred callback time" },
      },
      required: ["callerName", "callbackNumber", "reason"],
    },
  },
};

export const checkAvailabilityDef = {
  type: "function" as const,
  function: {
    name: "check_availability",
    description: "Check available appointment slots for a given date. Returns busy time slots so you can identify open times.",
    parameters: {
      type: "object",
      properties: {
        date: { type: "string", description: "Date to check in YYYY-MM-DD format" },
      },
      required: ["date"],
    },
  },
};

export const bookAppointmentDef = {
  type: "function" as const,
  function: {
    name: "book_appointment",
    description: "Book a 60-minute appointment on the calendar. Only call this AFTER confirming the details with the caller.",
    parameters: {
      type: "object",
      properties: {
        date: { type: "string", description: "Date in YYYY-MM-DD format" },
        startTime: { type: "string", description: "Start time in HH:MM format (24-hour)" },
        callerName: { type: "string", description: "Full name of the caller" },
        callerPhone: { type: "string", description: "Caller's phone number" },
        reason: { type: "string", description: "Reason for the appointment" },
      },
      required: ["date", "startTime", "callerName", "callerPhone"],
    },
  },
};

export const allToolDefs = [takeMessageDef, checkAvailabilityDef, bookAppointmentDef];

// Returns tool defs appropriate for this tenant (excludes calendar tools if no calendar configured)
export function getToolDefsForTenant(hasCalendar: boolean) {
  if (hasCalendar) return allToolDefs;
  return [takeMessageDef];
}
```

**Step 2: Rewrite tools.ts as plain executor functions**

Replace `src/ai/tools.ts` entirely:

```typescript
import { prisma } from "../db/prisma.js";
import type { TenantConfig } from "../config/schema.js";
import { executeCheckAvailability, executeBookAppointment } from "./tools/calendar.js";

export type OutcomeFlags = { messageTaken: boolean; bookingMade: boolean };

export interface ToolContext {
  tenant: TenantConfig;
  callLogId: string;
  outcomeFlags: OutcomeFlags;
}

export async function executeTakeMessage(
  args: { callerName: string; callbackNumber: string; reason: string; preferredTime?: string },
  ctx: ToolContext,
): Promise<string> {
  await prisma.message.create({
    data: {
      tenantId: ctx.tenant.id,
      callLogId: ctx.callLogId ?? null,
      callerName: args.callerName,
      callbackNumber: args.callbackNumber,
      reason: args.reason,
      preferredTime: args.preferredTime ?? null,
    },
  });

  ctx.outcomeFlags.messageTaken = true;
  console.log("[tool:take_message]", JSON.stringify({
    type: "message_taken",
    callerName: args.callerName,
    callbackNumber: args.callbackNumber,
    tenantId: ctx.tenant.id,
    callLogId: ctx.callLogId,
  }));

  return `Message recorded for ${args.callerName}. We will call back at ${args.callbackNumber}.`;
}

// Tool router: maps tool names to executor functions
export async function executeToolCall(
  toolName: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  switch (toolName) {
    case "take_message":
      return executeTakeMessage(args as any, ctx);
    case "check_availability":
      return executeCheckAvailability(args as any, ctx.tenant);
    case "book_appointment":
      return executeBookAppointment(args as any, ctx);
    default:
      return `Unknown tool: ${toolName}`;
  }
}
```

**Step 3: Update calendar tool execute functions to accept ToolContext/TenantConfig directly**

In `src/ai/tools/calendar.ts`, replace the file with:

```typescript
import {
  createCalendarClient,
  checkAvailability,
  bookAppointment,
} from "../../calendar/client.js";
import type { ServiceAccountCredentials } from "../../calendar/client.js";
import type { TenantConfig } from "../../config/schema.js";
import type { ToolContext } from "../tools.js";

export async function executeCheckAvailability(
  input: { date: string },
  tenant: TenantConfig,
): Promise<string> {
  const { googleCalendarId, googleCredentials, timezone } = tenant;

  if (!googleCalendarId || !googleCredentials) {
    return "Calendar is not configured for this business. Please offer to take a message instead.";
  }

  const credentials = googleCredentials as ServiceAccountCredentials;
  const calendar = createCalendarClient(credentials);
  const busySlots = await checkAvailability(
    calendar,
    googleCalendarId,
    input.date,
    timezone,
  );

  if (busySlots.length === 0) {
    return `The calendar is completely open on ${input.date}. All time slots are available.`;
  }

  return `Busy times on ${input.date}: ${JSON.stringify(busySlots)}. Any times outside these windows are available for booking.`;
}

export async function executeBookAppointment(
  input: {
    date: string;
    startTime: string;
    callerName: string;
    callerPhone: string;
    reason?: string;
  },
  ctx: ToolContext,
): Promise<string> {
  const { googleCalendarId, googleCredentials } = ctx.tenant;

  if (!googleCalendarId || !googleCredentials) {
    return "Calendar is not configured for this business. Please offer to take a message instead.";
  }

  const credentials = googleCredentials as ServiceAccountCredentials;
  const calendar = createCalendarClient(credentials);

  const startDateTime = `${input.date}T${input.startTime}:00`;
  const startDate = new Date(startDateTime);
  const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);

  const startISO = startDate.toISOString();
  const endISO = endDate.toISOString();

  const summary = `Appointment: ${input.callerName}`;
  const descriptionParts = [`Phone: ${input.callerPhone}`];
  if (input.reason) {
    descriptionParts.push(`Reason: ${input.reason}`);
  }
  const description = descriptionParts.join("\n");

  const result = await bookAppointment(
    calendar,
    googleCalendarId,
    startISO,
    endISO,
    summary,
    description,
  );

  if (!result.success) {
    return "Sorry, that time slot is no longer available. Please check availability again for updated open slots.";
  }

  ctx.outcomeFlags.bookingMade = true;

  console.log("[tool:book_appointment]", JSON.stringify({
    type: "booking_made",
    callerName: input.callerName,
    callerPhone: input.callerPhone,
    date: input.date,
    startTime: input.startTime,
    eventId: result.eventId,
  }));

  return `Appointment booked successfully for ${input.callerName} on ${input.date} at ${input.startTime}. The appointment is 60 minutes long.`;
}
```

**Step 4: Update calendar tool tests**

In `src/ai/tools/calendar.test.ts`, update all tests to pass `TenantConfig` / `ToolContext` objects instead of the `@openai/agents` RunContext wrapper. Replace `(context as any).context as CallContext` patterns with direct object access.

For `executeCheckAvailability` tests, change the second argument from the RunContext mock to a plain `TenantConfig`-shaped object:

```typescript
const tenant = {
  googleCalendarId: "cal@group.calendar.google.com",
  googleCredentials: { client_email: "sa@proj.iam", private_key: "key", project_id: "proj" },
  timezone: "America/New_York",
} as any;

const result = await executeCheckAvailability({ date: "2026-03-25" }, tenant);
```

For `executeBookAppointment` tests, pass a `ToolContext`:

```typescript
const ctx = {
  tenant: {
    googleCalendarId: "cal@group.calendar.google.com",
    googleCredentials: { client_email: "sa@proj.iam", private_key: "key", project_id: "proj" },
  } as any,
  callLogId: "cl-1",
  outcomeFlags: { messageTaken: false, bookingMade: false },
};

const result = await executeBookAppointment(args, ctx);
expect(ctx.outcomeFlags.bookingMade).toBe(true);
```

**Step 5: Run tests**

Run: `npx vitest run src/ai/tools/calendar.test.ts --reporter=dot`

Expected: All tests pass.

**Step 6: Commit**

```bash
git add src/ai/tools.ts src/ai/tools/calendar.ts src/ai/tools/definitions.ts src/ai/tools/calendar.test.ts
git commit -m "refactor: rewrite tools as plain functions with JSON Schema defs for Vapi"
```

---

### Task 5: Create Vapi Webhook Handler

**Files:**
- Create: `src/api/vapi-webhook.ts`
- Create: `src/api/vapi-webhook.test.ts`

**Step 1: Write the failing tests**

Create `src/api/vapi-webhook.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockLoadTenantConfig, mockCreateCallLog, mockFinalizeCallLogWithReport, mockExecuteToolCall } = vi.hoisted(() => {
  return {
    mockLoadTenantConfig: vi.fn(),
    mockCreateCallLog: vi.fn(),
    mockFinalizeCallLogWithReport: vi.fn(),
    mockExecuteToolCall: vi.fn(),
  };
});

vi.mock("../config/loader.js", () => ({
  loadTenantConfig: mockLoadTenantConfig,
}));

vi.mock("../ai/call-logger.js", () => ({
  createCallLog: mockCreateCallLog,
  finalizeCallLogWithReport: mockFinalizeCallLogWithReport,
  determineOutcome: vi.fn((flags) => {
    if (flags.bookingMade) return "booking_made";
    if (flags.messageTaken) return "message_taken";
    return "completed";
  }),
}));

vi.mock("../ai/tools.js", () => ({
  executeToolCall: mockExecuteToolCall,
}));

import { handleAssistantRequest, handleToolCalls, handleEndOfCallReport } from "./vapi-webhook.js";

const fakeTenant = {
  id: "t-1",
  businessName: "Test Salon",
  agentName: "Luna",
  greeting: "Thanks for calling Test Salon!",
  description: "A full-service salon.",
  escalationMessage: "I'll have someone call you back.",
  afterHoursMessage: null,
  voiceId: "ash",
  phoneNumber: "+15551234567",
  googleCalendarId: null,
  googleCredentials: null,
  timezone: "America/New_York",
  voiceProvider: "11labs",
  faqs: [],
  services: [],
  businessHours: [],
};

describe("handleAssistantRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns transient assistant config with system prompt and tools", async () => {
    mockLoadTenantConfig.mockResolvedValue(fakeTenant);
    mockCreateCallLog.mockResolvedValue({ id: "cl-1" });

    const message = {
      type: "assistant-request",
      call: {
        id: "call-uuid-123",
        phoneNumber: { number: "+15551234567" },
        customer: { number: "+447568719994" },
      },
    };

    const result = await handleAssistantRequest(message);

    expect(mockLoadTenantConfig).toHaveBeenCalledWith("+15551234567");
    expect(result.assistant).toBeDefined();
    expect(result.assistant.firstMessage).toBe("Thanks for calling Test Salon!");
    expect(result.assistant.model.provider).toBe("openai");
    expect(result.assistant.model.messages[0].role).toBe("system");
    expect(result.assistant.voice).toBeDefined();
  });

  it("creates a call log on assistant-request", async () => {
    mockLoadTenantConfig.mockResolvedValue(fakeTenant);
    mockCreateCallLog.mockResolvedValue({ id: "cl-1" });

    const message = {
      type: "assistant-request",
      call: {
        id: "call-uuid-123",
        phoneNumber: { number: "+15551234567" },
        customer: { number: "+447568719994" },
      },
    };

    await handleAssistantRequest(message);

    expect(mockCreateCallLog).toHaveBeenCalledWith("t-1", "call-uuid-123", "+447568719994");
  });

  it("returns error when tenant not found", async () => {
    mockLoadTenantConfig.mockRejectedValue(new Error("No tenant for number: +10000000000"));

    const message = {
      type: "assistant-request",
      call: {
        id: "call-uuid-123",
        phoneNumber: { number: "+10000000000" },
        customer: { number: "+447568719994" },
      },
    };

    const result = await handleAssistantRequest(message);

    expect(result.error).toBeDefined();
  });
});

describe("handleToolCalls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("executes tool and returns results array", async () => {
    mockLoadTenantConfig.mockResolvedValue(fakeTenant);
    mockExecuteToolCall.mockResolvedValue("Message recorded for Jeff.");

    const message = {
      type: "tool-calls",
      call: {
        id: "call-uuid-123",
        phoneNumber: { number: "+15551234567" },
        customer: { number: "+447568719994" },
      },
      toolCallList: [
        {
          id: "tc-1",
          name: "take_message",
          arguments: { callerName: "Jeff", callbackNumber: "07111222334", reason: "Inquiry" },
        },
      ],
    };

    const result = await handleToolCalls(message);

    expect(result.results).toHaveLength(1);
    expect(result.results[0].toolCallId).toBe("tc-1");
    expect(result.results[0].result).toBe("Message recorded for Jeff.");
  });
});

describe("handleEndOfCallReport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("finalizes call log with duration, transcript, and recording URL", async () => {
    mockFinalizeCallLogWithReport.mockResolvedValue({ id: "cl-1" });

    const message = {
      type: "end-of-call-report",
      call: { id: "call-uuid-123" },
      durationSeconds: 64,
      recordingUrl: "https://storage.vapi.ai/recording.wav",
      transcript: "User: Hello\nAssistant: Hi there!",
      messages: [
        { role: "user", message: "Hello" },
        { role: "bot", message: "Hi there!" },
      ],
    };

    await handleEndOfCallReport(message);

    expect(mockFinalizeCallLogWithReport).toHaveBeenCalledWith(
      "call-uuid-123",
      64,
      "completed",
      [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there!" },
      ],
      "https://storage.vapi.ai/recording.wav",
    );
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/api/vapi-webhook.test.ts --reporter=dot`

Expected: FAIL (module not found)

**Step 3: Implement the webhook handler**

Create `src/api/vapi-webhook.ts`:

```typescript
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { loadTenantConfig } from "../config/loader.js";
import { buildSystemPrompt } from "../config/prompt-builder.js";
import { createCallLog, finalizeCallLogWithReport, determineOutcome } from "../ai/call-logger.js";
import { executeToolCall, type ToolContext, type OutcomeFlags } from "../ai/tools.js";
import { getToolDefsForTenant } from "../ai/tools/definitions.js";
import type { TenantConfig } from "../config/schema.js";

// In-flight outcome flags per call (needed because tool-calls and end-of-call-report are separate requests)
const callOutcomeFlags = new Map<string, OutcomeFlags>();

export async function handleAssistantRequest(message: any) {
  const phoneNumber = message.call?.phoneNumber?.number;
  const callerNumber = message.call?.customer?.number ?? "unknown";
  const callId = message.call?.id;

  if (!phoneNumber) {
    return { error: "No phone number in assistant-request" };
  }

  let tenant: TenantConfig;
  try {
    tenant = await loadTenantConfig(phoneNumber);
  } catch (err) {
    console.error("[vapi] Tenant lookup failed:", (err as Error).message);
    return { error: (err as Error).message };
  }

  // Create call log
  try {
    await createCallLog(tenant.id, callId, callerNumber);
  } catch (err) {
    console.error("[vapi] Failed to create call log:", (err as Error).message);
  }

  // Initialize outcome flags for this call
  callOutcomeFlags.set(callId, { messageTaken: false, bookingMade: false });

  const systemPrompt = buildSystemPrompt(tenant);
  const toolDefs = getToolDefsForTenant(!!tenant.googleCalendarId);

  return {
    assistant: {
      name: tenant.agentName,
      firstMessage: tenant.greeting,
      model: {
        provider: "openai",
        model: "gpt-4o",
        messages: [{ role: "system", content: systemPrompt }],
        tools: toolDefs,
      },
      voice: {
        provider: tenant.voiceProvider ?? "11labs",
        voiceId: tenant.voiceId,
      },
      silenceTimeoutSeconds: 15,
      maxDurationSeconds: 600,
      serverUrl: process.env["PUBLIC_URL"] + "/api/vapi/webhook",
    },
  };
}

export async function handleToolCalls(message: any) {
  const phoneNumber = message.call?.phoneNumber?.number;
  const callId = message.call?.id;
  const toolCallList = message.toolCallList ?? [];

  let tenant: TenantConfig;
  try {
    tenant = await loadTenantConfig(phoneNumber);
  } catch (err) {
    console.error("[vapi] Tenant lookup failed for tool-calls:", (err as Error).message);
    return {
      results: toolCallList.map((tc: any) => ({
        toolCallId: tc.id,
        result: "Error: could not load business configuration.",
      })),
    };
  }

  const outcomeFlags = callOutcomeFlags.get(callId) ?? { messageTaken: false, bookingMade: false };
  const callLog = await findCallLogId(callId);

  const ctx: ToolContext = {
    tenant,
    callLogId: callLog,
    outcomeFlags,
  };

  const results = await Promise.all(
    toolCallList.map(async (tc: any) => {
      const result = await executeToolCall(tc.name, tc.arguments ?? {}, ctx);
      return { toolCallId: tc.id, result };
    }),
  );

  return { results };
}

async function findCallLogId(callId: string): Promise<string> {
  // Import prisma lazily to avoid circular deps in tests
  const { prisma } = await import("../db/prisma.js");
  try {
    const log = await prisma.callLog.findUnique({ where: { callId }, select: { id: true } });
    return log?.id ?? "";
  } catch {
    return "";
  }
}

export async function handleEndOfCallReport(message: any) {
  const callId = message.call?.id;
  const durationSeconds = message.durationSeconds ?? 0;
  const recordingUrl = message.recordingUrl ?? null;
  const messages = message.messages ?? [];

  // Convert Vapi messages to our transcript format
  const transcript = messages
    .filter((m: any) => m.role === "user" || m.role === "bot" || m.role === "assistant")
    .map((m: any) => ({
      role: m.role === "bot" ? "assistant" : m.role,
      content: m.message ?? "",
    }))
    .filter((m: any) => m.content);

  // Determine outcome from flags
  const flags = callOutcomeFlags.get(callId) ?? { messageTaken: false, bookingMade: false };
  const outcome = determineOutcome(flags);

  try {
    await finalizeCallLogWithReport(callId, durationSeconds, outcome, transcript, recordingUrl);
    console.log("[vapi] Call log finalized:", JSON.stringify({ callId, durationSeconds, outcome }));
  } catch (err) {
    console.error("[vapi] Failed to finalize call log:", (err as Error).message);
  }

  // Clean up outcome flags
  callOutcomeFlags.delete(callId);
}

export function registerVapiWebhookRoute(app: FastifyInstance) {
  app.post("/api/vapi/webhook", async (request: FastifyRequest, reply: FastifyReply) => {
    const { message } = request.body as { message: any };

    if (!message?.type) {
      return reply.status(400).send({ error: "Missing message.type" });
    }

    console.log(`[vapi] Received event: ${message.type}`);

    switch (message.type) {
      case "assistant-request": {
        const result = await handleAssistantRequest(message);
        return reply.send(result);
      }
      case "tool-calls": {
        const result = await handleToolCalls(message);
        return reply.send(result);
      }
      case "end-of-call-report": {
        await handleEndOfCallReport(message);
        return reply.status(200).send();
      }
      case "status-update": {
        console.log("[vapi] Status update:", message.status);
        return reply.status(200).send();
      }
      default: {
        return reply.status(200).send();
      }
    }
  });
}
```

**Step 4: Run tests**

Run: `npx vitest run src/api/vapi-webhook.test.ts --reporter=dot`

Expected: All tests pass.

**Step 5: Commit**

```bash
git add src/api/vapi-webhook.ts src/api/vapi-webhook.test.ts
git commit -m "feat: add Vapi webhook handler with assistant-request, tool-calls, and end-of-call-report"
```

---

### Task 6: Update Server Entry Point and Remove Twilio Code

**Files:**
- Modify: `src/server.ts`
- Delete: `src/telephony/webhooks.ts`
- Delete: `src/telephony/media-stream.ts`
- Delete: `src/telephony/twiml.ts`
- Delete: `src/ai/session.ts`
- Delete: `src/ai/realtime.ts`

**Step 1: Update server.ts**

Replace `src/server.ts` with:

```typescript
import "dotenv/config";
import Fastify from "fastify";
import formbody from "@fastify/formbody";
import { registerVapiWebhookRoute } from "./api/vapi-webhook.js";

const port = Number(process.env["PORT"] ?? 3001);
const host = process.env["HOST"] ?? "0.0.0.0";

const app = Fastify({ logger: true });

await app.register(formbody);

// Health check
app.get("/", async () => {
  return { status: "ok" };
});

// Vapi webhook (replaces Twilio routes)
registerVapiWebhookRoute(app);

try {
  await app.listen({ port, host });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
```

Note: `@fastify/websocket` is no longer needed. Remove the import and registration.

**Step 2: Delete Twilio-specific files**

Delete these files:
- `src/telephony/webhooks.ts`
- `src/telephony/media-stream.ts`
- `src/telephony/twiml.ts`
- `src/ai/session.ts`
- `src/ai/realtime.ts`

**Step 3: Run all tests**

Run: `npx vitest run --reporter=dot`

Expected: All tests pass. (Tests for deleted files no longer exist; remaining tests for loader, prompt-builder, call-logger, calendar, and vapi-webhook all pass.)

**Step 4: Commit**

```bash
git add src/server.ts src/api/
git rm src/telephony/webhooks.ts src/telephony/media-stream.ts src/telephony/twiml.ts src/ai/session.ts src/ai/realtime.ts
git commit -m "feat: replace Twilio transport with Vapi webhook, delete transport layer"
```

---

### Task 7: Update Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Remove Twilio and OpenAI agent dependencies, add Vapi SDK**

Run:
```bash
npm uninstall twilio @openai/agents @openai/agents-extensions @fastify/websocket ws @types/ws
npm install @vapi-ai/server-sdk
```

**Step 2: Verify build**

Run: `npx tsc --build --noEmit`

Expected: No type errors.

**Step 3: Run all tests**

Run: `npx vitest run --reporter=dot`

Expected: All tests pass.

**Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: swap twilio/@openai/agents deps for @vapi-ai/server-sdk"
```

---

### Task 8: Update Environment Config and Deployment

**Files:**
- Modify: `.env.example`
- Modify: `render.yaml`
- Modify: `Dockerfile`

**Step 1: Update .env.example**

Replace Twilio vars with Vapi vars:

```
OPENAI_API_KEY=sk-...
VAPI_API_KEY=your-vapi-api-key
VAPI_WEBHOOK_SECRET=your-webhook-secret
PORT=3001
HOST=0.0.0.0
PUBLIC_URL=https://your-deployed-url.example.com
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...
GOOGLE_SA_CLIENT_EMAIL=sa@project.iam.gserviceaccount.com
GOOGLE_SA_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n..."
```

**Step 2: Update render.yaml**

```yaml
services:
  - type: web
    name: agent-call
    runtime: docker
    dockerfilePath: ./Dockerfile
    healthCheckPath: /
    envVars:
      - key: OPENAI_API_KEY
        sync: false
      - key: VAPI_API_KEY
        sync: false
      - key: VAPI_WEBHOOK_SECRET
        sync: false
      - key: PUBLIC_URL
        sync: false
```

**Step 3: Update Dockerfile**

Remove `@fastify/websocket` is handled by npm uninstall already. No Dockerfile changes needed unless there are Twilio-specific build steps. Verify the Dockerfile still builds:

Run: `docker build -t agent-call .`

Expected: Build succeeds.

**Step 4: Commit**

```bash
git add .env.example render.yaml
git commit -m "chore: update env config and render.yaml for Vapi"
```

---

### Task 9: Update CLAUDE.md and Project State

**Files:**
- Modify: `CLAUDE.md`
- Modify: `.planning/STATE.md`
- Modify: `.planning/todos/migrate-twilio-to-vapi.md`

**Step 1: Update CLAUDE.md**

Remove Twilio-specific gotchas that no longer apply:
- The `TwilioRealtimeTransportLayer` gotchas
- The transport start event replay gotcha
- The TwiML `<Parameter>` gotcha

Add Vapi-specific notes:
- Vapi webhook is a single POST endpoint at `/api/vapi/webhook`
- `assistant-request` must respond within 7.5 seconds
- Tool results must include `toolCallId` matching the request
- `callOutcomeFlags` Map tracks per-call outcome between tool-calls and end-of-call-report

**Step 2: Update STATE.md**

Update stack description to replace Twilio with Vapi. Update current position and session continuity.

**Step 3: Mark todo as complete**

Update `.planning/todos/migrate-twilio-to-vapi.md` status from `pending` to `complete`.

**Step 4: Commit**

```bash
git add CLAUDE.md .planning/STATE.md .planning/todos/migrate-twilio-to-vapi.md
git commit -m "docs: update project docs for Vapi migration"
```

---

### Task 10: End-to-End Verification

**No files changed. Manual verification.**

**Step 1: Run full test suite**

Run: `npx vitest run --reporter=dot`

Expected: All tests pass.

**Step 2: Start dev server locally**

Run: `npm run dev`

Expected: Server starts, health check at `http://localhost:3001/` returns `{"status":"ok"}`.

**Step 3: Test webhook endpoint with curl**

```bash
curl -X POST http://localhost:3001/api/vapi/webhook \
  -H "Content-Type: application/json" \
  -d '{"message":{"type":"status-update","status":"in-progress"}}'
```

Expected: 200 OK.

**Step 4: Deploy to Render and configure Vapi**

1. Push to main, Render auto-deploys
2. In Vapi dashboard: create phone number, set server URL to `https://agent-call.onrender.com/api/vapi/webhook`
3. Leave assistant ID blank on the phone number (triggers assistant-request per call)
4. Update tenant's `phoneNumber` in the database to match the Vapi number
5. Make a test call

**Step 5: Commit any fixes from E2E testing**

# Phase 3: Call Resolution + Visibility - Research

**Researched:** 2026-03-21
**Domain:** Google Calendar API, call logging, admin UI call history
**Confidence:** HIGH

## Summary

Phase 3 adds three capabilities: Google Calendar booking (check availability + insert events), structured message persistence, and call history with transcripts. The voice server already has the in-memory session tracking (`SessionManager`) and tool infrastructure (`tool()` from `@openai/agents`) needed, so the work is primarily about wiring in the `googleapis` npm package for Calendar, adding Prisma models for persistence, and building admin UI pages.

The most technically nuanced piece is passing tenant-specific Google credentials to tool execute functions at runtime. The `@openai/agents` SDK supports this through the `context` option on `RealtimeSessionOptions`, which flows through to every tool's `execute(input, context)` callback as `RunContext<RealtimeContextData<TContext>>`. This means tools can access tenant config (calendar ID, credentials) without relying on module-level state.

**Primary recommendation:** Use `googleapis` with `google-auth-library` JWT auth for service account Calendar access. Pass tenant config via `RealtimeSession` context. Persist call logs and messages on call cleanup (stop/disconnect). Build admin call history as a new `/dashboard/calls` route.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| BOOK-01 | Agent checks real-time availability on Google Calendar during a live call | googleapis `freebusy.query` API, service account JWT auth, tool context pattern |
| BOOK-02 | Agent books an appointment on Google Calendar with caller's name and contact info | googleapis `events.insert` API, double-booking prevention via re-check before insert |
| BOOK-03 | Agent confirms booking details back to the caller before finalizing | Two-tool pattern: `check_availability` returns slots, agent confirms verbally, then `book_appointment` inserts. Prompt engineering enforces confirmation. |
| MSG-01 | Agent captures caller's name, phone number, reason for calling, and preferred callback time | Existing `take_message` tool already captures these fields; needs DB write in execute handler |
| MSG-02 | Message is stored and visible to business owner in admin interface | New `Message` Prisma model, admin messages view |
| HIST-01 | Every call is logged with timestamp, duration, caller number, and outcome | New `CallLog` Prisma model, persist on call cleanup in media-stream.ts |
| HIST-02 | Full conversation transcript is stored and viewable for each call | `history_updated` event already captures `RealtimeItem[]` with transcripts; serialize to JSON on persist |
| HIST-03 | Business owner can browse and search call history in admin UI | New `/dashboard/calls` route with server-side search, transcript viewer |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `googleapis` | ^171.x | Google Calendar API client | Official Google-maintained Node.js client for all Google APIs |
| `google-auth-library` | ^9.x | Service account JWT authentication | Official Google auth library; `googleapis` depends on it internally but direct import gives cleaner JWT setup |

### Already in Stack (no new dependencies)
| Library | Version | Purpose |
|---------|---------|---------|
| `@openai/agents` | 0.7.2 | `tool()` helper, `RealtimeSession`, `RealtimeAgent` |
| `@openai/agents-extensions` | 0.7.2 | `TwilioRealtimeTransportLayer` |
| Prisma | ^7.5.0 | Database models, migrations |
| Next.js | 16.2.0 | Admin UI (App Router) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `googleapis` | `node-google-calendar` | Simpler API but less maintained, fewer features, not official |
| `google-auth-library` JWT | `googleapis` built-in `google.auth.GoogleAuth` | `GoogleAuth` works but JWT gives more explicit control over credentials from JSON blob |

**Installation (voice server only):**
```bash
npm install googleapis google-auth-library
```

## Architecture Patterns

### Recommended Project Structure
```
src/
  ai/
    tools.ts              # Updated: take_message writes DB, new calendar tools
    tools/
      calendar.ts         # check_availability + book_appointment tool definitions
      message.ts          # take_message tool (extracted, DB-aware)
    session.ts            # Updated: persist to DB on cleanup
    realtime.ts           # Updated: pass tenant context to RealtimeSession
  calendar/
    client.ts             # Google Calendar API wrapper (auth + freebusy + insert)
  db/
    prisma.ts             # Existing
admin/
  app/
    dashboard/
      calls/
        page.tsx          # Call history list with search
        [id]/
          page.tsx        # Single call detail with transcript
      messages/
        page.tsx          # Messages list (or embed in calls page)
    actions/
      config.ts           # Existing
prisma/
  schema.prisma           # Updated: CallLog, Message models
```

### Pattern 1: Tool Context for Tenant Data
**What:** Pass tenant-specific config (Google Calendar ID, credentials JSON) to tools via RealtimeSession context, not module-level closures or globals.
**When to use:** Always, for any tool that needs per-call tenant data.
**Example:**
```typescript
// Source: @openai/agents-core/dist/tool.d.ts line 525
// tool execute signature: (input, context?, details?) => Promise<unknown>

// Define a context type
type CallContext = {
  tenantId: string;
  googleCalendarId: string | null;
  googleCredentials: unknown | null;
  callSid: string;
  streamSid: string;
};

// Pass context when creating session (in media-stream.ts)
const session = new RealtimeSession(agent, {
  transport,
  model: "gpt-realtime",
  context: {
    tenantId: config.id,
    googleCalendarId: config.googleCalendarId,
    googleCredentials: config.googleCredentials,
    callSid,
    streamSid,
  } satisfies CallContext,
});

// Access in tool execute handler
const checkAvailabilityTool = tool({
  name: "check_availability",
  description: "Check available appointment slots",
  parameters: z.object({
    date: z.string().describe("Date to check in YYYY-MM-DD format"),
  }),
  execute: async (input, context) => {
    // context is RunContext<RealtimeContextData<CallContext>>
    const { googleCalendarId, googleCredentials } = context!.state.context;
    // ... use to call Google Calendar API
  },
});
```

### Pattern 2: Google Calendar Service Account Auth from JSON Blob
**What:** Create a JWT client from the service account credentials JSON stored in the tenant's `googleCredentials` column.
**When to use:** Every calendar API call.
**Example:**
```typescript
// Source: google-auth-library JWT docs + dev.to verified example
import { JWT } from "google-auth-library";
import { google } from "googleapis";

function createCalendarClient(credentials: { client_email: string; private_key: string }) {
  const auth = new JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ["https://www.googleapis.com/auth/calendar"],
  });
  return google.calendar({ version: "v3", auth });
}
```

### Pattern 3: Freebusy Query for Availability
**What:** Use `freebusy.query` (not `events.list`) to check availability. It returns busy intervals, and the agent derives open slots from the gaps.
**When to use:** BOOK-01 availability checks.
**Example:**
```typescript
// Source: Google Calendar API v3 reference /freebusy/query
async function checkAvailability(
  calendar: ReturnType<typeof google.calendar>,
  calendarId: string,
  date: string, // YYYY-MM-DD
  timezone: string,
) {
  const timeMin = new Date(`${date}T00:00:00`);
  const timeMax = new Date(`${date}T23:59:59`);

  const res = await calendar.freebusy.query({
    requestBody: {
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      timeZone: timezone,
      items: [{ id: calendarId }],
    },
  });

  const busySlots = res.data.calendars?.[calendarId]?.busy ?? [];
  // busySlots: Array<{ start: string, end: string }>
  return busySlots;
}
```

### Pattern 4: Double-Booking Prevention
**What:** Re-check availability immediately before `events.insert` within the same tool execution. If a conflict appears between the check and the insert, abort and inform the caller.
**When to use:** BOOK-02, every booking.
**Example:**
```typescript
async function bookAppointment(calendar, calendarId, start, end, summary, description) {
  // Re-check: is the slot still free?
  const recheck = await calendar.freebusy.query({
    requestBody: {
      timeMin: start,
      timeMax: end,
      items: [{ id: calendarId }],
    },
  });

  const conflicts = recheck.data.calendars?.[calendarId]?.busy ?? [];
  if (conflicts.length > 0) {
    return { success: false, reason: "Slot is no longer available" };
  }

  const event = await calendar.events.insert({
    calendarId,
    requestBody: {
      summary,
      description,
      start: { dateTime: start },
      end: { dateTime: end },
    },
  });

  return { success: true, eventId: event.data.id, htmlLink: event.data.htmlLink };
}
```

### Pattern 5: Call Log Persistence on Cleanup
**What:** When a call ends (stop event or socket close), persist the call record and transcript to the database before removing the in-memory session.
**When to use:** Every call end.
**Example:**
```typescript
// In cleanup() inside media-stream.ts
async function persistCallLog(session: CallSession, tenantId: string, outcome: string) {
  const durationSec = Math.round((Date.now() - session.startedAt.getTime()) / 1000);

  await prisma.callLog.create({
    data: {
      tenantId,
      callSid: session.callSid,
      callerNumber: session.from,
      startedAt: session.startedAt,
      durationSeconds: durationSec,
      outcome, // "completed" | "message_taken" | "booking_made" | "abandoned"
      transcript: JSON.stringify(session.messages),
    },
  });
}
```

### Pattern 6: Transcript Extraction from RealtimeItem[]
**What:** The `history_updated` event emits `RealtimeItem[]` which contains message items with roles and content (including audio transcripts). Extract text from these for persistence.
**When to use:** Building the transcript to store.
**Detail:**
```typescript
// RealtimeItem shape (from @openai/agents-realtime/dist/items.d.ts):
// - type: "message", role: "user" | "assistant" | "system"
//   content: Array<{ type: "input_text" | "input_audio" | "output_text" | "output_audio", text?: string, transcript?: string }>
// - type: "function_call", name: string, arguments: string, output: string

function extractTranscript(history: RealtimeItem[]): Array<{ role: string; content: string; timestamp?: string }> {
  const transcript: Array<{ role: string; content: string }> = [];

  for (const item of history) {
    if (item.type === "message" && "content" in item) {
      const text = item.content
        .map((c: any) => c.text ?? c.transcript ?? "")
        .filter(Boolean)
        .join(" ");
      if (text) {
        transcript.push({ role: item.role, content: text });
      }
    }
  }
  return transcript;
}
```

### Anti-Patterns to Avoid
- **Module-level calendar client:** Do not create a single Google Calendar client at import time. Each tenant has different credentials. Create per-call.
- **Storing raw audio in transcript column:** Audio data from `input_audio`/`output_audio` items can be large (base64). Only store text transcripts, not audio blobs.
- **Querying events.list for availability:** Per STATE.md decision, use `freebusy.query` (fast, returns only busy intervals) not `events.list` (slow, returns full event details, requires broader permissions).
- **Nested HTML forms in admin UI:** Per STATE.md gotcha, avoid nested forms. Use sibling forms for delete/edit actions.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Google Calendar auth | Custom OAuth/JWT token management | `google-auth-library` JWT class | Handles token refresh, caching, error retry |
| Calendar API calls | Raw HTTP requests to Calendar API | `googleapis` calendar v3 client | Type-safe methods, handles pagination, error codes |
| Full-text search on call history | Custom SQL LIKE queries | Prisma `contains` filter (or PostgreSQL `ilike`) | Sufficient for demo; full-text search is v2 concern |
| Date/time formatting for Calendar API | Manual ISO string building | Native `Date.toISOString()` | Calendar API expects RFC3339 which is ISO 8601 |

**Key insight:** The Google Calendar API has subtle edge cases around timezone handling, recurring events, and busy/free status. The `googleapis` package handles these correctly. Writing raw HTTP calls would miss edge cases like token refresh on long-running calls.

## Common Pitfalls

### Pitfall 1: Service Account Calendar Sharing
**What goes wrong:** Service account creates events but they don't appear on the business owner's calendar, or freebusy returns empty for a calendar the service account can't access.
**Why it happens:** The service account is a separate identity. It has no access to any calendar by default.
**How to avoid:** The business owner must share their Google Calendar with the service account email (found in the credentials JSON `client_email` field) and grant "Make changes to events" permission.
**Warning signs:** `freebusy.query` returns empty busy array even for calendars with events; `events.insert` creates events that are only visible to the service account.

### Pitfall 2: Tool Context Type Safety
**What goes wrong:** Tool execute handler receives `undefined` context because the context type doesn't match.
**Why it happens:** The `tool()` generic needs explicit typing: `tool<typeof schema, CallContext>()`. If you use `tool()` without the context generic, `context.state.context` won't have your custom fields.
**How to avoid:** Define a `CallContext` type and pass it as the second generic parameter to `tool()`. Or access `context!.state.context` and cast.

### Pitfall 3: history_updated Fires Multiple Times
**What goes wrong:** Transcript gets duplicated or overwrites partial data.
**Why it happens:** `history_updated` emits the *full* history every time any item changes (not a diff). It fires frequently during conversation, including on connect with empty history.
**How to avoid:** Don't persist on every `history_updated`. Instead, capture the final history snapshot during cleanup (call end) and persist once.

### Pitfall 4: Timezone Handling in Calendar API
**What goes wrong:** Agent offers slots at wrong times; bookings appear at unexpected hours.
**Why it happens:** `freebusy.query` and `events.insert` use ISO 8601 datetimes. If the timezone doesn't match the business's actual timezone, busy/free calculations are wrong.
**How to avoid:** Store the business timezone in tenant config (or derive from Calendar settings). Always pass `timeZone` in freebusy requests and use `dateTime` (not `date`) with timezone offset in events.insert.

### Pitfall 5: Credential JSON Shape
**What goes wrong:** `new JWT({ key: credentials.private_key })` throws because `private_key` is undefined.
**Why it happens:** The `googleCredentials` column stores the full service account JSON, but if it was pasted incorrectly or the shape differs, required fields may be missing.
**How to avoid:** Validate the credentials JSON shape when saving in the admin UI. Required fields: `client_email`, `private_key`, `project_id`.

### Pitfall 6: Call Outcome Tracking
**What goes wrong:** All calls logged as "completed" with no way to distinguish booking vs. message vs. simple inquiry.
**Why it happens:** The call outcome depends on which tools were invoked during the call, but the cleanup function doesn't know this.
**How to avoid:** Track tool invocations during the call (set flags in session or context when `take_message` or `book_appointment` fires via `agent_tool_end` event) and use that to determine outcome.

## Code Examples

### Google Calendar Client Factory
```typescript
// src/calendar/client.ts
import { JWT } from "google-auth-library";
import { google, calendar_v3 } from "googleapis";

export interface ServiceAccountCredentials {
  client_email: string;
  private_key: string;
  project_id: string;
}

export function createCalendarClient(
  credentials: ServiceAccountCredentials,
): calendar_v3.Calendar {
  const auth = new JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ["https://www.googleapis.com/auth/calendar"],
  });
  return google.calendar({ version: "v3", auth });
}
```

### Prisma Schema Additions
```prisma
model CallLog {
  id              String   @id @default(cuid())
  tenantId        String
  tenant          Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  callSid         String   @unique
  callerNumber    String
  startedAt       DateTime
  durationSeconds Int
  outcome         String   // "completed" | "message_taken" | "booking_made" | "abandoned"
  transcript      Json     // Array of { role, content, timestamp }
  createdAt       DateTime @default(now())

  messages        Message[]

  @@index([tenantId, startedAt])
}

model Message {
  id              String   @id @default(cuid())
  tenantId        String
  tenant          Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  callLogId       String?
  callLog         CallLog? @relation(fields: [callLogId], references: [id], onDelete: SetNull)
  callerName      String
  callbackNumber  String
  reason          String
  preferredTime   String?
  createdAt       DateTime @default(now())

  @@index([tenantId, createdAt])
}
```

### Updated Tool with DB Write (take_message)
```typescript
// Tool that writes to DB via context
const takeMessageTool = tool({
  name: "take_message",
  description: "Record a message from the caller for a callback",
  parameters: z.object({
    callerName: z.string(),
    callbackNumber: z.string(),
    reason: z.string(),
    preferredTime: z.string().optional(),
  }),
  execute: async (input, context) => {
    const { tenantId, callLogId } = context!.state.context;

    await prisma.message.create({
      data: {
        tenantId,
        callLogId: callLogId ?? null,
        callerName: input.callerName,
        callbackNumber: input.callbackNumber,
        reason: input.reason,
        preferredTime: input.preferredTime ?? null,
      },
    });

    return `Message recorded for ${input.callerName}. We will call back at ${input.callbackNumber}.`;
  },
});
```

### Admin Call History Server Component Pattern
```typescript
// admin/app/dashboard/calls/page.tsx
// Uses existing patterns from dashboard/page.tsx
export default async function CallsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const tenant = await prisma.tenant.findUnique({
    where: { email: user.email! },
    select: { id: true },
  });
  if (!tenant) redirect("/");

  const where = {
    tenantId: tenant.id,
    ...(params.q ? {
      OR: [
        { callerNumber: { contains: params.q } },
        { outcome: { contains: params.q } },
      ],
    } : {}),
  };

  const calls = await prisma.callLog.findMany({
    where,
    orderBy: { startedAt: "desc" },
    take: 20,
    skip: (Number(params.page ?? 1) - 1) * 20,
  });

  // render call list...
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `events.list` for availability | `freebusy.query` | Always available, but often overlooked | 10x faster, returns only busy intervals, requires less permission scope |
| OAuth 2.0 per-user | Service account with calendar sharing | Service accounts have always existed | Eliminates per-tenant OAuth flow for v1 |
| Manual token refresh | `google-auth-library` auto-refresh | v9.x | JWT handles token lifecycle automatically |

**Deprecated/outdated:**
- `google-auth-library` v8: v9 is current, but API is compatible for JWT usage
- `googleapis` callback-based API: All methods now return promises natively

## Open Questions

1. **Timezone for the business**
   - What we know: Google Calendar events use timezone-aware datetimes. The `freebusy.query` accepts a `timeZone` parameter.
   - What's unclear: The tenant model does not currently store a timezone. The business hours use simple "HH:MM" strings without timezone context.
   - Recommendation: Add a `timezone` field to the Tenant model (default: "America/New_York" or derive from Calendar settings). For v1, could also use the calendar's timezone from `calendarList.get`.

2. **Appointment duration**
   - What we know: `events.insert` requires both start and end time.
   - What's unclear: How does the agent know the appointment duration? Different services may have different durations.
   - Recommendation: For v1, use a fixed default (e.g., 60 minutes) or add a `defaultAppointmentDuration` field to tenant config. Service-specific durations are a v2 enhancement.

3. **Call outcome when callLogId not yet created**
   - What we know: `take_message` tool needs a `callLogId` to link the message to the call log, but the call log is created at call end, not start.
   - What's unclear: The message is created mid-call but the call log doesn't exist yet.
   - Recommendation: Create the CallLog record at call start (in the `start` event handler) with a placeholder duration/outcome, then update it at call end. This gives tools a callLogId to reference. Alternatively, create messages without callLogId and link them after call end using callSid.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.x |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run --reporter=dot` |
| Full suite command | `npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BOOK-01 | check_availability tool returns available slots from freebusy | unit | `npx vitest run src/calendar/client.test.ts -t "checkAvailability"` | No, Wave 0 |
| BOOK-02 | book_appointment tool inserts event, re-checks availability | unit | `npx vitest run src/calendar/client.test.ts -t "bookAppointment"` | No, Wave 0 |
| BOOK-03 | Prompt includes confirmation instruction | unit | `npx vitest run src/config/prompt-builder.test.ts -t "booking confirmation"` | No, Wave 0 |
| MSG-01 | take_message captures all required fields | unit | `npx vitest run src/ai/tools.test.ts -t "take_message"` | No, Wave 0 |
| MSG-02 | Message persisted to DB | unit | `npx vitest run src/ai/tools.test.ts -t "message persistence"` | No, Wave 0 |
| HIST-01 | Call log created with correct fields on call end | unit | `npx vitest run src/ai/session.test.ts -t "call log persistence"` | No, Wave 0 |
| HIST-02 | Transcript extracted from RealtimeItem history | unit | `npx vitest run src/ai/session.test.ts -t "transcript extraction"` | No, Wave 0 |
| HIST-03 | Call history query with search | manual-only | Manual: browse admin UI `/dashboard/calls` | N/A |

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter=dot`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/calendar/client.test.ts` -- covers BOOK-01, BOOK-02 (mock googleapis)
- [ ] `src/ai/tools.test.ts` -- covers MSG-01, MSG-02 (mock prisma)
- [ ] `src/ai/session.test.ts` -- covers HIST-01, HIST-02 (mock prisma, test transcript extraction)

## Sources

### Primary (HIGH confidence)
- `@openai/agents-core/dist/tool.d.ts` (local, line 525): `ToolExecuteFunction` signature confirms `(input, context?, details?)` pattern
- `@openai/agents-realtime/dist/realtimeSession.d.ts` (local): `RealtimeSessionOptions.context` and `RealtimeContextData<TContext>` type
- `@openai/agents-realtime/dist/realtimeSessionEvents.d.ts` (local): Full event type definitions including `history_updated: [history: RealtimeItem[]]`
- `@openai/agents-realtime/dist/items.d.ts` (local): `RealtimeItem` shape with message content types (input_text, input_audio with transcript, output_text, output_audio with transcript)
- Google Calendar API v3 freebusy/query reference: request/response format
- Google Calendar API v3 events/insert reference: required fields, response format

### Secondary (MEDIUM confidence)
- [Google Calendar Events.insert API](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert) -- official docs, verified parameters
- [Google Calendar Freebusy.query API](https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query) -- official docs, verified request/response format
- [Create Google Calendar Events using Service Accounts (DEV Community)](https://dev.to/pedrohase/create-google-calender-events-using-the-google-api-and-service-accounts-in-nodejs-22m8) -- JWT auth pattern verified against local `google-auth-library` types
- [googleapis npm](https://www.npmjs.com/package/googleapis) -- version 171.x confirmed current

### Tertiary (LOW confidence)
- [OpenAI Agents JS Issue #489](https://github.com/openai/openai-agents-js/issues/489) -- Discussion on storing RealtimeSession history server-side; approaches discussed but no definitive SDK pattern for server-side Twilio use case

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- googleapis and google-auth-library are the official Google packages, verified via npm and local type inspection
- Architecture: HIGH -- Tool context pattern verified directly from SDK type definitions in node_modules; Prisma model patterns match existing codebase conventions
- Pitfalls: MEDIUM -- Calendar sharing requirement and timezone handling are well-documented; tool context typing nuances verified from source types but not tested end-to-end
- Admin UI: MEDIUM -- Next.js 16.2 has breaking changes per admin/AGENTS.md warning; existing patterns from dashboard/page.tsx are a reliable template but new routes need verification

**Research date:** 2026-03-21
**Valid until:** 2026-04-21 (stable APIs, 30-day validity)

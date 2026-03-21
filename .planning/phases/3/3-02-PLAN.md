---
phase: 3-call-resolution
plan: 02
type: execute
wave: 2
depends_on: ["3-01"]
files_modified:
  - src/calendar/client.ts
  - src/calendar/client.test.ts
  - src/ai/tools/calendar.ts
  - src/ai/tools/calendar.test.ts
  - src/config/prompt-builder.ts
  - src/config/prompt-builder.test.ts
  - src/ai/tools.ts
  - package.json
autonomous: true
requirements: [BOOK-01, BOOK-02, BOOK-03]

must_haves:
  truths:
    - "Agent can check real-time Google Calendar availability during a live call"
    - "Agent books an appointment on Google Calendar with caller name and contact info"
    - "Agent confirms booking details back to the caller before the event is inserted"
    - "Double-booking is prevented by re-checking availability before insert"
    - "System prompt includes booking instructions when Google Calendar is configured"
  artifacts:
    - path: "src/calendar/client.ts"
      provides: "Google Calendar API wrapper with JWT auth, freebusy query, and event insert"
      exports: ["createCalendarClient", "checkAvailability", "bookAppointment"]
    - path: "src/calendar/client.test.ts"
      provides: "Tests for calendar client with mocked googleapis"
    - path: "src/ai/tools/calendar.ts"
      provides: "check_availability and book_appointment tool definitions using tool() from @openai/agents"
      exports: ["checkAvailabilityTool", "bookAppointmentTool"]
    - path: "src/ai/tools/calendar.test.ts"
      provides: "Tests for calendar tools with mocked calendar client"
    - path: "src/config/prompt-builder.ts"
      provides: "Updated system prompt with booking instructions section"
  key_links:
    - from: "src/ai/tools/calendar.ts"
      to: "src/calendar/client.ts"
      via: "import createCalendarClient, checkAvailability, bookAppointment"
      pattern: "import.*from.*calendar/client"
    - from: "src/ai/tools/calendar.ts"
      to: "context.state.context"
      via: "CallContext for googleCredentials, googleCalendarId, timezone"
      pattern: "context!.state.context"
    - from: "src/ai/tools.ts"
      to: "src/ai/tools/calendar.ts"
      via: "import and include in agentTools array"
      pattern: "import.*calendar"
    - from: "src/config/prompt-builder.ts"
      to: "TenantConfig.googleCalendarId"
      via: "conditional booking instructions block"
      pattern: "googleCalendarId"
---

<objective>
Add Google Calendar integration with check_availability and book_appointment tools, and update the system prompt with booking instructions.

Purpose: This gives the agent the ability to check real-time calendar availability and book appointments during live calls. The two-tool pattern (check then book) enforces verbal confirmation with the caller before finalizing.

Output: Calendar client module, two new agent tools, updated prompt builder with booking instructions, updated tools array.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/3/3-CONTEXT.md
@.planning/phases/3/3-RESEARCH.md
@src/ai/tools.ts
@src/ai/realtime.ts
@src/config/prompt-builder.ts
@src/config/schema.ts

<interfaces>
<!-- Key types and contracts the executor needs. -->

From src/config/schema.ts (after Plan 3-01 updates):
```typescript
export type CallContext = {
  tenantId: string;
  callLogId: string;
  googleCalendarId: string | null;
  googleCredentials: unknown | null;
  timezone: string;
  callSid: string;
  streamSid: string;
  outcomeFlagsRef: { messageTaken: boolean; bookingMade: boolean };
};

export type TenantConfig = {
  // ... existing fields ...
  googleCalendarId: string | null;
  googleCredentials: unknown | null;
  timezone: string; // added in 3-01
  // ... relations ...
};
```

From src/ai/tools.ts:
```typescript
// Uses tool() from @openai/agents with Zod schemas
// Exports agentTools array consumed by createRealtimeAgent
export const agentTools: FunctionTool<any, any, any>[] = [takeMessageTool, endCallTool];
```

From src/ai/realtime.ts:
```typescript
export function createRealtimeAgent(config: TenantConfig) {
  const agent = new RealtimeAgent({
    name: config.agentName,
    instructions: buildSystemPrompt(config),
    voice: config.voiceId,
    tools: agentTools,
  });
  return agent;
}
```

From @openai/agents (verified in RESEARCH.md):
```typescript
// tool() execute signature: (input, context?) => Promise<unknown>
// context is RunContext<RealtimeContextData<CallContext>>
// Access tenant data: context!.state.context.googleCalendarId
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Google Calendar client and calendar tools with tests</name>
  <files>src/calendar/client.ts, src/calendar/client.test.ts, src/ai/tools/calendar.ts, src/ai/tools/calendar.test.ts, package.json</files>
  <behavior>
    - Test: createCalendarClient returns a calendar_v3.Calendar instance from service account credentials
    - Test: checkAvailability calls freebusy.query with correct calendarId, timeMin/timeMax for the date, and timezone
    - Test: checkAvailability returns busy slots array from freebusy response
    - Test: checkAvailability returns empty array when no busy periods
    - Test: bookAppointment re-checks availability before inserting
    - Test: bookAppointment returns { success: false } when slot has conflict on re-check
    - Test: bookAppointment inserts event and returns { success: true, eventId, htmlLink } when slot is free
    - Test: check_availability tool extracts credentials from context and calls checkAvailability
    - Test: check_availability tool returns error message when googleCalendarId is not configured
    - Test: book_appointment tool sets outcomeFlagsRef.bookingMade = true on success
    - Test: book_appointment tool returns error when slot is no longer available
  </behavior>
  <action>
1. Install Google Calendar dependencies:
   ```
   npm install googleapis google-auth-library
   ```

2. Create `src/calendar/client.ts` following RESEARCH.md Pattern 2 and Pattern 3:
   - Export `ServiceAccountCredentials` interface: `{ client_email: string; private_key: string; project_id: string }`
   - Export `createCalendarClient(credentials)`: Creates JWT auth with calendar scope, returns `google.calendar({ version: "v3", auth })`
   - Export `checkAvailability(calendar, calendarId, date, timezone, businessHours?)`: Calls `freebusy.query` with timeMin/timeMax for the given date. Returns the busy slots array. The date parameter is "YYYY-MM-DD" format. Construct timeMin as start of day and timeMax as end of day in the given timezone. Return `busySlots: Array<{start: string, end: string}>`.
   - Export `bookAppointment(calendar, calendarId, start, end, summary, description)`: Following RESEARCH.md Pattern 4, re-checks freebusy for the slot first. If conflicts exist, returns `{ success: false, reason: "Slot is no longer available" }`. Otherwise, calls `events.insert` and returns `{ success: true, eventId, htmlLink }`.

3. Create `src/calendar/client.test.ts`:
   - Mock `googleapis` and `google-auth-library` using vi.hoisted() pattern
   - Test all calendar client behaviors listed above
   - Use realistic mock responses matching Google Calendar API shapes

4. Create `src/ai/tools/calendar.ts`:
   - Import `tool` from `@openai/agents`, `z` from `zod`
   - Import `createCalendarClient`, `checkAvailability`, `bookAppointment` from `../../calendar/client.js`
   - Import prisma from `../../db/prisma.js` (not needed directly, but for future use)
   - Export `checkAvailabilityTool`: tool with name "check_availability", parameters `{ date: z.string().describe("Date to check in YYYY-MM-DD format") }`. Execute handler: get `googleCalendarId`, `googleCredentials`, `timezone` from `context!.state.context`. If googleCalendarId or googleCredentials are null, return an error string: "Calendar is not configured for this business." Cast googleCredentials to ServiceAccountCredentials. Call createCalendarClient, then checkAvailability. Return the busy slots as a string the agent can interpret (e.g., JSON stringified or a formatted message listing available times).
   - Export `bookAppointmentTool`: tool with name "book_appointment", parameters `{ date: z.string(), startTime: z.string().describe("Start time in HH:MM format"), callerName: z.string(), callerPhone: z.string(), reason: z.string().optional() }`. Execute handler: get context fields. Build start/end ISO strings (60-minute default duration per CONTEXT.md decision). Call createCalendarClient, then bookAppointment. On success, set `context!.state.context.outcomeFlagsRef.bookingMade = true`. Return success/failure message.

5. Create `src/ai/tools/calendar.test.ts`:
   - Mock `../../calendar/client.js` module
   - Create mock context objects matching the CallContext shape
   - Test tool execute handlers with the mocked calendar functions
   - Verify outcomeFlagsRef.bookingMade is set on successful booking

6. Run all tests to verify.
  </action>
  <verify>
    <automated>npx vitest run src/calendar/ src/ai/tools/calendar.test.ts --reporter=dot</automated>
  </verify>
  <done>Calendar client creates JWT-authed Google Calendar instances, checks freebusy, and inserts events with double-booking prevention. Calendar tools access tenant credentials via CallContext. All calendar tests pass.</done>
</task>

<task type="auto">
  <name>Task 2: Update prompt builder with booking instructions and wire tools into agent</name>
  <files>src/config/prompt-builder.ts, src/config/prompt-builder.test.ts, src/ai/tools.ts, src/ai/realtime.ts</files>
  <action>
1. Update `src/config/prompt-builder.ts`:
   - Add a `buildBookingBlock(config: TenantConfig)` function:
     - If `config.googleCalendarId` is null or empty, return empty string (no booking instructions)
     - Otherwise, return a block like:
       ```
       APPOINTMENT BOOKING:
       - You can check available appointment slots and book appointments for callers.
       - ALWAYS use the check_availability tool first to find open times before offering slots.
       - After the caller selects a time, CONFIRM the details verbally: repeat the date, time, and their name back to them.
       - Only call book_appointment AFTER the caller confirms the details are correct.
       - All appointments are 60 minutes long.
       - If no slots are available on the requested date, suggest checking another day.
       ```
   - Insert the booking block into the system prompt after the services block and before the guardrail section.

2. Update `src/config/prompt-builder.test.ts`:
   - Add test: buildSystemPrompt includes booking instructions when googleCalendarId is set
   - Add test: buildSystemPrompt does NOT include booking instructions when googleCalendarId is null
   - Add test: booking instructions include confirmation requirement (BOOK-03)

3. Update `src/ai/tools.ts`:
   - Import `checkAvailabilityTool` and `bookAppointmentTool` from `./tools/calendar.js`
   - Add both tools to the `agentTools` array export
   - Keep existing takeMessageTool and endCallTool

4. Update `src/ai/realtime.ts` if needed:
   - Verify that `agentTools` import picks up the new tools (it should, since the array is updated in tools.ts)
   - No other changes needed; the tools flow through the existing `createRealtimeAgent` function

5. Run full test suite.
  </action>
  <verify>
    <automated>npx tsc --noEmit && npx vitest run --reporter=dot</automated>
  </verify>
  <done>System prompt includes booking instructions when Calendar is configured and omits them when not. Booking instructions require verbal confirmation before finalizing (BOOK-03). agentTools array includes check_availability and book_appointment tools. All tests pass.</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes with zero errors
- `npx vitest run --reporter=dot` passes all tests
- `src/calendar/client.ts` exports createCalendarClient, checkAvailability, bookAppointment
- `src/ai/tools/calendar.ts` exports checkAvailabilityTool and bookAppointmentTool
- `src/ai/tools.ts` agentTools array includes all 4 tools (take_message, end_call, check_availability, book_appointment)
- `src/config/prompt-builder.ts` conditionally includes booking instructions
- Booking flow enforces check -> confirm -> book pattern via prompt instructions
</verification>

<success_criteria>
The agent has working Google Calendar tools: check_availability queries freebusy for open slots, book_appointment inserts events with double-booking prevention. The system prompt enforces verbal confirmation before booking (BOOK-03). Tools access tenant-specific Google credentials via CallContext. The prompt builder conditionally includes booking instructions only when Calendar is configured.
</success_criteria>

<output>
After completion, create `.planning/phases/3/3-02-SUMMARY.md`
</output>

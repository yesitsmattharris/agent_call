---
phase: 3-call-resolution
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - prisma/schema.prisma
  - src/config/schema.ts
  - src/ai/session.ts
  - src/telephony/media-stream.ts
  - src/ai/tools.ts
  - src/ai/call-logger.ts
  - src/ai/call-logger.test.ts
  - package.json
autonomous: true
requirements: [HIST-01, HIST-02, MSG-01, MSG-02]

must_haves:
  truths:
    - "Every call creates a CallLog record at call start with placeholder outcome"
    - "CallLog is updated at call end with final duration, outcome, and transcript"
    - "Transcript is extracted from RealtimeItem[] history as JSON array of {role, content}"
    - "Tool invocations (take_message, book_appointment) set outcome flags during the call"
    - "take_message tool writes a Message record to the database linked to the CallLog"
    - "Message model stores callerName, callbackNumber, reason, preferredTime"
  artifacts:
    - path: "prisma/schema.prisma"
      provides: "CallLog and Message models, timezone field on Tenant"
      contains: "model CallLog"
    - path: "src/ai/call-logger.ts"
      provides: "Call log persistence: create at start, update at end, transcript extraction"
      exports: ["createCallLog", "finalizeCallLog", "extractTranscript"]
    - path: "src/ai/call-logger.test.ts"
      provides: "Tests for call log persistence and transcript extraction"
    - path: "src/ai/tools.ts"
      provides: "Updated take_message with DB write, tool context access"
    - path: "src/telephony/media-stream.ts"
      provides: "Tool context passing, outcome tracking, call log persistence on cleanup"
  key_links:
    - from: "src/telephony/media-stream.ts"
      to: "src/ai/call-logger.ts"
      via: "createCallLog at start, finalizeCallLog in cleanup"
      pattern: "createCallLog|finalizeCallLog"
    - from: "src/ai/tools.ts"
      to: "prisma.message.create"
      via: "context.state.context for tenantId and callLogId"
      pattern: "prisma\\.message\\.create"
    - from: "src/telephony/media-stream.ts"
      to: "RealtimeSession context option"
      via: "context object passed to new RealtimeSession"
      pattern: "context:"
---

<objective>
Add CallLog and Message persistence, call outcome tracking, and transcript extraction to the voice server.

Purpose: This is the data foundation for Phase 3. Every call must be logged with duration, outcome, and transcript. Messages taken during calls must be persisted to the database. The tool context pattern must be wired so tools can access per-call tenant data.

Output: Prisma schema with CallLog and Message models, call-logger module for persistence, updated media-stream.ts with tool context and outcome tracking, updated take_message tool with DB writes.
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
@prisma/schema.prisma
@src/ai/session.ts
@src/ai/tools.ts
@src/ai/realtime.ts
@src/telephony/media-stream.ts
@src/config/schema.ts
@src/config/loader.ts
@src/db/prisma.ts

<interfaces>
<!-- Key types and contracts the executor needs. -->

From src/config/schema.ts:
```typescript
export type TenantConfig = z.infer<typeof tenantConfigSchema>;
// includes: id, email, businessName, googleCalendarId, googleCredentials, faqs, services, businessHours
```

From src/ai/session.ts:
```typescript
export interface CallSession {
  callSid: string;
  streamSid: string | null;
  from: string;
  to: string;
  startedAt: Date;
  messages: Array<{ role: string; content: string; timestamp: Date }>;
}
export class SessionManager { ... }
```

From src/ai/tools.ts:
```typescript
export const agentTools: FunctionTool<any, any, any>[] = [takeMessageTool, endCallTool];
```

From src/telephony/media-stream.ts:
```typescript
// RealtimeSession creation at line 181-184:
session = new RealtimeSession(agent, { transport, model: "gpt-realtime" });
// cleanup() at line 75-96: clears timers, closes session, removes from SessionManager
// agent_tool_end listener at line 102-119: handles end_call tool
// history_updated listener at line 123-134: logs transcripts to SessionManager
```

From @openai/agents (verified in RESEARCH.md):
```typescript
// RealtimeSession accepts context option:
new RealtimeSession(agent, { transport, model, context: T })
// Tool execute signature:
execute: async (input, context) => { /* context!.state.context has T */ }
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Schema updates, CallContext type, and call-logger module with tests</name>
  <files>prisma/schema.prisma, src/config/schema.ts, src/ai/call-logger.ts, src/ai/call-logger.test.ts</files>
  <behavior>
    - Test: createCallLog creates a CallLog record with tenantId, callSid, callerNumber, startedAt, outcome="in_progress"
    - Test: finalizeCallLog updates the record with durationSeconds, outcome, and transcript JSON
    - Test: extractTranscript converts RealtimeItem[] messages into [{role, content}] array
    - Test: extractTranscript skips function_call items and empty content
    - Test: extractTranscript handles input_audio.transcript and output_text.text content types
    - Test: determineOutcome returns "booking_made" when bookingMade flag is true
    - Test: determineOutcome returns "message_taken" when messageTaken flag is true
    - Test: determineOutcome returns "completed" when neither flag is set
  </behavior>
  <action>
1. Update `prisma/schema.prisma`:
   - Add `timezone` field to Tenant model: `timezone String @default("America/New_York")`
   - Add CallLog model exactly as specified in 3-RESEARCH.md Pattern 5 (id, tenantId, callSid @unique, callerNumber, startedAt, durationSeconds, outcome, transcript Json, createdAt, messages relation)
   - Add Message model exactly as specified in 3-RESEARCH.md (id, tenantId, callLogId optional, callerName, callbackNumber, reason, preferredTime optional, createdAt, indexes)
   - Add `callLogs CallLog[]` and `messages Message[]` relations to Tenant model
   - Run `npx prisma generate` to regenerate the client
   - Run `npx prisma db push` to apply schema changes to the database

2. Update `src/config/schema.ts`:
   - Add `timezone` field to `tenantConfigSchema`: `timezone: z.string()`
   - Define and export a `CallContext` type:
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
     ```
   The `outcomeFlagsRef` is a mutable object reference shared between tools and the cleanup handler. When a tool fires (take_message or book_appointment), it sets the corresponding flag. The cleanup handler reads the flags to determine the final outcome.

3. Create `src/ai/call-logger.ts`:
   - Import prisma from `../db/prisma.js`
   - `createCallLog(tenantId, callSid, callerNumber)`: Creates a CallLog with startedAt=now, durationSeconds=0, outcome="in_progress", transcript=[]
   - `finalizeCallLog(callLogId, durationSeconds, outcome, transcript)`: Updates the record with final values
   - `extractTranscript(history: unknown[])`: Iterates RealtimeItem[] array. For items with type="message" and content array, extracts text from `c.text ?? c.transcript` for each content item. Returns `Array<{role: string, content: string}>`. Skips items without meaningful text content.
   - `determineOutcome(flags: {messageTaken: boolean, bookingMade: boolean})`: Returns "booking_made" if bookingMade, "message_taken" if messageTaken, "completed" otherwise.

4. Create `src/ai/call-logger.test.ts`:
   - Mock `../db/prisma.js` using vi.hoisted() pattern (per STATE.md gotcha)
   - Write all behavior tests listed above
   - For extractTranscript tests, use fixture arrays matching RealtimeItem shape from RESEARCH.md Pattern 6
   - For createCallLog/finalizeCallLog, assert prisma.callLog.create/update are called with correct data

5. Run `npx vitest run src/ai/call-logger.test.ts` to verify tests pass.
  </action>
  <verify>
    <automated>npx vitest run src/ai/call-logger.test.ts --reporter=dot</automated>
  </verify>
  <done>CallLog and Message models in Prisma schema. CallContext type exported from schema.ts. call-logger module with createCallLog, finalizeCallLog, extractTranscript, determineOutcome. All tests pass.</done>
</task>

<task type="auto">
  <name>Task 2: Wire tool context, outcome tracking, and call persistence into media-stream and tools</name>
  <files>src/telephony/media-stream.ts, src/ai/tools.ts, src/ai/realtime.ts</files>
  <action>
1. Update `src/ai/tools.ts`:
   - Update `takeMessageTool` execute handler to write to database via context:
     ```typescript
     execute: async (input, context) => {
       const { tenantId, callLogId, outcomeFlagsRef } = context!.state.context;
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
       outcomeFlagsRef.messageTaken = true;
       return `Message recorded for ${input.callerName}. We will call back at ${input.callbackNumber}.`;
     },
     ```
   - Import prisma from `../db/prisma.js`

2. Update `src/telephony/media-stream.ts`:
   - Import `createCallLog`, `finalizeCallLog`, `extractTranscript`, `determineOutcome` from `../ai/call-logger.js`
   - Import `CallContext` from `../config/schema.js`
   - Add module-level variables inside the socket handler:
     - `let callLogId: string | null = null;`
     - `const outcomeFlags = { messageTaken: false, bookingMade: false };`
     - `let lastHistory: unknown[] = [];`
   - In the `start` event handler, after creating the SessionManager session:
     - Create the CallLog: `const callLog = await createCallLog(config.id, callSid, from);`
     - Store: `callLogId = callLog.id;`
   - When creating `RealtimeSession`, pass context:
     ```typescript
     session = new RealtimeSession(agent, {
       transport,
       model: "gpt-realtime",
       context: {
         tenantId: config.id,
         callLogId: callLogId!,
         googleCalendarId: config.googleCalendarId,
         googleCredentials: config.googleCredentials,
         timezone: config.timezone ?? "America/New_York",
         callSid: callSid!,
         streamSid: streamSid!,
         outcomeFlagsRef: outcomeFlags,
       } satisfies CallContext,
     });
     ```
   - Update the `history_updated` listener to capture the full history snapshot:
     ```typescript
     sess.on("history_updated", (history) => {
       lastHistory = history; // Capture latest snapshot for cleanup
     });
     ```
     Remove the per-item logMessage calls (transcript is now persisted on cleanup, not during the call).
   - In `cleanup()`, before removing the session, persist the call log:
     ```typescript
     if (callLogId && streamSid) {
       const callSession = sessionManager.getSession(streamSid);
       if (callSession) {
         const durationSec = Math.round((Date.now() - callSession.startedAt.getTime()) / 1000);
         const transcript = extractTranscript(lastHistory);
         const outcome = determineOutcome(outcomeFlags);
         await finalizeCallLog(callLogId, durationSec, outcome, transcript);
       }
     }
     ```
     Make `cleanup()` async. Wrap the finalizeCallLog call in try/catch so cleanup doesn't fail if DB write fails.

3. Update `src/ai/realtime.ts`:
   - The `createRealtimeAgent` function stays the same. No changes needed here since tools are already passed via `agentTools` array and context flows through the session.

4. Run `npx tsc --noEmit` to verify type correctness.
  </action>
  <verify>
    <automated>npx tsc --noEmit && npx vitest run --reporter=dot</automated>
  </verify>
  <done>media-stream.ts creates CallLog at call start, passes CallContext to RealtimeSession, captures history snapshots, and persists final call log with outcome and transcript on cleanup. take_message tool writes Messages to DB via context. All existing tests still pass.</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes with zero errors
- `npx vitest run --reporter=dot` passes all tests including new call-logger tests
- `prisma/schema.prisma` contains CallLog, Message models and timezone field on Tenant
- `src/ai/call-logger.ts` exports createCallLog, finalizeCallLog, extractTranscript, determineOutcome
- `src/ai/tools.ts` take_message writes to prisma.message via context
- `src/telephony/media-stream.ts` passes CallContext to RealtimeSession and persists call log on cleanup
</verification>

<success_criteria>
The voice server creates a CallLog record at the start of every call, tracks which tools fire during the call, captures the final conversation history, and persists the completed call log with duration, outcome, and transcript when the call ends. The take_message tool writes structured messages to the database linked to the active call log.
</success_criteria>

<output>
After completion, create `.planning/phases/3/3-01-SUMMARY.md`
</output>

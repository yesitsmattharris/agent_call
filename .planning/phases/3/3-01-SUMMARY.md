---
phase: 3-call-resolution
plan: 01
subsystem: voice-server
tags: [call-logging, persistence, prisma, tools, transcript]
dependency_graph:
  requires: []
  provides: [CallLog-model, Message-model, CallContext-type, call-logger-module]
  affects: [media-stream, tools, schema]
tech_stack:
  added: []
  patterns: [tool-context-via-RealtimeSession, outcome-flags-ref, transcript-extraction]
key_files:
  created:
    - src/ai/call-logger.ts
    - src/ai/call-logger.test.ts
  modified:
    - prisma/schema.prisma
    - src/config/schema.ts
    - src/ai/tools.ts
    - src/telephony/media-stream.ts
    - src/config/prompt-builder.test.ts
decisions:
  - RunContext.context (not .state.context) is the correct accessor for tool context in @openai/agents realtime
metrics:
  duration: 4m18s
  completed: 2026-03-21T22:27:38Z
  tasks_completed: 2
  tasks_total: 2
  test_count: 9
  test_pass: 9
---

# Phase 3 Plan 01: Call Log Persistence + Outcome Tracking Summary

CallLog and Message Prisma models with call-logger module for create/finalize/transcript-extraction, wired into media-stream cleanup and take_message tool via RealtimeSession context.

## What Was Built

1. **Prisma schema additions:** CallLog model (id, tenantId, callSid unique, callerNumber, startedAt, durationSeconds, outcome, transcript Json, with index on tenantId+startedAt), Message model (id, tenantId, callLogId optional, callerName, callbackNumber, reason, preferredTime, with index on tenantId+createdAt), timezone field on Tenant with default "America/New_York".

2. **CallContext type** in `src/config/schema.ts`: Shared context type passed through RealtimeSession to tools, carrying tenantId, callLogId, googleCalendarId, googleCredentials, timezone, callSid, streamSid, and a mutable outcomeFlagsRef.

3. **call-logger module** (`src/ai/call-logger.ts`): Four functions: `createCallLog` (creates placeholder record at call start), `finalizeCallLog` (updates with duration/outcome/transcript at call end), `extractTranscript` (converts RealtimeItem[] history to [{role, content}] array), `determineOutcome` (reads outcome flags to return booking_made/message_taken/completed).

4. **Tool context wiring:** `take_message` tool now writes Message records to the database via `prisma.message.create`, accessing tenantId and callLogId from `RunContext.context`. Sets `outcomeFlagsRef.messageTaken = true` for outcome tracking.

5. **Media stream integration:** Creates CallLog at call start (start event handler), passes CallContext to RealtimeSession, captures history_updated snapshots into `lastHistory`, and persists finalized call log on cleanup with try/catch for DB resilience.

## Test Results

9 tests in `src/ai/call-logger.test.ts`, all passing:
- createCallLog creates record with correct fields and in_progress outcome
- finalizeCallLog updates record with duration, outcome, transcript
- extractTranscript converts message items, skips function_call items, skips empty content, handles input_audio.transcript and output_text.text
- determineOutcome returns correct outcome for each flag combination

Full suite: 24 tests across 3 files, all passing.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] RunContext accessor is .context not .state.context**
- **Found during:** Task 2
- **Issue:** The plan (based on research) specified `context!.state.context` as the accessor for tool context in RealtimeSession. The actual SDK type is `RunContext<RealtimeContextData<TContext>>` where `.context` directly contains the merged TContext + history.
- **Fix:** Used `context!.context as unknown as CallContext` instead of `context!.state.context`
- **Files modified:** src/ai/tools.ts
- **Commit:** f621f4c

**2. [Rule 3 - Blocking] Missing timezone in test fixture**
- **Found during:** Task 2 (tsc --noEmit)
- **Issue:** Adding timezone to tenantConfigSchema made the existing prompt-builder test fixture incomplete
- **Fix:** Added `timezone: "America/New_York"` to baseTenant in prompt-builder.test.ts
- **Files modified:** src/config/prompt-builder.test.ts
- **Commit:** f621f4c

**3. [Rule 3 - Blocking] Async await in sync event handler**
- **Found during:** Task 2 (tsc --noEmit)
- **Issue:** The transport.on("*") callback was synchronous but createCallLog uses await
- **Fix:** Made the callback async
- **Files modified:** src/telephony/media-stream.ts
- **Commit:** f621f4c

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 3393de9 | feat(3-01): add CallLog/Message models, CallContext type, and call-logger module |
| 2 | f621f4c | feat(3-01): wire tool context, outcome tracking, and call persistence |

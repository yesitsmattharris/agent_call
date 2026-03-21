---
phase: 3-call-resolution
plan: 02
subsystem: voice-server
tags: [google-calendar, booking, availability, tools, prompt-builder]
dependency_graph:
  requires: [CallContext-type, agentTools-array]
  provides: [calendar-client, check-availability-tool, book-appointment-tool, booking-prompt-block]
  affects: [tools, prompt-builder, realtime-agent]
tech_stack:
  added: [googleapis, google-auth-library]
  patterns: [service-account-jwt, freebusy-query, double-booking-prevention, conditional-prompt-block]
key_files:
  created:
    - src/calendar/client.ts
    - src/calendar/client.test.ts
    - src/ai/tools/calendar.ts
    - src/ai/tools/calendar.test.ts
  modified:
    - src/config/prompt-builder.ts
    - src/config/prompt-builder.test.ts
    - src/ai/tools.ts
    - package.json
decisions:
  - vi.clearAllMocks does not reset mockResolvedValue in vitest; use mockReset per-mock for proper cleanup
  - FunctionTool.invoke(runContext, jsonInput) is the SDK call pattern; execute is not directly accessible on tool objects
  - Extract execute logic into exported functions for direct unit testing instead of fighting SDK invoke wrapper
metrics:
  duration: 9m17s
  completed: 2026-03-21T22:39:33Z
  tasks_completed: 2
  tasks_total: 2
  test_count: 42
  test_pass: 42
---

# Phase 3 Plan 02: Google Calendar Integration Summary

Google Calendar client with JWT service account auth, freebusy availability checks, and event insertion with double-booking prevention, exposed as check_availability and book_appointment tools wired into the agent.

## What Was Built

1. **Calendar client module** (`src/calendar/client.ts`): Three exports: `createCalendarClient` (JWT auth with calendar scope, returns calendar_v3.Calendar), `checkAvailability` (freebusy.query for a given date and timezone, returns busy slots array), `bookAppointment` (re-checks freebusy before events.insert, returns success/failure with double-booking prevention).

2. **Calendar tools** (`src/ai/tools/calendar.ts`): Two tool definitions using `tool()` from `@openai/agents`. `check_availability` takes a date, reads googleCalendarId/googleCredentials/timezone from CallContext, queries freebusy, and returns a string describing busy times or full availability. `book_appointment` takes date, startTime, callerName, callerPhone, reason; constructs 60-minute event, calls bookAppointment with double-booking prevention, sets outcomeFlagsRef.bookingMade on success.

3. **Prompt builder booking block** (`src/config/prompt-builder.ts`): New `buildBookingBlock` function conditionally adds APPOINTMENT BOOKING instructions when `config.googleCalendarId` is set. Instructions enforce the check-confirm-book pattern (BOOK-03): always check_availability first, verbally confirm details with caller, only then call book_appointment.

4. **Tools array update** (`src/ai/tools.ts`): agentTools now includes all 4 tools: take_message, end_call, check_availability, book_appointment.

## Test Results

42 tests across 5 files, all passing:
- `src/calendar/client.test.ts`: 7 tests (JWT auth, freebusy query, event insert, double-booking prevention)
- `src/ai/tools/calendar.test.ts`: 8 tests (context extraction, null config handling, outcome flags, time construction)
- `src/config/prompt-builder.test.ts`: 14 tests (including 3 new booking instruction tests)
- `src/ai/call-logger.test.ts`: 9 tests (existing, unchanged)
- `src/ai/tools.test.ts`: 4 tests (existing, unchanged)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] vi.clearAllMocks does not reset mockResolvedValue**
- **Found during:** Task 1 (test debugging)
- **Issue:** Tests for null-config error path were seeing stale mock return values from prior tests because `vi.clearAllMocks()` only clears calls/instances/results, not implementation (mockResolvedValue/mockReturnValue).
- **Fix:** Used `mockReset()` per-mock in `beforeEach` instead of `vi.clearAllMocks()`
- **Files modified:** src/ai/tools/calendar.test.ts

**2. [Rule 1 - Bug] Nullish coalescing operator (??) does not preserve explicit null**
- **Found during:** Task 1 (test debugging)
- **Issue:** Test helper `makeContext({ googleCalendarId: null })` used `??` which treats null as nullish and falls through to the default value "cal-123", so the null check was never tested.
- **Fix:** Used `"googleCalendarId" in overrides` check instead of `??` for nullable fields
- **Files modified:** src/ai/tools/calendar.test.ts

**3. [Rule 3 - Blocking] FunctionTool.execute not directly callable**
- **Found during:** Task 1 (test development)
- **Issue:** The `tool()` SDK function returns a `FunctionTool` object where `execute` is captured in a closure, only accessible via `invoke(runContext, jsonStringInput)`. Direct `.execute()` calls fail.
- **Fix:** Extracted execute logic into exported `executeCheckAvailability` and `executeBookAppointment` functions, tested directly. Tool objects wrap these functions.
- **Files modified:** src/ai/tools/calendar.ts, src/ai/tools/calendar.test.ts

**4. [Rule 3 - Blocking] TypeScript type mismatch on mock Calendar object**
- **Found during:** Task 2 (tsc --noEmit)
- **Issue:** Partial mock Calendar object missing required properties (context, acl, calendarList, etc.)
- **Fix:** Added `as any` cast on mock objects passed to functions expecting full calendar_v3.Calendar type
- **Files modified:** src/calendar/client.test.ts

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 185befb | feat(3-02): add Google Calendar client and calendar tools |
| 2 | 7f60242 | feat(3-02): add booking instructions to prompt builder and wire calendar tools |

## Self-Check: PASSED

- All 4 created files exist
- All 4 modified files updated correctly
- Commits 185befb and 7f60242 present in git log
- Exports verified: createCalendarClient, checkAvailability, bookAppointment, checkAvailabilityTool, bookAppointmentTool
- agentTools array contains all 4 tools
- 42/42 tests passing, tsc --noEmit clean

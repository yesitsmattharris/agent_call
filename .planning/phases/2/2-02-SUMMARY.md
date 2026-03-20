---
phase: 2-tenant-identity
plan: 02
subsystem: voice-server
tags: [prisma, tenant-config, prompt-builder, per-call-lookup]
dependency_graph:
  requires: [prisma-schema, prisma-client, vitest-framework, test-scaffolds]
  provides: [loadTenantConfig, buildSystemPrompt-v2, isCurrentlyOpen, per-call-config]
  affects: [src/config/loader.ts, src/config/prompt-builder.ts, src/telephony/webhooks.ts, src/telephony/media-stream.ts, src/ai/realtime.ts, src/server.ts]
tech_stack:
  added: []
  patterns: [per-call-db-lookup, pendingConfigs-map, transport-star-event-listener, vi-hoisted-mock]
key_files:
  created: []
  modified:
    - src/config/loader.ts
    - src/config/prompt-builder.ts
    - src/config/loader.test.ts
    - src/config/prompt-builder.test.ts
    - src/ai/realtime.ts
    - src/telephony/webhooks.ts
    - src/telephony/media-stream.ts
    - src/server.ts
decisions:
  - "Used transport.on('*') for Twilio message events instead of session.on('transport_event') since transport is created before session in new per-call architecture"
  - "Session and agent creation deferred to Twilio start event handler, transport created at WebSocket connect time to capture all events"
  - "Used vi.hoisted() for mock function declaration to work around vitest mock hoisting behavior"
metrics:
  duration: 457s
  completed: 2026-03-20T20:45:35Z
  tasks_completed: 2
  tasks_total: 2
---

# Phase 2 Plan 02: Voice Server DB Integration Summary

Per-call tenant config loading from PostgreSQL via loadTenantConfig(twilioNumber), hours-aware prompt builder with FAQ/services injection and hallucination guardrail, 15 passing unit tests.

## Tasks Completed

### Task 1: Rewrite loader.ts and prompt-builder.ts for tenant-aware config (TDD)
**Commits:** 26dd0bd (RED), 61b54fa (GREEN)

- Rewrote `src/config/loader.ts`: replaced `loadBusinessConfig()` (JSON file reader) with async `loadTenantConfig(twilioNumber)` that queries `prisma.tenant.findUnique` with faqs/services/businessHours includes
- Rewrote `src/config/prompt-builder.ts`: accepts TenantConfig, added `isCurrentlyOpen(hours, now?)`, `buildFaqBlock`, `buildServicesBlock`, hours-aware greeting with after-hours messaging, hallucination guardrail
- Implemented and un-skipped 15 tests across loader.test.ts and prompt-builder.test.ts
- Used `vi.hoisted()` to solve vitest mock hoisting issue with `vi.mock` factory

### Task 2: Wire voice server to use per-call tenant config
**Commits:** 71c6649, e880641

- Updated `src/ai/realtime.ts`: changed `BusinessConfig` to `TenantConfig`
- Updated `src/telephony/webhooks.ts`: resolves tenant from `To` number via `loadTenantConfig(To)`, stores in `pendingConfigs` Map by CallSid, error handling returns TwiML "sorry" for unconfigured numbers
- Updated `src/telephony/media-stream.ts`: removed config parameter, retrieves config from `pendingConfigs` in start event handler, defers agent/session creation to after config lookup, uses `transport.on("*")` for Twilio events
- Updated `src/server.ts`: removed `loadBusinessConfig()` import and startup call, `registerMediaStreamRoute(app)` takes no config param

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] vitest mock hoisting requires vi.hoisted()**
- **Found during:** Task 1, test implementation
- **Issue:** `vi.mock` factory is hoisted above variable declarations, causing `mockFindUnique` to be accessed before initialization
- **Fix:** Used `vi.hoisted()` to declare mock function in a hoisting-safe way
- **Files modified:** src/config/loader.test.ts
- **Commit:** 61b54fa

**2. [Rule 1 - Bug] Transport event listener used wrong event name**
- **Found during:** Task 2, post-implementation review
- **Issue:** Used `transport.on("event", ...)` but TwilioRealtimeTransportLayer emits on `"*"` handler with `{ type: "twilio_message", message: data }` structure
- **Fix:** Changed to `transport.on("*", ...)` with proper type filtering
- **Files modified:** src/telephony/media-stream.ts
- **Commit:** e880641

**3. [Rule 3 - Blocking] Accidental git amend picked up staged admin/ directory**
- **Found during:** Task 2, commit phase
- **Issue:** `git commit --amend` picked up previously staged admin/ files from a concurrent session, creating a bad commit
- **Fix:** Soft-reset to correct commit, unstaged admin/ files, created clean separate commit
- **No code impact:** Git history restored to correct state

## Verification Results

- `npx tsc --noEmit`: PASS (zero errors)
- `npx vitest run --reporter=dot`: PASS (2 test files, 15 tests, 0 failures)
- `src/server.ts` does NOT import `loadBusinessConfig`: VERIFIED
- `src/telephony/webhooks.ts` calls `loadTenantConfig(To)`: VERIFIED
- `src/config/prompt-builder.ts` exports `isCurrentlyOpen`: VERIFIED
- No module-level config caching: VERIFIED

## Self-Check: PASSED

All 8 modified files verified on disk. All 4 commits (26dd0bd, 61b54fa, 71c6649, e880641) verified in git log.

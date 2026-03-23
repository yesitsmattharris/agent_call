# Project State: Agent Call

*This file is the persistent memory of the project. Update it after every session.*

---

## Project Reference

**Core value:** When a customer calls a business, an AI agent answers and handles the call naturally, either resolving the inquiry, booking an appointment, or taking a message.

**Differentiator:** Config-driven plain-English agent setup (no flow builder). SMB owners configure via admin UI; the LLM interprets business context rather than following hardcoded decision trees.

**Stack:** Node.js 22 + TypeScript + Fastify 5 + `@vapi-ai/server-sdk` + Vapi (voice/telephony) / Next.js 16.2 App Router (admin) / PostgreSQL via Supabase / Prisma 7 / Render (voice server host) / Vercel (admin host)

---

## Current Position

**Current phase:** Phase 3 - Call Resolution + Visibility (Vapi migration complete)
**Current plan:** 3-02 complete, Vapi migration complete
**Status:** Plans 3-01, 3-02, 3-03 complete; Twilio-to-Vapi migration complete
**Progress:** Phases 1-2 complete, Phase 3 in progress (22/22 requirements delivered), telephony migrated to Vapi

```
[====================] 100%
Phase 1: Working Call      [COMPLETE]
Phase 2: Tenant Identity   [COMPLETE]
Phase 3: Call Resolution   [In Progress - 3/3 plans done (pending verification)]
```

---

## Performance Metrics

| Metric | Target | Actual |
|--------|--------|--------|
| Phases complete | 3 | 2 |
| Requirements delivered | 22 | 20 |
| Calls handled end-to-end | 1+ | 1+ |

---

## Accumulated Context

### Key Decisions Made

| Decision | Rationale |
|----------|-----------|
| Vapi-managed agent with transient assistant config per call | No persistent assistant IDs; config built dynamically from tenant settings on each assistant-request |
| Stateless server with per-request tenant lookup | No in-memory session state except outcome flags; simplifies horizontal scaling |
| `assistant-request` webhook for dynamic multi-tenant config | Vapi calls our server for assistant config; no hardcoded assistant IDs |
| Fastify over Express | Clean plugin system; `@fastify/websocket` integrates well for future needs |
| Transfers deferred to v2 | Simplifies Phase 1 architecture; no conference-from-start requirement; validate core value first |
| Google Calendar service account for v1 | Avoids per-tenant OAuth 2.0 flow for demo stage; validate calendar friction with first customer before building full OAuth |
| Deploy to Render from day one | Stable hosting required for Vapi webhook callbacks; ngrok unreliable for production webhooks |
| PostgreSQL via Supabase (free tier) | Covers demo scale; Prisma schema doubles as documentation |
| `gpt-realtime` model slug (not deprecated `gpt-4o-realtime-preview`) | SDK default, current production model per OpenAI docs |
| `tool()` from `@openai/agents` with Zod schemas | Verified SDK API; tools use `tool()` helper with `execute` handlers |
| Render over Railway for voice server hosting | User did not have Railway account; Render free tier works equivalently |
| PrismaPg PoolConfig object over pg.Pool instance | Avoids @types/pg version conflict between devDependency and @prisma/adapter-pg bundled types |
| Prisma 7 datasource block: provider only, no url/directUrl | Prisma 7 moved connection config to prisma.config.ts; url/directUrl in schema.prisma is an error |
| prisma.config.ts uses process.env fallback, not Prisma env() | env() throws if var is unset, breaking prisma generate in CI/Vercel postinstall without DIRECT_URL |
| vi.hoisted() for vitest mock declarations | vi.mock factory is hoisted above variable declarations; vi.hoisted() ensures mock fns are available during hoisting |
| Separate delete/save forms to avoid nested HTML forms | Nested forms are invalid HTML; delete form placed as sibling after save form |
| Controlled state for business hours grid | Closed checkbox toggles disable and clear time inputs; submitted values reflect visual state |
| Dev-only password login for local testing | Magic link requires email delivery; password toggle hidden behind NODE_ENV check |
| RunContext.context for tool context (not .state.context) | Verified from SDK types: RunContext<RealtimeContextData<T>> has .context which merges T + history |
| Create CallLog at call start, finalize on cleanup | Tools need callLogId mid-call; placeholder record created on start event, updated with duration/outcome/transcript on cleanup |
| Mutable outcomeFlagsRef shared between tools and cleanup | Simple boolean flags object passed by reference via CallContext; tools set flags, cleanup reads them to determine outcome |
| Admin Prisma schema must stay synced with voice server schema | Both apps share the same database; models added in voice server (CallLog, Message) must be replicated in admin schema for Prisma client generation |
| vi.clearAllMocks vs mockReset for vitest | clearAllMocks does NOT reset mockResolvedValue/mockReturnValue; use mockReset() per-mock when tests need clean implementation state |
| Extract tool execute logic into exported functions for testing | FunctionTool.invoke wraps execute in closure; export bare functions for direct unit testing |

### Critical Implementation Notes

- **Outcome flags Map:** `outcomeFlagsMap` in vapi-webhook.ts tracks per-call outcome (messageTaken, bookingMade) between tool-calls and end-of-call-report events. Cleaned up on end-of-call-report.
- **Vapi handles barge-in, silence detection, and call ending natively.** No custom implementation needed. Configure via assistant config (silenceTimeoutSeconds, maxDurationSeconds).
- **Double-booking prevention:** Re-check Google Calendar availability immediately before `events.insert` within the same tool call.
- **Google Calendar API:** Use `freebusy.query` for availability (fast) not `events.list` (slow).
- **vitest mock hoisting:** Use `vi.hoisted()` to declare mock functions that are referenced inside `vi.mock()` factory functions. The factory is hoisted above all imports.
- **CallLog lifecycle:** Created at call start (start event) with outcome="in_progress", finalized in cleanup() with actual duration, outcome, and transcript. DB errors in cleanup are caught and logged but don't prevent session teardown.
- **Admin Prisma schema sync:** The admin app has its own `admin/prisma/schema.prisma` with output to `admin/app/generated/prisma`. When adding models to the voice server schema, the admin schema must be updated too and `npx prisma generate` re-run in the admin directory.
- **vitest mockReset vs clearAllMocks:** `vi.clearAllMocks()` does NOT clear `mockResolvedValue`/`mockReturnValue` implementation. Use `mockFn.mockReset()` per-mock when tests need a clean slate between test cases.
- **Nullish coalescing (??) with intentional null:** `null ?? "default"` yields `"default"`. When test helpers need to preserve explicit `null`, use `"key" in overrides ? overrides.key : default` instead.

### Research Flags

- **Phase 3 (Booking):** Google Calendar service account setup, `freebusy` API usage, and refresh token lifecycle in multi-tenant context may warrant a targeted research spike before planning.

### Blockers

None currently.

### Open Questions

- Service account calendar sharing friction: does requiring the business to share their calendar with a service account email create unacceptable onboarding friction?
- VAD sensitivity tuning: background noise thresholds for OpenAI Realtime API are not well-documented; budget empirical tuning time in Phase 1.

---

## Session Continuity

### Last Session

**Date:** 2026-03-23
**Completed:** Vapi migration (Tasks 1-9). Replaced Twilio Media Streams + OpenAI Realtime with Vapi webhook-based architecture. Updated Prisma schema, config types, call logger, tools, webhook handler, server entry point, dependencies, environment config, and project docs.
**Left off:** Vapi migration complete, pending E2E verification

### Next Session Should

1. Deploy to Render with Vapi environment variables configured
2. Configure Vapi phone number to point webhook at deployed server
3. Run end-to-end test call to verify full flow

---

## Todos

- [x] Migrate from Twilio to Vapi (`.planning/todos/migrate-twilio-to-vapi.md`)

---

*State initialized: 2026-03-19*
*Last updated: 2026-03-23 after completing Vapi migration*

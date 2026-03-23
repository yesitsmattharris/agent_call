# Project State: Agent Call

*This file is the persistent memory of the project. Update it after every session.*

---

## Project Reference

**Core value:** When a customer calls a business, an AI agent answers and handles the call naturally, either resolving the inquiry, booking an appointment, or taking a message.

**Differentiator:** Config-driven plain-English agent setup (no flow builder). SMB owners configure via admin UI; the LLM interprets business context rather than following hardcoded decision trees.

**Stack:** Node.js 22 + TypeScript + Fastify 5 + `@openai/agents` + `@openai/agents-extensions` 0.7.2 (voice server) / Next.js 16.2 App Router (admin) / PostgreSQL via Supabase / Prisma 7 / Railway or Render (voice server host) / Vercel (admin host)

---

## Current Position

**Current phase:** v1 Complete
**Status:** All 3 phases complete, all 22 requirements delivered and verified
**Progress:** v1 milestone closed 2026-03-22

```
[====================] 100%
Phase 1: Working Call      [COMPLETE - 2026-03-20]
Phase 2: Tenant Identity   [COMPLETE - 2026-03-21]
Phase 3: Call Resolution   [COMPLETE - 2026-03-22]
```

---

## Performance Metrics

| Metric | Target | Actual |
|--------|--------|--------|
| Phases complete | 3 | 3 |
| Requirements delivered | 22 | 22 |
| Calls handled end-to-end | 1+ | 1+ |

---

## Accumulated Context

### Key Decisions Made

| Decision | Rationale |
|----------|-----------|
| Template literal TwiML over Twilio VoiceResponse builder | Simpler, fewer deps, sufficient for Connect > Stream use case |
| Twilio signature validation skipped in dev when auth token unset | Dev convenience; logged as warning so it's visible |
| Dual WebSocket bridge (Twilio Media Streams <-> Fastify <-> OpenAI Realtime) | Sub-400ms latency; the chained STT+LLM+TTS pipeline hits 1200-2000ms which breaks conversational feel |
| `@openai/agents` + `@openai/agents-extensions` with TwilioRealtimeTransportLayer | Handles codec bridging, interrupt handling, and tool dispatch; avoids significant custom work |
| Fastify over Express | Twilio reference implementations use Fastify; `@fastify/websocket` integrates cleanly |
| Transfers deferred to v2 | Simplifies Phase 1 architecture; no conference-from-start requirement; validate core value first |
| Google Calendar service account for v1 | Avoids per-tenant OAuth 2.0 flow for demo stage; validate calendar friction with first customer before building full OAuth |
| Deploy to Railway/Render from day one | ngrok silently drops Twilio Media Streams packets in some configurations; real WSS required for any external testing |
| PostgreSQL via Supabase (free tier) | Covers demo scale; Prisma schema doubles as documentation |
| `gpt-realtime` model slug (not deprecated `gpt-4o-realtime-preview`) | SDK default, current production model per OpenAI docs |
| `tool()` from `@openai/agents` with Zod schemas | Verified SDK API; tools use `tool()` helper with `execute` handlers |
| TwilioRealtimeTransportLayer handles barge-in automatically | Verified in SDK; uses mark events for audio truncation, no manual truncate+clear needed |
| Render over Railway for voice server hosting | User did not have Railway account; Render free tier works equivalently |
| Explicit greeting trigger via sendMessage after connect | OpenAI Realtime does not auto-generate a greeting; must send a prompt to trigger it |
| PrismaPg PoolConfig object over pg.Pool instance | Avoids @types/pg version conflict between devDependency and @prisma/adapter-pg bundled types |
| Prisma 7 datasource block: provider only, no url/directUrl | Prisma 7 moved connection config to prisma.config.ts; url/directUrl in schema.prisma is an error |
| prisma.config.ts uses process.env fallback, not Prisma env() | env() throws if var is unset, breaking prisma generate in CI/Vercel postinstall without DIRECT_URL |
| transport.on("*") for Twilio events in media-stream | TwilioRealtimeTransportLayer emits on "*" handler, not "event"; session.on("transport_event") requires session to exist first |
| Defer session/agent creation to Twilio start event | Per-call config requires callSid from start event to look up tenant; transport created at connect time, session after start |
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
| Re-emit start event after connect() for transport streamSid | Transport registers listener in connect(), but start event fires before connect() is called; socket.emit replay is the least invasive fix |
| TwiML `<Parameter>` elements for From/To | Twilio `<Stream>` does not auto-forward webhook fields; explicit params needed for caller info in media stream |

### Critical Implementation Notes

- **Barge-in (INFRA-02):** Handled automatically by `TwilioRealtimeTransportLayer` via mark events. No manual `truncate`+`clear` implementation needed.
- **`@fastify/formbody` must be registered first:** Without it, Twilio form-encoded POST bodies silently produce `undefined`. Register before any routes.
- **Double-booking prevention:** Re-check Google Calendar availability immediately before `events.insert` within the same tool call.
- **Google Calendar API:** Use `freebusy.query` for availability (fast) not `events.list` (slow).
- **Package version lockstep:** `@openai/agents` and `@openai/agents-extensions` must stay at the same version (0.7.2 at project start).
- **Silence timers:** 10s silence -> agent asks "are you still there?", 15s more -> goodbye. Reset on any media event.
- **end_call tool:** Triggers `client.calls(callSid).update({ status: 'completed' })` via Twilio REST API.
- **pendingConfigs Map pattern:** Webhook stores tenant config by CallSid, media-stream retrieves and deletes on start event. No module-level config caching.
- **vitest mock hoisting:** Use `vi.hoisted()` to declare mock functions that are referenced inside `vi.mock()` factory functions. The factory is hoisted above all imports.
- **Tool context accessor:** In `@openai/agents` realtime, tool execute handlers receive `RunContext<RealtimeContextData<TContext>>`. Access custom context via `context!.context` (not `.state.context` as some docs suggest). Cast with `as unknown as CallContext`.
- **CallLog lifecycle:** Created at call start (start event) with outcome="in_progress", finalized in cleanup() with actual duration, outcome, and transcript. DB errors in cleanup are caught and logged but don't prevent session teardown.
- **Admin Prisma schema sync:** The admin app has its own `admin/prisma/schema.prisma` with output to `admin/app/generated/prisma`. When adding models to the voice server schema, the admin schema must be updated too and `npx prisma generate` re-run in the admin directory.
- **vitest mockReset vs clearAllMocks:** `vi.clearAllMocks()` does NOT clear `mockResolvedValue`/`mockReturnValue` implementation. Use `mockFn.mockReset()` per-mock when tests need a clean slate between test cases.
- **Nullish coalescing (??) with intentional null:** `null ?? "default"` yields `"default"`. When test helpers need to preserve explicit `null`, use `"key" in overrides ? overrides.key : default` instead.
- **Transport start event replay:** The transport's Twilio listener is registered inside `connect()`, but the `start` event fires before `connect()` is called. The transport needs `streamSid` from the start event to send audio back. Fix: save the raw start message, re-emit via `socket.emit("message", savedData, false)` after `connect()` resolves. Guard the raw socket handler with a `startHandled` flag to prevent re-processing.
- **TwiML `<Parameter>` for caller info:** Twilio `<Stream>` does not forward webhook fields to WebSocket. Pass `From`/`To` explicitly via `<Parameter>` elements so they appear in `start.customParameters`.

### Research Flags

- **Phase 3 (Booking):** Google Calendar service account setup, `freebusy` API usage, and refresh token lifecycle in multi-tenant context may warrant a targeted research spike before planning.

### Todos

- [ ] Migrate from Twilio to Vapi (`.planning/todos/migrate-twilio-to-vapi.md`)

### Blockers

None currently.

### Open Questions

- Service account calendar sharing friction: does requiring the business to share their calendar with a service account email create unacceptable onboarding friction?
- VAD sensitivity tuning: background noise thresholds for OpenAI Realtime API are not well-documented; budget empirical tuning time in Phase 1.

---

## Session Continuity

### Last Session

**Date:** 2026-03-22
**Completed:** Phase 3 verified with live call. Jeff Bailey called, agent took message correctly, call logged at 64s with outcome `message_taken`, admin UI shows call history and message detail. All 22 v1 requirements confirmed. Milestone closed.

### Next Session Should

1. Begin v2 planning if desired (transfers, enhanced booking, post-call intelligence)
2. Or pick up the "Migrate from Twilio to Vapi" todo

---

*State initialized: 2026-03-19*
*Last updated: 2026-03-21 after completing Plan 3-02*

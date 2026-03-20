# Project State: Agent Call

*This file is the persistent memory of the project. Update it after every session.*

---

## Project Reference

**Core value:** When a customer calls a business, an AI agent answers and handles the call naturally, either resolving the inquiry, booking an appointment, or taking a message.

**Differentiator:** Config-driven plain-English agent setup (no flow builder). SMB owners configure via admin UI; the LLM interprets business context rather than following hardcoded decision trees.

**Stack:** Node.js 22 + TypeScript + Fastify 5 + `@openai/agents` + `@openai/agents-extensions` 0.7.2 (voice server) / Next.js 16.2 App Router (admin) / PostgreSQL via Supabase / Prisma 7 / Railway or Render (voice server host) / Vercel (admin host)

---

## Current Position

**Current phase:** Phase 2 - Tenant Identity
**Current plan:** Not started
**Status:** Ready to plan
**Progress:** Phase 1/3 complete

```
[===       ] 33%
Phase 1: Working Call      [COMPLETE]
Phase 2: Tenant Identity   [Not started]
Phase 3: Call Resolution   [Not started]
```

---

## Performance Metrics

| Metric | Target | Actual |
|--------|--------|--------|
| Phases complete | 3 | 1 |
| Requirements delivered | 22 | 6 |
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

### Critical Implementation Notes

- **Barge-in (INFRA-02):** Handled automatically by `TwilioRealtimeTransportLayer` via mark events. No manual `truncate`+`clear` implementation needed.
- **`@fastify/formbody` must be registered first:** Without it, Twilio form-encoded POST bodies silently produce `undefined`. Register before any routes.
- **Double-booking prevention:** Re-check Google Calendar availability immediately before `events.insert` within the same tool call.
- **Google Calendar API:** Use `freebusy.query` for availability (fast) not `events.list` (slow).
- **Package version lockstep:** `@openai/agents` and `@openai/agents-extensions` must stay at the same version (0.7.2 at project start).
- **Silence timers:** 10s silence -> agent asks "are you still there?", 15s more -> goodbye. Reset on any media event.
- **end_call tool:** Triggers `client.calls(callSid).update({ status: 'completed' })` via Twilio REST API.

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

**Date:** 2026-03-20
**Completed:** Phase 1 complete. All 3 plans executed. Deployed to Render, Twilio number provisioned, e2e call verified.
**Left off:** Phase 1 done, ready for Phase 2

### Next Session Should

1. Run `/gsd:plan-phase 2` to decompose Phase 2 (Tenant Identity) into executable plans
2. Phase 2 covers: admin UI, database, tenant config CRUD, business hours, FAQs, dynamic config reload

---

*State initialized: 2026-03-19*
*Last updated: 2026-03-19 after completing Plans 1-01, 1-02, 1-03 Task 1*

# Project State: Agent Call

*This file is the persistent memory of the project. Update it after every session.*

---

## Project Reference

**Core value:** When a customer calls a business, an AI agent answers and handles the call naturally, either resolving the inquiry, booking an appointment, or taking a message.

**Differentiator:** Config-driven plain-English agent setup (no flow builder). SMB owners configure via admin UI; the LLM interprets business context rather than following hardcoded decision trees.

**Stack:** Node.js 22 + TypeScript + Fastify 5 + `@openai/agents` + `@openai/agents-extensions` 0.7.2 (voice server) / Next.js 16.2 App Router (admin) / PostgreSQL via Supabase / Prisma 7 / Railway or Render (voice server host) / Vercel (admin host)

---

## Current Position

**Current phase:** Phase 1 - Working Call
**Current plan:** None started
**Status:** Not started
**Progress:** Phase 0/3 complete

```
[          ] 0%
Phase 1: Working Call      [Not started]
Phase 2: Tenant Identity   [Not started]
Phase 3: Call Resolution   [Not started]
```

---

## Performance Metrics

| Metric | Target | Actual |
|--------|--------|--------|
| Phases complete | 3 | 0 |
| Requirements delivered | 22 | 0 |
| Calls handled end-to-end | 1+ | 0 |

---

## Accumulated Context

### Key Decisions Made

| Decision | Rationale |
|----------|-----------|
| Dual WebSocket bridge (Twilio Media Streams <-> Fastify <-> OpenAI Realtime) | Sub-400ms latency; the chained STT+LLM+TTS pipeline hits 1200-2000ms which breaks conversational feel |
| `@openai/agents` + `@openai/agents-extensions` with TwilioRealtimeTransportLayer | Handles codec bridging, interrupt handling, and tool dispatch; avoids significant custom work |
| Fastify over Express | Twilio reference implementations use Fastify; `@fastify/websocket` integrates cleanly |
| Transfers deferred to v2 | Simplifies Phase 1 architecture; no conference-from-start requirement; validate core value first |
| Google Calendar service account for v1 | Avoids per-tenant OAuth 2.0 flow for demo stage; validate calendar friction with first customer before building full OAuth |
| Deploy to Railway/Render from day one | ngrok silently drops Twilio Media Streams packets in some configurations; real WSS required for any external testing |
| PostgreSQL via Supabase (free tier) | Covers demo scale; Prisma schema doubles as documentation |

### Critical Implementation Notes

- **Barge-in (INFRA-02):** When caller interrupts, `conversation.item.truncate` (to OpenAI) AND `clear` media message (to Twilio) must fire simultaneously. If only one fires, AI transcript diverges from what caller heard. Must be in Phase 1 core audio loop, not added later.
- **`@fastify/formbody` must be registered first:** Without it, Twilio form-encoded POST bodies silently produce `undefined`. Register before any routes.
- **Double-booking prevention:** Re-check Google Calendar availability immediately before `events.insert` within the same tool call. The `freebusy` query and `events.insert` are separate API calls with no locking.
- **Google Calendar API:** Use `freebusy.query` for availability (fast) not `events.list` (slow).
- **Package version lockstep:** `@openai/agents` and `@openai/agents-extensions` must stay at the same version (0.7.2 at project start).

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

**Date:** 2026-03-19
**Completed:** Project initialization, requirements definition, research, roadmap creation
**Left off:** Ready to plan Phase 1

### Next Session Should

1. Run `/gsd:plan-phase 1` to decompose Phase 1 into executable plans
2. Phase 1 plans should cover: Fastify server setup with `@fastify/formbody` and `@fastify/websocket`, Twilio webhook handler (`/incoming-call`), dual WebSocket bridge to OpenAI Realtime, barge-in handling (INFRA-02), Twilio number provisioning (INFRA-01), Railway/Render deployment (INFRA-03)

---

*State initialized: 2026-03-19*
*Last updated: 2026-03-19 after roadmap creation*

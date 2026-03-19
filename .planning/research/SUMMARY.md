# Project Research Summary

**Project:** agent-call
**Domain:** Voice AI Phone Agent SaaS (B2B, SMB inbound calls, appointment booking, call transfer)
**Researched:** 2026-03-19
**Confidence:** HIGH

## Executive Summary

This project is a B2B SaaS voice AI phone agent targeting SMBs: a business buys a phone number and a configured AI agent answers their inbound calls, handles FAQs, books appointments, and transfers to humans when needed. The expert-recommended pattern for this class of product in 2026 is a dual WebSocket bridge: a persistent Node.js server relays G.711 u-law audio between Twilio Media Streams and the OpenAI Realtime API (speech-to-speech), achieving 200-400ms latency. This is architecturally distinct from older chained pipelines (STT + LLM + TTS), which produce 1200-2000ms latency that makes conversation feel broken. The OpenAI Agents SDK with the Twilio transport extension (`@openai/agents-extensions`) is the correct abstraction level: it handles the audio codec bridging, interrupt handling, and tool dispatch that would otherwise require significant custom work.

The recommended implementation uses Fastify (not Express) as the voice server framework, aligned with Twilio's own reference implementations, with TypeScript throughout for type safety on the notoriously stringly-typed WebSocket event shapes. Multi-tenancy is implemented via config-driven system prompt construction: each business's settings (hours, services, FAQs, transfer number) are stored in PostgreSQL and assembled into a structured system prompt at call start. This is the key differentiator from drag-and-drop flow builders that competitors offer; the LLM interprets plain-text business context rather than following hardcoded decision trees. The admin dashboard is a separate Next.js app deployed to Vercel, while the voice server requires a persistent process (Railway or Render) since WebSocket connections cannot run on serverless infrastructure.

The critical risks are: (1) barge-in handling is non-obvious and must be built into the core audio loop from day one, not added later; (2) call transfer requires a conference-based architecture from call start, not added at transfer time; (3) deployment to a real WSS-capable host must happen before any external testing (ngrok silently drops media packets in some configurations); and (4) Google Calendar booking requires a re-check before event creation to prevent double-bookings. All four of these are "looks done but isn't" failure modes that are easy to miss during isolated happy-path testing.

## Key Findings

### Recommended Stack

The voice server runs on Node.js 22 LTS with TypeScript, Fastify 5.x, `@openai/agents` + `@openai/agents-extensions` (both at 0.7.2, must stay in lockstep), and the Twilio Node SDK. The admin dashboard is Next.js 16.2 (App Router) deployed to Vercel. The database is PostgreSQL via Supabase (free tier covers demo scale), accessed through Prisma 7.x. Do not use Python for the voice server: the `@openai/agents-extensions` Twilio transport is TypeScript/JS only. Do not use Vapi, Retell, or ConversationRelay for demo stage: the Media Streams path costs ~$0.013/min telephony vs ConversationRelay's $0.07/min, and managed platforms prevent owning the stack as a product.

**Core technologies:**
- Node.js 22 LTS: voice server runtime; WebSocket proxying is where Node excels; required by the agents SDK tutorials
- TypeScript 5.x: type safety on WebSocket event shapes and TwiML responses; catches codec/streamSid bugs at compile time
- Fastify 5.8.2: HTTP + WebSocket host; Twilio's reference implementations use Fastify; `@fastify/websocket` integrates cleanly
- `@openai/agents` + `@openai/agents-extensions` 0.7.2: OpenAI Realtime API orchestration with Twilio transport; provides `TwilioRealtimeTransportLayer`, interrupt handling, and tool dispatch
- Twilio 5.13.0: telephony, TwiML, conference API; constrained by project requirements
- Next.js 16.2 (App Router): admin dashboard; co-located API routes; zero-config Vercel deployment
- PostgreSQL via Supabase: tenant config, call logs, appointment records; free tier covers demo
- Prisma 7.5.0: type-safe ORM; schema doubles as documentation
- googleapis 171.4.0: Google Calendar availability check and event creation
- Zod 4.3.6: tool parameter schemas (required by agents SDK) and webhook payload validation

### Expected Features

Research confirms appointment booking is the highest-value call outcome for SMBs (~8% of calls are scheduling requests) and the most complex table-stakes feature. The key differentiator to own is plain-English agent configuration (no flow builder): SMB owners are not technical and plain-text setup beats drag-and-drop for this persona. Competitors (Retell AI, Bland AI, My AI Front Desk) all offer flow builders; not building one is the intentional differentiator, not a gap.

**Must have (table stakes):**
- Agent configuration via plain-text business context: everything else depends on this
- Inbound call answering with natural voice: core product experience
- FAQ answering grounded in business config: prevents hallucination on basic questions
- Business hours awareness: expected by callers; must be enforced server-side in calendar tool, not just in system prompt
- Appointment booking via Google Calendar: primary conversion event; real-time availability check required (no stubs)
- Cold call transfer to configured number: basic escalation safety net
- Warm call transfer with caller briefing: differentiates from voicemail-only services
- Message taking with callback info: fallback when nothing else resolves the call
- Call history and transcripts in admin: business owner needs visibility to trust the product
- Graceful fallback for unhandled scenarios: prevents dead ends; hardcoded escalation path

**Should have (competitive, add post-validation):**
- Post-call AI summary and action items: saves reading full transcripts; add when call volume makes logs impractical
- SMS confirmation after booking: low-cost, improves no-show rates; can share a phase with booking
- Returning caller recognition: requires call history to exist first
- Basic call analytics (volume, outcomes by day/week): ROI proof for business owners

**Defer (v2+):**
- Rescheduling and cancellation handling: requires reading existing calendar state; validate booking demand first
- Per-service booking rules with different durations/buffers: need real SMB feedback on granularity
- Caller sentiment escalation: adds latency risk; validate base experience quality first
- Multilingual support: only valuable once non-English segment is confirmed
- Outbound calling/campaigns: different product surface entirely
- Visual flow builder: only if config-driven approach proves insufficient for complex businesses

### Architecture Approach

The system is a monolith at demo scale with clear internal seams that support future separation. The voice server acts as a dual WebSocket bridge: one connection faces Twilio (G.711 u-law audio), one faces OpenAI Realtime API (PCM audio + function calls). The server intercepts `function_call` events from OpenAI to execute tools (calendar, message logging, transfer), then returns results. All inbound calls are placed into a Twilio Conference room from the start (not just at transfer time) to enable warm transfer without re-routing. Tenant config is loaded from the database at call start and assembled into a structured system prompt; the LLM never sees hardcoded instructions.

**Major components:**
1. Webhook Handler: receives Twilio POST events (`/incoming-call`, `/call-status`, `/conference-events`), responds with TwiML, triggers session start
2. WebSocket Bridge: relays raw audio between Twilio Media Stream and OpenAI Realtime, intercepts function calls
3. Orchestration Layer: loads tenant config from DB, builds system prompt, routes tool calls to correct handler
4. Call Session Manager: in-process Map keyed by `callSid`; holds transcript accumulator and transfer state; flushed to DB on call end
5. Tool Handler: calendar availability check, appointment booking, message logging; each independently testable
6. Transfer Manager: warm and cold transfer via Twilio Conference participant management
7. Admin API + UI: CRUD for tenant config and call history; scoped to authenticated tenant
8. Database Layer: Prisma ORM over PostgreSQL; tenant config, call logs, calendar OAuth tokens

**Build order (from ARCHITECTURE.md):** DB schema first, then webhook handler, then WebSocket bridge + OpenAI session (critical path, steps 1-4). Calendar, transfer, and message tools are independent features (steps 5-7). Admin surface can be built in parallel with tools (steps 8-9).

### Critical Pitfalls

1. **Barge-in handling omitted from core audio loop:** When a caller interrupts the AI, both a `conversation.item.truncate` event (to OpenAI) and a `clear` media message (to Twilio) must fire simultaneously. If only one fires, the AI's internal transcript diverges from what the caller actually heard, causing the AI to reference things the caller never heard. Build and test this in Phase 1, not as an enhancement.

2. **Conference-from-start sequencing failures:** The caller must join the Twilio Conference before the AI participant is added. If the `participant-joined` webhook doesn't distinguish AI vs human participant, both can speak simultaneously during warm transfer. Tag participants on creation and sequence strictly: AI announces, human added, wait for human `participant-joined` webhook, then remove AI. Set `endConferenceOnExit: false` on all participants.

3. **ngrok used beyond local development:** Twilio Media Streams WebSocket connections through ngrok silently drop media packets in some configurations (connection event fires, but no audio frames arrive). Deploy to Railway or Render with a valid WSS endpoint before any external testing. This is a first-hour setup requirement, not a later concern.

4. **Missing `@fastify/formbody` causes silent webhook failures:** Without this plugin, Twilio's form-encoded POST bodies produce `undefined` request bodies. No error is thrown; the webhook handler silently receives nothing. Register this as the first Fastify plugin, before any routes.

5. **Google Calendar double-booking race condition:** The `freebusy` query and `events.insert` are two separate API calls with no locking between them. Re-check availability immediately before creating the calendar event, within the same `bookAppointment` tool call. Build the re-check into the initial implementation, not as a later fix.

## Implications for Roadmap

Based on the dependency graph across all four research files, the critical path runs through infrastructure setup, the core audio loop, and tenant config before any user-visible features can be built. Features then fall into natural groupings based on shared dependencies.

### Phase 1: Core Infrastructure and Audio Loop

**Rationale:** Everything else depends on a working audio bridge. The conference-from-start architecture must be established here, not retrofitted later. Deployment to a real WSS host must happen in this phase, not deferred, because ngrok cannot be used for testing. Barge-in handling is core infrastructure, not an enhancement.

**Delivers:** A functional inbound call that connects a caller to an AI agent via conference, with bidirectional audio, barge-in handling, and session cleanup on hangup.

**Addresses:** Inbound call answering (table stakes), graceful fallback skeleton.

**Avoids:** ngrok-in-production pitfall, missing `@fastify/formbody`, missing webhook signature validation, barge-in transcript divergence, session state leaks.

**Stack:** Fastify + `@openai/agents` + `@openai/agents-extensions`, Twilio conference, Railway/Render deployment, Supabase DB setup.

### Phase 2: Tenant Config and Agent Identity

**Rationale:** The core audio loop produces a generic AI. This phase makes it tenant-aware. Config-to-prompt construction is the foundational differentiator of the product; all runtime features (FAQ, hours, booking rules) are parameterized by what gets built here. Prompt injection boundaries must be established at this point.

**Delivers:** A per-business AI agent that knows the business's name, hours, services, and FAQs; configuration survives across calls without restarts; admin config UI allows non-technical setup.

**Addresses:** Agent configuration (table stakes), FAQ answering, business hours awareness.

**Avoids:** Prompt injection from caller data (sanitization boundary in `prompt-builder.ts`), hardcoded tenant config at deploy time.

**Stack:** Prisma schema, config loader, prompt builder, Next.js admin UI (basic form).

### Phase 3: Appointment Booking

**Rationale:** Booking is the highest-value call outcome and the most complex table-stakes feature. It requires the tenant config from Phase 2 (services, durations) and the Google Calendar integration. Business hours enforcement must be server-side in this tool, not only in the system prompt.

**Delivers:** Real-time availability check against Google Calendar and confirmed appointment creation during a live call, with server-side business hours filtering.

**Addresses:** Appointment booking (table stakes, P1).

**Avoids:** Double-booking race condition (re-check before `events.insert`), OAuth access token storage (store refresh token, not access token), slow `events.list` queries (use `freebusy.query`).

**Stack:** `googleapis` SDK, service account auth (v1), Zod validation of tool arguments.

**Research flag:** Deeper research may be warranted on Google Calendar service account setup and shared calendar permissions before implementation.

### Phase 4: Call Transfer

**Rationale:** Transfer (warm and cold) is table-stakes. The conference infrastructure is already in place from Phase 1; this phase adds the participant management logic. Cold transfer is simpler and must be built before warm.

**Delivers:** Cold transfer (immediate redirect to configured number) and warm transfer (AI announces, human added to conference, AI removed after human joins, caller never hears silence longer than 2 seconds).

**Addresses:** Cold transfer (table stakes), warm transfer (table stakes, differentiator vs voicemail-only services).

**Avoids:** TwiML `<Dial>` without conference (can't warm transfer), simultaneous AI+human audio during handoff, conference ending when AI leaves (`endConferenceOnExit: false`).

**Stack:** Twilio REST API (`client.calls.create`), conference participant management, `transfer.ts` module.

### Phase 5: Message Taking and Admin Visibility

**Rationale:** Message taking is the fallback when no other resolution path works (caller can't be transferred, booking isn't possible). Call history and transcripts are what make the business owner trust the product enough to keep paying. These can be built in parallel; both depend on call log writes from Phase 1.

**Delivers:** Structured message capture (name, number, reason, callback time) stored in DB; admin UI showing call history with transcripts, timestamps, and outcomes.

**Addresses:** Message taking (table stakes), call history and transcripts (table stakes), graceful fallback (completed).

**Avoids:** Admin API cross-tenant data access (scope all DB queries by authenticated tenant ID, never by URL parameters).

**Stack:** Prisma call log queries, Next.js admin UI (call history view), admin API auth middleware.

### Phase 6: Post-Launch Enhancements (v1.x)

**Rationale:** Add these once the core loop is validated with real callers and call volume makes some features practical (summaries) or the ROI case needs strengthening (analytics, SMS).

**Delivers:** Post-call AI summary with extracted intent and next steps; SMS booking confirmation via Twilio SMS; basic call analytics dashboard (volume and outcomes by day/week).

**Addresses:** Post-call AI summary (P2), SMS confirmation (P2), call analytics (P2).

**Research flag:** Post-call summary extraction patterns (structured output from transcript) may benefit from a targeted research spike before implementation.

### Phase Ordering Rationale

- Phases 1-2 are the strict critical path: no user-visible feature works without them.
- Phase 3 (booking) is higher priority than Phase 4 (transfer) because booking is the primary conversion event; a product that books appointments but can only do cold transfer is more valuable than one that warm-transfers but cannot book.
- Phase 4 depends on Phase 1's conference infrastructure but not on Phase 3; it could run in parallel with Phase 3 if resources allow.
- Phase 5 depends on call log writes being in place (from Phase 1) but not on Phase 3 or 4 specifically.
- Phase 6 depends on call volume existing (real callers), which is why it's post-launch.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 3:** Google Calendar service account configuration, `freebusy` API usage, and refresh token lifecycle in a multi-tenant context have enough edge cases that a targeted research spike before implementation is warranted.
- **Phase 6:** Post-call AI summary extraction (structured output from raw transcript) has no obvious reference implementation; needs research into prompting patterns and output schema design.

Phases with standard patterns (skip research-phase):
- **Phase 1:** Dual WebSocket bridge pattern is thoroughly documented in official Twilio tutorials with working Node.js code. Follow the reference implementation closely.
- **Phase 2:** Config-to-prompt construction is a standard multi-tenant SaaS pattern. No novel territory.
- **Phase 4:** Conference-based warm transfer is documented in official Twilio tutorials with exact API call sequences.
- **Phase 5:** Standard CRUD admin UI. No research needed.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Package versions verified against npm registry; architecture pattern verified against official Twilio tutorials with working code samples. Node.js/Fastify path is the Twilio-sanctioned reference implementation. |
| Features | MEDIUM-HIGH | Table stakes confirmed against multiple competitor analyses and SMB call statistics. Competitor feature matrix built from vendor docs, which carry self-reporting bias. Core feature priorities are reliable; precise UX tradeoffs need real SMB validation. |
| Architecture | HIGH | Dual WebSocket bridge and conference-based transfer patterns verified against official Twilio docs and production post-mortems. Component boundaries and data flow match multiple independent implementations. |
| Pitfalls | HIGH | Barge-in handling, conference sequencing, and double-booking race conditions verified against official docs, OpenAI community threads, and production post-mortems. Not theoretical risks. |

**Overall confidence:** HIGH

### Gaps to Address

- **Per-user OAuth for Google Calendar (v1 uses service account):** The service account shortcut works for demo but requires the business to share their calendar with a service account email. Validate this friction level with the first real customer before building the full OAuth 2.0 per-tenant flow.
- **Pricing model:** Research found competitor pricing ($0.07-0.09/min) but the project's own pricing strategy is undefined. This is not a technical gap but needs to be resolved before any customer conversations.
- **VAD (Voice Activity Detection) tuning:** Background noise thresholds and VAD sensitivity settings for OpenAI Realtime API are not well-documented in official sources. Budget time for empirical tuning during Phase 1 testing.
- **OpenAI Realtime API rate limits:** At higher concurrency, OpenAI Realtime API rate limits become the first bottleneck. Request limit increases before scaling; limits are not publicly documented in detail.

## Sources

### Primary (HIGH confidence)
- [Twilio blog: Build AI Voice Assistant with Twilio + OpenAI Realtime Agents SDK](https://www.twilio.com/en-us/blog/developers/tutorials/product/speech-assistant-realtime-agents-sdk-node) — package list, Node 22 requirement, Fastify pattern
- [Twilio blog: Warm Transfer from OpenAI Realtime to Human Agent](https://www.twilio.com/en-us/blog/developers/tutorials/product/warm-transfer-openai-realtime-programmable-sip) — conference-based transfer architecture, exact npm install
- [OpenAI Agents SDK docs: Realtime Agents on Twilio](https://openai.github.io/openai-agents-js/extensions/twilio/) — `@openai/agents-extensions` package confirmation
- [Twilio: Build an AI Voice Assistant with OpenAI Realtime API and Node.js](https://www.twilio.com/en-us/blog/voice-ai-assistant-openai-realtime-api-node) — dual WebSocket bridge pattern
- [Twilio: Warm Transfer with Node.js](https://www.twilio.com/docs/voice/tutorials/warm-transfer) — conference participant management sequences
- [Twilio Media Streams WebSocket Messages reference](https://www.twilio.com/docs/voice/media-streams/websocket-messages) — `stop` event, `clear` message
- [Twilio Webhooks Security documentation](https://www.twilio.com/docs/usage/webhooks/webhooks-security) — signature validation
- [Twilio Voice Pricing US](https://www.twilio.com/en-us/voice/pricing/us) — $0.0085/min inbound, $0.004/min media streams, $0.07/min ConversationRelay
- [OpenAI: Introducing gpt-realtime](https://openai.com/index/introducing-gpt-realtime/) — current model names and pricing
- [OpenAI: Safety in building agents](https://platform.openai.com/docs/guides/agent-builder-safety) — prompt injection prevention
- npm registry: verified all package versions live (2026-03-19)

### Secondary (MEDIUM confidence)
- [AssemblyAI: Voice AI stack for agents 2026](https://www.assemblyai.com/blog/the-voice-ai-stack-for-building-agents) — ecosystem context, streaming pipeline pattern
- [WebRTC.ventures: ConversationRelay GA Release](https://webrtc.ventures/2025/05/twilios-conversationrelay-ga-release-brings-voice-ai-to-the-enterprise-mainstream/) — ConversationRelay vs Media Streams comparison
- [OpenAI Community: Reconstruct correct transcript when speech output is interrupted](https://community.openai.com/t/realtime-openai-twilio-media-streams-how-to-reconstruct-the-correct-conversation-transcript-when-speech-output-is-interrupted/1371638) — barge-in handling detail
- [Nick Tikhonov: How I built a sub-500ms latency voice agent from scratch](https://www.ntik.me/posts/voice-agent) — production post-mortem
- [Vapi community: Google Calendar checkAvailability Tool Not Preventing Double Bookings](https://vapi.ai/community/m/1387478334203756714) — double-booking race condition
- [LiveKit GitHub: Twilio Media Streams WebSocket silently drops media packets with ngrok](https://github.com/livekit/agents/issues/3379) — ngrok silent failure mode
- [Upfirst: Best AI Answering Services 2025](https://upfirst.ai/blog/best-ai-answering-services) — competitor feature landscape
- [Retell AI vs. Bland AI Feature Comparison](https://www.retellai.com/blog/retell-ai-vs-bland-ai-choose-the-right-voice-agent-for-your-business) — competitor feature matrix
- [Resonate AI: AI Receptionists 2024-2025 Statistics](https://www.resonateapp.com/resources/ai-receptionists-statistics) — SMB call statistics (~8% scheduling)

### Tertiary (LOW-MEDIUM confidence)
- [My AI Front Desk: AI Receptionist Business Model](https://www.myaifrontdesk.com/blogs/the-future-of-front-desks-exploring-the-ai-receptionist-business-model) — competitor positioning (vendor blog)
- [Aloware: Best AI Voice Agents 2026](https://aloware.com/blog/best-ai-voice-agents-complete-guide-for-smbs) — SMB feature expectations
- [Daily.co: Advice on Building Voice AI in June 2025](https://www.daily.co/blog/advice-on-building-voice-ai-in-june-2025/) — practitioner perspective

---
*Research completed: 2026-03-19*
*Ready for roadmap: yes*

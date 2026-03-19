# Architecture Research

**Domain:** Voice AI Phone Agent SaaS (B2B, inbound calls)
**Researched:** 2026-03-19
**Confidence:** HIGH (verified against Twilio official docs, OpenAI documentation, and multiple production implementations)

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                         PSTN / Caller                                │
│                     (Inbound phone call)                             │
└─────────────────────────┬────────────────────────────────────────────┘
                          │
┌─────────────────────────▼────────────────────────────────────────────┐
│                     Twilio Edge                                      │
│  ┌───────────────┐    ┌───────────────┐    ┌──────────────────────┐  │
│  │  Phone Number │    │  Media Stream │    │  Call Events         │  │
│  │  (provisioned │    │  (bidirec-    │    │  (webhooks to        │  │
│  │  per tenant)  │    │  tional audio │    │  application)        │  │
│  └───────┬───────┘    │  WebSocket)   │    └──────────┬───────────┘  │
│          │            └───────┬───────┘               │              │
└──────────┼────────────────────┼───────────────────────┼──────────────┘
           │                   │                        │
┌──────────▼────────────────────▼───────────────────────▼──────────────┐
│                     Application Server (Node.js)                     │
│                                                                      │
│  ┌─────────────────┐   ┌─────────────────┐   ┌──────────────────┐   │
│  │  Webhook        │   │  WebSocket      │   │  Call Session    │   │
│  │  Handler        │   │  Proxy / Bridge │   │  Manager         │   │
│  │  (POST routes)  │   │  (audio relay)  │   │  (state per call)│   │
│  └────────┬────────┘   └────────┬────────┘   └────────┬─────────┘   │
│           │                    │                      │             │
│  ┌────────▼────────────────────▼──────────────────────▼─────────┐   │
│  │                     Orchestration Layer                       │   │
│  │  (load agent config, build system prompt, route tool calls)   │   │
│  └───────────────────────────────────────────────────────────────┘   │
│           │                    │                      │             │
│  ┌────────▼───────┐   ┌────────▼───────┐   ┌─────────▼──────────┐   │
│  │  Tool Handler  │   │  Transfer      │   │  Admin API         │   │
│  │  (calendar,    │   │  Manager       │   │  (CRUD for tenant  │   │
│  │  message log)  │   │  (warm/cold)   │   │  config, call logs)│   │
│  └────────┬───────┘   └────────┬───────┘   └─────────┬──────────┘   │
└───────────┼────────────────────┼─────────────────────┼──────────────┘
            │                   │                      │
┌───────────▼──────┐  ┌─────────▼──────┐  ┌───────────▼──────────────┐
│  OpenAI          │  │  Twilio        │  │  Database                │
│  Realtime API    │  │  Conference    │  │  (tenant config,         │
│  (GPT-4o,        │  │  (warm         │  │  call logs, messages)    │
│  speech-to-      │  │  transfer      │  │                          │
│  speech)         │  │  hub)          │  └──────────────────────────┘
└──────────────────┘  └────────────────┘
            │
┌───────────▼──────────────────────────┐
│  Google Calendar API                 │
│  (availability check, event create)  │
└──────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| Twilio Phone Number | Dedicated DID per tenant, receives PSTN calls, fires webhooks | Twilio phone number provisioned via API at tenant signup |
| Webhook Handler | Receives Twilio call events (incoming, status, recording), responds with TwiML | HTTP POST routes on Express/Fastify |
| WebSocket Proxy/Bridge | Relays raw G.711 u-law audio between Twilio Media Stream and OpenAI Realtime API | Single Node.js process bridging two WebSocket connections per call |
| Orchestration Layer | Loads tenant config, constructs system prompt, routes function calls from LLM to correct tool | Called at session start and on each LLM tool_call event |
| Call Session Manager | Holds in-memory state for an active call (call SID, tenant ID, transcript accumulator, transfer status) | In-process map keyed by callSid; flushed to DB on call end |
| Tool Handler | Executes LLM-requested tools: check calendar, book appointment, log message | Async functions, results returned to LLM via Realtime API |
| Transfer Manager | Executes warm/cold transfer: adds human participant to conference, removes AI participant | Calls Twilio REST API to manipulate conference participants |
| Admin API | CRUD for tenant agent config, retrieves call history | REST endpoints, auth-gated |
| Database | Persists tenant config, call logs, messages, calendar OAuth tokens | PostgreSQL (structured config) |
| Admin UI | Minimal web frontend for business owners | Next.js or plain React served from same server |

## Recommended Project Structure

```
src/
├── telephony/            # Twilio integration
│   ├── webhooks.ts       # Incoming call, status callbacks
│   ├── twiml.ts          # TwiML response builders
│   ├── media-stream.ts   # WebSocket bridge to OpenAI
│   └── transfer.ts       # Warm and cold transfer logic
├── ai/                   # AI/LLM integration
│   ├── realtime.ts       # OpenAI Realtime API client
│   ├── session.ts        # Session lifecycle (open, configure, close)
│   └── tools.ts          # Function call dispatcher
├── tools/                # Individual tool implementations
│   ├── calendar.ts       # Google Calendar availability + booking
│   └── messages.ts       # Take-a-message logging
├── config/               # Tenant agent configuration
│   ├── loader.ts         # Load config for a phone number
│   ├── prompt-builder.ts # Converts config to system prompt
│   └── schema.ts         # Config shape/validation
├── admin/                # Admin API + UI backend
│   ├── routes.ts         # Config CRUD, call history
│   └── auth.ts           # Session/auth middleware
├── db/                   # Database layer
│   ├── schema.ts         # Table definitions (Drizzle or Prisma)
│   ├── tenants.ts        # Tenant + config queries
│   └── calls.ts          # Call log queries
└── server.ts             # Express/Fastify entry point
```

### Structure Rationale

- **telephony/:** All Twilio-specific code isolated here. Changing telephony provider later only touches this folder.
- **ai/:** OpenAI Realtime connection management separated from tool execution.
- **tools/:** Each tool is independently testable with no telephony or AI dependencies.
- **config/:** The config-to-prompt translation is its own concern; business logic lives here, not in the AI layer.
- **admin/:** Admin surface is a thin REST API. UI can be a separate repo or co-located; at this scale, co-location is fine.

## Architectural Patterns

### Pattern 1: Dual WebSocket Bridge (Speech-to-Speech)

**What:** The application server acts as a transparent audio proxy. One WebSocket connection faces Twilio (receiving G.711 u-law audio frames), another faces OpenAI Realtime API (sending/receiving audio). The server forwards audio in both directions and intercepts function_call events to execute tools.

**When to use:** Chosen for this project because GPT-4o Realtime eliminates the STT + LLM + TTS sequential chain, cutting latency from ~1500ms to ~200-300ms. This is the recommended approach for Twilio + OpenAI specifically.

**Trade-offs:** Lower latency and fewer moving parts than chained pipelines, but OpenAI Realtime API is more expensive than GPT-4o text API + separate STT/TTS. At demo scale, cost difference is negligible.

**Data flow:**
```
Twilio WS → [audio frame: base64 μ-law] → Server → [input_audio_buffer.append] → OpenAI
OpenAI → [response.audio.delta: base64 PCM] → Server → [media event: base64 μ-law] → Twilio WS
OpenAI → [response.done: function_call] → Server → Tool execution → [tool result] → OpenAI
```

### Pattern 2: Conference-Based Transfer Hub

**What:** Rather than routing calls directly between endpoints, the inbound call is placed into a Twilio Conference room. The AI agent joins as a participant. For warm transfer, a human agent is added to the same conference with the AI still present; once human accepts, AI is removed.

**When to use:** Any time call transfer is required. The conference is the only reliable Twilio primitive that allows adding/removing participants without dropping the caller.

**Trade-offs:** Slightly more complex initial setup (two-step: add caller to conference, then add AI agent via SIP/TwiML App). Enables warm transfer, hold, and participant management as first-class operations. No alternative in standard TwiML without this pattern.

**Warm transfer sequence:**
```
1. Caller dials in → joined to Conference (conf-{callSid})
2. AI agent (OpenAI Realtime) added as conference participant via SIP
3. AI detects transfer intent → triggers addHumanAgent function call
4. Server calls Twilio: add human phone number to conference
5. Human answers → /conference-events webhook fires (participant-joined)
6. Server calls Twilio: update AI call status to "completed" (remove AI)
7. Caller and human agent continue directly
```

**Cold transfer sequence:**
```
1-3. Same as warm transfer
4. Server calls Twilio: update AI call status to "completed"
5. Server calls Twilio: add human phone number to conference
   (Caller is briefly alone before human answers — no briefing)
```

### Pattern 3: Config-Driven System Prompt Construction

**What:** Tenant configuration (business name, hours, services, FAQs, transfer number, booking rules) is stored in the database and assembled into a structured system prompt at the start of each call session. The LLM uses this context to behave as that business's specific agent.

**When to use:** Required for multi-tenant SaaS where each business has different identity and rules. Avoids per-tenant model fine-tuning.

**Trade-offs:** System prompt length grows with config richness; very large prompts increase TTFT (time to first token). Keep configs focused. Structure prompts with clear sections (identity, instructions, tools available, escalation rules) rather than prose.

**Example structure:**
```typescript
function buildSystemPrompt(config: TenantConfig): string {
  return `
You are ${config.businessName}'s phone agent. Be friendly and concise.

BUSINESS HOURS: ${formatHours(config.hours)}
SERVICES: ${config.services.join(', ')}
FAQS:
${config.faqs.map(f => `Q: ${f.q}\nA: ${f.a}`).join('\n')}

TOOLS AVAILABLE:
- checkAvailability: Check open appointment slots
- bookAppointment: Book a slot for the caller
- transferCall: Transfer to ${config.transferNumber}
- leaveMessage: Record a callback message

ESCALATION RULES: ${config.escalationRules}
  `.trim();
}
```

## Data Flow

### Inbound Call Flow (Happy Path: Booking)

```
Caller dials Twilio number
    ↓
Twilio POST /incoming-call (webhook)
    ↓
Server looks up tenant by phone number
Server responds: TwiML <Dial><Conference name="conf-{callSid}">
    ↓
Server adds AI agent as conference participant (SIP call to OpenAI)
    ↓
OpenAI Realtime: realtime.call.incoming webhook fires
Server accepts, opens WebSocket, sends session.update with system prompt + tools
    ↓
[Bidirectional audio begins]
    ↓
Caller requests appointment
    ↓
OpenAI sends function_call: checkAvailability({date, duration})
    ↓
Server calls Google Calendar API (OAuth token from DB)
Server returns available slots to OpenAI via conversation.item.create
    ↓
Caller confirms slot
    ↓
OpenAI sends function_call: bookAppointment({slot, callerName, phone})
    ↓
Server creates Google Calendar event
Server updates call_log in DB with booking outcome
    ↓
AI confirms booking to caller, ends conversation
    ↓
Twilio call-status webhook: "completed"
Server flushes call session state (transcript, outcome) to DB
```

### Warm Transfer Flow

```
[Active call in progress]
    ↓
AI detects transfer trigger (caller asks for human, or AI determines it can't resolve)
    ↓
OpenAI sends function_call: transferCall({reason, summary})
    ↓
Server calls Twilio REST: add human phone number to conference
Server optionally: AI verbally briefs caller ("Connecting you now, one moment")
    ↓
Human phone rings
    ↓
Twilio /conference-events webhook: participant-joined
    ↓
Server calls Twilio REST: remove AI from conference (set status=completed)
    ↓
[Caller and human agent speak directly]
    ↓
Call ends → DB log updated with "transferred" outcome
```

### Admin Config Flow

```
Business owner logs in (admin UI)
    ↓
GET /admin/config → loads tenant record from DB
    ↓
Owner edits fields (business info, hours, services, FAQs, transfer number)
    ↓
PUT /admin/config → validates, writes to DB
    ↓
[Next inbound call picks up new config — no restart required]
```

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-50 tenants, low call volume | Single Node.js process handles all WebSocket bridges. Monolith is fine. |
| 50-500 tenants, moderate volume | Add process-level concurrency (cluster or PM2). Move DB to managed Postgres. Add Redis for session state so calls can be handled by any process. |
| 500+ tenants, high concurrency | Horizontally scale the WebSocket bridge layer separately from the admin API. Consider Twilio ConversationRelay to offload STT/TTS infrastructure. Each WebSocket connection holds ~200-400KB in memory; plan accordingly. |

### Scaling Priorities

1. **First bottleneck:** Concurrent WebSocket connections. Each active call holds two open WebSocket connections (Twilio + OpenAI). Node.js handles thousands of these, but OpenAI Realtime API rate limits apply. Monitor and request limit increases early.
2. **Second bottleneck:** Database reads on call start. Every incoming call loads tenant config from DB. Add a short in-process cache (30s TTL, invalidated on admin config save) to avoid DB hits per ring.

## Anti-Patterns

### Anti-Pattern 1: Sequential STT + LLM + TTS Chain

**What people do:** Build a pipeline: Twilio records a chunk → send to Whisper → send text to GPT-4o chat → send response to ElevenLabs TTS → play audio back.

**Why it's wrong:** Cumulative latency of 1200-2000ms makes conversation feel broken. Callers talk over the agent or hang up. The sequential approach is appropriate for prototyping but not for a product callers judge in 3 seconds.

**Do this instead:** Use OpenAI Realtime API (speech-to-speech) via the dual WebSocket bridge pattern. Latency drops to 200-400ms, which is within the range that feels conversational.

### Anti-Pattern 2: TwiML `<Dial>` Without Conference for Transfers

**What people do:** Use TwiML `<Dial number="...">` directly to implement call transfer, replacing the AI with a dial to the human.

**Why it's wrong:** This terminates the AI's participation abruptly with no ability to brief the human agent, no context handoff, and no graceful hold behavior. The caller hears a click and silence.

**Do this instead:** Use Twilio Conference as the transfer hub from the start. The conference primitive allows adding/removing participants independently, enabling warm transfer with context briefing.

### Anti-Pattern 3: Storing Tenant Config in System Prompt at Deploy Time

**What people do:** Hardcode each tenant's instructions as a static string in code or config file.

**Why it's wrong:** Each config change requires a redeploy. Configuration belongs in the database, loaded at runtime per call. This is the foundational requirement for a multi-tenant SaaS product.

**Do this instead:** Store config in DB keyed to the Twilio phone number. Load it in the webhook handler before building the OpenAI session.

### Anti-Pattern 4: Long-Polling for Call State

**What people do:** Poll the database from the admin UI to show live call status.

**Why it's wrong:** Unnecessary load and stale data. Call state is event-driven (Twilio webhooks fire on each transition).

**Do this instead:** Use Twilio status callbacks to write call state to DB. Admin UI polls DB at a slow interval (5-10s) or uses SSE/WebSocket from the app server for near-real-time display. At this scale, slow polling is fine.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Twilio Voice | Webhook (HTTP POST) for call events + WebSocket (Media Streams) for audio | Phone number must be configured with webhook URL at provisioning time. Use ngrok locally. |
| OpenAI Realtime API | WebSocket connection per call, initiated by server | Session configured with `session.update` immediately after open. Tools registered here. G.711 u-law audio format required to match Twilio. |
| Google Calendar API | OAuth 2.0, REST calls per tool invocation | Store refresh token per tenant in DB. Scopes needed: `calendar.readonly` + `calendar.events`. |
| Twilio REST API | HTTP calls for outbound participant management (add/remove from conference) | Used during transfer flow, not the main audio path. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Webhook Handler ↔ Orchestration | Direct function call (same process) | Handler looks up tenant, then calls orchestration to start session |
| WebSocket Bridge ↔ Tool Handler | Event-driven (function_call from OpenAI triggers tool dispatch) | Tool results must be returned to OpenAI within ~5s or session times out |
| Tool Handler ↔ Google Calendar | Async HTTP (googleapis SDK) | Cache OAuth tokens in memory per session; re-fetch from DB only on expiry |
| Orchestration ↔ Database | Async DB query (Prisma/Drizzle) | Config loaded once per call at session start; not re-read mid-call |
| Transfer Manager ↔ Twilio REST | Async HTTP (twilio SDK) | Conference participant management; must complete before caller hears silence |
| Admin API ↔ Database | Async DB query | Standard CRUD; invalidate any config cache on write |

## Suggested Build Order

Based on component dependencies:

1. **Database schema + tenant config model** (everything else depends on having a place to store config)
2. **Twilio webhook handler + basic TwiML response** (proves the phone number receives calls)
3. **WebSocket bridge + OpenAI Realtime session** (core audio loop — the product's main value)
4. **Orchestration layer + config-to-prompt builder** (makes the agent tenant-aware)
5. **Tool: Google Calendar integration** (adds booking capability)
6. **Transfer Manager** (warm and cold transfer)
7. **Tool: Take-a-message** (simple fallback, depends on DB call logs)
8. **Admin API + minimal UI** (configuration surface for business owners)
9. **Call history / logs view** (depends on call log writes from steps 3-7)

Steps 1-4 are the critical path. Steps 5-7 are independent features. Steps 8-9 are the admin surface and can be built in parallel with 5-7.

## Sources

- [Build an AI Voice Assistant with Twilio Voice, OpenAI's Realtime API, and Node.js](https://www.twilio.com/en-us/blog/voice-ai-assistant-openai-realtime-api-node) (Twilio official, HIGH confidence)
- [Perform a Warm Transfer to a Human Agent from the OpenAI Realtime API using Twilio Programmable SIP](https://www.twilio.com/en-us/blog/developers/tutorials/product/warm-transfer-openai-realtime-programmable-sip) (Twilio official, HIGH confidence)
- [Warm Transfer with Node.js](https://www.twilio.com/docs/voice/tutorials/warm-transfer) (Twilio docs, HIGH confidence)
- [Twilio ConversationRelay product page](https://www.twilio.com/en-us/products/conversational-ai/conversationrelay) (Twilio official, HIGH confidence)
- [Real-Time vs Turn-Based Voice Agent Architecture](https://softcery.com/lab/ai-voice-agents-real-time-vs-turn-based-tts-stt-architecture) (MEDIUM confidence)
- [The Voice AI Stack for Building Agents 2026](https://www.assemblyai.com/blog/the-voice-ai-stack-for-building-agents) (MEDIUM confidence)
- [Architecting Real-Time Voice Agents with Twilio, OpenAI Realtime, FastAPI](https://aniketjha1304.medium.com/architecting-real-time-voice-agents-with-twilio-openai-realtime-fastapi-and-agent-builder-e2df8feb9375) (MEDIUM confidence)
- [Sub-200ms Voice AI: Bridging Twilio and OpenAI Realtime API](https://dev.to/ryancwynar/sub-200ms-voice-ai-bridging-twilio-and-openai-realtime-api-21g3) (MEDIUM confidence)

---
*Architecture research for: Voice AI Phone Agent SaaS (B2B inbound calls, Twilio + OpenAI)*
*Researched: 2026-03-19*

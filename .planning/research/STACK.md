# Stack Research

**Domain:** Voice AI Phone Agent SaaS (B2B, inbound calls, appointment booking, call transfer)
**Researched:** 2026-03-19
**Confidence:** HIGH (core voice/AI layer), MEDIUM (admin UI layer)

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Node.js | 22.x LTS | Runtime for voice server | The OpenAI Agents SDK + Twilio integration tutorials are authored against Node 22. Async WebSocket proxying is where Node excels. DO NOT use Python here — the OpenAI Agents SDK JS/TS extension for Twilio is first-class; Python has the raw API but no equivalent agents-extensions package. |
| TypeScript | 5.x | Type safety across the voice server | WebSocket event shapes and TwiML responses are stringly-typed by default. TypeScript catches the class of bugs (wrong audio codec, missing `streamSid`) that are uniquely painful to debug at call time. |
| Fastify | 5.8.2 | HTTP server + WebSocket host | Twilio's own reference implementations use Fastify (not Express) for voice agents. It has native async/await, faster routing, and `@fastify/websocket` integrates cleanly. Express works but Fastify is the current ecosystem default for this use case. |
| @openai/agents | 0.7.2 | OpenAI Realtime API orchestration with tool calling | Use the agents SDK, not the raw `openai` package. It provides `RealtimeAgent`, `TwilioRealtimeTransportLayer`, built-in tool dispatch, guardrails, and interrupt handling — all of which you would otherwise hand-roll. |
| @openai/agents-extensions | 0.7.2 | Twilio transport adapter for agents SDK | Provides `TwilioRealtimeTransportLayer` which handles the G.711 u-law audio codec bridging, `streamSid` lifecycle, and bidirectional proxying between Twilio Media Streams and the OpenAI Realtime WebSocket. |
| twilio | 5.13.0 | Telephony: phone numbers, TwiML, call control, conference API | Constrained by project requirements. Use the Node SDK for TwiML generation, REST API calls (conference participants, warm transfers), and webhook handling. |
| Next.js | 16.2.0 | Admin dashboard UI + API routes | App Router + Server Actions = less boilerplate for a minimal config UI. The admin is not complex enough to warrant a separate backend. Next.js unifies the admin frontend and lightweight API surface under one deployment. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @fastify/websocket | 11.2.0 | WebSocket route support in Fastify | Required for the `/media-stream` endpoint that Twilio connects to. Use for all WS routes. |
| @fastify/formbody | latest | Parse `application/x-www-form-urlencoded` | Twilio webhooks POST form-encoded data. Without this, request bodies are `undefined`. |
| zod | 4.3.6 | Schema validation for tool inputs and webhook payloads | The OpenAI agents SDK uses Zod for tool parameter schemas. Also use it to validate incoming Twilio webhook fields. |
| googleapis | 171.4.0 | Google Calendar API for appointment booking | Official Google client library. Use the `calendar` scope with a service account (for business calendar access) rather than OAuth per-user flow for the v1 demo. |
| @prisma/client | 7.5.0 | ORM for call logs, agent config, business records | Prisma gives you type-safe DB queries without raw SQL. The schema doubles as documentation of your data model. |
| prisma | 7.5.0 | Prisma CLI for migrations | Dev dependency. Run `prisma migrate dev` in development. |
| dotenv | latest | Environment variable management | Standard. Load secrets (Twilio credentials, OpenAI key, DB URL) without committing them. |
| ws | 8.19.0 | WebSocket client for OpenAI Realtime API connection | Used by `@openai/agents-extensions` internally. Pin it explicitly to avoid version conflicts. |

### Database

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| PostgreSQL (via Supabase) | 15.x | Primary datastore | Call logs, business config, agent settings, appointment records. Supabase gives you a managed Postgres with a free tier that fits the demo-stage budget constraint. No infra to run. When you need to go beyond demo, it scales linearly. |

### Infrastructure

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Supabase | hosted | Managed PostgreSQL + auth option | Free tier covers demo usage. Prisma connects to it via the Supabase connection pooler (Supavisor). Use the direct connection string for Prisma migrations, pooled string for runtime. |
| Vercel | hosted | Next.js admin dashboard deployment | Zero-config for Next.js. The admin UI has no long-running processes — API routes are serverless functions. |
| Railway or Render | hosted | Voice server deployment | The Fastify voice server needs a persistent process (WebSocket connections can't be serverless). Railway has a hobby tier. Use a single always-on service. Render works equally well. |
| Twilio | hosted | Telephony, phone numbers, call routing | Pay-as-you-go. Inbound local calls cost $0.0085/min + $0.004/min for Media Streams = ~$0.013/min. ConversationRelay costs $0.07/min (too expensive for demo stage — use Media Streams + OpenAI direct, see Architecture Variants below). |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| tsx | TypeScript execution in development | `npm install --save-dev tsx`. Run voice server with `tsx watch src/server.ts` for hot-reload during dev. |
| ngrok | Local webhook tunnel | Required during development so Twilio can reach your local Fastify server. `ngrok http 3001`. |
| Prisma Studio | Visual database browser | Run `npx prisma studio` for inspecting call logs during development. |

---

## Installation

```bash
# Voice server (Node.js service)
npm install fastify @fastify/websocket @fastify/formbody
npm install @openai/agents @openai/agents-extensions
npm install twilio
npm install zod
npm install googleapis
npm install dotenv ws

# Database
npm install @prisma/client
npm install -D prisma

# TypeScript dev dependencies
npm install -D typescript tsx @types/node @types/ws

# Admin UI (Next.js app)
npx create-next-app@latest admin --typescript --tailwind --app
cd admin
npm install @prisma/client
npm install @clerk/nextjs   # optional: handles auth without building it
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| @openai/agents + @openai/agents-extensions | Raw `openai` package with manual WebSocket proxy | Only if you need sub-millisecond control over the audio pipeline or the agents SDK version lags behind OpenAI Realtime API features you need. The raw approach requires you to implement tool dispatch, interrupt handling, and audio codec conversion manually. |
| Twilio Media Streams + OpenAI Realtime API | Twilio ConversationRelay | ConversationRelay ($0.07/min) is 5x the cost of Media Streams ($0.004/min) at the audio layer. For demo/early stage, the Media Streams + OpenAI direct path is the right call. Switch to ConversationRelay when you need lower latency guarantees for enterprise clients and can absorb the cost. |
| Twilio ConversationRelay | Vapi.ai | Vapi is a managed platform that abstracts STT, TTS, and LLM orchestration. Appropriate if you do NOT want to own the stack. For this project, the builder wants control and has Twilio experience — direct Twilio integration is preferable. Vapi also charges per minute on top of underlying API costs. |
| Fastify | Express | Express works but Fastify is what Twilio's official voice AI samples use. Its plugin model (`@fastify/websocket`) integrates more cleanly than `express-ws`. Use Express only if your team has no Fastify experience and the learning curve matters more than alignment with reference implementations. |
| PostgreSQL (Supabase) | PlanetScale (MySQL) | MySQL is fine but Prisma's PostgreSQL support is more complete. Supabase also gives you row-level security and realtime subscriptions if you later add live call status to the admin UI. |
| Next.js 16 (App Router) | Remix | Both work for a minimal admin UI. Next.js is the safer default: more community resources, Vercel deployment is trivial, shadcn/ui components work out of the box. |
| Railway/Render (persistent process) | Vercel (serverless) | WebSocket connections are stateful and can last the full duration of a call. Serverless functions have execution time limits and connection limits that will kill active calls. Do NOT run the voice server on Vercel. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Python for the voice server | The `@openai/agents-extensions` Twilio transport is TypeScript/JS only. A Python voice server means hand-rolling the `TwilioRealtimeTransportLayer` equivalent, which is significant undifferentiated work. | Node.js 22 with @openai/agents |
| Vapi or Retell AI | They abstract the stack away from you. Fine for non-technical builders. For a SaaS product where YOU are the platform, you need to own the telephony-to-AI layer. You cannot build a differentiated product on top of another voice AI platform. | Twilio + OpenAI direct |
| ConversationRelay for the demo stage | $0.07/min is expensive when you're validating. A 5-minute demo call costs $0.35 in ConversationRelay fees alone, before LLM costs. | Twilio Media Streams ($0.004/min) |
| `gpt-4o-realtime-preview` (older snapshot) | The preview model is deprecated. OpenAI has released `gpt-realtime` (2025-08-28) and `gpt-realtime-1.5` (2026-02-23) as production-ready replacements with 20% lower pricing. | `gpt-realtime-1.5` or the latest `gpt-realtime` model slug |
| OAuth 2.0 user-level auth for Google Calendar (v1) | Requires each business owner to go through a consent flow and store refresh tokens. Too much friction for a demo. | Google Calendar service account with delegated access to a shared business calendar. Revisit per-user OAuth in v2 when you have real customers. |
| Socket.io | Adds a framing layer over WebSocket with reconnection logic designed for browser clients. Twilio sends raw WebSocket frames in a specific format — Socket.io's abstraction will break protocol compatibility. | Native `ws` library or `@fastify/websocket` |

---

## Architecture Variants

**For demo/early stage (default recommendation):**
- Voice server: Fastify + @openai/agents + @openai/agents-extensions (Media Streams path)
- Cost: ~$0.013/min telephony + ~$0.30/min OpenAI Realtime audio (gpt-realtime-1.5 at ~$0.06 input + $0.24 output)
- Total: ~$0.31/min per concurrent call at current pricing

**For production/enterprise (future):**
- Switch to Twilio ConversationRelay for lower latency (sub-500ms median) and enterprise SLAs
- Cost jumps to ~$0.083/min telephony (ConversationRelay $0.07 + call $0.0085 + phone number)
- LLM costs remain the same; justifiable when paying customers need quality guarantees

**For warm transfer to human:**
- Use Twilio Conference API (not `<Dial>` TwiML). Pattern: caller + AI join a conference, AI triggers `addHumanAgent` tool, server places outbound call to human, human joins conference, AI disconnects via `TwilioRealtimeTransportLayer` cleanup.
- Key package: `twilio` REST client to call `client.calls.create()` adding the human to the conference.

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| @openai/agents@0.7.2 | @openai/agents-extensions@0.7.2 | Keep these in lockstep — the extensions package is released in sync with the agents SDK. |
| Prisma@7.5.0 | Node.js 20+ | Prisma 7.x requires Node 20 or higher. Node 22 LTS is fine. |
| Next.js@16.2.0 | React 19 | Next 16 ships with React 19 as a peer dependency. Ensure any UI libraries you add support React 19. shadcn/ui components do. |
| googleapis@171.x | Node.js 18+ | Stable. No known conflicts with the rest of the stack. |
| Fastify@5.x | Node.js 20+ | Fastify 5 dropped support for Node 18. Node 22 LTS is required. |

---

## Sources

- Official Twilio tutorial: [Build AI Voice Assistant with Twilio + OpenAI Realtime Agents SDK](https://www.twilio.com/en-us/blog/developers/tutorials/product/speech-assistant-realtime-agents-sdk-node) — package list, architecture pattern, Node 22 requirement (HIGH confidence)
- Official Twilio tutorial: [Warm Transfer from OpenAI Realtime to Human Agent](https://www.twilio.com/en-us/blog/developers/tutorials/product/warm-transfer-openai-realtime-programmable-sip) — conference-based transfer architecture, exact npm install command (HIGH confidence)
- OpenAI Agents SDK docs: [Realtime Agents on Twilio](https://openai.github.io/openai-agents-js/extensions/twilio/) — confirms @openai/agents-extensions package (HIGH confidence)
- Twilio pricing: [Voice Pricing US](https://www.twilio.com/en-us/voice/pricing/us) — $0.0085/min inbound, $0.004/min media streams, $0.07/min ConversationRelay (HIGH confidence, verified 2026-03-19)
- OpenAI: [Introducing gpt-realtime](https://openai.com/index/introducing-gpt-realtime/) — current model names, pricing (HIGH confidence)
- npm registry: package versions for fastify, @openai/agents, twilio, googleapis, prisma, next, zod, ws — verified live (HIGH confidence)
- AssemblyAI: [Voice AI stack for agents 2026](https://www.assemblyai.com/blog/the-voice-ai-stack-for-building-agents) — ecosystem context, streaming pipeline pattern (MEDIUM confidence, vendor-authored)
- WebRTC.ventures: [ConversationRelay GA Release](https://webrtc.ventures/2025/05/twilios-conversationrelay-ga-release-brings-voice-ai-to-the-enterprise-mainstream/) — ConversationRelay vs Media Streams comparison (MEDIUM confidence)

---

*Stack research for: Voice AI Phone Agent SaaS (agent-call)*
*Researched: 2026-03-19*

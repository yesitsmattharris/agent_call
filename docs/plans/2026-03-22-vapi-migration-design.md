# Vapi Migration Design

**Date:** 2026-03-22
**Approach:** Full replacement (Approach A), Vapi-managed agent (Option A)
**Goal:** Replace Twilio transport layer with Vapi. Server becomes a stateless tool execution backend. Vapi owns audio pipeline, STT, LLM orchestration, TTS, and telephony.

---

## Architecture

### Current Flow
```
Caller -> Twilio -> POST /incoming-call (TwiML response)
                 -> WS /media-stream (dual bridge: Twilio <-> Server <-> OpenAI Realtime)
                 -> POST /call-status (logging)
```

### New Flow
```
Caller -> Vapi -> POST /api/vapi/webhook
                    |-- assistant-request -> return tenant-specific assistant config
                    |-- tool-calls -> execute tools, return results
                    |-- end-of-call-report -> finalize call log, store transcript
                    |-- status-update -> track call lifecycle
```

One endpoint replaces three routes. No WebSocket. No audio handling. No codec bridging. Stateless server with per-request tenant lookup.

---

## Webhook Handler

Single Fastify route: `POST /api/vapi/webhook`

### assistant-request
- Vapi calls with `message.call.phoneNumber.number`
- Load tenant by phone number (reuse existing loader)
- Run prompt builder to generate system prompt
- Return transient assistant config: firstMessage, model (openai/gpt-4o with system prompt), voice (per-tenant), tools (inline JSON Schema definitions), serverUrl

### tool-calls
- Identify tenant from call context (re-load from DB per request, stateless)
- Route by tool name: check_availability, book_appointment, take_message
- Return `{ results: [{ toolCallId, result }] }`

### end-of-call-report
- Vapi sends: transcript, recordingUrl, endedReason, duration, messages array
- Create or finalize CallLog with duration, outcome, transcript

### status-update
- Log and acknowledge

---

## Data Model Changes

### Tenant
- Rename `twilioPhoneNumber` -> `phoneNumber`
- Add `vapiAssistantId String?` (optional, for persistent assistant mode)
- Add `voiceProvider String? @default("11labs")`
- Add `voiceId String?`

### CallLog
- Rename `callSid` -> `callId`
- Add `recordingUrl String?`

### CallContext type
- Drop `streamSid`
- Rename `callSid` -> `callId`
- Keep: tenantId, googleCalendarId, googleCredentials, callLogId, timezone

### Environment Variables
- Remove: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN
- Add: VAPI_API_KEY, VAPI_WEBHOOK_SECRET
- Keep: PUBLIC_URL, OPENAI_API_KEY, DATABASE_URL, DIRECT_URL, Google Calendar vars

---

## Tool Migration

Current `tool()` from `@openai/agents` with Zod schemas become plain async functions with JSON Schema definitions.

### Tool definitions
JSON Schema format for Vapi assistant config (type, function.name, function.description, function.parameters).

### Tool executors
Plain async functions: `(args, tenant: TenantConfig) => Promise<string>`

### Tool routing
Map of tool name to executor function in webhook handler.

### end_call
Replaced by Vapi's built-in `endCall` tool. No custom implementation.

### Silence handling
Replaced by Vapi's `silenceTimeoutSeconds` on assistant config.

---

## Files Deleted
- `src/telephony/webhooks.ts` (TwiML, signature validation)
- `src/telephony/media-stream.ts` (WebSocket bridge, transport layer)
- `src/ai/session.ts` (in-memory session manager)

## Files Preserved
- `src/config/loader.ts` (tenant lookup by phone number)
- `src/config/prompt-builder.ts` (system prompt generation)
- `src/config/schema.ts` (TenantConfig types, updated fields)
- `src/ai/tools/calendar.ts` (Google Calendar logic)
- `src/ai/call-logger.ts` (call log creation/finalization)
- Admin UI, Prisma models, deployment config

## Files Rewritten
- New: `src/api/vapi-webhook.ts` (single webhook handler)
- New: `src/ai/tools/definitions.ts` (JSON Schema tool defs)
- Updated: `src/ai/tools/*.ts` (unwrap from tool() to plain functions)
- Updated: `prisma/schema.prisma` (renames + new fields)
- Updated: `admin/prisma/schema.prisma` (mirror changes)

## Dependencies
- Remove: `twilio`, `@openai/agents`, `@openai/agents-extensions`
- Add: `@vapi-ai/server-sdk`

---

## Free v2 Features

These become configuration rather than code:
- XFER-01/02: Built-in transferCall tool (cold + warm)
- BOOK-06: Built-in sms tool
- Voicemail detection: Phone number setting
- Per-tenant voice selection: voiceProvider + voiceId fields
- POST-01 (call summaries): LLM call on end-of-call-report message history
- POST-02 (returning caller): Query history in assistant-request, inject into prompt

---

**Estimated effort:** ~2-3 days
**Net code change:** Delete ~400 lines, add ~150 lines

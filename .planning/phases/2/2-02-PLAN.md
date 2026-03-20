---
phase: 2-tenant-identity
plan: 02
type: execute
wave: 2
depends_on: [01]
files_modified:
  - src/config/loader.ts
  - src/config/prompt-builder.ts
  - src/telephony/webhooks.ts
  - src/telephony/media-stream.ts
  - src/ai/realtime.ts
  - src/server.ts
  - src/config/prompt-builder.test.ts
  - src/config/loader.test.ts
autonomous: true
requirements: [CFG-06, CALL-03, CALL-04]

must_haves:
  truths:
    - "Voice server loads tenant config from database on each incoming call using Twilio To number"
    - "System prompt includes FAQ content when FAQs are configured"
    - "System prompt includes service list when services are configured"
    - "System prompt adjusts greeting and behavior based on whether business is currently open or closed"
    - "No in-memory config caching between calls"
  artifacts:
    - path: "src/config/loader.ts"
      provides: "Per-call tenant config loading from PostgreSQL"
      exports: ["loadTenantConfig"]
    - path: "src/config/prompt-builder.ts"
      provides: "Hours-aware system prompt with FAQ and service injection"
      exports: ["buildSystemPrompt", "isCurrentlyOpen"]
    - path: "src/telephony/webhooks.ts"
      provides: "Tenant resolution from Twilio To number on incoming call"
  key_links:
    - from: "src/telephony/webhooks.ts"
      to: "src/config/loader.ts"
      via: "loadTenantConfig(To)"
      pattern: "loadTenantConfig.*To"
    - from: "src/telephony/media-stream.ts"
      to: "src/ai/realtime.ts"
      via: "createRealtimeAgent(tenantConfig)"
      pattern: "createRealtimeAgent"
    - from: "src/ai/realtime.ts"
      to: "src/config/prompt-builder.ts"
      via: "buildSystemPrompt(config)"
      pattern: "buildSystemPrompt"
    - from: "src/config/prompt-builder.ts"
      to: "isCurrentlyOpen"
      via: "Checks business hours to switch greeting/behavior"
      pattern: "isCurrentlyOpen"
---

<objective>
Replace the static JSON config loader with per-call database lookups and extend the prompt builder to inject FAQs, services, and hours-aware behavior into the system prompt.

Purpose: This is the core voice server work for Phase 2. After this plan, the agent dynamically loads tenant config from the database on every call and adapts its behavior based on that config (CFG-06). The prompt includes FAQ content (CALL-03) and hours-aware instructions (CALL-04).

Output: Voice server that reads config from PostgreSQL per-call, with passing unit tests for all behaviors.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/2/2-CONTEXT.md
@.planning/phases/2/2-RESEARCH.md
@.planning/phases/2/2-01-SUMMARY.md

@src/config/loader.ts
@src/config/prompt-builder.ts
@src/config/schema.ts
@src/telephony/webhooks.ts
@src/telephony/media-stream.ts
@src/ai/realtime.ts
@src/server.ts
@src/db/prisma.ts

<interfaces>
<!-- From Plan 01 outputs (src/config/schema.ts after expansion) -->
The TenantConfig type will include:
- All Tenant scalar fields (businessName, agentName, greeting, description, escalationMessage, afterHoursMessage, voiceId, twilioPhoneNumber)
- faqs: Array<{ id: string; question: string; answer: string }>
- services: Array<{ id: string; name: string; description: string; startingAt: string | null }>
- businessHours: Array<{ id: string; dayOfWeek: number; openTime: string | null; closeTime: string | null }>

<!-- From src/ai/realtime.ts -->
export function createRealtimeAgent(config: BusinessConfig): RealtimeAgent

<!-- From src/telephony/webhooks.ts -->
IncomingCallBody: { CallSid: string; From: string; To: string }

<!-- From src/telephony/media-stream.ts -->
registerMediaStreamRoute(app: FastifyInstance, config: BusinessConfig): void
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Rewrite loader.ts and prompt-builder.ts for tenant-aware config</name>
  <files>src/config/loader.ts, src/config/prompt-builder.ts, src/config/prompt-builder.test.ts, src/config/loader.test.ts</files>
  <behavior>
    - loadTenantConfig("+15551234567") returns full tenant with faqs, services, businessHours
    - loadTenantConfig("+10000000000") throws "No tenant for number: +10000000000"
    - buildSystemPrompt(config with 2 FAQs) contains "FREQUENTLY ASKED QUESTIONS" and both Q/A pairs
    - buildSystemPrompt(config with 0 FAQs) does NOT contain "FREQUENTLY ASKED QUESTIONS"
    - buildSystemPrompt(config with services) contains "SERVICES OFFERED" and service names with prices
    - buildSystemPrompt(config with services without prices) contains "schedule a visit" guidance
    - isCurrentlyOpen(hours, fakeDate during open) returns true
    - isCurrentlyOpen(hours, fakeDate outside open) returns false
    - isCurrentlyOpen(empty hours array) returns false
    - buildSystemPrompt when closed includes "currently closed" and after-hours message
    - buildSystemPrompt when closed with custom afterHoursMessage uses that message
    - buildSystemPrompt when closed without afterHoursMessage generates one from hours
  </behavior>
  <action>
1. **Rewrite `src/config/loader.ts`** following Pattern 8 from 2-RESEARCH.md:
   - Replace `loadBusinessConfig()` (reads JSON) with `loadTenantConfig(twilioNumber: string)`
   - Import prisma from `../db/prisma.js`
   - Use `prisma.tenant.findUnique({ where: { twilioPhoneNumber }, include: { faqs: true, services: true, businessHours: true } })`
   - Throw descriptive error if tenant is null
   - Return the full tenant with relations
   - Keep the old function signature temporarily as a deprecated export for backwards compat during migration

2. **Rewrite `src/config/prompt-builder.ts`** following Pattern 10 from 2-RESEARCH.md:
   - Accept `TenantConfig` (from schema.ts) instead of `BusinessConfig`
   - Add `isCurrentlyOpen(hours: BusinessHoursEntry[], now?: Date): boolean` (accept optional Date for testability)
     - Get day of week and HH:mm time string from `now` (defaults to `new Date()`)
     - Find today's hours entry by dayOfWeek
     - If no entry or openTime/closeTime is null, return false
     - If closeTime < openTime, return false (midnight crossing not supported per CONTEXT.md)
     - Return `timeStr >= openTime && timeStr < closeTime`
   - Add `buildFaqBlock(faqs)`: returns FAQ section string or empty string
   - Add `buildServicesBlock(services)`: returns services section string or empty string. For services without startingAt, include note: "Contact us for pricing."
   - Update `buildSystemPrompt` to:
     - Call `isCurrentlyOpen` with the tenant's business hours
     - If open: use normal greeting from config
     - If closed: prepend "Thanks for calling [businessName], we're currently closed." to greeting (per CONTEXT.md locked decision). If `afterHoursMessage` is set, include it. If not, generate a message showing next opening time from hours data.
     - Append FAQ block after PERSONALITY section
     - Append services block after FAQ block
     - Add hallucination guardrail: "IMPORTANT: Only use facts from the FREQUENTLY ASKED QUESTIONS and SERVICES OFFERED sections above. If the caller asks something not covered, say you don't have that information and offer to take a message."
   - Export `isCurrentlyOpen` for direct testing

3. **Un-skip and update test files:**
   - `src/config/prompt-builder.test.ts`: Remove `.skip` from describe blocks. Update test fixtures to match the actual TenantConfig type from schema.ts. All tests should now pass against the rewritten prompt-builder.
   - `src/config/loader.test.ts`: Remove `.skip`. Mock `../db/prisma.js` using `vi.mock`. Verify loadTenantConfig calls prisma with correct where/include and handles null result.

4. Run all tests: `npx vitest run --reporter=dot` -- all must pass.
  </action>
  <verify>
    <automated>npx vitest run --reporter=dot</automated>
  </verify>
  <done>loadTenantConfig reads from DB by phone number. buildSystemPrompt injects FAQs, services, and hours-aware behavior. All tests pass green.</done>
</task>

<task type="auto">
  <name>Task 2: Wire voice server to use per-call tenant config</name>
  <files>src/telephony/webhooks.ts, src/telephony/media-stream.ts, src/ai/realtime.ts, src/server.ts</files>
  <action>
1. **Update `src/ai/realtime.ts`**:
   - Change import from `BusinessConfig` to `TenantConfig` (from schema.ts)
   - Update `createRealtimeAgent` to accept `TenantConfig`
   - Pass the full config to `buildSystemPrompt` (which now handles FAQs, services, hours)

2. **Update `src/telephony/webhooks.ts`** following Pattern 8 from 2-RESEARCH.md:
   - Import `loadTenantConfig` from `../config/loader.js`
   - In `/incoming-call` handler: extract `To` from body, call `loadTenantConfig(To)` to get tenant config
   - Store the tenant config in a Map keyed by CallSid (so media-stream can retrieve it)
   - Export the pending config map: `export const pendingConfigs = new Map<string, TenantConfig>()`
   - Wrap loadTenantConfig in try/catch: if no tenant found, log error and return a TwiML "sorry" message instead of connecting to the agent

3. **Update `src/telephony/media-stream.ts`**:
   - Remove the `config: BusinessConfig` parameter from `registerMediaStreamRoute`
   - Instead of receiving config at registration time, retrieve it from `pendingConfigs` Map using the callSid extracted from the Twilio start event
   - Import `pendingConfigs` from `./webhooks.js`
   - In the `start` event handler: `const config = pendingConfigs.get(callSid)` then `pendingConfigs.delete(callSid)`
   - If no config found for callSid, log error and close the socket
   - Create the agent with `createRealtimeAgent(config)` inside the start handler (moved from connection time to after config is available)
   - This means the transport and session creation also move inside the start handler. The socket message listener must buffer or the transport handles this (TwilioRealtimeTransportLayer already handles this per Phase 1 notes)

   **Critical consideration:** The current code creates the transport immediately on WebSocket connect so it catches the Twilio `start` event. Moving agent creation to after the start event means the transport needs to be created first without an agent. Approach:
   - Keep transport creation at WebSocket connect time (it just wraps the socket)
   - Listen for the `start` event via a raw socket message handler to extract callSid and get config
   - Then create agent + session with the config
   - Connect to OpenAI after agent creation
   - This restructure is safe because the transport buffers Twilio audio until session.connect() is called

4. **Update `src/server.ts`**:
   - Remove `loadBusinessConfig()` call and its import
   - Remove config parameter from `registerMediaStreamRoute(app, businessConfig)` -- now just `registerMediaStreamRoute(app)`
   - Config is loaded per-call in webhooks.ts, not at startup

5. Verify TypeScript compiles: `npx tsc --noEmit`
  </action>
  <verify>
    <automated>npx tsc --noEmit && npx vitest run --reporter=dot</automated>
  </verify>
  <done>Voice server no longer loads config at startup. Each incoming call resolves tenant from DB by phone number. Agent receives full tenant config including FAQs, services, and hours. TypeScript compiles clean. All tests pass.</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes
- `npx vitest run` passes all tests (prompt-builder and loader)
- `src/server.ts` does NOT import `loadBusinessConfig`
- `src/telephony/webhooks.ts` calls `loadTenantConfig(To)`
- `src/config/prompt-builder.ts` exports `isCurrentlyOpen` and includes FAQ/services/hours blocks
- No in-memory config caching (grep for module-level config variables should find none)
</verification>

<success_criteria>
The voice server dynamically loads tenant configuration from the database on every incoming call (CFG-06). The system prompt includes FAQ content (CALL-03) and adjusts behavior based on business hours (CALL-04). All unit tests pass. The voice server compiles and is ready for deployment once DATABASE_URL is configured.
</success_criteria>

<output>
After completion, create `.planning/phases/2/2-02-SUMMARY.md`
</output>

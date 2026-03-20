# Phase 2 Context: Tenant Identity

**Phase goal:** The agent is tenant-aware. It knows the specific business's name, services, hours, and FAQs. Business owners configure this through an admin UI. Config changes take effect on the next call without redeployment.

**Requirements:** CFG-01, CFG-02, CFG-03, CFG-04, CFG-05, CFG-06, CALL-03, CALL-04

---

## Decisions

### 1. Admin UI Experience

- **Polish level:** Bare-bones functional UI. Form fields, save buttons, done. Not styled for customer demos yet.
- **Auth:** Magic link authentication (email-based, no password).
- **Layout:** Single page with sections (business info, hours, services, FAQs, calendar connection). No sidebar or tab navigation. Collapsible sections on one scrollable page.
- **Save feedback:** Simple "saved" toast notification after successful save. No "changes take effect on next call" messaging needed.

### 2. FAQ Structure and Agent Behavior

- **Structure:** Flat question/answer pairs. No categories, no priority ordering. Business owner adds Q and A, that's it.
- **Upper bound:** ~10 FAQs expected. All injected directly into the system prompt. No retrieval layer needed.
- **Agent usage:** FAQs are reference knowledge, not scripts. The agent paraphrases, adapts, and connects dots conversationally. If a caller asks something adjacent to a configured FAQ, the agent should infer and answer using the configured content.
- **Multi-FAQ synthesis:** When a caller's question spans multiple FAQs, the agent combines them into a single natural answer rather than handling one at a time.
- **Hallucination guardrail:** The agent only answers using facts from configured FAQs and business info. If the caller asks something not covered, the agent acknowledges it doesn't have that info and offers to take a message (same escalation pattern as Phase 1).

### 3. After-Hours Call Behavior

- **Greeting:** Different from in-hours. Agent leads with "Thanks for calling [Business], we're currently closed" rather than the standard greeting.
- **After-hours message:** Business owner can configure a custom after-hours message in the admin UI. If not configured, the system generates one based on configured hours (e.g., "We're closed right now. Our next opening is Monday at 9 AM.").
- **Behavior:** Agent still answers FAQs and converses normally. It just can't take actionable steps. Wraps up by offering to take a message for callback.
- **Hours model:** Day-of-week open/close times only. No holiday or one-off closure support in v1.

### 4. Services Configuration and Agent Usage

- **Structure:** Name + short description per service (e.g., "Oil Change - Conventional and synthetic options, takes about 30 minutes").
- **Pricing:** Optional "starting at" field. If populated, the agent can share it. If empty, the agent says something like "I'd recommend scheduling a visit so we can give you an accurate quote."
- **Upper bound:** No hard cap. All services go into the system prompt alongside FAQs.
- **Agent usage:** When a caller describes a problem (e.g., "my brakes are squeaking"), the agent suggests the relevant service by name using the configured service list. The agent connects symptoms to services proactively.

---

## Code Context

### Existing Assets (from Phase 1)

- **Config system:** `src/config/loader.ts` loads `config/business.json` at startup, validated by Zod schema in `src/config/schema.ts`. Phase 2 replaces this with database reads.
- **Prompt builder:** `src/config/prompt-builder.ts` dynamically builds the system prompt from config. Phase 2 extends this to include FAQs, services, hours, and after-hours instructions.
- **Config schema:** Current Zod schema covers `businessName`, `agentName`, `greeting`, `businessDescription`, `escalationMessage`, `voiceId`. Phase 2 expands significantly.
- **Session manager:** `src/ai/session.ts` tracks active calls in-memory. Needs tenant ID association.
- **Tools:** `src/ai/tools.ts` has `take_message` (logs to console) and `end_call`. Message storage moves to database in Phase 2.
- **Deployment:** Voice server on Render (Docker), admin UI will deploy to Vercel (Next.js App Router).

### Integration Points

- **Voice server config loading:** Currently `loader.ts` reads JSON once at startup. Must change to per-call database lookup (by Twilio phone number to tenant mapping).
- **System prompt:** `prompt-builder.ts` needs FAQ content, service list, and hours-aware instructions injected.
- **Twilio webhook:** `/incoming-call` receives the called number (`To` field), which maps to a tenant's configured phone number in the database.

### Patterns to Preserve

- Zod validation for all config (extend schema, don't replace pattern)
- `@fastify/formbody` registered before all routes
- `@openai/agents` + `@openai/agents-extensions` at version 0.7.2 lockstep
- Template literal TwiML generation

---

## Deferred Ideas

- Holiday/one-off closure dates (revisit if customers request)
- FAQ categories and priority ordering (revisit if FAQ count grows beyond ~20)
- Polished admin UI with proper design system (post-demo, when showing to customers)
- Password-based auth or OAuth (magic link sufficient for now)
- Service recommendation engine beyond simple keyword matching (v2)

---

*Created: 2026-03-20*

# Roadmap: Agent Call

**Project:** agent-call
**Granularity:** Coarse (3 phases)
**Coverage:** 22/22 v1 requirements mapped
**Created:** 2026-03-19

---

## Phases

- [x] **Phase 1: Working Call** - A real caller can reach the AI agent via a dedicated phone number, have a bidirectional voice conversation, and the call ends cleanly
- [ ] **Phase 2: Tenant Identity** - The agent knows who it's working for, answers FAQs correctly, respects business hours, and can be reconfigured without redeployment
- [ ] **Phase 3: Call Resolution + Visibility** - The agent can book appointments, take messages, and business owners can review every call in the admin UI

---

## Phase Details

### Phase 1: Working Call

**Goal**: A caller can dial the business's dedicated number, be answered by the AI agent with natural-sounding voice, have a bidirectional conversation with clean barge-in handling, and the session ends cleanly on hangup. The server runs on a real WSS endpoint, not ngrok.

**Depends on**: Nothing (first phase)

**Requirements**: CALL-01, CALL-02, CALL-05, INFRA-01, INFRA-02, INFRA-03

**Success Criteria** (what must be TRUE when this phase completes):
1. Calling the Twilio number connects to the AI agent within 3 seconds with a natural-sounding greeting using the business name
2. The caller can speak and the AI responds with coherent conversational turns (bidirectional audio confirmed)
3. When the caller interrupts the AI mid-sentence, the AI stops immediately and does not reference content the caller never heard
4. When no resolution path is available, the agent offers to take a message or call back rather than going silent or looping
5. The voice server is deployed to Railway or Render with a valid WSS endpoint and handles calls without packet loss

**Plans:** 3 plans

Plans:
- [x] 1-01-PLAN.md -- Project scaffolding, config system, Fastify server with incoming call webhook
- [x] 1-02-PLAN.md -- Core audio bridge (Twilio <-> OpenAI Realtime), barge-in handling, agent tools, session lifecycle
- [x] 1-03-PLAN.md -- Render deployment, Twilio number provisioning, end-to-end call verification

---

### Phase 2: Tenant Identity

**Goal**: The agent is tenant-aware. It knows the specific business's name, services, hours, and FAQs. Business owners configure this through an admin UI. Config changes take effect on the next call without redeployment.

**Depends on**: Phase 1

**Requirements**: CFG-01, CFG-02, CFG-03, CFG-04, CFG-05, CFG-06, CALL-03, CALL-04

**Success Criteria** (what must be TRUE when this phase completes):
1. A business owner can set their business name, description, greeting, hours, services, and FAQs through the admin UI without touching code
2. When a caller asks a question covered by a configured FAQ, the agent answers accurately using that content without hallucinating
3. When a caller calls outside configured business hours, the agent acknowledges being closed and offers the appropriate after-hours response
4. After a business owner updates their configuration, the next inbound call reflects those changes without any server restart

**Plans:** 4 plans

Plans:
- [ ] 2-01-PLAN.md -- Prisma schema, database models, vitest setup, test scaffolds
- [ ] 2-02-PLAN.md -- Voice server DB integration: per-call config loading, prompt builder with FAQs/services/hours
- [ ] 2-03-PLAN.md -- Admin UI scaffold: Next.js project, Supabase magic link auth, dashboard shell
- [ ] 2-04-PLAN.md -- Admin UI config forms: business info, hours, FAQs, services, calendar placeholder

---

### Phase 3: Call Resolution + Visibility

**Goal**: The agent has the full resolution toolkit: it can book appointments on Google Calendar, capture structured messages for callback, and log every call. Business owners can browse and search call history with full transcripts in the admin UI.

**Depends on**: Phase 2

**Requirements**: BOOK-01, BOOK-02, BOOK-03, MSG-01, MSG-02, HIST-01, HIST-02, HIST-03

**Success Criteria** (what must be TRUE when this phase completes):
1. During a live call, the agent checks real-time Google Calendar availability and offers specific open slots to the caller
2. The agent books an appointment on Google Calendar with the caller's name and contact info, confirms details before finalizing, and the event appears in the calendar immediately
3. When booking is not possible (no availability, after-hours, caller just has a question), the agent captures the caller's name, number, reason, and preferred callback time
4. Every call appears in the admin UI with timestamp, duration, caller number, outcome, and the full conversation transcript
5. A business owner can search and browse call history from the admin UI

**Plans**: TBD

---

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Working Call | 3/3 | Complete | 2026-03-20 |
| 2. Tenant Identity | 0/4 | Planning complete | - |
| 3. Call Resolution + Visibility | 0/? | Not started | - |

---

## Coverage Map

| Requirement | Phase |
|-------------|-------|
| CALL-01 | Phase 1 |
| CALL-02 | Phase 1 |
| CALL-03 | Phase 2 |
| CALL-04 | Phase 2 |
| CALL-05 | Phase 1 |
| BOOK-01 | Phase 3 |
| BOOK-02 | Phase 3 |
| BOOK-03 | Phase 3 |
| MSG-01 | Phase 3 |
| MSG-02 | Phase 3 |
| CFG-01 | Phase 2 |
| CFG-02 | Phase 2 |
| CFG-03 | Phase 2 |
| CFG-04 | Phase 2 |
| CFG-05 | Phase 2 |
| CFG-06 | Phase 2 |
| HIST-01 | Phase 3 |
| HIST-02 | Phase 3 |
| HIST-03 | Phase 3 |
| INFRA-01 | Phase 1 |
| INFRA-02 | Phase 1 |
| INFRA-03 | Phase 1 |

**Total v1 mapped: 22/22**

---

*Roadmap created: 2026-03-19*
*Last updated: 2026-03-20 after Phase 2 planning*

# Requirements: Agent Call

**Defined:** 2026-03-19
**Core Value:** When a customer calls a business, an AI agent answers and handles the call naturally, either resolving the inquiry, booking an appointment, or taking a message.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Call Handling

- [x] **CALL-01**: AI agent answers inbound calls with a natural-sounding voice
- [x] **CALL-02**: Agent greets caller using the business name and context from configuration
- [x] **CALL-03**: Agent answers caller questions using FAQ content from business configuration without hallucinating
- [x] **CALL-04**: Agent adjusts behavior based on configured business hours (in-hours vs after-hours)
- [x] **CALL-05**: Agent gracefully escalates when it cannot handle a request (takes a message rather than dead-ending)

### Booking

- [x] **BOOK-01**: Agent checks real-time availability on Google Calendar during a live call
- [x] **BOOK-02**: Agent books an appointment on Google Calendar with caller's name and contact info
- [x] **BOOK-03**: Agent confirms booking details back to the caller before finalizing

### Message Taking

- [ ] **MSG-01**: Agent captures caller's name, phone number, reason for calling, and preferred callback time
- [ ] **MSG-02**: Message is stored and visible to business owner in the admin interface

### Agent Configuration

- [x] **CFG-01**: Business owner can set business name, description, and greeting via admin UI
- [x] **CFG-02**: Business owner can configure business hours (open/close times per day of week)
- [x] **CFG-03**: Business owner can add FAQ entries (question/answer pairs) that the agent uses
- [x] **CFG-04**: Business owner can list services offered by the business
- [x] **CFG-05**: Business owner can connect their Google Calendar for appointment booking
- [x] **CFG-06**: Agent behavior updates immediately when configuration changes (no redeployment)

### Call History

- [ ] **HIST-01**: Every call is logged with timestamp, duration, caller number, and outcome
- [ ] **HIST-02**: Full conversation transcript is stored and viewable for each call
- [ ] **HIST-03**: Business owner can browse and search call history in admin UI

### Infrastructure

- [x] **INFRA-01**: Each business gets a dedicated Twilio phone number
- [x] **INFRA-02**: System handles barge-in (caller interruptions) cleanly without audio desync
- [x] **INFRA-03**: Voice server deployed to a real WSS endpoint (not ngrok)

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Call Transfer

- **XFER-01**: Agent can cold-transfer a call to a configured phone number
- **XFER-02**: Agent can warm-transfer (brief the human, then connect the caller)
- **XFER-03**: Agent can offer callback as an alternative to hold/transfer

### Enhanced Booking

- **BOOK-04**: Agent can handle rescheduling requests for existing appointments
- **BOOK-05**: Agent can handle cancellation requests
- **BOOK-06**: Agent sends SMS confirmation after booking via Twilio

### Post-Call Intelligence

- **POST-01**: AI-generated summary of each call (intent, outcome, action items)
- **POST-02**: Returning caller recognition (personalized greeting based on call history)
- **POST-03**: Call analytics dashboard (volume, outcomes, peak hours)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Visual drag-and-drop flow builder | Fights the config-driven differentiator; high complexity |
| Outbound calling / campaigns | Different product surface; TCPA compliance burden |
| SMS/chat as full channels | Turns focused phone agent into general comms platform |
| Mobile app | Web-first; responsive admin is sufficient |
| Multi-tenant / white-label reseller | Not v1; revisit if distribution strategy requires it |
| Role-based access control | SMB context, usually 1-2 owners; single account sufficient |
| Real-time call monitoring ("listen in") | Post-call transcripts cover 90% of the use case |
| Multilingual support | Validate English-first; add languages when customer segment confirmed |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| CALL-01 | Phase 1 | Complete |
| CALL-02 | Phase 1 | Complete |
| CALL-03 | Phase 2 | Complete |
| CALL-04 | Phase 2 | Complete |
| CALL-05 | Phase 1 | Complete |
| BOOK-01 | Phase 3 | Complete |
| BOOK-02 | Phase 3 | Complete |
| BOOK-03 | Phase 3 | Complete |
| MSG-01 | Phase 3 | Pending |
| MSG-02 | Phase 3 | Pending |
| CFG-01 | Phase 2 | Complete |
| CFG-02 | Phase 2 | Complete |
| CFG-03 | Phase 2 | Complete |
| CFG-04 | Phase 2 | Complete |
| CFG-05 | Phase 2 | Complete |
| CFG-06 | Phase 2 | Complete |
| HIST-01 | Phase 3 | Pending |
| HIST-02 | Phase 3 | Pending |
| HIST-03 | Phase 3 | Pending |
| INFRA-01 | Phase 1 | Complete |
| INFRA-02 | Phase 1 | Complete |
| INFRA-03 | Phase 1 | Complete |

**Coverage:**
- v1 requirements: 22 total
- Mapped to phases: 22
- Unmapped: 0

---
*Requirements defined: 2026-03-19*
*Last updated: 2026-03-21 after Plan 3-02 completion*

# Agent Call

## What This Is

A B2B SaaS product that gives small businesses an AI-powered phone agent. When a customer calls in, the AI answers, handles the conversation through a configurable flow, and can book appointments (via calendar integration) or transfer to a human. Business owners configure their agent through a minimal admin interface, providing business details, hours, services, and FAQs, and the AI uses that context to handle calls intelligently.

## Core Value

When a customer calls a business, an AI agent answers and handles the call naturally, either resolving the inquiry, booking an appointment, or connecting them to the right person.

## Requirements

### Validated

(None yet, ship to validate)

### Active

- [ ] AI agent answers inbound calls and converses naturally with callers
- [ ] Business owners configure their agent via a minimal admin UI (business info, hours, services, FAQs)
- [ ] AI can book appointments by integrating with Google Calendar
- [ ] AI can warm-transfer calls (brief the human, then connect)
- [ ] AI can cold-transfer calls to a configured number
- [ ] AI can take a message for callback
- [ ] Business owners can view call history and logs
- [ ] Config-driven call flows (no visual builder, AI interprets business context)

### Out of Scope

- Visual drag-and-drop flow builder, too complex for v1, revisit in v2
- Mobile app, web-first
- Multi-tenant enterprise features (SSO, role-based access), SMB focus for now
- Outbound calling, inbound only for v1
- SMS/chat channels, voice only for v1

## Context

- Target market: general SMBs that receive inbound phone calls (service businesses, restaurants, offices, etc.)
- This is a demo-stage product, cost sensitivity is high, free/cheap tooling preferred
- Builder has experience with both Twilio and Vapi
- Success for v1: call a number, AI answers, handles a scenario end-to-end (book or transfer)

## Constraints

- **Budget**: Demo-stage, minimize costs. Twilio pay-as-you-go for telephony.
- **LLM**: OpenAI (GPT-4o or similar) for conversational AI
- **Telephony**: Twilio for call handling and phone number provisioning
- **Simplicity**: Config-driven flows over complex flow builders

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Config-driven flows over visual builder | Simpler to build, validate core value first | -- Pending |
| Twilio for telephony | Known tool, cheap pay-as-you-go, full control over stack | -- Pending |
| OpenAI for conversational AI | User preference | -- Pending |
| Dedicated phone numbers (not call forwarding) | Simpler for v1, no dependency on business's existing setup | -- Pending |
| Minimal admin UI over full dashboard | Enough to configure agent and see call history, nothing more | -- Pending |

---
*Last updated: 2026-03-19 after initialization*

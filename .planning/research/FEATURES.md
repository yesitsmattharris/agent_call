# Feature Research

**Domain:** Voice AI Phone Agent SaaS (B2B, SMB inbound calls)
**Researched:** 2026-03-19
**Confidence:** MEDIUM-HIGH (WebSearch verified against multiple competitor product pages and industry analyses)

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features SMB buyers assume exist. Missing these means the product feels broken or incomplete before they even evaluate differentiators.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| 24/7 inbound call answering | The whole value prop; if it sleeps, hire a human | LOW | Core telephony + agent loop |
| Natural-sounding voice | Bot voices cause callers to hang up within 20-30 seconds | LOW | Use a modern TTS provider (ElevenLabs, Deepgram, OpenAI TTS); do not synthesize voice in-house |
| Business hours / after-hours awareness | Callers expect different handling at 2am vs 10am | LOW | Agent uses configured hours; no separate IVR tree needed if LLM interprets context |
| FAQ answering (hours, location, services) | Callers ask this on every call; agent must answer without hallucinating | LOW-MEDIUM | Ground answers in business config, not LLM training data |
| Message taking with callback info | Escape hatch when AI can't resolve; caller must not dead-end | LOW | Capture name, number, reason, preferred callback time |
| Cold call transfer to a configured number | Basic escalation; expected by any business with staff | LOW | Twilio `<Dial>` or equivalent; SIP transfer |
| Warm call transfer (brief human before connecting) | Expected in any professional context; cold transfers feel abrupt | MEDIUM | Two-leg call: agent speaks to human briefly, then bridges caller |
| Appointment booking with calendar check | ~8% of SMB calls are scheduling requests; this is the primary conversion event | HIGH | Real-time availability check + write to Google Calendar; most complex table-stakes feature |
| Call history and transcripts in admin | Business owner needs to know what happened on every call | MEDIUM | Store transcript, timestamp, outcome, duration; searchable |
| Agent configuration via business context | Business must be able to define who they are, what they do, their hours, services | LOW | Structured form that builds a system prompt; no coding required |
| Graceful fallback for unhandled scenarios | If AI is confused, it must not hang up or loop; it must escalate | LOW | Hardcoded fallback: "Let me connect you with someone who can help" |

### Differentiators (Competitive Advantage)

Features that are not universally expected but create meaningful competitive separation and retention. Agent Call should pick 1-2 to own deeply rather than spreading thin.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Plain-English agent configuration (no flow builder) | SMB owners are not technical; plain text setup beats drag-and-drop for non-technical users | MEDIUM | LLM interprets business context rather than following hardcoded paths; this is the project's stated differentiator |
| Post-call AI summary + action items | Saves business owner from reading full transcripts; surfaces what matters | MEDIUM | Structured extraction after each call: intent, outcome, next steps |
| Caller sentiment detection + escalation trigger | Detect frustration and auto-escalate before the caller asks to; feels proactive | HIGH | Requires sentiment model in the call loop; adds latency risk |
| Rescheduling and cancellation handling | Most appointment tools only book; rescheduling requires reading existing events | HIGH | Google Calendar read + write; handle ambiguous requests ("move my Thursday appointment") |
| SMS follow-up after call | Confirmation texts after bookings; "We'll see you Tuesday at 3pm" | LOW-MEDIUM | Twilio SMS; triggered post-call; improves no-show rates |
| Per-service booking rules | Different appointment types have different durations, buffers, staff | HIGH | Requires structured service catalog in config, not just free-text description |
| Call analytics dashboard (volume, outcomes, peak hours) | Helps SMB owner understand their call traffic and agent ROI | MEDIUM | Aggregate metrics over call history; charts for weekly/monthly trends |
| Caller ID lookup + returning caller recognition | Personalized "Welcome back, Sarah" creates stickiness | MEDIUM | Match phone number to past calls; surface prior context to agent |
| Multilingual support | Opens market to non-English-speaking SMBs and their callers | HIGH | Requires multilingual TTS + ASR; separate LLM system prompt per language or multilingual model |
| Vertical-specific integrations (e.g., restaurant POS, healthcare EHR) | Deep integrations in one vertical beat shallow integrations everywhere | HIGH | Premature for v1; revisit after identifying dominant customer vertical |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem valuable but create scope creep, UX confusion, or implementation burden disproportionate to the v1 goal.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Visual drag-and-drop flow builder | "I want to see exactly what the AI does" | High implementation cost; fights against the config-driven differentiator; Twilio Studio already does this | Let LLM interpret structured business context; show call transcripts to build trust instead |
| Outbound calling / campaigns | "Can it follow up with leads?" | Orthogonal to inbound answering; adds dialer infra, compliance (TCPA), and a different UX surface | Defer to v2; focus on inbound first |
| SMS/chat channels | "I want one inbox" | Turns a focused phone agent into a general communication platform; requires separate conversation management | Voice-only for v1; SMS confirmation is acceptable as a side effect of calls, not a full channel |
| Mobile app | "I want to check calls from my phone" | Web-first is faster to ship and good enough; native app adds store approval, push infra | Responsive web admin; consider PWA if needed |
| Multi-tenant / white-label reseller | "Agencies want to resell this" | Requires complex tenant isolation, billing per sub-tenant, custom branding infra | Revisit if distribution strategy calls for it; not v1 |
| Role-based access control | "My office manager should only see X" | SMB context: usually one or two owners; RBAC adds auth complexity for a persona that rarely needs it | Single owner account per business for v1 |
| Real-time live monitoring ("listen in" to active calls) | Supervisors want to monitor | Requires WebSocket audio streaming to browser; non-trivial latency and security considerations | Post-call transcripts satisfy 90% of the use case |
| AI-generated follow-up emails | "Have it email the customer" | Crosses into email marketing infra; requires SMTP, template management, spam compliance | SMS confirmation is sufficient; email is a different product |

---

## Feature Dependencies

```
[Appointment Booking]
    └──requires──> [Google Calendar Integration]
                       └──requires──> [OAuth / Service Account Auth]

[Warm Call Transfer]
    └──requires──> [Cold Call Transfer]
                       └──requires──> [Telephony (Twilio)]

[Post-Call AI Summary]
    └──requires──> [Call Transcript Storage]
                       └──requires──> [Call History / Logs]

[Returning Caller Recognition]
    └──requires──> [Call History / Logs]

[SMS Confirmation After Booking]
    └──requires──> [Appointment Booking]
    └──requires──> [Twilio SMS]

[Agent Configuration]
    └──required by──> [FAQ Answering]
    └──required by──> [Business Hours Awareness]
    └──required by──> [Appointment Booking] (services, duration rules)

[Call Analytics Dashboard]
    └──requires──> [Call History / Logs]

[Rescheduling / Cancellation]
    └──requires──> [Appointment Booking]
    └──requires──> [Google Calendar read access to existing events]
```

### Dependency Notes

- **Appointment Booking requires Google Calendar Integration:** The agent must check real availability in real-time during a live call. A stub or fake calendar check will cause double-booking in production.
- **Warm Transfer requires Cold Transfer:** Warm transfer is an enhancement on the two-party bridge; cold transfer (simple redirect) must exist first.
- **Post-Call Summary requires Transcript Storage:** You cannot summarize what was not stored. Transcript storage is a prerequisite, not a concurrent feature.
- **Agent Configuration is foundational:** Nearly every runtime feature (FAQ, hours, booking rules) is parameterized by what the business owner configured. This must be phase 1.
- **SMS Confirmation enhances Appointment Booking:** These can ship together but SMS is non-critical path; booking confirmation can live in the admin dashboard first.

---

## MVP Definition

### Launch With (v1)

Minimum feature set to demonstrate end-to-end value: "call a number, AI handles it, something real happens."

- [ ] Agent configuration (business name, hours, services, FAQs as plain text) -- required for any intelligent behavior
- [ ] Inbound call answering with natural voice -- core product experience
- [ ] FAQ answering grounded in business config -- prevents hallucination on basic questions
- [ ] Business hours awareness (in-hours vs after-hours handling) -- expected by callers
- [ ] Appointment booking via Google Calendar -- primary conversion event, highest-value outcome
- [ ] Cold call transfer to configured number -- basic escalation safety net
- [ ] Warm call transfer -- differentiates from voicemail-only services
- [ ] Message taking with callback info -- fallback when nothing else resolves the call
- [ ] Call history and transcripts in admin -- business owner needs visibility to trust the product
- [ ] Graceful fallback for unhandled scenarios -- prevents dead ends

### Add After Validation (v1.x)

Add when v1 is live and core loop is validated with real callers.

- [ ] Post-call AI summary -- add once transcript volume makes reading individual logs impractical
- [ ] SMS confirmation after booking -- improves no-show rate; low-cost add after booking works
- [ ] Returning caller recognition -- improves experience once call history exists
- [ ] Basic call analytics (volume, outcomes by day/week) -- business owner wants ROI proof

### Future Consideration (v2+)

Defer until product-market fit is established and dominant use case is clear.

- [ ] Rescheduling and cancellation handling -- requires reading existing calendar state; high complexity, validate booking demand first
- [ ] Per-service booking rules (different durations, buffers per service type) -- need real SMB feedback to know how granular rules need to be
- [ ] Caller sentiment escalation -- adds latency risk; validate quality of base experience first
- [ ] Multilingual support -- only valuable once non-English customer segment is confirmed
- [ ] Vertical-specific integrations (POS, EHR) -- only after identifying dominant vertical in customer base
- [ ] Outbound calling / campaigns -- different product surface; separate roadmap
- [ ] Visual flow builder -- only if config-driven approach proves insufficient for complex businesses

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Inbound call answering (natural voice) | HIGH | LOW | P1 |
| Agent configuration (plain text) | HIGH | LOW | P1 |
| Appointment booking (Google Calendar) | HIGH | HIGH | P1 |
| FAQ answering from business context | HIGH | LOW | P1 |
| Business hours awareness | HIGH | LOW | P1 |
| Cold call transfer | HIGH | LOW | P1 |
| Warm call transfer | HIGH | MEDIUM | P1 |
| Message taking | HIGH | LOW | P1 |
| Call history and transcripts | HIGH | MEDIUM | P1 |
| Graceful fallback | HIGH | LOW | P1 |
| Post-call AI summary | MEDIUM | MEDIUM | P2 |
| SMS confirmation after booking | MEDIUM | LOW | P2 |
| Returning caller recognition | MEDIUM | MEDIUM | P2 |
| Call analytics dashboard | MEDIUM | MEDIUM | P2 |
| Rescheduling / cancellation | HIGH | HIGH | P3 |
| Per-service booking rules | MEDIUM | HIGH | P3 |
| Caller sentiment escalation | LOW | HIGH | P3 |
| Multilingual support | MEDIUM | HIGH | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

---

## Competitor Feature Analysis

| Feature | Retell AI | Bland AI / My AI Front Desk | Our Approach |
|---------|--------------|--------------|--------------|
| Call answering | Yes, LLM-driven with structured dialogue pathways | Yes, conversational pathways with conditional logic | LLM interprets plain-text business config; no pathway builder |
| Appointment booking | Via Cal.com or custom integrations | Third-party booking integrations | Native Google Calendar integration; no third-party dependency |
| Call transfer (warm/cold) | Yes | Yes | Yes; warm transfer with briefing is a priority |
| Post-call summary | Yes, with sentiment and intent extraction | Yes, call analytics | AI summary after each call; simpler initial version |
| Knowledge base sync | Automatic website/doc sync | Manual configuration | Manual config with plain text; auto-sync is v2 |
| CRM integration | HubSpot, Salesforce, GoHighLevel | HubSpot, CRM tools | Not v1; call logs in admin are the CRM substitute initially |
| Visual flow builder | Yes | Yes (Bland Conversational Pathways) | Explicitly not building this; config-driven is the differentiator |
| Pricing model | ~$0.07/min pay-as-you-go | ~$0.09/min + feature fees | Per-call or per-minute subscription TBD |
| Target market | Mid-market to enterprise | Enterprise | SMB; simpler setup, lower price point |

---

## Sources

- [Best AI Answering Services 2025 - Upfirst](https://upfirst.ai/blog/best-ai-answering-services) (MEDIUM confidence -- editorial roundup)
- [Retell AI vs. Bland AI Feature Comparison](https://www.retellai.com/blog/retell-ai-vs-bland-ai-choose-the-right-voice-agent-for-your-business) (MEDIUM confidence -- vendor-authored, cross-checked against Bland docs)
- [Best AI Voice Agents 2026 - Aloware](https://aloware.com/blog/best-ai-voice-agents-complete-guide-for-smbs) (MEDIUM confidence)
- [AI Receptionists 2024-2025: 50+ Statistics - Resonate AI](https://www.resonateapp.com/resources/ai-receptionists-statistics) (MEDIUM confidence -- aggregate survey data)
- [Common Voice AI Agent Challenges - Beconversive](https://www.beconversive.com/blog/voice-ai-challenges) (MEDIUM confidence -- practitioner post)
- [My AI Front Desk: AI Receptionist Business Model](https://www.myaifrontdesk.com/blogs/the-future-of-front-desks-exploring-the-ai-receptionist-business-model) (LOW-MEDIUM confidence -- vendor blog)
- [Best AI Receptionist for Small Business - NextPhone](https://www.getnextphone.com/blog/best-ai-receptionist) (MEDIUM confidence)
- [AI Voice Agent for Appointment Booking - GoodCall](https://www.goodcall.com/voice-ai/ai-voice-agent-for-appointment-booking) (MEDIUM confidence)
- [AI Receptionists Embracing Live Transfers 2025 - My AI Front Desk](https://www.myaifrontdesk.com/blogs/is-ai-receptionist-sector-embracing-live-transfers-a-2025-recommendation-b1cfa) (LOW-MEDIUM confidence -- vendor blog)

---

*Feature research for: Voice AI Phone Agent SaaS (B2B SMB)*
*Researched: 2026-03-19*

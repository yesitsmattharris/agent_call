# Phase 1 Context: Working Call

**Phase goal:** A caller can dial the business's dedicated number, be answered by the AI agent with natural-sounding voice, have a bidirectional conversation with clean barge-in handling, and the session ends cleanly on hangup. The server runs on a real WSS endpoint.

**Requirements:** CALL-01, CALL-02, CALL-05, INFRA-01, INFRA-02, INFRA-03

---

## Decisions

### 1. Agent Greeting and Persona

- **Greeting style:** Professional/warm. Format: "Thanks for calling [Business], this is Gary, how can I help you?"
- **Agent name:** Gary
- **Voice:** Use the friendliest-sounding OpenAI Realtime voice (researcher should determine which voice ID best fits "friendly")
- **AI disclosure:** Truthful. If a caller asks "Am I talking to a robot?", Gary says yes, he's an AI assistant for the business. No deflection.

### 2. Graceful Escalation (Phase 1)

- **Escalation behavior:** When Gary can't help, he offers to take the caller's name and number for a callback.
- **Message storage:** Console/server logs only in Phase 1. No database writes for messages yet.
- **Retry before escalation:** Gary attempts to rephrase/clarify once before escalating. Not immediately.
- **Frustrated caller:** Gary is polite and understanding. Acknowledges frustration, apologizes, takes their info, and promises a callback. ("I completely understand. Let me get your name and number and we'll have someone call you right back.") No transfer capability in Phase 1.
- **No direct number fallback:** Gary does not give out a phone number to call. Callback offer only.

### 3. Call Ending and Silence Handling

- **Natural ending:** Gary initiates wrap-up with "Is there anything else I can help you with?" If no, says "Thanks for calling [Business], have a great day!" then ends the call.
- **Silence timeout:** 10 seconds of silence -> "Are you still there?" -> 15 more seconds of silence -> "I'll let you go. Have a great day!" -> hang up.
- **Caller hangs up mid-conversation:** Silent teardown. Server closes both WebSocket connections, logs call metadata (duration, timestamp, caller number). No audio response into a dead line.
- **Background noise / unintelligible speech:** Gary asks "Sorry, I didn't catch that, could you repeat?" once. If still unintelligible, offers to take a message.

### 4. Business Identity Source

- **Config source:** A JSON config file in the repo (e.g., `config/business.json`) containing business name, greeting, and any other identity fields. This mirrors the structure the admin UI will write to in Phase 2.
- **Demo business:** Generic placeholder (e.g., "Sunshine Auto Repair" or similar). Not a real business.
- **FAQ knowledge:** None in Phase 1. Gary greets, converses, and takes messages. He does not answer domain-specific questions.
- **Unknown business questions:** Gary acknowledges he doesn't have the info ("I don't have that information right now") then pivots to offering a callback ("I'd be happy to have someone get back to you with those details. Can I get your name and number?").

---

## Code Context

- **Codebase:** Greenfield. No existing source code.
- **Reusable assets:** None.
- **Integration points:** Twilio Media Streams (inbound), OpenAI Realtime API (voice AI).

---

## Deferred Ideas

- Warm/cold transfer to a human (v2, XFER-01/02)
- Giving callers a direct number to call (revisit when transfer exists)
- FAQ answering (Phase 2, after admin UI and config DB)

---

*Created: 2026-03-19*

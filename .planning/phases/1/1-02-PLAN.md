---
phase: 1-working-call
plan: 02
type: execute
wave: 2
depends_on: [01]
files_modified:
  - src/telephony/media-stream.ts
  - src/ai/realtime.ts
  - src/ai/session.ts
  - src/ai/tools.ts
  - src/server.ts
autonomous: true
requirements: [CALL-01, CALL-02, CALL-05, INFRA-02]

must_haves:
  truths:
    - "When a Twilio Media Stream WebSocket connects at /media-stream, the server opens an OpenAI Realtime session and bridges audio bidirectionally"
    - "The AI agent greets the caller with the configured greeting using a natural-sounding voice"
    - "When the caller speaks, the AI responds with coherent conversational turns"
    - "When the caller interrupts the AI mid-sentence, the AI stops immediately (barge-in via truncate + clear)"
    - "When the caller hangs up, both WebSocket connections close cleanly and session state is removed"
    - "When the caller asks something the agent cannot help with, the agent offers to take a message using the take_message tool"
    - "After 10s silence the agent asks 'Are you still there?', after 15s more the agent says goodbye and ends the call"
  artifacts:
    - path: "src/telephony/media-stream.ts"
      provides: "WebSocket handler for Twilio Media Streams, bridges to OpenAI"
      exports: ["registerMediaStreamRoute"]
    - path: "src/ai/realtime.ts"
      provides: "OpenAI Realtime API session management via @openai/agents"
      exports: ["createRealtimeSession"]
    - path: "src/ai/session.ts"
      provides: "Call session lifecycle (create, track, cleanup)"
      exports: ["SessionManager", "CallSession"]
    - path: "src/ai/tools.ts"
      provides: "Tool definitions for the AI agent (take_message, end_call)"
      exports: ["agentTools"]
  key_links:
    - from: "src/server.ts"
      to: "src/telephony/media-stream.ts"
      via: "registerMediaStreamRoute(app) replaces placeholder"
      pattern: "registerMediaStreamRoute"
    - from: "src/telephony/media-stream.ts"
      to: "src/ai/realtime.ts"
      via: "createRealtimeSession() on Twilio WS connect"
      pattern: "createRealtimeSession"
    - from: "src/ai/realtime.ts"
      to: "src/ai/tools.ts"
      via: "agentTools registered with the RealtimeAgent"
      pattern: "agentTools"
    - from: "src/telephony/media-stream.ts"
      to: "src/ai/session.ts"
      via: "SessionManager tracks active calls, cleanup on disconnect"
      pattern: "SessionManager"
    - from: "src/ai/realtime.ts"
      to: "src/config/prompt-builder.ts"
      via: "buildSystemPrompt(config) sets agent instructions"
      pattern: "buildSystemPrompt"
---

<objective>
Implement the core audio bridge between Twilio Media Streams and OpenAI Realtime API, including barge-in handling, session lifecycle management, the take-message tool, and silence handling. This is the product's central value: a caller speaks, the AI responds naturally.

Purpose: This plan delivers the actual voice conversation capability. Without it, the server accepts calls but cannot respond. The barge-in handling (INFRA-02) is core infrastructure that must be built here, not added later.

Output: A fully functional bidirectional voice bridge where Twilio audio flows to OpenAI and back, with interrupt handling, session cleanup, agent tools, and silence detection.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/1/1-CONTEXT.md
@.planning/phases/1/1-01-SUMMARY.md
@.planning/research/STACK.md
@.planning/research/ARCHITECTURE.md
@.planning/research/PITFALLS.md

<interfaces>
<!-- From Plan 01 outputs that this plan depends on -->

From src/config/schema.ts:
```typescript
export interface BusinessConfig {
  businessName: string;
  agentName: string;
  greeting: string;
  businessDescription: string;
  escalationMessage: string;
  voiceId: string;
}
export const businessConfigSchema: ZodSchema<BusinessConfig>;
```

From src/config/loader.ts:
```typescript
export function loadBusinessConfig(): BusinessConfig;
```

From src/config/prompt-builder.ts:
```typescript
export function buildSystemPrompt(config: BusinessConfig): string;
```

From src/telephony/twiml.ts:
```typescript
export function buildStreamResponse(wsUrl: string): string;
```

From src/telephony/webhooks.ts:
```typescript
export function registerWebhookRoutes(app: FastifyInstance): void;
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Session manager, tools, and OpenAI Realtime agent setup</name>
  <files>src/ai/session.ts, src/ai/tools.ts, src/ai/realtime.ts</files>
  <action>
Build the AI layer that manages call sessions, defines agent tools, and creates the OpenAI Realtime agent.

**1. src/ai/session.ts - Call session lifecycle:**

Create a `CallSession` interface:
```typescript
interface CallSession {
  callSid: string;
  streamSid: string | null;
  from: string;
  to: string;
  startedAt: Date;
  messages: Array<{ role: string; content: string; timestamp: Date }>;
}
```

Create a `SessionManager` class (singleton pattern):
- `sessions: Map<string, CallSession>` keyed by streamSid
- `createSession(streamSid: string, callSid: string, from: string, to: string): CallSession`
- `getSession(streamSid: string): CallSession | undefined`
- `removeSession(streamSid: string): void` - logs call duration and metadata when removing
- `logMessage(streamSid: string, role: string, content: string): void`

Add a periodic cleanup timer (every 5 minutes) that evicts sessions older than 30 minutes to prevent memory leaks from missed `stop` events (per PITFALLS.md).

Export the singleton instance and the types.

**2. src/ai/tools.ts - Agent tool definitions:**

Define tools using the pattern expected by `@openai/agents` SDK. The SDK uses Zod for parameter schemas.

Tool 1: `take_message`
- Description: "Record a message from the caller for a callback. Use this when the caller wants to leave their information for someone to call them back."
- Parameters (Zod schema):
  - callerName: z.string().describe("The caller's name")
  - callbackNumber: z.string().describe("Phone number to call back")
  - reason: z.string().describe("Why they are calling")
  - preferredTime: z.string().optional().describe("When they prefer to be called back")
- Handler: Log the message to console as structured JSON (Phase 1 stores messages in logs only per CONTEXT.md). Return a confirmation string like "Message recorded. Someone will call {callerName} back at {callbackNumber}."

Tool 2: `end_call`
- Description: "End the current phone call. Use this after the caller confirms they have no more questions, or after extended silence."
- Parameters: none (empty object)
- Handler: This tool signals that the call should be ended. Return "Call ending." The actual hangup is handled by the media-stream handler when it detects this tool was called (it sends a close message to Twilio).

Export `agentTools` as an array of tool definitions compatible with the `@openai/agents` SDK.

IMPORTANT: Check the `@openai/agents` SDK documentation for the exact tool definition format. The SDK may use a `tool()` function or a class-based approach. Adapt accordingly. The key is that tools use Zod schemas for parameters and have async handler functions.

**3. src/ai/realtime.ts - OpenAI Realtime session factory:**

Export `createRealtimeSession(config: BusinessConfig)` that:

1. Creates a `RealtimeAgent` (from `@openai/agents`) configured with:
   - name: config.agentName (e.g., "Gary")
   - instructions: `buildSystemPrompt(config)` (imported from config/prompt-builder.ts)
   - voice: config.voiceId (e.g., "ash")
   - model: "gpt-4o-realtime-preview" (or whatever the current model slug is for OpenAI Realtime, check the SDK docs)
   - tools: agentTools (imported from tools.ts)

2. Returns the configured agent (the actual transport/connection is handled in media-stream.ts using TwilioRealtimeTransportLayer).

IMPORTANT: The exact API surface of `@openai/agents` and `@openai/agents-extensions` must be verified by the executor. The SDK may use `RealtimeAgent`, `realtimeAgent()`, or another pattern. The research references `TwilioRealtimeTransportLayer` from `@openai/agents-extensions` as the key class that handles codec bridging, but the exact constructor signature should be verified against the installed package.

Key behavior requirements:
- The agent MUST use the system prompt from buildSystemPrompt() which includes all behavioral instructions (greeting, escalation, silence handling, call ending)
- The voice MUST sound natural and friendly (the "ash" voice or equivalent)
- Tool definitions MUST be registered so the agent can call take_message and end_call
  </action>
  <verify>
    <automated>cd /Users/matthewharris/Workspace/personal/ai/agent-call && npx tsc --noEmit && echo "TypeScript compiles" && npx tsx -e "import { SessionManager } from './src/ai/session.ts'; const sm = new SessionManager(); const s = sm.createSession('stream1', 'call1', '+15551234567', '+15559876543'); console.log('Session created:', s.callSid); console.log('Session retrievable:', !!sm.getSession('stream1')); sm.removeSession('stream1'); console.log('Session removed:', !sm.getSession('stream1'));"</automated>
  </verify>
  <done>
- SessionManager creates, tracks, and cleans up call sessions with TTL eviction
- take_message tool logs structured message data to console
- end_call tool returns a signal for call termination
- createRealtimeSession returns a configured agent with the system prompt and tools
- All TypeScript compiles without errors
  </done>
</task>

<task type="auto">
  <name>Task 2: WebSocket media stream bridge with barge-in and session cleanup</name>
  <files>src/telephony/media-stream.ts, src/server.ts</files>
  <action>
Implement the WebSocket handler that bridges Twilio Media Streams to the OpenAI Realtime API, and update server.ts to use it instead of the placeholder.

**1. src/telephony/media-stream.ts:**

Export `registerMediaStreamRoute(app: FastifyInstance, config: BusinessConfig)` that registers a WebSocket route at `/media-stream`.

When a Twilio Media Stream WebSocket connects:

a) **Parse Twilio events:** Twilio sends JSON messages with an `event` field:
   - `connected`: Initial connection event
   - `start`: Contains `streamSid`, `callSid`, and metadata. Extract these.
   - `media`: Contains `payload` (base64-encoded G.711 u-law audio chunk)
   - `stop`: Call ended, Twilio is closing the stream
   - `mark`: Playback position markers

b) **On `start` event:**
   - Extract `streamSid` and `callSid` from the start message
   - Create a session via SessionManager
   - Create the RealtimeAgent via `createRealtimeSession(config)`
   - Create a `TwilioRealtimeTransportLayer` (from `@openai/agents-extensions`) passing the Twilio WebSocket connection. This class handles:
     - Audio codec bridging (G.711 u-law <-> PCM)
     - Forwarding audio between Twilio and OpenAI
     - Barge-in handling (sending `conversation.item.truncate` to OpenAI and `clear` to Twilio when the caller interrupts)
   - Connect the transport layer to the agent and start the session
   - The agent should begin with the greeting (the system prompt instructs it to greet on connection)

c) **On `stop` event:**
   - Clean up the session via SessionManager.removeSession()
   - Close the OpenAI Realtime WebSocket connection
   - Log call metadata (duration, callSid)

d) **On WebSocket close/error:**
   - Same cleanup as `stop`
   - Handle gracefully: no errors thrown into a dead connection

e) **Barge-in handling (INFRA-02):**
   The `TwilioRealtimeTransportLayer` from `@openai/agents-extensions` should handle barge-in automatically. It listens for `input_audio_buffer.speech_started` from OpenAI and sends both:
   - `conversation.item.truncate` to OpenAI (with the item_id and audio offset)
   - `clear` media message to Twilio (to flush buffered audio)

   VERIFY that the transport layer handles this. If it does not, implement it manually:
   - Track the current response item_id and elapsed playback milliseconds (chunk count * 20ms per chunk for G.711 u-law at 8kHz)
   - On `input_audio_buffer.speech_started` from OpenAI:
     1. Send `{ type: "conversation.item.truncate", item_id: currentItemId, content_index: 0, audio_end_ms: elapsedMs }` to OpenAI
     2. Send `{ event: "clear", streamSid: streamSid }` to Twilio WS
   - This ensures the AI's transcript matches what the caller actually heard

f) **End call handling:**
   When the `end_call` tool is invoked by the agent, the server needs to hang up the Twilio call. Do this by:
   - Using the Twilio REST API: `twilioClient.calls(callSid).update({ status: 'completed' })` to end the call
   - This triggers the normal `stop` event flow for cleanup
   - Import and initialize the Twilio client using TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN from env

g) **Silence handling:**
   The silence timeout behavior (10s prompt, then 15s hangup) should be handled by the OpenAI Realtime API's server-side VAD combined with the system prompt instructions. The system prompt (from Plan 01) already instructs the agent on silence behavior. However, if the OpenAI session does not have a built-in server-side silence timeout, implement a timer:
   - Start a 10-second timer when no caller audio is received
   - After 10s, inject a text prompt to the agent: "The caller has been silent. Ask if they are still there."
   - Reset the timer. After 15 more seconds of silence, inject: "The caller is still silent. Say goodbye and end the call using the end_call tool."
   - Reset the timer on any incoming caller audio

IMPORTANT IMPLEMENTATION NOTE: The exact API of `@openai/agents` and `@openai/agents-extensions` must be verified by the executor against the installed packages. The general pattern is:
1. Create a RealtimeAgent with instructions, voice, and tools
2. Create a TwilioRealtimeTransportLayer with the Twilio WebSocket
3. Run the agent with the transport layer
4. The transport layer handles audio bridging and codec conversion

If the SDK's API differs from what's described here, adapt accordingly while preserving the same behavior: bidirectional audio, barge-in handling, tool execution, and session cleanup.

**2. Update src/server.ts:**
- Remove the placeholder /media-stream WebSocket route
- Import and call `registerMediaStreamRoute(app, config)` where `config` is the loaded business config
- Pass the config to the media stream handler so it can create properly configured agents
  </action>
  <verify>
    <automated>cd /Users/matthewharris/Workspace/personal/ai/agent-call && npx tsc --noEmit && echo "TypeScript compiles OK"</automated>
  </verify>
  <done>
- /media-stream WebSocket route handles Twilio Media Stream events (connected, start, media, stop)
- On start, creates an OpenAI Realtime session via @openai/agents with TwilioRealtimeTransportLayer
- Audio flows bidirectionally between Twilio and OpenAI
- Barge-in is handled: caller interruption causes truncation of AI response and clearing of Twilio audio buffer
- Session cleanup happens on stop event and WebSocket close (both WS connections closed, session removed from manager)
- end_call tool triggers Twilio call termination via REST API
- Silence timeout is implemented (10s prompt, 15s more then hangup)
- server.ts uses registerMediaStreamRoute instead of the placeholder
- TypeScript compiles without errors
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes with zero errors
2. `npm run dev` starts the server successfully
3. The /media-stream WebSocket endpoint is registered (visible in Fastify route log)
4. SessionManager creates and cleans up sessions properly
5. Code review confirms barge-in handling is present (either via TwilioRealtimeTransportLayer automatic handling or manual implementation with truncate + clear)
6. Code review confirms session cleanup on stop event and WebSocket close
7. Code review confirms end_call tool triggers Twilio call termination
</verification>

<success_criteria>
The voice server has a complete audio bridge: when a Twilio Media Stream connects at /media-stream, the server creates an OpenAI Realtime session configured with the business identity and system prompt, bridges audio bidirectionally, handles caller interruptions cleanly, manages session lifecycle, and supports tool calls (take_message, end_call). The server is ready for a real call once deployed to a WSS-capable host (Plan 03).
</success_criteria>

<output>
After completion, create `.planning/phases/1/1-02-SUMMARY.md`
</output>

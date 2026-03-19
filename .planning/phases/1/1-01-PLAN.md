---
phase: 1-working-call
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - package.json
  - tsconfig.json
  - .env.example
  - .gitignore
  - src/server.ts
  - src/config/schema.ts
  - src/config/loader.ts
  - src/config/prompt-builder.ts
  - src/telephony/webhooks.ts
  - src/telephony/twiml.ts
  - config/business.json
autonomous: true
requirements: [CALL-02, INFRA-03]

must_haves:
  truths:
    - "npm install completes without errors"
    - "npm run build produces a valid dist/ with no TypeScript errors"
    - "npm run dev starts the Fastify server and logs the listening port"
    - "POST /incoming-call with form-encoded body returns valid TwiML containing a Connect Stream element"
    - "Business config is loaded from config/business.json and validated against the Zod schema"
    - "System prompt includes the business name, agent name Gary, and behavioral instructions"
  artifacts:
    - path: "package.json"
      provides: "All production and dev dependencies"
    - path: "tsconfig.json"
      provides: "TypeScript compilation config"
    - path: "src/server.ts"
      provides: "Fastify entry point with formbody, websocket, and all route registration"
    - path: "src/config/schema.ts"
      provides: "Zod schema for business config"
      exports: ["BusinessConfig", "businessConfigSchema"]
    - path: "src/config/loader.ts"
      provides: "Loads and validates config/business.json"
      exports: ["loadBusinessConfig"]
    - path: "src/config/prompt-builder.ts"
      provides: "Builds system prompt from business config"
      exports: ["buildSystemPrompt"]
    - path: "src/telephony/webhooks.ts"
      provides: "POST /incoming-call route handler"
      exports: ["registerWebhookRoutes"]
    - path: "src/telephony/twiml.ts"
      provides: "TwiML response builders"
      exports: ["buildStreamResponse"]
    - path: "config/business.json"
      provides: "Demo business config for Sunshine Auto Repair"
  key_links:
    - from: "src/server.ts"
      to: "src/telephony/webhooks.ts"
      via: "registerWebhookRoutes(app)"
      pattern: "registerWebhookRoutes"
    - from: "src/telephony/webhooks.ts"
      to: "src/telephony/twiml.ts"
      via: "buildStreamResponse() to generate TwiML"
      pattern: "buildStreamResponse"
    - from: "src/config/loader.ts"
      to: "src/config/schema.ts"
      via: "validates JSON against businessConfigSchema"
      pattern: "businessConfigSchema\\.parse"
---

<objective>
Scaffold the greenfield project, install all dependencies, create the config system, and stand up the Fastify server with the incoming call webhook handler that returns TwiML connecting to a Media Stream.

Purpose: Establish the foundation that Plan 02 builds the audio bridge on top of. Without a working server, valid TwiML, and a config-to-prompt pipeline, nothing else can function.

Output: A runnable Fastify server that accepts Twilio webhook POSTs at /incoming-call, returns TwiML with a Connect Stream pointing to /media-stream, and has a config system that loads business identity and builds a system prompt.
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
@.planning/research/STACK.md
@.planning/research/ARCHITECTURE.md
@.planning/research/PITFALLS.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Project scaffolding and dependency installation</name>
  <files>package.json, tsconfig.json, .env.example, .gitignore</files>
  <action>
Initialize a new Node.js project in the repo root (the repo already exists but has no source code).

1. Create `package.json` with:
   - name: "agent-call"
   - type: "module" (ESM)
   - scripts:
     - "dev": "tsx watch src/server.ts"
     - "build": "tsc"
     - "start": "node dist/server.js"
   - Production dependencies (exact versions):
     - fastify: "5.8.2"
     - @fastify/websocket: "11.2.0"
     - @fastify/formbody: "^8.0.0"
     - @openai/agents: "0.7.2"
     - @openai/agents-extensions: "0.7.2"
     - twilio: "5.13.0"
     - zod: "4.3.6"
     - dotenv: "^16.4.0"
     - ws: "8.19.0"
   - Dev dependencies:
     - typescript: "^5.8.0"
     - tsx: "^4.19.0"
     - @types/node: "^22.0.0"
     - @types/ws: "^8.5.0"

2. Create `tsconfig.json`:
   - target: "ES2022"
   - module: "NodeNext"
   - moduleResolution: "NodeNext"
   - outDir: "dist"
   - rootDir: "src"
   - strict: true
   - esModuleInterop: true
   - skipLibCheck: true
   - declaration: true
   - include: ["src/**/*"]

3. Create `.env.example` with placeholders for:
   - OPENAI_API_KEY
   - TWILIO_ACCOUNT_SID
   - TWILIO_AUTH_TOKEN
   - PORT (default 3001)
   - HOST (default 0.0.0.0)
   - PUBLIC_URL (the deployed WSS-capable URL, e.g., https://agent-call.up.railway.app)

4. Create `.gitignore` with: node_modules, dist, .env, *.js.map

5. Create empty directory structure:
   - src/telephony/
   - src/ai/
   - src/config/
   - config/

6. Run `npm install` to generate package-lock.json.

IMPORTANT: @openai/agents and @openai/agents-extensions MUST both be 0.7.2 (lockstep versions per research).
  </action>
  <verify>
    <automated>cd /Users/matthewharris/Workspace/personal/ai/agent-call && npm install && npx tsc --noEmit --pretty 2>&1 | head -5</automated>
  </verify>
  <done>package.json exists with all dependencies, npm install succeeds, tsconfig.json is valid, .env.example documents all required env vars, directory structure exists.</done>
</task>

<task type="auto">
  <name>Task 2: Config system and Fastify server with incoming call webhook</name>
  <files>config/business.json, src/config/schema.ts, src/config/loader.ts, src/config/prompt-builder.ts, src/telephony/twiml.ts, src/telephony/webhooks.ts, src/server.ts</files>
  <action>
Build the config system and the Fastify server with the /incoming-call webhook. This is the entry point for all inbound calls.

**Config system:**

1. `config/business.json`: Demo config for "Sunshine Auto Repair":
```json
{
  "businessName": "Sunshine Auto Repair",
  "agentName": "Gary",
  "greeting": "Thanks for calling Sunshine Auto Repair, this is Gary, how can I help you?",
  "businessDescription": "A friendly neighborhood auto repair shop specializing in oil changes, brake service, tire rotations, and general automotive maintenance.",
  "escalationMessage": "I'd be happy to have someone get back to you with those details. Can I get your name and number?",
  "voiceId": "ash"
}
```
Note: Use "ash" as the OpenAI Realtime voice (friendliest-sounding option per research). If this is wrong, the executor should check the OpenAI docs for the warmest/friendliest voice and use that instead.

2. `src/config/schema.ts`: Define a Zod schema `businessConfigSchema` that validates the shape above. Export the inferred type as `BusinessConfig`. All fields required.

3. `src/config/loader.ts`: Export `loadBusinessConfig()` that reads `config/business.json` from disk (using `fs.readFileSync` and `JSON.parse`), validates with the Zod schema, and returns the typed config. Throw a clear error if validation fails. Use path resolution relative to process.cwd() so it works in both dev and production.

4. `src/config/prompt-builder.ts`: Export `buildSystemPrompt(config: BusinessConfig): string` that constructs the system prompt for the OpenAI Realtime session. The prompt must include:

```
You are {agentName}, a friendly and professional AI phone assistant for {businessName}.

{businessDescription}

GREETING: When a call starts, greet the caller with: "{greeting}"

PERSONALITY:
- Be warm, conversational, and concise
- Use natural speech patterns (contractions, brief acknowledgments like "sure", "got it", "absolutely")
- Do not use technical jargon or robotic phrasing
- If asked whether you are a robot or AI, be truthful: "Yes, I'm an AI assistant for {businessName}. How can I help you today?"

HANDLING UNKNOWN QUESTIONS:
- If you do not have the information to answer a question, say: "I don't have that information right now."
- Then offer a callback: "{escalationMessage}"
- Attempt to rephrase or clarify once before escalating. Do not escalate immediately.

FRUSTRATED CALLERS:
- Acknowledge their frustration and apologize
- Say: "I completely understand. Let me get your name and number and we'll have someone call you right back."
- Do NOT give out a direct phone number. Callback offer only.

BACKGROUND NOISE / UNINTELLIGIBLE SPEECH:
- Ask "Sorry, I didn't catch that, could you repeat?" once
- If still unintelligible, offer to take a message

ENDING THE CALL:
- When the caller's question is resolved, ask: "Is there anything else I can help you with?"
- If no, say: "Thanks for calling {businessName}, have a great day!"
- Then end the call.

SILENCE HANDLING:
- If the caller is silent for about 10 seconds, say: "Are you still there?"
- If still silent for about 15 more seconds, say: "I'll let you go. Have a great day!" and end the call.

TAKING A MESSAGE:
When taking a message, collect:
- Caller's name
- Callback phone number
- Reason for calling
- Preferred callback time (if offered)
Use the take_message tool to record this information.
```

**Telephony:**

5. `src/telephony/twiml.ts`: Export `buildStreamResponse(wsUrl: string): string` that builds a TwiML XML string. The TwiML should respond with a `<Connect>` element containing a `<Stream>` element pointing to the WebSocket URL for the media stream. No conference needed in Phase 1 (transfers are deferred to v2).

The TwiML structure:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://{host}/media-stream" />
  </Connect>
</Response>
```

Do NOT use the Twilio Node SDK's VoiceResponse builder for this. Build the XML string directly or use a simple template literal. The SDK's builder adds unnecessary complexity for a static TwiML response.

6. `src/telephony/webhooks.ts`: Export `registerWebhookRoutes(app: FastifyInstance)` that registers:
   - POST `/incoming-call`: Receives Twilio's form-encoded webhook. Extracts `CallSid`, `From`, `To` from `request.body`. Logs the incoming call metadata. Responds with the TwiML from `buildStreamResponse()` using the PUBLIC_URL env var to construct the WSS URL. Sets Content-Type to `text/xml`.
   - POST `/call-status`: Receives Twilio call status updates. Logs the status (for now, just console.log). Returns 200.

   Add Twilio webhook signature validation on both routes using a Fastify preHandler hook. Use `twilio.validateRequest(authToken, twilioSignature, url, params)`. The auth token comes from `process.env.TWILIO_AUTH_TOKEN`. If validation fails, return 403. Skip validation in development if TWILIO_AUTH_TOKEN is not set (log a warning).

**Server entry point:**

7. `src/server.ts`:
   - Import and call `dotenv/config` at the top
   - Create a Fastify instance with logger: true
   - Register `@fastify/formbody` FIRST (before any routes, this is critical per research)
   - Register `@fastify/websocket`
   - Call `registerWebhookRoutes(app)`
   - Register a placeholder GET `/` health check route returning { status: "ok" }
   - Register a placeholder WebSocket route at `/media-stream` (just log connection/close for now, Plan 02 implements the bridge)
   - Listen on PORT (default 3001) and HOST (default 0.0.0.0)
   - Log: "Server listening on {host}:{port}"
   - Load business config at startup (call `loadBusinessConfig()`) and log the business name to confirm config is valid

CRITICAL: `@fastify/formbody` MUST be the first plugin registered. Without it, Twilio's form-encoded POST bodies produce undefined request.body. This is a known silent failure (see PITFALLS.md).
  </action>
  <verify>
    <automated>cd /Users/matthewharris/Workspace/personal/ai/agent-call && npx tsc --noEmit && echo "TypeScript OK" && npx tsx -e "import { loadBusinessConfig } from './src/config/loader.ts'; import { buildSystemPrompt } from './src/config/prompt-builder.ts'; const c = loadBusinessConfig(); console.log('Config loaded:', c.businessName); const p = buildSystemPrompt(c); console.log('Prompt length:', p.length); console.log('Has greeting:', p.includes(c.greeting)); console.log('Has agent name:', p.includes(c.agentName));"</automated>
  </verify>
  <done>
- TypeScript compiles with zero errors
- loadBusinessConfig() returns the Sunshine Auto Repair config
- buildSystemPrompt() produces a prompt containing the business name, agent name Gary, greeting, escalation instructions, silence handling, and call ending behavior
- POST /incoming-call returns TwiML with a Connect Stream element
- Twilio signature validation is implemented on webhook routes
- @fastify/formbody is registered before any routes in server.ts
  </done>
</task>

</tasks>

<verification>
1. `npm install` completes with no errors
2. `npx tsc --noEmit` shows zero TypeScript errors
3. `npm run dev` starts the server and logs "Server listening on 0.0.0.0:3001" and "Config loaded: Sunshine Auto Repair" (or similar)
4. `curl -X POST http://localhost:3001/incoming-call -d "CallSid=test123&From=+15551234567&To=+15559876543"` returns TwiML XML containing `<Connect><Stream url="wss://`
5. Config validation rejects malformed business.json (missing required fields)
</verification>

<success_criteria>
A running Fastify server that accepts Twilio webhook POSTs, returns valid TwiML connecting to a Media Stream WebSocket, loads and validates business config from a JSON file, and builds a complete system prompt for the AI agent. The /media-stream WebSocket endpoint exists as a placeholder ready for Plan 02 to implement the audio bridge.
</success_criteria>

<output>
After completion, create `.planning/phases/1/1-01-SUMMARY.md`
</output>

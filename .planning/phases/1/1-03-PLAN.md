---
phase: 1-working-call
plan: 03
type: execute
wave: 3
depends_on: [01, 02]
files_modified:
  - Dockerfile
  - .dockerignore
  - railway.json
  - src/server.ts
autonomous: false
requirements: [INFRA-01, INFRA-03]
user_setup:
  - service: railway
    why: "Voice server hosting with persistent process and valid WSS endpoint"
    env_vars:
      - name: PORT
        source: "Railway auto-injects this, do not set manually"
      - name: OPENAI_API_KEY
        source: "OpenAI Dashboard -> API keys -> Create new secret key"
      - name: TWILIO_ACCOUNT_SID
        source: "Twilio Console -> Account Info -> Account SID"
      - name: TWILIO_AUTH_TOKEN
        source: "Twilio Console -> Account Info -> Auth Token"
      - name: PUBLIC_URL
        source: "Railway deployment URL (e.g., https://agent-call-production.up.railway.app) - available after first deploy"
    dashboard_config:
      - task: "Create a Railway project and deploy the voice server"
        location: "railway.app -> New Project -> Deploy from GitHub repo"
  - service: twilio
    why: "Phone number provisioning and webhook configuration"
    env_vars: []
    dashboard_config:
      - task: "Buy a local phone number"
        location: "Twilio Console -> Phone Numbers -> Buy a Number"
      - task: "Configure the phone number webhook to point to the Railway deployment URL"
        location: "Twilio Console -> Phone Numbers -> Active Numbers -> [number] -> Voice Configuration -> 'A Call Comes In' -> Webhook URL: https://{railway-url}/incoming-call (HTTP POST)"
      - task: "Configure call status webhook"
        location: "Same page -> 'Call status changes' -> https://{railway-url}/call-status (HTTP POST)"

must_haves:
  truths:
    - "The voice server is deployed to Railway with a valid HTTPS/WSS URL"
    - "A Twilio phone number is provisioned and configured to POST to the deployed /incoming-call endpoint"
    - "Calling the Twilio number connects to the AI agent and produces a voice greeting"
    - "Bidirectional voice conversation works over the deployed endpoint"
    - "Barge-in works: interrupting the AI causes it to stop and respond to the interruption"
  artifacts:
    - path: "Dockerfile"
      provides: "Container image for Railway deployment"
    - path: "railway.json"
      provides: "Railway deployment configuration"
  key_links:
    - from: "Twilio phone number"
      to: "Railway /incoming-call"
      via: "Twilio webhook POST on inbound call"
      pattern: "incoming-call"
    - from: "Railway /incoming-call"
      to: "Railway /media-stream"
      via: "TwiML Connect Stream with wss:// URL"
      pattern: "wss://"
    - from: "Railway /media-stream"
      to: "OpenAI Realtime API"
      via: "TwilioRealtimeTransportLayer WebSocket bridge"
      pattern: "TwilioRealtimeTransportLayer"
---

<objective>
Deploy the voice server to Railway with a valid WSS endpoint, provision a Twilio phone number, configure webhooks, and verify end-to-end call functionality.

Purpose: The server is useless on localhost. Twilio Media Streams require a real WSS endpoint (ngrok silently drops packets per research). This plan makes the system callable from a real phone.

Output: A deployed voice server on Railway with a Twilio phone number that, when called, connects to the AI agent for a full voice conversation.
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
@.planning/phases/1/1-02-SUMMARY.md
@.planning/research/PITFALLS.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create deployment configuration for Railway</name>
  <files>Dockerfile, .dockerignore, railway.json</files>
  <action>
Create the deployment artifacts needed to run on Railway.

**1. Dockerfile:**
```dockerfile
FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY tsconfig.json ./
COPY src/ ./src/
COPY config/ ./config/

RUN npx tsc

EXPOSE ${PORT:-3001}

CMD ["node", "dist/server.js"]
```

Key points:
- Use node:22-slim (matches our Node 22 LTS requirement)
- `npm ci --omit=dev` for reproducible production installs without dev deps
- Copy and compile TypeScript in the container
- Railway injects PORT via environment variable

**2. .dockerignore:**
```
node_modules
dist
.env
.env.*
.git
.planning
*.md
```

**3. railway.json:**
```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "Dockerfile"
  },
  "deploy": {
    "startCommand": "node dist/server.js",
    "healthcheckPath": "/",
    "healthcheckTimeout": 10,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}
```

**4. Update src/server.ts** (minor):
- Ensure the PORT is read from `process.env.PORT` (Railway injects this)
- Ensure HOST is `0.0.0.0` (required for Railway container networking)
- Ensure the health check at GET `/` returns `{ status: "ok" }` (Railway uses this for health checks)
  </action>
  <verify>
    <automated>cd /Users/matthewharris/Workspace/personal/ai/agent-call && docker build -t agent-call-test . 2>&1 | tail -5 && echo "Docker build OK"</automated>
  </verify>
  <done>
- Dockerfile builds successfully and produces a working container image
- railway.json configures Dockerfile-based deployment with health check
- .dockerignore excludes development artifacts
- Server reads PORT from environment (Railway injection compatible)
  </done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 2: Deploy to Railway, provision Twilio number, configure webhooks</name>
  <action>
Deploy the voice server and configure Twilio. These steps require account access that Claude cannot perform.
  </action>
  <instructions>
**Step 1: Deploy to Railway**

1. Go to [railway.app](https://railway.app) and create a new project
2. Connect your GitHub repo (or deploy from local with `railway up` if you have the CLI)
3. Railway will detect the Dockerfile and build automatically
4. Set these environment variables in the Railway dashboard (Settings -> Variables):
   - `OPENAI_API_KEY`: Your OpenAI API key (from platform.openai.com -> API keys)
   - `TWILIO_ACCOUNT_SID`: From Twilio Console -> Account Info
   - `TWILIO_AUTH_TOKEN`: From Twilio Console -> Account Info
   - `PUBLIC_URL`: The Railway deployment URL (available after first deploy, looks like `https://agent-call-production.up.railway.app`)
   - Do NOT set PORT (Railway injects this automatically)
5. Wait for deployment to complete
6. Verify the health check: visit `https://{your-railway-url}/` in a browser, should return `{"status":"ok"}`

**Step 2: Provision a Twilio phone number**

1. Go to [Twilio Console](https://console.twilio.com) -> Phone Numbers -> Buy a Number
2. Buy a local US number (any area code)
3. Note the phone number

**Step 3: Configure Twilio webhooks**

1. Go to Twilio Console -> Phone Numbers -> Active Numbers -> click the number you bought
2. Under "Voice Configuration":
   - "A Call Comes In": Set to **Webhook**, URL: `https://{your-railway-url}/incoming-call`, HTTP POST
   - "Call status changes": URL: `https://{your-railway-url}/call-status`, HTTP POST
3. Save the configuration

**Step 4: Verify**

1. Call the Twilio phone number from your personal phone
2. You should hear the AI agent greet you: "Thanks for calling Sunshine Auto Repair, this is Gary, how can I help you?"
3. Have a brief conversation to confirm bidirectional audio works
4. Try interrupting the AI mid-sentence to test barge-in
  </instructions>
  <resume-signal>Report the results: Did the call connect? Did the greeting play? Did conversation work? Did barge-in work? Include the Railway URL and Twilio phone number. If there were issues, describe them.</resume-signal>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>Complete Phase 1 voice system: Twilio call -> Railway server -> OpenAI Realtime API bidirectional voice conversation with barge-in handling, take-message capability, and clean session lifecycle.</what-built>
  <how-to-verify>
1. **Call the Twilio number** from your phone
2. **Verify greeting**: AI should say "Thanks for calling Sunshine Auto Repair, this is Gary, how can I help you?"
3. **Test conversation**: Ask a question like "What are your hours?" - Gary should say he doesn't have that info and offer to take a message
4. **Test barge-in**: While Gary is speaking, interrupt him mid-sentence. He should stop immediately and respond to your interruption
5. **Test take-message**: Say "I'd like to leave a message" and provide a name and number. Gary should confirm the message was recorded.
6. **Test call ending**: Say "That's all, thanks" - Gary should ask if there's anything else, then say goodbye
7. **Test silence**: Call again and stay silent for ~10 seconds. Gary should ask "Are you still there?"
8. **Check Railway logs**: The Railway dashboard should show call metadata (callSid, duration) in the deployment logs
  </how-to-verify>
  <resume-signal>Type "approved" if all tests pass, or describe which tests failed and what happened.</resume-signal>
</task>

</tasks>

<verification>
1. Railway deployment is live with a valid HTTPS URL that returns {"status":"ok"} at GET /
2. Twilio phone number is provisioned and webhook points to the Railway URL
3. Calling the number produces the AI greeting within 3 seconds
4. Bidirectional conversation works (caller speaks, AI responds coherently)
5. Barge-in works (interrupting AI causes it to stop and address the interruption)
6. Take-message tool works (caller provides info, agent confirms)
7. Call ending works naturally (agent says goodbye, call ends)
8. Silence handling works (agent prompts after ~10s of silence)
9. Session cleanup works (Railway logs show session removed after call ends)
</verification>

<success_criteria>
A real phone call to the Twilio number connects to the AI agent hosted on Railway. The agent greets the caller by name (Sunshine Auto Repair), has a natural bidirectional conversation, handles interruptions cleanly, can take a message, ends calls gracefully, and handles silence. All Phase 1 success criteria from the ROADMAP are met.
</success_criteria>

<output>
After completion, create `.planning/phases/1/1-03-SUMMARY.md`
</output>

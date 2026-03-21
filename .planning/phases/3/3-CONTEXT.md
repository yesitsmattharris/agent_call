# Phase 3 Context: Call Resolution + Visibility

**Phase goal:** The agent has the full resolution toolkit: it can book appointments on Google Calendar, capture structured messages for callback, and log every call. Business owners can browse and search call history with full transcripts in the admin UI.

**Requirements:** BOOK-01, BOOK-02, BOOK-03, MSG-01, MSG-02, HIST-01, HIST-02, HIST-03

---

## Decisions

### 1. Google Calendar Integration

- **Auth method:** Service account with JWT. Business owner shares their calendar with the service account email and grants "Make changes to events" permission.
- **Availability check:** Use `freebusy.query` (fast, returns busy intervals). Derive open slots by subtracting busy intervals from business hours.
- **Booking:** Use `events.insert` with double-booking prevention (re-check freebusy immediately before insert).
- **Confirmation flow (BOOK-03):** Two-tool pattern. `check_availability` returns slots, agent verbally confirms with caller, then `book_appointment` inserts the event. Prompt engineering enforces the confirmation step.
- **Credentials storage:** The `googleCredentials` column (Json) on Tenant already exists. Stores the full service account JSON. Validated on save for required fields: `client_email`, `private_key`, `project_id`.
- **Dependencies:** `googleapis` + `google-auth-library` (voice server only).

### 2. Timezone Handling

- **Approach:** Add a `timezone` field to the Tenant model (e.g. "America/New_York"). Required for correct Calendar API queries.
- **Default:** "America/New_York" as initial default.
- **Admin UI:** Timezone selector in the Business Info section.
- **Usage:** Passed to `freebusy.query` timeZone parameter and used for `events.insert` dateTime values.

### 3. Appointment Duration

- **Approach:** Fixed 60-minute default for v1. All bookings are 1 hour.
- **No config needed:** Service-specific durations are a v2 enhancement.

### 4. Call Logging (HIST-01, HIST-02)

- **Timing:** Create CallLog record at call start (in the `start` event handler) with placeholder outcome/duration. Update on call cleanup with final duration, outcome, and transcript.
- **Outcome tracking:** Track tool invocations during the call via `agent_tool_end` event. Set flags when `take_message` or `book_appointment` fires. Use to determine outcome: "completed" | "message_taken" | "booking_made" | "abandoned".
- **Transcript:** Capture final `history_updated` snapshot during cleanup. Extract text from RealtimeItem[] (input_audio.transcript for user, output_text.text/output_audio.transcript for agent). Store as JSON array.

### 5. Message Persistence (MSG-01, MSG-02)

- **Approach:** Update `take_message` tool to write to a new `Message` Prisma model instead of console.log.
- **Linking:** Messages link to CallLog via `callLogId` (available because CallLog is created at call start).
- **Tool context:** Pass `tenantId` and `callLogId` via RealtimeSession context so tools can reference them.

### 6. Admin UI Call History (HIST-03)

- **New route:** `/dashboard/calls` for call history list with search.
- **Detail view:** `/dashboard/calls/[id]` for individual call with full transcript.
- **Navigation:** Add a link/tab from the main dashboard to the calls page.
- **Search:** Server-side Prisma `contains` filter on caller number and outcome. Sufficient for demo scale.
- **Messages view:** Messages shown within call detail view (linked via callLogId). Also accessible from a `/dashboard/messages` list.

### 7. Tool Context Pattern

- **Approach:** Pass tenant-specific config to tools via `RealtimeSession` context option, not module-level closures.
- **Context type:** `CallContext` with `tenantId`, `googleCalendarId`, `googleCredentials`, `callSid`, `streamSid`, `callLogId`, `timezone`.
- **Access in tools:** `context!.state.context` in the execute handler.

---

## Code Context

### Existing Assets (from Phases 1-2)

- **Tools:** `src/ai/tools.ts` has `take_message` (logs to console) and `end_call` using `tool()` from `@openai/agents`
- **Session manager:** `src/ai/session.ts` tracks active calls in-memory with messages array
- **Media stream:** `src/telephony/media-stream.ts` handles WebSocket lifecycle, creates RealtimeSession with transport, listens for tool_end and history_updated events
- **Config loader:** `src/config/loader.ts` loads tenant by Twilio phone number from Prisma with all relations
- **Prompt builder:** `src/config/prompt-builder.ts` builds system prompt from TenantConfig with FAQs, services, hours
- **Schema:** `src/config/schema.ts` has Zod schemas and TypeScript types for TenantConfig
- **Prisma schema:** `prisma/schema.prisma` with Tenant, BusinessHours, Faq, Service models
- **Admin dashboard:** `admin/app/dashboard/page.tsx` with collapsible sections for config forms
- **Admin actions:** `admin/lib/actions/config.ts` with server actions for config mutations
- **Admin auth:** Supabase magic link + dev password login

### Integration Points

- **Media stream cleanup:** `cleanup()` in `media-stream.ts` needs to persist CallLog and transcript
- **Tool context:** `RealtimeSession` creation in `media-stream.ts` needs `context` option added
- **Tools:** Need `check_availability` and `book_appointment` tools, plus `take_message` DB write
- **Prompt builder:** Needs booking instructions added to system prompt (when Calendar is configured)
- **Admin navigation:** Dashboard needs link to calls page

### Patterns to Preserve

- `tool()` from `@openai/agents` with Zod schemas for all tools
- Zod validation for config types
- `@fastify/formbody` registered before all routes
- Template literal TwiML generation
- `pendingConfigs` Map pattern for webhook-to-media-stream config handoff
- Separate delete/save forms (no nested HTML forms)
- Server components with server actions in admin UI

---

## Deferred Ideas

- Service-specific appointment durations (v2)
- Per-tenant OAuth 2.0 for Google Calendar (revisit if service account sharing friction is too high)
- Full-text search on transcripts (PostgreSQL tsvector, v2)
- Call analytics dashboard (volume, outcomes, peak hours) (v2, POST-03)
- AI-generated call summaries (v2, POST-01)

---

*Created: 2026-03-21*

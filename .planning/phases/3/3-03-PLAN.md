---
phase: 3-call-resolution
plan: 03
type: execute
wave: 2
depends_on: ["3-01"]
files_modified:
  - admin/app/dashboard/calls/page.tsx
  - admin/app/dashboard/calls/[id]/page.tsx
  - admin/app/dashboard/calls/_components/CallList.tsx
  - admin/app/dashboard/calls/_components/TranscriptViewer.tsx
  - admin/app/dashboard/calls/_components/SearchBar.tsx
  - admin/app/dashboard/messages/page.tsx
  - admin/app/dashboard/page.tsx
  - admin/app/dashboard/layout.tsx
autonomous: true
requirements: [HIST-03, MSG-02]

must_haves:
  truths:
    - "Business owner can browse call history in the admin UI at /dashboard/calls"
    - "Business owner can search call history by caller number or outcome"
    - "Business owner can view full conversation transcript for any call"
    - "Each call shows timestamp, duration, caller number, and outcome"
    - "Messages taken during calls are visible in the call detail and in a messages list"
  artifacts:
    - path: "admin/app/dashboard/calls/page.tsx"
      provides: "Call history list page with search"
    - path: "admin/app/dashboard/calls/[id]/page.tsx"
      provides: "Call detail page with transcript viewer and linked messages"
    - path: "admin/app/dashboard/calls/_components/CallList.tsx"
      provides: "Reusable call list component with columns for timestamp, duration, caller, outcome"
    - path: "admin/app/dashboard/calls/_components/TranscriptViewer.tsx"
      provides: "Component rendering transcript JSON as a chat-style conversation"
    - path: "admin/app/dashboard/messages/page.tsx"
      provides: "Messages list page showing all messages across calls"
    - path: "admin/app/dashboard/layout.tsx"
      provides: "Dashboard layout with navigation links to config, calls, messages"
  key_links:
    - from: "admin/app/dashboard/calls/page.tsx"
      to: "prisma.callLog.findMany"
      via: "Server component data fetch with search filter"
      pattern: "prisma\\.callLog\\.findMany"
    - from: "admin/app/dashboard/calls/[id]/page.tsx"
      to: "prisma.callLog.findUnique"
      via: "Server component data fetch with messages include"
      pattern: "prisma\\.callLog\\.findUnique"
    - from: "admin/app/dashboard/layout.tsx"
      to: "/dashboard/calls"
      via: "Navigation link"
      pattern: "href.*dashboard/calls"
---

<objective>
Build the admin UI pages for call history browsing, search, transcript viewing, and message listing.

Purpose: Business owners need visibility into every call handled by the agent. This plan delivers the UI for browsing call logs, searching by caller number or outcome, viewing full conversation transcripts, and reviewing messages taken during calls.

Output: Call history list page with search, call detail page with transcript viewer, messages list page, and dashboard navigation updates.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/3/3-CONTEXT.md
@.planning/phases/3/3-RESEARCH.md
@admin/app/dashboard/page.tsx
@admin/app/actions/config.ts
@admin/lib/prisma.ts
@admin/lib/supabase/server.ts
@admin/AGENTS.md

**CRITICAL: Next.js 16.2 has breaking changes.** Before writing any admin UI code, read the relevant guide in `admin/node_modules/next/dist/docs/` to verify current API conventions for App Router pages, server components, `searchParams` handling, layouts, and `Link` component. Do NOT assume training data patterns are correct.

<interfaces>
<!-- Key types from existing admin codebase. -->

From admin/lib/prisma.ts:
```typescript
import { PrismaClient } from "../app/generated/prisma";
export const prisma: PrismaClient;
```

From admin/lib/supabase/server.ts:
```typescript
export async function createClient(): Promise<SupabaseClient>;
```

From admin/app/actions/config.ts (pattern reference):
```typescript
// Auth pattern: getAuthenticatedTenantId() returns tenantId or null
// Uses createClient() for Supabase auth, then prisma.tenant.findUnique
// All mutations verify ownership before proceeding
```

From admin/app/dashboard/page.tsx (pattern reference):
```typescript
// Server component pattern:
// 1. const supabase = await createClient();
// 2. const { data: { user } } = await supabase.auth.getUser();
// 3. if (!user) redirect("/");
// 4. const tenant = await prisma.tenant.findUnique({ where: { email: user.email! } });
// 5. if (!tenant) redirect("/");
```

Prisma models available (from Plan 3-01):
```prisma
model CallLog {
  id              String   @id @default(cuid())
  tenantId        String
  callSid         String   @unique
  callerNumber    String
  startedAt       DateTime
  durationSeconds Int
  outcome         String
  transcript      Json
  createdAt       DateTime @default(now())
  messages        Message[]
}

model Message {
  id              String   @id @default(cuid())
  tenantId        String
  callLogId       String?
  callerName      String
  callbackNumber  String
  reason          String
  preferredTime   String?
  createdAt       DateTime @default(now())
}
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Dashboard layout with navigation and call history list page</name>
  <files>admin/app/dashboard/layout.tsx, admin/app/dashboard/calls/page.tsx, admin/app/dashboard/calls/_components/CallList.tsx, admin/app/dashboard/calls/_components/SearchBar.tsx</files>
  <action>
**FIRST:** Read `admin/node_modules/next/dist/docs/` directory listing, then read the guides for App Router pages, layouts, Link, and searchParams. Verify the correct patterns before writing any code.

1. Create `admin/app/dashboard/layout.tsx`:
   - Server component wrapping all /dashboard/* pages
   - Render a simple navigation bar at the top with links: "Config" (/dashboard), "Calls" (/dashboard/calls), "Messages" (/dashboard/messages)
   - Use inline styles consistent with the existing dashboard page (maxWidth: 600, margin auto)
   - Use Next.js `Link` component (verify import path from docs)
   - Render `{children}` below the nav

2. Update `admin/app/dashboard/page.tsx`:
   - Remove the outer `<main>` wrapper with maxWidth/margin styles (now handled by layout)
   - Keep the content inside but wrapped in a fragment or div without the outer margin styles
   - Actually, the layout should set the max-width on the children wrapper, and the page should just render its content. Check if the existing page's `<main>` styling conflicts with the layout. If so, move the maxWidth to layout and simplify the page.

3. Create `admin/app/dashboard/calls/_components/SearchBar.tsx`:
   - Client component ("use client")
   - Renders a text input and a search form
   - On submit, navigates to `/dashboard/calls?q={searchTerm}` using the router or form action
   - Use a simple `<form>` with GET method and `action="/dashboard/calls"` for server-side search (no client-side state management needed)
   - Input name="q", placeholder="Search by phone number or outcome..."

4. Create `admin/app/dashboard/calls/_components/CallList.tsx`:
   - Server component (or could be a simple function component receiving props)
   - Props: `calls: Array<{ id, callerNumber, startedAt, durationSeconds, outcome }>`
   - Renders a list/table of calls with columns: Date/Time, Duration, Caller, Outcome
   - Each row links to `/dashboard/calls/{id}` using Next.js Link
   - Format startedAt as readable date/time string
   - Format durationSeconds as "Xm Ys"
   - If calls array is empty, show "No calls found."

5. Create `admin/app/dashboard/calls/page.tsx`:
   - Server component following the existing auth pattern from dashboard/page.tsx
   - Accept `searchParams` prop (verify correct type from Next.js 16.2 docs, likely `Promise<{q?: string, page?: string}>`)
   - Auth check: Supabase user -> tenant lookup -> redirect if not found
   - Query `prisma.callLog.findMany` with:
     - `where: { tenantId: tenant.id }` plus optional search filter
     - If `q` param exists, add `OR: [{ callerNumber: { contains: q } }, { outcome: { contains: q } }]`
     - `orderBy: { startedAt: "desc" }`
     - `take: 50` (simple limit for v1, no pagination needed at demo scale)
   - Render SearchBar component and CallList component

6. Verify the page renders without errors by running the Next.js dev server build check.
  </action>
  <verify>
    <automated>cd admin && npx next build 2>&1 | tail -20</automated>
  </verify>
  <done>Dashboard layout has navigation to Config, Calls, Messages. /dashboard/calls page shows call history list with search. Call list displays timestamp, duration, caller number, outcome for each call. Search filters by caller number or outcome.</done>
</task>

<task type="auto">
  <name>Task 2: Call detail page with transcript viewer and messages list page</name>
  <files>admin/app/dashboard/calls/[id]/page.tsx, admin/app/dashboard/calls/_components/TranscriptViewer.tsx, admin/app/dashboard/messages/page.tsx</files>
  <action>
**FIRST:** If not already done, read `admin/node_modules/next/dist/docs/` for dynamic route segment (`[id]`) patterns in Next.js 16.2.

1. Create `admin/app/dashboard/calls/_components/TranscriptViewer.tsx`:
   - Server component (pure rendering, no interactivity needed)
   - Props: `transcript: Array<{ role: string; content: string }>`
   - Renders each transcript entry as a chat bubble or labeled line:
     - "user" role: left-aligned or labeled "Caller:"
     - "assistant" role: right-aligned or labeled "Agent:"
   - Use inline styles for simplicity (consistent with existing admin UI approach)
   - If transcript is empty or null, show "No transcript available."
   - Parse the transcript from Json (it's stored as JSON in the database, so it may arrive as a parsed array or need JSON.parse)

2. Create `admin/app/dashboard/calls/[id]/page.tsx`:
   - Server component following auth pattern
   - Accept `params` prop (verify correct type for dynamic segments in Next.js 16.2, likely `Promise<{ id: string }>`)
   - Auth check: same Supabase -> tenant pattern
   - Query `prisma.callLog.findUnique({ where: { id: params.id }, include: { messages: true } })`
   - Verify the call belongs to the authenticated tenant (callLog.tenantId === tenant.id), redirect if not
   - Render call details: caller number, date/time, duration, outcome
   - Render TranscriptViewer with the transcript JSON
   - If messages exist on this call, render a "Messages" section listing each message:
     - Caller name, callback number, reason, preferred time
   - Add a "Back to Call History" link to /dashboard/calls

3. Create `admin/app/dashboard/messages/page.tsx`:
   - Server component following auth pattern
   - Query `prisma.message.findMany({ where: { tenantId: tenant.id }, orderBy: { createdAt: "desc" }, take: 50, include: { callLog: { select: { id: true, callerNumber: true, startedAt: true } } } })`
   - Render a list of messages with: caller name, callback number, reason, preferred time, created date
   - If message has a linked callLog, show a link to the call detail page
   - If no messages, show "No messages yet."

4. Verify build succeeds.
  </action>
  <verify>
    <automated>cd admin && npx next build 2>&1 | tail -20</automated>
  </verify>
  <done>Call detail page shows full call info with transcript viewer rendering the conversation as labeled turns. Messages section shows any messages taken during that call. Messages list page shows all messages across calls with links to call detail. Admin build succeeds.</done>
</task>

</tasks>

<verification>
- `cd admin && npx next build` succeeds with zero errors
- `/dashboard/calls` route exists and renders call history with search
- `/dashboard/calls/[id]` route exists and renders call detail with transcript
- `/dashboard/messages` route exists and renders messages list
- Dashboard navigation includes links to Config, Calls, Messages
- All pages follow the existing Supabase auth pattern (redirect if not logged in)
- All pages verify tenant ownership before displaying data
</verification>

<success_criteria>
A business owner can navigate to the Calls page from the dashboard, browse all call logs sorted by most recent, search by caller number or outcome, click into any call to see full details including the conversation transcript, and view all messages taken during calls. The admin UI build compiles without errors.
</success_criteria>

<output>
After completion, create `.planning/phases/3/3-03-SUMMARY.md`
</output>

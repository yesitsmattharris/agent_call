---
phase: 2-tenant-identity
plan: 03
type: execute
wave: 2
depends_on: [01]
files_modified:
  - admin/package.json
  - admin/app/layout.tsx
  - admin/app/page.tsx
  - admin/app/auth/confirm/route.ts
  - admin/app/dashboard/page.tsx
  - admin/lib/supabase/server.ts
  - admin/lib/supabase/client.ts
  - admin/lib/supabase/middleware.ts
  - admin/lib/prisma.ts
  - admin/middleware.ts
  - admin/prisma/schema.prisma
  - admin/prisma.config.ts
  - admin/tsconfig.json
autonomous: true
requirements: [CFG-01]

user_setup:
  - service: supabase
    why: "Database hosting and magic link authentication"
    env_vars:
      - name: NEXT_PUBLIC_SUPABASE_URL
        source: "Supabase Dashboard -> Project Settings -> API -> Project URL"
      - name: NEXT_PUBLIC_SUPABASE_ANON_KEY
        source: "Supabase Dashboard -> Project Settings -> API -> Project API keys -> anon/public"
      - name: DATABASE_URL
        source: "Supabase Dashboard -> Project Settings -> Database -> Connection string (pooler, port 6543, append ?pgbouncer=true)"
      - name: DIRECT_URL
        source: "Supabase Dashboard -> Project Settings -> Database -> Connection string (direct, port 5432)"
    dashboard_config:
      - task: "Create Supabase project (if not already done)"
        location: "supabase.com/dashboard -> New Project"
      - task: "Create initial admin user"
        location: "Supabase Dashboard -> Authentication -> Users -> Invite user (enter business owner email)"

must_haves:
  truths:
    - "Admin UI starts and renders a login page at /"
    - "Magic link email is sent when user enters email on login page"
    - "After clicking magic link, user is redirected to /dashboard"
    - "Unauthenticated users are redirected from /dashboard to /"
    - "Dashboard page loads and shows the authenticated user's tenant config from database"
  artifacts:
    - path: "admin/app/page.tsx"
      provides: "Login page with magic link form"
    - path: "admin/app/dashboard/page.tsx"
      provides: "Dashboard page shell (config forms added in Plan 04)"
    - path: "admin/app/auth/confirm/route.ts"
      provides: "Magic link callback handler"
    - path: "admin/middleware.ts"
      provides: "Supabase session refresh and auth redirect"
    - path: "admin/lib/prisma.ts"
      provides: "PrismaClient singleton for admin UI"
      exports: ["prisma"]
    - path: "admin/lib/supabase/server.ts"
      provides: "Server-side Supabase client factory"
      exports: ["createClient"]
  key_links:
    - from: "admin/middleware.ts"
      to: "admin/lib/supabase/middleware.ts"
      via: "Token refresh on every request"
      pattern: "getUser"
    - from: "admin/app/auth/confirm/route.ts"
      to: "supabase.auth.verifyOtp"
      via: "Magic link token verification"
      pattern: "verifyOtp"
    - from: "admin/app/dashboard/page.tsx"
      to: "admin/lib/prisma.ts"
      via: "Tenant query by authenticated user email"
      pattern: "prisma.tenant.findUnique"
---

<objective>
Scaffold the Next.js 16 admin UI with Supabase magic link authentication and Prisma database access.

Purpose: The admin UI is how business owners configure their agent. This plan creates the project, wires up authentication (magic link per locked decision), and establishes the dashboard shell that Plan 04 will fill with config forms.

Output: Working Next.js app with login page, magic link auth flow, session middleware, and authenticated dashboard page that loads tenant data.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/2/2-CONTEXT.md
@.planning/phases/2/2-RESEARCH.md
@.planning/phases/2/2-01-SUMMARY.md

<interfaces>
<!-- From Plan 01: Prisma schema (shared between voice server and admin) -->
The admin shares the same database schema as the voice server:
- Tenant: id, email, businessName, agentName, greeting, description, escalationMessage, afterHoursMessage, voiceId, twilioPhoneNumber, googleCalendarId, createdAt, updatedAt
- BusinessHours: id, tenantId, dayOfWeek (0-6), openTime (HH:mm), closeTime (HH:mm)
- Faq: id, tenantId, question, answer, createdAt
- Service: id, tenantId, name, description, startingAt, createdAt

The admin uses its own Prisma schema file pointing to the same database. The tenant is resolved by matching the authenticated Supabase user's email to Tenant.email.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create Next.js project with Prisma and Supabase auth</name>
  <files>admin/ (new directory with full Next.js project)</files>
  <action>
1. **Create Next.js project:**
   ```
   npx create-next-app@latest admin --typescript --app --no-tailwind --no-src-dir --import-alias "@/*"
   ```
   After creation, cd into admin and install deps:
   ```
   cd admin
   npm install @supabase/supabase-js @supabase/ssr sonner
   npm install prisma @prisma/client @prisma/adapter-pg pg
   npm install -D @types/pg
   ```

2. **Create Prisma schema** at `admin/prisma/schema.prisma`:
   - Copy the same models from voice server schema (Plan 01)
   - Generator: `prisma-client-js` provider with `output = "../app/generated/prisma"` (admin uses app/ directory)
   - Same datasource config (DATABASE_URL + DIRECT_URL)
   - Add `@@unique([tenantId, dayOfWeek])` on BusinessHours

3. **Create `admin/prisma.config.ts`** following Pattern 2 from 2-RESEARCH.md.

4. **Create `admin/lib/prisma.ts`** following Pattern 3 from 2-RESEARCH.md:
   - Import from `../app/generated/prisma`
   - PrismaPg adapter with pg Pool
   - Global singleton pattern

5. **Create Supabase client utilities** following Pattern 4 from 2-RESEARCH.md:
   - `admin/lib/supabase/server.ts`: createServerClient with cookie handling
   - `admin/lib/supabase/client.ts`: createBrowserClient
   - `admin/lib/supabase/middleware.ts`: Helper function for token refresh (called by middleware.ts)

6. **Create `admin/middleware.ts`** following Pattern 5 from 2-RESEARCH.md:
   - Refresh session on every request using `getUser()` (NOT `getSession()`, per Pitfall 3)
   - Redirect unauthenticated users from `/dashboard/*` to `/`
   - Matcher: `["/dashboard/:path*"]`

7. **Create `admin/app/layout.tsx`**:
   - Root layout with `<Toaster />` from sonner
   - Basic HTML structure, no styling beyond defaults

8. **Create `admin/app/page.tsx`** (login page):
   - Client component ("use client")
   - Simple form with email input and "Send magic link" button
   - On submit: call `supabase.auth.signInWithOtp` with `shouldCreateUser: false` and `emailRedirectTo` pointing to `/auth/confirm` (per Pattern 6, Pitfall 5)
   - Show success message after sending: "Check your email for a login link"
   - Show error if email not found

9. **Create `admin/app/auth/confirm/route.ts`** following Pattern 6 from 2-RESEARCH.md:
   - GET handler that extracts token_hash and type from searchParams
   - Verifies OTP via createServerClient
   - Redirects to `/dashboard` on success, `/` on failure

10. **Create `admin/app/dashboard/page.tsx`** (shell):
    - Server component
    - Get authenticated user via `createClient()` then `supabase.auth.getUser()`
    - Query tenant by email: `prisma.tenant.findUnique({ where: { email: user.email }, include: { businessHours: true, faqs: true, services: true } })`
    - If no tenant found, show "No business configured for this account" message
    - If tenant found, render the business name as an h1 and a placeholder: "Configuration forms coming soon"
    - This page will be expanded with actual forms in Plan 04

11. **Add postinstall script** to `admin/package.json`: `"postinstall": "prisma generate"` (per Pitfall 4)

12. **Create `admin/.env.example`** with all required env vars (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, DATABASE_URL, DIRECT_URL, NEXT_PUBLIC_SITE_URL)

13. **Run `npx prisma generate`** in admin directory to generate the client.

14. **Add `admin/.gitignore`** entry for `.env` and `app/generated/` (generated Prisma client should not be committed).

15. Verify: `cd admin && npm run build` should succeed (or `npx next build`). If DATABASE_URL is not set, the build may fail at the dashboard page server component. To handle this, wrap the prisma query in the dashboard page with a try/catch that shows a "Database not configured" message, so the build succeeds even without a database connection.
  </action>
  <verify>
    <automated>cd /Users/matthewharris/Workspace/personal/ai/agent-call/admin && npx tsc --noEmit</automated>
  </verify>
  <done>Next.js admin project exists at admin/ with Supabase auth (magic link), Prisma client, middleware for session refresh, login page, auth callback, and dashboard shell. TypeScript compiles clean.</done>
</task>

</tasks>

<verification>
- `cd admin && npx tsc --noEmit` passes
- `admin/app/page.tsx` contains `signInWithOtp` with `shouldCreateUser: false`
- `admin/middleware.ts` uses `getUser()` not `getSession()`
- `admin/app/auth/confirm/route.ts` handles token verification
- `admin/app/dashboard/page.tsx` queries tenant by user email
- `admin/lib/prisma.ts` uses `prisma-client-js` provider (not `prisma-client`)
- `admin/package.json` has `postinstall: prisma generate`
</verification>

<success_criteria>
The admin UI scaffolding is complete with working authentication flow. A pre-provisioned user can receive a magic link, click it, and land on an authenticated dashboard page that loads their tenant data from the database. The dashboard is a shell ready for Plan 04 to add config forms.
</success_criteria>

<output>
After completion, create `.planning/phases/2/2-03-SUMMARY.md`
</output>

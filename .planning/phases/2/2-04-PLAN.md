---
phase: 2-tenant-identity
plan: 04
type: execute
wave: 3
depends_on: [02, 03]
files_modified:
  - admin/app/actions/config.ts
  - admin/app/dashboard/page.tsx
  - admin/app/dashboard/_components/BusinessInfoForm.tsx
  - admin/app/dashboard/_components/BusinessHoursForm.tsx
  - admin/app/dashboard/_components/FaqSection.tsx
  - admin/app/dashboard/_components/ServicesSection.tsx
  - admin/app/dashboard/_components/CalendarSection.tsx
  - admin/app/dashboard/_components/CollapsibleSection.tsx
autonomous: false

requirements: [CFG-01, CFG-02, CFG-03, CFG-04, CFG-05]

must_haves:
  truths:
    - "Business owner can edit business name, description, greeting, escalation message, and voice ID"
    - "Business owner can set open/close times for each day of the week"
    - "Business owner can add, edit, and delete FAQ question/answer pairs"
    - "Business owner can add, edit, and delete services with name, description, and optional price"
    - "Calendar section shows a placeholder for future Google Calendar connection"
    - "All saves show a toast notification confirming success"
    - "All config changes persist to the database"
  artifacts:
    - path: "admin/app/actions/config.ts"
      provides: "Server Actions for all config mutations"
      exports: ["saveBusinessInfo", "saveBusinessHours", "saveFaq", "deleteFaq", "saveService", "deleteService"]
    - path: "admin/app/dashboard/_components/BusinessInfoForm.tsx"
      provides: "Form for business name, description, greeting, escalation message, voice ID"
    - path: "admin/app/dashboard/_components/BusinessHoursForm.tsx"
      provides: "Form for 7-day open/close time grid"
    - path: "admin/app/dashboard/_components/FaqSection.tsx"
      provides: "CRUD list for FAQ question/answer pairs"
    - path: "admin/app/dashboard/_components/ServicesSection.tsx"
      provides: "CRUD list for services with name, description, starting price"
  key_links:
    - from: "admin/app/dashboard/_components/BusinessInfoForm.tsx"
      to: "admin/app/actions/config.ts"
      via: "useActionState(saveBusinessInfo)"
      pattern: "useActionState.*saveBusinessInfo"
    - from: "admin/app/actions/config.ts"
      to: "admin/lib/prisma.ts"
      via: "prisma.tenant.update / prisma.faq.create / etc."
      pattern: "prisma\\.(tenant|faq|service|businessHours)"
    - from: "admin/app/actions/config.ts"
      to: "revalidatePath"
      via: "Cache invalidation after mutation"
      pattern: "revalidatePath.*dashboard"
---

<objective>
Build all admin UI config forms: business info, hours, FAQs, services, and calendar placeholder. This completes the admin UI and covers all CFG-* requirements.

Purpose: Business owners need to configure their agent without touching code. This plan adds the forms that write to the database, which the voice server reads per-call (wired in Plan 02).

Output: Fully functional admin dashboard with all config sections. Saving any field persists to the database and takes effect on the next call.
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
@.planning/phases/2/2-02-SUMMARY.md
@.planning/phases/2/2-03-SUMMARY.md

<interfaces>
<!-- From Plan 03: Admin project structure -->
admin/app/dashboard/page.tsx: Server component that loads tenant with relations
admin/lib/prisma.ts: exports prisma (PrismaClient singleton)
admin/lib/supabase/server.ts: exports createClient() for server-side auth

<!-- From Plan 01: Prisma models -->
Tenant: { id, email, businessName, agentName, greeting, description, escalationMessage, afterHoursMessage, voiceId, twilioPhoneNumber, ... }
BusinessHours: { id, tenantId, dayOfWeek (0-6), openTime ("HH:mm" | null), closeTime ("HH:mm" | null) } with @@unique([tenantId, dayOfWeek])
Faq: { id, tenantId, question, answer, createdAt }
Service: { id, tenantId, name, description, startingAt (string | null), createdAt }

<!-- Server Action pattern from 2-RESEARCH.md Pattern 7 -->
Actions return { success: boolean; message: string }
Client components use useActionState + useEffect for toast feedback
All mutations call revalidatePath("/dashboard") on success (Pitfall 7)
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Server Actions for all config mutations</name>
  <files>admin/app/actions/config.ts, admin/app/dashboard/_components/CollapsibleSection.tsx</files>
  <action>
1. **Create `admin/app/actions/config.ts`** with "use server" directive. All actions follow Pattern 7 from 2-RESEARCH.md: accept (_prevState, formData), return `{ success: boolean; message: string }`, call `revalidatePath("/dashboard")` on success.

   **saveBusinessInfo**: Update tenant with businessName, description, greeting, escalationMessage, afterHoursMessage, voiceId. Use `prisma.tenant.update({ where: { id: tenantId }, data: { ... } })`.

   **saveBusinessHours**: Accept form data with 7 days of open/close times. Use `prisma.$transaction` with upsert pattern from 2-RESEARCH.md code example (upsert by tenantId_dayOfWeek composite unique). For each day: if both open and close are empty strings, set openTime/closeTime to null (closed that day). Days: 0=Sunday through 6=Saturday.

   **saveFaq**: If faqId is present in formData, update existing. If not, create new. Use `prisma.faq.upsert` or conditional create/update.

   **deleteFaq**: Accept faqId, delete with `prisma.faq.delete({ where: { id: faqId } })`.

   **saveService**: If serviceId is present, update. If not, create. Fields: name, description, startingAt (can be empty string, store as null).

   **deleteService**: Accept serviceId, delete.

   All actions must verify the tenant belongs to the authenticated user before mutating. Get user via createClient() + getUser(), then verify tenant.email matches user.email.

2. **Create `admin/app/dashboard/_components/CollapsibleSection.tsx`**:
   - Client component with a heading and toggle button
   - Uses useState for open/closed state, default open
   - Renders children when open
   - Per CONTEXT.md: "Collapsible sections on one scrollable page"
   - Bare-bones styling: border-bottom, padding, cursor pointer on heading
  </action>
  <verify>
    <automated>cd /Users/matthewharris/Workspace/personal/ai/agent-call/admin && npx tsc --noEmit</automated>
  </verify>
  <done>All 6 Server Actions compile and handle CRUD for business info, hours, FAQs, and services. CollapsibleSection component exists for dashboard layout.</done>
</task>

<task type="auto">
  <name>Task 2: Dashboard form components and page assembly</name>
  <files>admin/app/dashboard/_components/BusinessInfoForm.tsx, admin/app/dashboard/_components/BusinessHoursForm.tsx, admin/app/dashboard/_components/FaqSection.tsx, admin/app/dashboard/_components/ServicesSection.tsx, admin/app/dashboard/_components/CalendarSection.tsx, admin/app/dashboard/page.tsx</files>
  <action>
1. **BusinessInfoForm.tsx** (client component, "use client"):
   - Props: tenant object (id, businessName, description, greeting, escalationMessage, afterHoursMessage, voiceId)
   - Uses `useActionState(saveBusinessInfo, null)` + `useEffect` for toast (Pattern 7)
   - Form fields: businessName (text input), description (textarea), greeting (textarea), escalationMessage (textarea), afterHoursMessage (textarea, optional, placeholder: "Leave blank for auto-generated message"), voiceId (text input)
   - Hidden input for tenantId
   - Submit button with pending state ("Saving..." / "Save")
   - Bare-bones: labels + inputs, no fancy styling per CONTEXT.md locked decision

2. **BusinessHoursForm.tsx** (client component):
   - Props: tenantId, businessHours array (pre-populated from DB)
   - Renders a row for each day of the week (Sunday through Saturday)
   - Each row: day name label, open time input (type="time"), close time input (type="time"), "Closed" checkbox
   - When "Closed" is checked, time inputs are disabled and values cleared
   - Pre-populate from businessHours array; days with null openTime/closeTime show as "Closed"
   - Uses `useActionState(saveBusinessHours, null)` for form submission
   - Toast feedback on save

3. **FaqSection.tsx** (client component):
   - Props: tenantId, faqs array
   - Renders existing FAQs as editable rows: question (text input), answer (textarea), Save button, Delete button
   - "Add FAQ" button at bottom that appends a new empty row
   - Each FAQ row is its own form using saveFaq action (with faqId hidden input for existing, omitted for new)
   - Delete uses a separate form with deleteFaq action and faqId
   - Toast feedback on save/delete
   - Keep it simple: no drag-and-drop, no reordering (per CONTEXT.md: flat, no priority ordering)

4. **ServicesSection.tsx** (client component):
   - Props: tenantId, services array
   - Same pattern as FaqSection: editable rows with name, description, startingAt (optional)
   - Each service row: name (text input), description (textarea), startingAt (text input, placeholder: "e.g., $49"), Save button, Delete button
   - "Add Service" button
   - Toast feedback

5. **CalendarSection.tsx** (client component):
   - Props: tenantId, googleCalendarId (string | null)
   - For Phase 2: display a simple placeholder message: "Google Calendar integration will be available in a future update."
   - If googleCalendarId is already set (unlikely in Phase 2), show it as read-only text
   - This satisfies CFG-05 requirement at the UI level (the section exists, full OAuth comes in Phase 3)

6. **Update `admin/app/dashboard/page.tsx`**:
   - Server component that loads tenant with all relations (from Plan 03 shell)
   - Import all form components and CollapsibleSection
   - Render sections in order per CONTEXT.md: Business Info, Hours, Services, FAQs, Calendar Connection
   - Each section wrapped in CollapsibleSection with appropriate heading
   - Pass the relevant data slice to each component
   - Show the business name at the top as a page heading

7. Verify: `cd admin && npx tsc --noEmit`
  </action>
  <verify>
    <automated>cd /Users/matthewharris/Workspace/personal/ai/agent-call/admin && npx tsc --noEmit</automated>
  </verify>
  <done>All 5 form components render with appropriate inputs. Dashboard page assembles them in collapsible sections. TypeScript compiles clean.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
Complete admin UI with all configuration forms. The dashboard has collapsible sections for:
- Business Info (name, description, greeting, escalation message, after-hours message, voice ID)
- Business Hours (7-day grid with open/close times)
- Services (name, description, optional starting price)
- FAQs (question/answer pairs)
- Calendar Connection (placeholder)

All forms save to the database via Server Actions with toast feedback.
  </what-built>
  <how-to-verify>
1. Ensure Supabase project is set up with DATABASE_URL, DIRECT_URL, and auth env vars in admin/.env
2. Run migrations: `cd admin && npx prisma migrate deploy` (or `npx prisma db push` for dev)
3. Seed a tenant: use Prisma Studio (`npx prisma studio`) or run a seed script to create a Tenant row with your email and a twilioPhoneNumber
4. Create a Supabase user: Supabase Dashboard -> Authentication -> Users -> Invite user (use same email as tenant)
5. Start admin: `cd admin && npm run dev`
6. Visit http://localhost:3000, enter your email, click "Send magic link"
7. Check email (or Supabase logs for dev), click the magic link
8. Verify you land on /dashboard with your business name displayed
9. Test each section:
   - Edit business name, click Save, verify toast appears, refresh page, verify change persists
   - Set Monday hours to 09:00-17:00, click Save, verify toast, refresh, verify hours persist
   - Add an FAQ ("What are your hours?" / "We're open Monday to Friday 9-5"), Save, verify it appears
   - Add a service ("Oil Change" / "Conventional and synthetic" / "$49"), Save, verify it appears
   - Delete an FAQ or service, verify it disappears
10. Verify the voice server can read this config: call the Twilio number and confirm the agent uses the updated business name/greeting

Type "approved" if all sections save correctly and config changes are reflected.
  </how-to-verify>
  <resume-signal>Type "approved" or describe issues found</resume-signal>
</task>

</tasks>

<verification>
- `cd admin && npx tsc --noEmit` passes
- All Server Actions exist and compile
- Dashboard renders 5 collapsible sections
- Business info form saves and persists
- Hours form saves 7-day grid
- FAQ section supports add/edit/delete
- Services section supports add/edit/delete
- Calendar section shows placeholder message
- Toast notifications appear on save
</verification>

<success_criteria>
A business owner can log into the admin UI, configure all aspects of their agent (business info, hours, services, FAQs), and those changes are persisted to the database. The voice server reads this config on each incoming call, meaning configuration changes take effect without redeployment. All CFG-01 through CFG-05 requirements are met (CFG-05 as placeholder UI, full implementation in Phase 3).
</success_criteria>

<output>
After completion, create `.planning/phases/2/2-04-SUMMARY.md`
</output>

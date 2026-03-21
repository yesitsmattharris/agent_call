---
phase: 2-tenant-identity
plan: 04
subsystem: admin-ui
tags: [server-actions, forms, config-ui, useActionState, sonner-toast]
dependency_graph:
  requires: [admin-ui-scaffold, supabase-auth, admin-prisma-client, dashboard-shell]
  provides: [config-forms, server-actions-config, collapsible-sections]
  affects: [admin/app/dashboard/page.tsx]
tech_stack:
  added: []
  patterns: [useActionState-toast-pattern, server-action-auth-verification, prisma-transaction-upsert]
key_files:
  created:
    - admin/app/actions/config.ts
    - admin/app/dashboard/_components/BusinessInfoForm.tsx
    - admin/app/dashboard/_components/BusinessHoursForm.tsx
    - admin/app/dashboard/_components/FaqSection.tsx
    - admin/app/dashboard/_components/ServicesSection.tsx
    - admin/app/dashboard/_components/CalendarSection.tsx
    - admin/app/dashboard/_components/CollapsibleSection.tsx
  modified:
    - admin/app/dashboard/page.tsx
decisions:
  - "Separated delete forms from save forms to avoid nested HTML forms (invalid HTML)"
  - "Used controlled state for business hours (closed checkbox toggles and clears time inputs)"
  - "Used crypto.randomUUID() for temporary keys on new FAQ/service rows"
metrics:
  duration: 258s
  completed: 2026-03-21T00:00:00Z
  tasks_completed: 3
  tasks_total: 3
---

# Phase 2 Plan 04: Admin UI Config Forms Summary

All config forms with 6 Server Actions (saveBusinessInfo, saveBusinessHours, saveFaq, deleteFaq, saveService, deleteService), useActionState + sonner toast feedback, tenant ownership verification via Supabase auth on every mutation.

## Tasks Completed

### Task 1: Server Actions for all config mutations
**Commit:** 7712dc5

- Created `admin/app/actions/config.ts` with 6 exported Server Actions following Pattern 7 (useActionState signature)
- All actions verify tenant ownership: getUser() from Supabase, lookup tenant by email, compare tenantId
- saveBusinessHours uses prisma.$transaction with 7 upserts by tenantId_dayOfWeek composite unique
- saveFaq/saveService use conditional create/update based on presence of existing ID
- All mutations call revalidatePath("/dashboard") on success
- Created CollapsibleSection client component with heading toggle and children rendering

### Task 2: Dashboard form components and page assembly
**Commit:** eba85ce

- BusinessInfoForm: 7 fields (businessName, agentName, description, greeting, escalationMessage, afterHoursMessage, voiceId) with hidden tenantId
- BusinessHoursForm: controlled state for 7-day grid with open/close time inputs and Closed checkbox; disabled inputs clear values when toggled
- FaqSection: CRUD list pattern, each row is its own save form with separate delete form (avoids nested forms), "Add FAQ" appends empty row
- ServicesSection: same CRUD list pattern with name, description, optional startingAt fields
- CalendarSection: placeholder message for Phase 3, shows googleCalendarId as read-only if set
- Updated dashboard page.tsx: imports all components, renders in CollapsibleSection wrappers in order (Business Info, Hours, Services, FAQs, Calendar)

### Task 3: Dev password login and error logging improvements
**Commit:** d390d1c

- Added dev-only password login toggle to login page (magic link remains default for production)
- Added `console.error` with actual error object in dashboard database catch block for debugging

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] Dev password login on login page**
- **Found during:** Checkpoint verification
- **Issue:** Magic link auth requires email delivery, making local dev testing cumbersome
- **Fix:** Added dev-only password auth toggle (hidden behind `NODE_ENV === "development"` check)
- **Files modified:** admin/app/page.tsx
- **Commit:** d390d1c

**2. [Rule 1 - Bug] Silent error swallowing in dashboard**
- **Found during:** Checkpoint verification
- **Issue:** Database errors caught but not logged, making debugging impossible
- **Fix:** Added console.error with actual error object
- **Files modified:** admin/app/dashboard/page.tsx
- **Commit:** d390d1c

## Verification Results

- `npx tsc --noEmit`: PASS (zero errors, both tasks)
- All 6 Server Actions exist and compile: VERIFIED
- Dashboard renders 5 collapsible sections: VERIFIED (Business Info, Hours, Services, FAQs, Calendar Connection)
- All forms use useActionState pattern with toast: VERIFIED
- No nested HTML forms: VERIFIED (delete forms are siblings, not children of save forms)

## Self-Check: PASSED

---
phase: 3-call-resolution
plan: 03
subsystem: admin-ui
tags: [call-history, transcript-viewer, messages, admin-ui, navigation]
dependency_graph:
  requires: [CallLog-model, Message-model]
  provides: [call-history-ui, transcript-viewer, messages-list-ui, dashboard-navigation]
  affects: [admin/app/dashboard]
tech_stack:
  added: []
  patterns: [promise-based-searchParams, promise-based-params, dashboard-layout-nav]
key_files:
  created:
    - admin/app/dashboard/layout.tsx
    - admin/app/dashboard/calls/page.tsx
    - admin/app/dashboard/calls/_components/CallList.tsx
    - admin/app/dashboard/calls/_components/SearchBar.tsx
    - admin/app/dashboard/calls/_components/TranscriptViewer.tsx
    - admin/app/dashboard/calls/[id]/page.tsx
    - admin/app/dashboard/messages/page.tsx
  modified:
    - admin/app/dashboard/page.tsx
    - admin/prisma/schema.prisma
decisions:
  - Admin Prisma schema must be kept in sync with voice server schema (both need CallLog/Message models)
  - Dashboard layout handles max-width/centering so individual pages stay simple
metrics:
  duration: 2m59s
  completed: 2026-03-21T22:33:45Z
  tasks_completed: 2
  tasks_total: 2
---

# Phase 3 Plan 03: Admin UI Call History + Messages Summary

Dashboard navigation with call history list (search by caller/outcome), call detail page with chat-style transcript viewer, and messages list page with call links.

## What Was Built

1. **Dashboard layout** (`admin/app/dashboard/layout.tsx`): Server component wrapping all /dashboard/* pages with a navigation bar (Config, Calls, Messages links). Handles the max-width/centering that was previously in each page individually.

2. **Call history list** (`admin/app/dashboard/calls/page.tsx`): Server component with Supabase auth and tenant verification. Queries `prisma.callLog.findMany` with optional search filter on callerNumber and outcome via `?q=` search param. Renders SearchBar and CallList components.

3. **SearchBar** (`admin/app/dashboard/calls/_components/SearchBar.tsx`): Client component using a plain GET form to `/dashboard/calls` for server-side search. No client-side state management needed.

4. **CallList** (`admin/app/dashboard/calls/_components/CallList.tsx`): Renders each call as a linked row showing caller number, formatted date/time, outcome badge, and formatted duration (Xm Ys). Links to call detail page.

5. **Call detail page** (`admin/app/dashboard/calls/[id]/page.tsx`): Server component with auth + tenant ownership check. Shows call metadata (caller, outcome, date, duration) in a grid, renders TranscriptViewer with the transcript JSON, and lists any messages taken during the call.

6. **TranscriptViewer** (`admin/app/dashboard/calls/_components/TranscriptViewer.tsx`): Renders transcript entries as chat-style bubbles. Agent messages right-aligned with blue background, Caller messages left-aligned with gray background. Handles both pre-parsed arrays and JSON strings gracefully.

7. **Messages list** (`admin/app/dashboard/messages/page.tsx`): Shows all messages across calls sorted by most recent. Each message displays caller name, callback number, reason, preferred time, and a link to the associated call if one exists.

8. **Dashboard page update** (`admin/app/dashboard/page.tsx`): Removed outer `<main>` with max-width/margin styles (now handled by layout). Content remains unchanged.

## Build Results

`cd admin && npx next build` succeeds with zero errors on both task commits.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Admin Prisma schema missing CallLog and Message models**
- **Found during:** Task 1 (build verification)
- **Issue:** Plan 3-01 added CallLog and Message models to the voice server's `prisma/schema.prisma` but the admin app has its own separate schema at `admin/prisma/schema.prisma` which was not updated. Build failed with "Property 'callLog' does not exist on type 'PrismaClient'".
- **Fix:** Synced admin schema with voice server schema, adding CallLog model, Message model, timezone field on Tenant, and relation fields (callLogs, messages) on Tenant. Ran `npx prisma generate` to regenerate the client.
- **Files modified:** admin/prisma/schema.prisma
- **Commit:** 9333edd

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 9333edd | feat(3-03): add dashboard layout with nav and call history list page |
| 2 | e5df124 | feat(3-03): add call detail with transcript viewer and messages list page |

## Self-Check: PASSED

All 7 created files verified on disk. Both task commits (9333edd, e5df124) verified in git log.

---
phase: 2-tenant-identity
plan: 03
subsystem: admin-ui
tags: [nextjs, supabase, prisma, authentication, magic-link]
dependency_graph:
  requires: [prisma-schema]
  provides: [admin-ui-scaffold, supabase-auth, admin-prisma-client, dashboard-shell]
  affects: []
tech_stack:
  added: [next@16.2.0, "@supabase/supabase-js@^2.99", "@supabase/ssr@^0.9", sonner@^2, "@prisma/adapter-pg@^7.5", pg@^8]
  patterns: [supabase-ssr-cookie-auth, prisma-singleton-poolconfig, magic-link-otp, middleware-session-refresh]
key_files:
  created:
    - admin/app/page.tsx
    - admin/app/layout.tsx
    - admin/app/auth/confirm/route.ts
    - admin/app/dashboard/page.tsx
    - admin/middleware.ts
    - admin/lib/prisma.ts
    - admin/lib/supabase/server.ts
    - admin/lib/supabase/client.ts
    - admin/lib/supabase/middleware.ts
    - admin/prisma/schema.prisma
    - admin/prisma.config.ts
    - admin/.env.example
  modified:
    - admin/package.json
    - admin/.gitignore
decisions:
  - "Used process.env fallback in prisma.config.ts instead of Prisma env() helper to allow prisma generate without DIRECT_URL set (needed for CI/Vercel postinstall)"
  - "Changed .gitignore from .env* to .env and .env*.local to allow committing .env.example"
  - "Did NOT install @types/pg per Plan 01 finding (conflicts with @prisma/adapter-pg bundled types)"
metrics:
  duration: 290s
  completed: 2026-03-20T20:43:32Z
  tasks_completed: 1
  tasks_total: 1
---

# Phase 2 Plan 03: Admin UI Scaffold with Supabase Auth Summary

Next.js 16 admin UI at admin/ with Supabase magic link auth (signInWithOtp, shouldCreateUser: false), PrismaClient singleton using PrismaPg PoolConfig adapter, session middleware using getUser(), and dashboard shell querying tenant by authenticated user email.

## Tasks Completed

### Task 1: Create Next.js project with Prisma and Supabase auth
**Commit:** 8fc9759

- Created Next.js 16 admin project with App Router (no src directory, @/* import alias)
- Installed @supabase/supabase-js, @supabase/ssr, sonner, prisma, @prisma/client, @prisma/adapter-pg, pg
- Created Prisma schema with Tenant, BusinessHours, Faq, Service models (mirrors voice server schema)
- Created prisma.config.ts with DIRECT_URL fallback for generate-without-env scenarios
- Created PrismaClient singleton (lib/prisma.ts) with PrismaPg PoolConfig adapter pattern
- Created Supabase SSR client utilities: server.ts (createServerClient with cookies), client.ts (createBrowserClient), middleware.ts (session refresh helper with getUser)
- Created middleware.ts matching /dashboard/:path* with auth redirect
- Created login page (app/page.tsx) with magic link form using signInWithOtp, shouldCreateUser: false
- Created /auth/confirm route handler for magic link token verification via verifyOtp
- Created dashboard page (server component) querying tenant by user email with try/catch for missing DB
- Added postinstall script for prisma generate
- Added app/generated/ to .gitignore
- Generated Prisma client successfully
- TypeScript compiles clean (npx tsc --noEmit)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] prisma.config.ts env() fails without DIRECT_URL**
- **Found during:** Task 1, step 13 (prisma generate)
- **Issue:** Prisma's `env("DIRECT_URL")` helper throws if the variable is not set, breaking `prisma generate` in CI/Vercel postinstall where only DATABASE_URL may be present
- **Fix:** Used `process.env.DIRECT_URL ?? "postgresql://placeholder:..."` fallback instead of `env()` helper
- **Files modified:** admin/prisma.config.ts
- **Commit:** 8fc9759

**2. [Rule 3 - Blocking] .gitignore .env* pattern blocks .env.example**
- **Found during:** Task 1, step 14 (git add)
- **Issue:** The `.env*` glob in .gitignore created by create-next-app catches `.env.example`, preventing it from being committed
- **Fix:** Changed to `.env` and `.env*.local` patterns (matches .env, .env.local, .env.development.local, etc. but not .env.example)
- **Files modified:** admin/.gitignore
- **Commit:** 8fc9759

## Verification Results

- `npx tsc --noEmit`: PASS (zero errors)
- `admin/app/page.tsx` contains `signInWithOtp` with `shouldCreateUser: false`: PASS
- `admin/lib/supabase/middleware.ts` uses `getUser()` not `getSession()`: PASS
- `admin/app/auth/confirm/route.ts` handles token verification via `verifyOtp`: PASS
- `admin/app/dashboard/page.tsx` queries tenant by user email: PASS
- `admin/prisma/schema.prisma` uses `prisma-client-js` provider: PASS
- `admin/package.json` has `postinstall: prisma generate`: PASS

## Self-Check: PASSED

All 12 key files verified on disk. Commit 8fc9759 verified in git log.

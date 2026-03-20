---
phase: 2-tenant-identity
plan: 01
subsystem: data-layer
tags: [prisma, database, testing, vitest]
dependency_graph:
  requires: []
  provides: [prisma-schema, prisma-client, vitest-framework, test-scaffolds]
  affects: [src/config/schema.ts]
tech_stack:
  added: [prisma@7.5.0, "@prisma/client@7.5.0", "@prisma/adapter-pg@7.5.0", pg@8, vitest@4.1.0]
  patterns: [prisma-singleton, pg-pool-config-adapter, describe-skip-scaffolds]
key_files:
  created:
    - prisma/schema.prisma
    - prisma.config.ts
    - src/db/prisma.ts
    - vitest.config.ts
    - src/config/prompt-builder.test.ts
    - src/config/loader.test.ts
    - src/generated/prisma/
  modified:
    - src/config/schema.ts
    - package.json
decisions:
  - "Used PoolConfig object instead of pg.Pool instance to avoid @types/pg version conflict between devDependency and @prisma/adapter-pg bundled types"
  - "Removed url and directUrl from schema.prisma datasource block per Prisma 7 requirement (connection config lives in prisma.config.ts only)"
  - "Removed @types/pg devDependency since @prisma/adapter-pg bundles its own compatible version"
metrics:
  duration: 301s
  completed: 2026-03-20T20:34:08Z
  tasks_completed: 2
  tasks_total: 2
---

# Phase 2 Plan 01: Prisma Schema, Database Models, Vitest Setup Summary

Prisma 7 data layer with Tenant/BusinessHours/Faq/Service models, PrismaClient singleton using PrismaPg PoolConfig adapter, vitest configured with 9 skipped test scaffolds for CALL-03/CALL-04/CFG-06.

## Tasks Completed

### Task 1: Prisma schema, config, and client singleton
**Commit:** a14f470

- Installed prisma, @prisma/client, @prisma/adapter-pg, pg
- Created `prisma/schema.prisma` with Tenant, BusinessHours, Faq, Service models
- Added `@@unique([tenantId, dayOfWeek])` on BusinessHours for upsert pattern
- Created `prisma.config.ts` with defineConfig pointing to DIRECT_URL for CLI
- Created `src/db/prisma.ts` PrismaClient singleton with PrismaPg adapter
- Extended `src/config/schema.ts` with Zod schemas for Faq, Service, BusinessHoursEntry, TenantConfig types
- Added `postinstall: prisma generate` script for deploy builds
- Generated Prisma client to `src/generated/prisma/`

### Task 2: Vitest setup and test scaffolds
**Commit:** 353e134

- Installed vitest 4.1.0
- Created `vitest.config.ts` with globals and src/**/*.test.ts include pattern
- Added `test: vitest run --reporter=dot` script
- Created `src/config/prompt-builder.test.ts` with 7 skipped tests covering:
  - FAQ injection into prompt (CALL-03)
  - Services injection into prompt (CALL-03)
  - Empty FAQs exclusion
  - After-hours messaging when closed (CALL-04)
  - isCurrentlyOpen true during open hours (CALL-04)
  - isCurrentlyOpen false outside hours (CALL-04)
  - isCurrentlyOpen false with no hours configured (CALL-04)
- Created `src/config/loader.test.ts` with 2 skipped tests covering:
  - loadTenantConfig returns tenant with relations (CFG-06)
  - loadTenantConfig throws for unknown number (CFG-06)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Prisma 7 datasource url/directUrl removed from schema.prisma**
- **Found during:** Task 1, step 6
- **Issue:** Prisma 7 no longer supports `url` and `directUrl` properties in the schema.prisma datasource block. These must be configured in prisma.config.ts only.
- **Fix:** Removed both url and directUrl from datasource block, keeping only `provider = "postgresql"`
- **Files modified:** prisma/schema.prisma
- **Commit:** a14f470

**2. [Rule 3 - Blocking] @types/pg version conflict with @prisma/adapter-pg**
- **Found during:** Task 1, step 7
- **Issue:** Installing @types/pg as a devDependency created a type conflict with the @types/pg bundled inside @prisma/adapter-pg (different Pool.connect() return types)
- **Fix:** Removed @types/pg devDependency and used PoolConfig plain object (instead of pg.Pool instance) as the PrismaPg constructor argument, avoiding the pg import entirely
- **Files modified:** src/db/prisma.ts, package.json
- **Commit:** a14f470

## Verification Results

- `npx tsc --noEmit`: PASS (zero errors)
- `npx vitest run --reporter=dot`: PASS (2 test files, 9 tests skipped, 0 failures)
- `prisma/schema.prisma`: Contains Tenant, BusinessHours, Faq, Service models
- `src/db/prisma.ts`: Exports PrismaClient singleton
- `src/generated/prisma/`: Directory exists with generated client

## Self-Check: PASSED

All 8 key files verified on disk. Both commits (a14f470, 353e134) verified in git log.

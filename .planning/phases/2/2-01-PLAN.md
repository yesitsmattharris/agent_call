---
phase: 2-tenant-identity
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - prisma/schema.prisma
  - prisma.config.ts
  - src/db/prisma.ts
  - src/config/schema.ts
  - vitest.config.ts
  - src/config/prompt-builder.test.ts
  - src/config/loader.test.ts
  - package.json
autonomous: true
requirements: [CFG-06, CALL-03, CALL-04]

must_haves:
  truths:
    - "Prisma schema defines Tenant, BusinessHours, Faq, and Service models with correct relations"
    - "PrismaClient singleton connects to PostgreSQL via PrismaPg adapter"
    - "Vitest runs and executes test files in the voice server"
    - "Test stubs exist for prompt-builder (CALL-03, CALL-04) and loader (CFG-06)"
  artifacts:
    - path: "prisma/schema.prisma"
      provides: "Database schema for all tenant config"
      contains: "model Tenant"
    - path: "prisma.config.ts"
      provides: "Prisma 7 CLI configuration"
      contains: "defineConfig"
    - path: "src/db/prisma.ts"
      provides: "PrismaClient singleton for voice server"
      exports: ["prisma"]
    - path: "vitest.config.ts"
      provides: "Test framework configuration"
      contains: "defineConfig"
    - path: "src/config/prompt-builder.test.ts"
      provides: "Tests for FAQ injection, services injection, hours-aware behavior"
    - path: "src/config/loader.test.ts"
      provides: "Tests for tenant config loading from DB"
  key_links:
    - from: "src/db/prisma.ts"
      to: "prisma/schema.prisma"
      via: "Generated Prisma client import"
      pattern: "import.*PrismaClient"
---

<objective>
Set up the Prisma 7 data layer, database schema, and test infrastructure for the voice server.

Purpose: Everything in Phase 2 depends on the database schema and Prisma client. The test framework is needed for automated verification of voice server changes in Plans 02-04.

Output: Working Prisma schema with migrations applied, PrismaClient singleton, vitest configured, and test stubs for CALL-03/CALL-04/CFG-06 ready for Plan 02 to make them pass.
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
@src/config/schema.ts
@package.json
@tsconfig.json
</context>

<tasks>

<task type="auto">
  <name>Task 1: Prisma schema, config, and client singleton</name>
  <files>prisma/schema.prisma, prisma.config.ts, src/db/prisma.ts, src/config/schema.ts, package.json</files>
  <action>
1. Install Prisma dependencies in voice server:
   ```
   npm install @prisma/client @prisma/adapter-pg pg prisma
   npm install -D @types/pg
   ```

2. Create `prisma/schema.prisma` following Pattern 9 from 2-RESEARCH.md exactly:
   - Generator: `prisma-client-js` provider (NOT `prisma-client`, Turbopack pitfall)
   - Output: `../src/generated/prisma` (voice server uses src/, not app/)
   - Datasource: postgresql with `url = env("DATABASE_URL")` and `directUrl = env("DIRECT_URL")`
   - Models: Tenant, BusinessHours, Faq, Service exactly as specified in Pattern 9
   - Add `@@unique([tenantId, dayOfWeek])` on BusinessHours (needed for upsert pattern)

3. Create `prisma.config.ts` at project root following Pattern 2 from 2-RESEARCH.md:
   - Import `dotenv/config`
   - Use `defineConfig` from `prisma/config`
   - Schema path: `prisma/schema.prisma`
   - Datasource url: `env("DIRECT_URL")` (CLI uses direct connection, not pooler)

4. Create `src/db/prisma.ts` following Pattern 3 from 2-RESEARCH.md:
   - Import PrismaClient from `../generated/prisma` (matches output path)
   - Import PrismaPg from `@prisma/adapter-pg`
   - Import Pool from `pg`
   - Global singleton pattern to prevent connection pool exhaustion in dev
   - Export `prisma` instance

5. Update `src/config/schema.ts`: Expand the Zod schema to include the new fields from the DB models. Add types for the tenant config shape that `loadTenantConfig` will return (with included relations). Keep the existing `BusinessConfig` type and add a new `TenantConfig` type that includes faqs, services, and businessHours arrays. The voice server code will migrate from `BusinessConfig` to `TenantConfig`.

6. Run `npx prisma generate` to generate the client. Do NOT run migrations yet (requires DATABASE_URL which is a user setup step).

7. Verify `npx tsc --noEmit` passes (the generated client types should resolve).
  </action>
  <verify>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <done>Prisma schema defines all 4 models. PrismaClient singleton exists at src/db/prisma.ts. Generated client compiles. Zod schema has TenantConfig type with relations.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Vitest setup and test scaffolds</name>
  <files>vitest.config.ts, src/config/prompt-builder.test.ts, src/config/loader.test.ts, package.json</files>
  <behavior>
    - prompt-builder.test.ts:
      - Test: buildSystemPrompt with FAQs injects FAQ content into prompt string (CALL-03)
      - Test: buildSystemPrompt with services injects service names and prices (CALL-03)
      - Test: buildSystemPrompt with empty FAQs does not include FAQ section
      - Test: isCurrentlyOpen returns true during open hours (CALL-04)
      - Test: isCurrentlyOpen returns false outside hours (CALL-04)
      - Test: isCurrentlyOpen returns false when no hours configured for today (CALL-04)
      - Test: buildSystemPrompt includes after-hours messaging when closed (CALL-04)
    - loader.test.ts:
      - Test: loadTenantConfig returns tenant with all relations for valid phone number (CFG-06)
      - Test: loadTenantConfig throws for unknown phone number (CFG-06)
  </behavior>
  <action>
1. Install vitest: `npm install -D vitest`

2. Create `vitest.config.ts` at project root:
   ```typescript
   import { defineConfig } from "vitest/config";
   export default defineConfig({
     test: {
       globals: true,
       include: ["src/**/*.test.ts"],
     },
   });
   ```

3. Add test script to package.json: `"test": "vitest run --reporter=dot"`

4. Create `src/config/prompt-builder.test.ts` with RED tests:
   - Import the functions that WILL exist after Plan 02 implements them (buildSystemPrompt, isCurrentlyOpen)
   - Write all the behavior tests listed above using plain object fixtures (not Prisma models)
   - These tests WILL FAIL because the functions don't accept the new TenantConfig shape yet. That's expected (RED phase).
   - Use `describe.skip` blocks so CI doesn't break, but include a comment: "Remove .skip when Plan 02 implements TenantConfig support"

5. Create `src/config/loader.test.ts` with RED tests:
   - Mock the prisma client using vi.mock
   - Test loadTenantConfig with a mock that returns a full tenant object
   - Test loadTenantConfig with a mock that returns null (should throw)
   - Use `describe.skip` blocks with same comment as above

6. Run `npx vitest run --reporter=dot` to verify the test framework works (skipped tests should show as skipped, not errored).
  </action>
  <verify>
    <automated>npx vitest run --reporter=dot 2>&1 | tail -5</automated>
  </verify>
  <done>Vitest runs successfully. Test files exist with skipped test suites covering CALL-03, CALL-04, CFG-06 behaviors. Zero failures (skipped tests are not failures).</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes with zero errors
- `npx vitest run --reporter=dot` completes with skipped (not failed) tests
- `prisma/schema.prisma` contains Tenant, BusinessHours, Faq, Service models
- `src/db/prisma.ts` exports a PrismaClient singleton
- `src/generated/prisma/` directory exists with generated client
</verification>

<success_criteria>
The database schema is defined and the Prisma client is generated. The test framework is installed and configured. Test stubs exist for all voice server requirements (CALL-03, CALL-04, CFG-06) ready to be un-skipped and turned green in Plan 02.
</success_criteria>

<output>
After completion, create `.planning/phases/2/2-01-SUMMARY.md`
</output>

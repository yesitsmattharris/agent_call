# Phase 2: Tenant Identity - Research

**Researched:** 2026-03-20
**Domain:** Multi-tenant config, Next.js App Router admin UI, Supabase Auth (magic link), Prisma 7 + PostgreSQL
**Confidence:** HIGH (stack is confirmed, major pitfalls verified from official docs and current community reports)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

1. **Admin UI Experience**
   - Polish level: Bare-bones functional UI. Form fields, save buttons, done. Not styled for customer demos yet.
   - Auth: Magic link authentication (email-based, no password).
   - Layout: Single page with sections (business info, hours, services, FAQs, calendar connection). No sidebar or tab navigation. Collapsible sections on one scrollable page.
   - Save feedback: Simple "saved" toast notification after successful save. No "changes take effect on next call" messaging needed.

2. **FAQ Structure and Agent Behavior**
   - Structure: Flat question/answer pairs. No categories, no priority ordering.
   - Upper bound: ~10 FAQs expected. All injected directly into the system prompt. No retrieval layer needed.
   - Agent usage: FAQs are reference knowledge, not scripts. Agent paraphrases and synthesizes.
   - Hallucination guardrail: Agent only answers using configured facts. Unknown questions escalate to take_message.

3. **After-Hours Call Behavior**
   - Different greeting: "Thanks for calling [Business], we're currently closed"
   - Custom after-hours message configurable. Falls back to system-generated from hours if not set.
   - Agent still answers FAQs and converses after hours. Wraps up by offering to take a message.
   - Hours model: Day-of-week open/close times only. No holiday support in v1.

4. **Services Configuration**
   - Structure: Name + short description per service.
   - Optional "starting at" price. If empty, agent says to schedule for accurate quote.
   - All services injected into system prompt.

5. **Config Reload**
   - Per-call database lookup by Twilio phone number to tenant mapping.
   - No in-memory caching between calls.

### Claude's Discretion

- (None stated in CONTEXT.md — all decisions are locked.)

### Deferred Ideas (OUT OF SCOPE)

- Holiday/one-off closure dates
- FAQ categories and priority ordering
- Polished admin UI with design system
- Password-based auth or OAuth
- Service recommendation engine beyond simple keyword matching
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CFG-01 | Business owner can set business name, description, and greeting via admin UI | Server Actions + Prisma upsert on Tenant model |
| CFG-02 | Business owner can configure business hours (open/close times per day of week) | BusinessHours join table, 7-row upsert pattern |
| CFG-03 | Business owner can add FAQ entries (question/answer pairs) | FAQ model with CRUD; all rows injected into system prompt |
| CFG-04 | Business owner can list services offered | Service model with CRUD; injected into system prompt |
| CFG-05 | Business owner can connect Google Calendar | OAuth credential storage on Tenant; Google OAuth consent flow |
| CFG-06 | Agent behavior updates immediately when config changes | No caching: per-call DB read in webhooks.ts using `To` phone number |
| CALL-03 | Agent answers questions using FAQ content without hallucinating | FAQ content injected as explicit reference block in system prompt |
| CALL-04 | Agent adjusts behavior based on configured business hours | hours-aware prompt section: checks current time vs. stored hours, switches greeting/behavior |
</phase_requirements>

---

## Summary

Phase 2 introduces a Supabase-backed Prisma 7 data layer and a Next.js 16 App Router admin UI, replacing the current JSON file-based config. The voice server changes from loading config at startup to performing a per-call database lookup using the Twilio `To` phone number to resolve the tenant, then loading all config for that tenant.

The admin UI is a single-page React application using Next.js Server Actions for form mutations. Authentication uses Supabase magic link (passwordless email) with the `@supabase/ssr` package and a `/auth/confirm` callback route. The UI requires no styling investment at this stage -- functional HTML forms with toast feedback on save.

The critical implementation risk is Prisma 7 compatibility with Next.js 16 + Turbopack. The new `prisma-client` generator provider causes module resolution failures with Turbopack. The workaround is to use `prisma-client-js` as the provider even on Prisma 7, or set a custom `output` path and import from it directly. Both workarounds are documented and in use by the community.

**Primary recommendation:** Use `prisma-client-js` provider in `schema.prisma` to avoid Turbopack breakage. Use `@prisma/adapter-pg` + `pg` for the Prisma 7 driver adapter requirement. Use `@supabase/ssr` for server-side auth across middleware, server components, and route handlers.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `prisma` | 7.x | Schema, migrations, Prisma CLI | Project already decided; v7 is current release |
| `@prisma/client` | 7.x | Runtime ORM queries | Pair with prisma CLI at same version |
| `@prisma/adapter-pg` | 7.x | Driver adapter required by Prisma 7 | Prisma 7 requires explicit driver adapter for PostgreSQL |
| `pg` | ^8 | PostgreSQL driver (node-postgres) | Paired with @prisma/adapter-pg |
| `@supabase/supabase-js` | ^2 | Supabase client | Official JS client |
| `@supabase/ssr` | ^0.5 | Cookie-based session management for Next.js | Replaces deprecated @supabase/auth-helpers-nextjs; handles Server Components, middleware |
| `sonner` | ^1 | Toast notifications | Lightweight, works with Server Actions + useActionState, widely adopted in Next.js ecosystem |
| `next` | 16.2.x | Admin UI framework | Already decided in stack |
| `zod` | 4.x | Schema validation for Server Actions | Already in project; extend to admin form validation |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@prisma/adapter-pg` + `pg` | as above | Required connection pool for Prisma 7 | Use whenever initializing PrismaClient |
| `dotenv` | ^16 | Load env vars in prisma.config.ts | Already in project; add to admin if needed |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| sonner | react-hot-toast | Both are ~5KB, both work with Server Actions. Sonner has better stacking and is more actively maintained in 2026. Either is fine. |
| @supabase/ssr | NextAuth.js | NextAuth adds complexity and doesn't leverage existing Supabase project. @supabase/ssr is purpose-built for this. |
| prisma-client-js provider (v7 workaround) | prisma-client provider | prisma-client is the v7 default but breaks Turbopack. Use prisma-client-js to avoid the issue. |

### Installation

Voice server (no new deps beyond existing):
```bash
# No changes needed for voice server deps -- it uses existing Prisma client
```

Admin UI (new Next.js project):
```bash
npx create-next-app@latest admin --typescript --app --no-tailwind --no-src-dir --import-alias "@/*"
cd admin
npm install @supabase/supabase-js @supabase/ssr sonner
npm install prisma @prisma/client @prisma/adapter-pg pg
npm install -D @types/pg
```

Voice server Prisma additions:
```bash
# In voice server package.json
npm install @prisma/client @prisma/adapter-pg pg prisma
npm install -D @types/pg
```

---

## Architecture Patterns

### Recommended Project Structure

```
admin/                         # Next.js 16 App Router admin UI
├── app/
│   ├── layout.tsx             # Root layout with <Toaster />
│   ├── page.tsx               # Login page (magic link form)
│   ├── dashboard/
│   │   └── page.tsx           # Single scrollable config page
│   ├── auth/
│   │   └── confirm/
│   │       └── route.ts       # Supabase magic link callback handler
│   └── actions/
│       └── config.ts          # Server Actions for all config mutations
├── lib/
│   ├── supabase/
│   │   ├── server.ts          # createServerClient (for server components/actions)
│   │   ├── client.ts          # createBrowserClient (for client components)
│   │   └── middleware.ts      # Token refresh helper
│   └── prisma.ts              # PrismaClient singleton with PrismaPg adapter
├── middleware.ts               # Supabase session refresh middleware
└── prisma/
    ├── schema.prisma
    ├── migrations/
    └── seed.ts

src/                           # Voice server (existing)
├── config/
│   ├── schema.ts              # Extend Zod types to match DB shape
│   ├── loader.ts              # Replace JSON read with DB read by phone number
│   └── prompt-builder.ts      # Extend to inject FAQs, services, hours
├── db/
│   └── prisma.ts              # PrismaClient singleton (same adapter pattern)
```

### Pattern 1: Prisma 7 Schema with prisma-client-js Provider (Turbopack Safe)

**What:** Use `prisma-client-js` provider (not `prisma-client`) to avoid Next.js 16 Turbopack module resolution bug. Add `output` field pointing inside `app/generated/` so the generated client is visible to file watchers.

**When to use:** Always with Next.js 16 + Turbopack (which is the default).

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
  output   = "../app/generated/prisma"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

The `url` uses the Supabase connection pooler (Supavisor). The `directUrl` is the direct connection used by Prisma CLI for migrations.

### Pattern 2: prisma.config.ts (Prisma 7 Required)

**What:** Prisma 7 requires a config file to define schema path and migration settings. Place at project root.

```typescript
// prisma.config.ts
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DIRECT_URL"),  // CLI uses direct connection, not pooler
  },
});
```

### Pattern 3: PrismaClient Singleton with PrismaPg Adapter

**What:** Prisma 7 requires a driver adapter. Use `PrismaPg` with a connection pool. Global singleton prevents connection pool exhaustion in dev with hot reload.

```typescript
// lib/prisma.ts (shared by voice server and admin)
import { PrismaClient } from "../app/generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const adapter = new PrismaPg(pool);

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

### Pattern 4: Supabase SSR Client Setup

**What:** Three distinct client configurations required by `@supabase/ssr` for Next.js App Router.

```typescript
// lib/supabase/server.ts -- for Server Components, Server Actions, Route Handlers
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component context -- cookies can't be set from here, middleware handles it
          }
        },
      },
    }
  );
}

// lib/supabase/client.ts -- for Client Components only
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

### Pattern 5: Middleware for Session Refresh

**What:** Supabase requires middleware to refresh the auth token on every request. Without it, sessions expire without renewal.

```typescript
// middleware.ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session; use getUser(), not getSession()
  const { data: { user } } = await supabase.auth.getUser();

  // Redirect unauthenticated users to login
  if (!user && !request.nextUrl.pathname.startsWith("/auth")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
```

### Pattern 6: Magic Link Auth Flow

**What:** Two-step flow -- send magic link, handle callback.

```typescript
// Send magic link (Server Action or client-side call)
const supabase = createClient(); // browser client
const { error } = await supabase.auth.signInWithOtp({
  email: formData.get("email") as string,
  options: {
    emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirm`,
    shouldCreateUser: false, // only allow existing users to log in
  },
});
```

```typescript
// app/auth/confirm/route.ts -- callback handler
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as any;
  const next = searchParams.get("next") ?? "/dashboard";

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );

  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      return NextResponse.redirect(new URL(next, request.url));
    }
  }

  return NextResponse.redirect(new URL("/auth/error", request.url));
}
```

### Pattern 7: Server Action with Toast Feedback

**What:** Server Action returns status; Client Component uses `useActionState` + `useEffect` to trigger toast.

```typescript
// app/actions/config.ts
"use server";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function saveBusinessInfo(
  _prevState: { success: boolean; message: string } | null,
  formData: FormData
) {
  const tenantId = formData.get("tenantId") as string;
  try {
    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        businessName: formData.get("businessName") as string,
        description: formData.get("description") as string,
        greeting: formData.get("greeting") as string,
      },
    });
    revalidatePath("/dashboard");
    return { success: true, message: "Saved" };
  } catch (e) {
    return { success: false, message: "Save failed" };
  }
}
```

```tsx
// app/dashboard/_components/BusinessInfoForm.tsx
"use client";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { saveBusinessInfo } from "@/app/actions/config";

export function BusinessInfoForm({ tenant }: { tenant: Tenant }) {
  const [state, formAction, pending] = useActionState(saveBusinessInfo, null);

  useEffect(() => {
    if (state?.success) toast.success(state.message);
    if (state?.success === false) toast.error(state.message);
  }, [state]);

  return (
    <form action={formAction}>
      <input type="hidden" name="tenantId" value={tenant.id} />
      <input name="businessName" defaultValue={tenant.businessName} />
      <button type="submit" disabled={pending}>
        {pending ? "Saving..." : "Save"}
      </button>
    </form>
  );
}
```

### Pattern 8: Per-Call Config Lookup in Voice Server

**What:** Replace `loadBusinessConfig()` JSON read with a database query keyed on the Twilio `To` phone number.

```typescript
// src/config/loader.ts (Phase 2 replacement)
import { prisma } from "../db/prisma.js";

export async function loadTenantConfig(twilioNumber: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { twilioPhoneNumber: twilioNumber },
    include: {
      faqs: true,
      services: true,
      businessHours: true,
    },
  });
  if (!tenant) throw new Error(`No tenant for number: ${twilioNumber}`);
  return tenant;
}
```

```typescript
// src/telephony/webhooks.ts (Phase 2 change)
const { To } = body; // Twilio sends the called number
const tenantConfig = await loadTenantConfig(To);
const agent = createRealtimeAgent(tenantConfig);
```

### Pattern 9: Prisma Schema for Tenant Config

```prisma
model Tenant {
  id                 String          @id @default(cuid())
  email              String          @unique   // maps to Supabase auth user
  businessName       String
  agentName          String          @default("Assistant")
  greeting           String
  description        String
  escalationMessage  String          @default("I'll have someone call you back.")
  afterHoursMessage  String?
  voiceId            String          @default("ash")
  twilioPhoneNumber  String          @unique   // key for per-call lookup
  googleCalendarId   String?
  googleCredentials  Json?           // encrypted OAuth tokens (Phase 3)
  createdAt          DateTime        @default(now())
  updatedAt          DateTime        @updatedAt

  businessHours      BusinessHours[]
  faqs               Faq[]
  services           Service[]
}

model BusinessHours {
  id        String   @id @default(cuid())
  tenantId  String
  tenant    Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  dayOfWeek Int      // 0=Sunday, 6=Saturday
  openTime  String?  // "09:00" HH:mm, null = closed
  closeTime String?  // "17:00" HH:mm, null = closed
}

model Faq {
  id        String   @id @default(cuid())
  tenantId  String
  tenant    Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  question  String
  answer    String
  createdAt DateTime @default(now())
}

model Service {
  id           String   @id @default(cuid())
  tenantId     String
  tenant       Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  name         String
  description  String
  startingAt   String?  // e.g., "$49"
  createdAt    DateTime @default(now())
}
```

### Pattern 10: Prompt Builder Extension (hours-aware)

**What:** `prompt-builder.ts` needs to inject FAQs, services, and a time-aware hours block.

```typescript
// src/config/prompt-builder.ts (Phase 2 extension)
import type { Tenant, Faq, Service, BusinessHours } from "../db/prisma.js";

function isCurrentlyOpen(hours: BusinessHours[]): boolean {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sunday
  const timeStr = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
  const todayHours = hours.find((h) => h.dayOfWeek === dayOfWeek);
  if (!todayHours?.openTime || !todayHours?.closeTime) return false;
  return timeStr >= todayHours.openTime && timeStr < todayHours.closeTime;
}

function buildFaqBlock(faqs: Faq[]): string {
  if (faqs.length === 0) return "";
  return `\nFREQUENTLY ASKED QUESTIONS:\n` +
    faqs.map((f, i) => `${i + 1}. Q: ${f.question}\n   A: ${f.answer}`).join("\n");
}

function buildServicesBlock(services: Service[]): string {
  if (services.length === 0) return "";
  return `\nSERVICES OFFERED:\n` +
    services.map((s) =>
      `- ${s.name}: ${s.description}${s.startingAt ? ` (starting at ${s.startingAt})` : ""}`
    ).join("\n");
}
```

### Anti-Patterns to Avoid

- **Caching config between calls in memory:** The requirement is per-call DB lookup. Do not add a module-level cache. Each call to `loadTenantConfig` must hit the DB.
- **Using `getSession()` on the server in Supabase:** Always use `getUser()` for server-side auth checks. `getSession()` does not revalidate tokens with the auth server.
- **Using `prisma-client` provider with Turbopack:** Known breakage in Next.js 16. Use `prisma-client-js` provider.
- **Running `prisma migrate deploy` without a direct URL:** The Supabase connection pooler (Supavisor on port 6543) does not support the advisory locks Prisma needs for migrations. Migrations must use `DIRECT_URL` pointing to port 5432.
- **Storing Google credentials in plaintext in JSON column:** Even for Phase 2 (just storing the calendar ID), consider the column type. Full OAuth credentials (Phase 3) need encryption.
- **Forgetting `postinstall: prisma generate` on Vercel:** Vercel does not auto-generate Prisma client. Without this script, builds fail with missing module errors.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Session management | Custom JWT decode/verify | `@supabase/ssr` createServerClient | Handles cookie rotation, token refresh, PKCE, server/client splits |
| Magic link flow | Custom email token + callback | Supabase `signInWithOtp` + `/auth/confirm` route | Handles token hashing, expiry, one-time use, email delivery |
| Toast notifications | Custom alert/banner component | `sonner` | Handles stacking, positioning, dismiss, duration, SSR compatibility |
| Business hours time comparison | Custom date/time parsing | Inline HH:mm string comparison (`timeStr >= openTime`) | Hours are stored as HH:mm; string comparison works correctly for 24hr format with no library needed |
| Connection pooling | Custom pg.Pool management | `@prisma/adapter-pg` with `pg.Pool` | PrismaPg manages pool lifecycle; hand-rolling misses prepared statement invalidation |

**Key insight:** The auth surface area is the area most likely to introduce bugs if hand-rolled. Supabase handles token rotation, PKCE challenge/response, and session refresh transparently -- these are all edge cases that break custom implementations.

---

## Common Pitfalls

### Pitfall 1: Prisma 7 + Next.js 16 Turbopack Module Resolution

**What goes wrong:** Using `provider = "prisma-client"` in schema.prisma causes `TypeError: The "path" argument must be of type string. Received undefined` at build time with Turbopack.
**Why it happens:** Prisma 7's new ESM-first client structure uses a different module resolution path that Turbopack does not correctly handle during SSR.
**How to avoid:** Use `provider = "prisma-client-js"` even on Prisma 7. Add an explicit `output` path inside `app/generated/prisma`.
**Warning signs:** Build error mentioning "path argument must be of type string" or "Cannot find module '.prisma/client/default'".

### Pitfall 2: Supabase Migration vs. Application Connection Strings

**What goes wrong:** Using the Supabase connection pooler URL (port 6543, `?pgbouncer=true`) for `prisma migrate deploy` causes migration failures.
**Why it happens:** Prisma migrations use PostgreSQL advisory locks; PgBouncer in transaction mode does not support them.
**How to avoid:** Set two env vars: `DATABASE_URL` (pooler, port 6543) for runtime queries, `DIRECT_URL` (direct, port 5432) for Prisma CLI. Reference both in `schema.prisma` via `url` and `directUrl`. Use `DIRECT_URL` in `prisma.config.ts` for the CLI.
**Warning signs:** `P1010: User does not have permission to execute advisory lock queries`.

### Pitfall 3: Supabase `getSession()` Trust Issue in Server Code

**What goes wrong:** Using `supabase.auth.getSession()` in a Server Component to verify auth -- session data comes from cookies which can be tampered with.
**Why it happens:** `getSession()` reads the cookie without revalidating with the Supabase auth server.
**How to avoid:** Always use `supabase.auth.getUser()` on the server. It makes a round-trip to the auth server to verify the token.
**Warning signs:** Auth checks that pass even with expired or manipulated tokens.

### Pitfall 4: Prisma Client Not Generated on Vercel Build

**What goes wrong:** Vercel deployment fails with "Cannot find module '../app/generated/prisma'" because `prisma generate` was not run.
**Why it happens:** Vercel only runs `npm install` by default. Prisma client generation is separate.
**How to avoid:** Add `"postinstall": "prisma generate"` to `package.json` scripts. This runs automatically on `npm install` during Vercel builds.
**Warning signs:** Build passes locally, fails on Vercel with module not found error.

### Pitfall 5: Missing `shouldCreateUser: false` in Magic Link

**What goes wrong:** Any email address can create a new account through the magic link form.
**Why it happens:** `signInWithOtp` defaults to `shouldCreateUser: true`.
**How to avoid:** Set `shouldCreateUser: false` so only pre-provisioned accounts (the business owner) can receive magic links.
**Warning signs:** Unknown email addresses getting access to the admin panel.

### Pitfall 6: Hours Comparison Crossing Midnight

**What goes wrong:** Business hours like 22:00-02:00 (late-night businesses) return incorrect open/closed status.
**Why it happens:** Simple `openTime <= time < closeTime` string comparison breaks when close time is next calendar day.
**How to avoid:** For v1, document that hours within a single calendar day only (per CONTEXT.md decision). If closeTime < openTime, treat as closed. This is the simplest safe default.
**Warning signs:** Businesses with late hours reporting incorrectly as closed.

### Pitfall 7: `revalidatePath` Needed After Server Action Mutations

**What goes wrong:** After saving config, the page still shows stale data because Next.js cached the route.
**Why it happens:** Next.js 15+ caches route data by default. Server Actions that mutate data must explicitly invalidate.
**How to avoid:** Always call `revalidatePath("/dashboard")` at the end of every successful config mutation Server Action.
**Warning signs:** Config saves successfully but the form still shows old values after the page refreshes.

---

## Code Examples

### Environment Variables (two sets needed)

```bash
# .env (admin UI)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
DATABASE_URL="postgres://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgres://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres"
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# .env (voice server additions)
DATABASE_URL="postgres://..."  # same pooler URL
```

### Upsert Pattern for Business Hours (7 rows, one per day)

```typescript
// Server Action: save all 7 days atomically
await prisma.$transaction(
  days.map((day) =>
    prisma.businessHours.upsert({
      where: { tenantId_dayOfWeek: { tenantId, dayOfWeek: day.dayOfWeek } },
      update: { openTime: day.openTime, closeTime: day.closeTime },
      create: { tenantId, dayOfWeek: day.dayOfWeek, openTime: day.openTime, closeTime: day.closeTime },
    })
  )
);
```

Note: Requires `@@unique([tenantId, dayOfWeek])` on `BusinessHours` model.

### Per-Call Tenant Resolution in Voice Server

```typescript
// src/telephony/webhooks.ts -- Phase 2 version
app.post("/incoming-call", { preHandler: twilioHook }, async (req, reply) => {
  const { CallSid, From, To } = req.body as IncomingCallBody;

  // Per-call DB lookup -- no caching
  const tenantConfig = await loadTenantConfig(To);
  const agent = createRealtimeAgent(tenantConfig);

  // Store agent in session for media-stream handler to pick up
  pendingAgents.set(CallSid, agent);

  const wsUrl = `${PUBLIC_URL.replace(/^http/, "ws")}/media-stream`;
  reply.type("text/xml").send(buildStreamResponse(wsUrl));
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@supabase/auth-helpers-nextjs` | `@supabase/ssr` | 2024 | auth-helpers deprecated; @supabase/ssr is the current package |
| `prisma-client-js` as only provider | `prisma-client` (new ESM default) | Prisma 7, Jan 2026 | But `prisma-client` breaks Turbopack; use `prisma-client-js` for Next.js 16 |
| Prisma client generated in `node_modules` | Generated in `app/generated/` | Prisma 7 | Allows file watchers and tree-shaking to work; `output` field now required |
| Implicit driver (Rust-based) | Explicit driver adapter required | Prisma 7 | `@prisma/adapter-pg` is now mandatory; no more implicit connection management |
| `prisma migrate dev` auto-generates client | Manual `prisma generate` required | Prisma 7 | The `--skip-generate` flag removed; commands no longer auto-generate client |

**Deprecated/outdated:**
- `@supabase/auth-helpers-nextjs`: Deprecated, use `@supabase/ssr`
- Prisma client in `node_modules`: Default changed in v7; use explicit `output` path
- `getSession()` on server: Always use `getUser()` for server-side auth verification

---

## Open Questions

1. **Where does the voice server get its DATABASE_URL?**
   - What we know: Voice server is on Render; environment variables are set via Render dashboard.
   - What's unclear: Whether the current `render.yaml` has DATABASE_URL stubbed or if it needs to be added manually.
   - Recommendation: Add DATABASE_URL as an env var in Render dashboard, do not commit to render.yaml.

2. **Supabase email provider for magic links in dev**
   - What we know: Supabase free tier includes email sending but has rate limits (2/hr on free, 10/hr on Pro).
   - What's unclear: Whether the development flow uses Supabase's email or needs a local SMTP setup.
   - Recommendation: Use Supabase's built-in email in dev. Configure real SMTP (Resend or Postmark) before sharing with real customers.

3. **Admin user provisioning**
   - What we know: `shouldCreateUser: false` prevents unknown signups. But someone must create the initial user.
   - What's unclear: How the first business owner account gets created.
   - Recommendation: Use Supabase dashboard to create the user manually (Authentication > Users > Invite user). Phase 2 is single-tenant for one demo business.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | No test framework currently installed in project |
| Config file | None -- Wave 0 must create |
| Quick run command | `npx vitest run --reporter=dot` |
| Full suite command | `npx vitest run` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CFG-06 | `loadTenantConfig(twilioNumber)` returns correct tenant data from DB | unit (with mock DB) | `npx vitest run src/config/loader.test.ts` | Wave 0 |
| CALL-03 | `buildSystemPrompt` injects FAQ block when FAQs present | unit | `npx vitest run src/config/prompt-builder.test.ts` | Wave 0 |
| CALL-04 | `isCurrentlyOpen()` returns correct open/closed for given time + hours | unit | `npx vitest run src/config/prompt-builder.test.ts` | Wave 0 |
| CFG-01..04 | Server Actions return `{ success: true }` and data persists in DB | integration (manual) | Manual via admin UI | manual-only |
| CFG-05 | Google Calendar connection stores credentials | manual | Manual via OAuth flow | manual-only |

### Sampling Rate

- Per task commit: `npx vitest run --reporter=dot` (prompt-builder and loader unit tests, ~5s)
- Per wave merge: `npx vitest run` (full suite)
- Phase gate: Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/config/prompt-builder.test.ts` -- covers CALL-03, CALL-04
- [ ] `src/config/loader.test.ts` -- covers CFG-06 (mock Prisma client)
- [ ] `vitest.config.ts` at project root -- test framework not yet installed
- [ ] Framework install: `npm install -D vitest` in voice server

---

## Sources

### Primary (HIGH confidence)

- Next.js official docs (nextjs.org/docs/app/guides/forms) -- confirmed Server Actions pattern, useActionState, forms, version 16.2.0, updated 2026-03-10
- Prisma official upgrade guide (prisma.io/docs/orm/more/upgrade-guides) -- confirmed Prisma 7 adapter requirement, prisma.config.ts format, output field requirement
- Prisma official Next.js guide (prisma.io/docs/guides/nextjs) -- confirmed PrismaPg singleton pattern, postinstall script, output path
- Supabase official passwordless docs (supabase.com/docs/guides/auth/auth-email-passwordless) -- confirmed signInWithOtp API

### Secondary (MEDIUM confidence)

- Supabase SSR server-side auth guide (supabase.com/docs/guides/auth/server-side/nextjs) -- confirmed @supabase/ssr package requirement, getUser() vs getSession() guidance, createServerClient pattern
- Multiple community sources on Prisma 7 + Next.js 16 Turbopack issue (github.com/vercel/next.js/issues/76497, buildwithmatija.com) -- consistent reports of prisma-client provider breaking Turbopack; workaround confirmed by multiple authors
- Prisma 7 + Supabase pooler configuration (medium.com/@iyanu752, jb.desishub.com) -- DATABASE_URL vs DIRECT_URL pattern, both sources agree

### Tertiary (LOW confidence)

- Individual blog post claim that `db push` is preferred over `prisma migrate` for Prisma 7 -- contradicted by Prisma official docs which recommend `migrate deploy` for production. Trust official docs.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all packages verified from official docs or official changelogs
- Architecture: HIGH -- patterns sourced from official Next.js 16.2 docs and Prisma official guides
- Pitfalls: HIGH (Turbopack issue) / MEDIUM (hours crossing midnight) -- Turbopack issue confirmed by multiple independent sources including GitHub issues; other pitfalls sourced from official docs

**Research date:** 2026-03-20
**Valid until:** 2026-04-20 (Prisma 7 and Next.js 16 are actively evolving; Turbopack issue may be patched)

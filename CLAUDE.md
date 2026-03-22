# Agent Call - Voice Server

## Gotchas

- **Never use bare `npx tsc` in Docker or CI.** It resolves to the wrong npm package (`tsc@2.0.4`, not TypeScript). Use `npx tsc --build` to force project-local resolution, or call `./node_modules/.bin/tsc` directly.
- **Use `process.env` with fallback in `prisma.config.ts`, not Prisma's `env()`.** `env()` throws if the variable is unset, breaking `prisma generate` during `npm install` / Docker builds / CI where `DIRECT_URL` isn't available. Use `process.env.DIRECT_URL ?? "postgres://localhost:5432/agent_call"` instead.

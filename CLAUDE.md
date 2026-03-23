# Agent Call - Voice Server

## Gotchas

- **Never use bare `npx tsc` in Docker or CI.** It resolves to the wrong npm package (`tsc@2.0.4`, not TypeScript). Use `npx tsc --build` to force project-local resolution, or call `./node_modules/.bin/tsc` directly.
- **Use `process.env` with fallback in `prisma.config.ts`, not Prisma's `env()`.** `env()` throws if the variable is unset, breaking `prisma generate` during `npm install` / Docker builds / CI where `DIRECT_URL` isn't available. Use `process.env.DIRECT_URL ?? "postgres://localhost:5432/agent_call"` instead.
- **Dockerfile must use `npm ci --ignore-scripts`.** The postinstall script runs `prisma generate`, which needs the schema and config files. Those aren't copied until after `npm ci`. Use `--ignore-scripts` during install, then run `prisma generate` explicitly after copying the files.
- **Vapi webhook is a single POST endpoint at `/api/vapi/webhook`.** All event types (assistant-request, tool-calls, end-of-call-report, status-update) arrive at the same URL. Dispatch on `message.type`.
- **`assistant-request` must respond within 7.5 seconds.** If your server takes longer to load tenant config and build the assistant, Vapi will fail the call. Keep the DB query fast.
- **Tool results must include `toolCallId` matching the request.** Vapi uses this to correlate responses. If the ID doesn't match, the tool result is silently dropped.
- **Vapi sends `bot` as the role, not `assistant`.** When processing `end-of-call-report` messages, map `bot` to `assistant` for transcript consistency.

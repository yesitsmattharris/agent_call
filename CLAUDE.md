# Agent Call - Voice Server

## Gotchas

- **Never use bare `npx tsc` in Docker or CI.** It resolves to the wrong npm package (`tsc@2.0.4`, not TypeScript). Use `npx tsc --build` to force project-local resolution, or call `./node_modules/.bin/tsc` directly.

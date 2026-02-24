# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

WRK Copilot is a Next.js 14 (App Router) + TypeScript SaaS app for managing workflow automations. See `README.md` for full architecture and directory structure.

### Services

| Service | Command | Notes |
|---------|---------|-------|
| Next.js dev server | `npm run dev` | Runs on port 3000 |
| Build worker | `npm run worker:build` | Required for full copilot pipeline (flowchart/requirements/tasks). Both together: `npm run dev:all` |
| PostgreSQL | `sudo pg_ctlcluster 16 main start` | Must be running before the dev server |
| Redis | `redis-server --daemonize yes` | Must be running for BullMQ job queues |

### Auth mock mode

Set `AUTH0_MOCK_ENABLED=true` in `.env.local` to bypass Auth0. Also set `MOCK_TENANT_ID` and `MOCK_USER_ID` from seed output. See README for full `.env.local` template.

### Database setup

1. Start PostgreSQL: `sudo pg_ctlcluster 16 main start`
2. Apply schema: `PGPASSWORD=wrk_dev_pass psql -h localhost -U wrk_dev -d wrk_copilot -f scripts/bootstrap.sql`
3. Seed: `npx tsx --env-file=.env.local scripts/seed.ts`
4. Update `MOCK_TENANT_ID`, `MOCK_USER_ID`, and `DEFAULT_TENANT_ID` in `.env.local` with seed output values.

### Known pre-existing issues

- **`npm run lint` fails**: ESLint 9 is installed but the project uses `.eslintrc.json` (legacy format) and `next lint`, which doesn't support ESLint 9. This is a pre-existing incompatibility.
- **`npm run build` fails**: A route file exports `runCopilotChat` which is not a valid Next.js Route export, causing type checking to fail during build. The dev server (`npm run dev`) works fine since it skips strict type checking.
- **`npm run type-check`**: Several pre-existing TS errors exist across the codebase.
- **8 of 68 Vitest test files fail**: Due to missing function exports (pre-existing).

### Running tests

- Unit/integration tests: `npm run test` (Vitest, 60/68 files pass)
- E2E tests: `npm run test:e2e` (Playwright, requires `npx playwright install chromium` first)
- Type checking: `npm run type-check`

### Key gotchas

- The `.env.local` file is not committed. You must create it manually (template in README).
- `drizzle-kit` config file doesn't exist in the repo; use `scripts/bootstrap.sql` to set up the schema directly.
- The automation creation form submits to the API but processing requires `OPENAI_API_KEY` for AI features; without it, submissions may hang or fail gracefully.

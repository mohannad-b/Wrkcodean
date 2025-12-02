# Cursor Internal Project Plan (v1.0)

> Source of truth for implementation steps derived from `wrk-copilot-cursor-v1-instructions.md`.  
> Tracks Cursor-owned tasks, required user actions, and sequencing for shipping WRK Copilot v1.0.  
> Every task should result in tested, committed code (frequent GitHub commits, ideally after each subsection below).

---

## 0. Owner Responsibilities & Collaboration

- **Cursor** (you) owns all engineering work listed in this plan unless labelled `USER ACTION`.
- **User / Stakeholder** must complete any task explicitly marked `USER ACTION` before dependent work begins.
- **Commit cadence**: after each logical slice (e.g., schema migration, API route, UI integration) merge to `main` with tests.
- **Testing**: add/extend unit/API tests as features land; do not postpone until the end.

---

## 1. Environment & Accounts (Phase 0 prerequisites)

### Cursor Tasks
- [ ] Verify Node 18+, pnpm, Tailwind, shadcn/ui already configured; clean any legacy design artifacts if they block TypeScript strict mode.
- [ ] Add `.env.example` entries for Auth0, Neon, OpenAI, Vercel Blob (or chosen storage), Sentry (optional), rate-limit store.
- [x] Scaffold Drizzle + Neon connection helper + scripts (`db:generate`, `db:push`, `db:seed`) and documented bootstrap SQL (`scripts/bootstrap.sql`) for recreating environments.

### USER ACTION
- [x] Provision **Neon Postgres** project; share `DATABASE_URL` (dev + staging).
- [x] Create **Auth0** tenant + application; provide domain, client ID/secret, callback URLs.
- [x] Ensure **OpenAI (vision-capable)** API key is available; confirm usage budget.
- [x] Provide **Vercel / Blob** credentials (or confirm S3 alternative).
- [x] Confirm GitHub repo access + desired branching strategy (feature branches?).

---

## 2. Foundation (Phase 0)

- [ ] Enable TypeScript strict mode, ESLint, Prettier; fix existing violations.
- [x] Implement session helper (`getSession()`) that returns `{ userId, tenantId, roles[] }`.
- [ ] Model membership & roles (`memberships` table); seed sample tenant + users.
- [ ] Implement `can(user, action, resource)` helper + central authorisation middleware.
- [ ] Add base Drizzle schema + migrations:
  - `tenants`, `users`, `memberships`
  - `automations`, `automation_versions`
  - `projects`, `quotes`, `messages`, `tasks`
  - `audit_logs`, `ai_jobs`, `automation_version_files`
- [x] Seed script to create:
  - Tenant “Acme Demo”
  - `client_admin` user
  - `ops_admin` user

**Testing/Commits:** schema migration + seed tests; commit once DB + auth helpers are functional.

---

## 3. Automations & Versions (Phase 1)

- [ ] API routes with tenant/RBAC enforcement:
  - `GET/POST /api/automations`
  - `GET /api/automations/:id`
  - `POST /api/automations/:id/versions`
  - `GET /api/automation-versions/:id`
  - `PATCH /api/automation-versions/:id/status` (uses `canTransition`)
- [x] Implement canonical build pipeline (`IntakeInProgress → NeedsPricing → AwaitingClientApproval → BuildInProgress → QATesting → Live`) with DB enum, helpers, and transition guards (maps legacy values to new schema).
- [ ] Frontend:
  - `/automations` list (filters + create automation modal/form)
  - `/automations/[id]` detail (version selector, status badge, intake text area)
- [ ] Tests: CRUD, tenant isolation, status transition rejections.
- [ ] Commit after backend + UI slice passes tests.

---

## 4. File Uploads & AI Job Infrastructure (Phase 2)

- [ ] Implement `automation_version_files` Drizzle schema + migration.
- [ ] API handlers:
  - POST create upload URL (enforce type/size/tenant quotas).
  - POST confirm upload.
  - GET list files.
- [ ] Integrate Vercel Blob SDK with signed URL helper.
- [ ] Add per-version size tracking (50 MB cap).
- [ ] Implement `ai_jobs` schema + `POST /api/automation-versions/:id/ai/generate`, `GET /api/ai-jobs/:id`.
- [ ] In-process job runner (cron-like loop or API-triggered worker) that:
  - Loads intake + files.
  - Extracts PDF/DOC text (use existing libs or call external service).
  - Calls vision + text LLM via `lib/ai/*`.
  - Stores `requirements_json`, `blueprint_json`, updates progress/status/errors.
- [ ] Frontend:
  - File upload UI with progress + error states.
  - “Generate Draft Blueprint” button + job polling + retry.
- [ ] Tests: file validation paths, job record creation, failure handling (mock AI clients).
- [ ] Commit once uploads + AI job endpoints + UI are wired with unit tests.

---

## 5. Blueprint Canvas & Studio UX (Phase 3)

### 5.1 Blueprint Spec + Storage
- [x] Publish canonical Blueprint contract in `wrk-copilot-cursor-v1-instructions.md` (sections + steps + lifecycle + UI note).
- [x] Sync TypeScript types, Zod schema, DB defaults, and helper factories to the v1 contract.
- [x] Update supporting docs (AI System Design, Backend/System Design, user flows 9/10/11/21, Realtime Collab, Project Overview) to reference the new schema and remove “phases / nodes + edges” assumptions.
- [x] Refresh Studio blueprint summary/editor UIs and API tests to read/write `sections[]` + `steps[]`.
- [ ] Extend Flow 9 ingestion and Flow 11 validation scoring to emit/require the richer metadata (goalOutcome, systems, notifications, etc.).

### 5.2 Canvas & Copilot UX
- [ ] Add React Flow client component (dynamic import to avoid SSR issues).
- [ ] Render `blueprint_json.steps` as nodes (derive edges from `nextStepIds`; handle Trigger/Action/Logic/Human).
- [ ] Show `requirements_json` summary panel (systems, triggers, steps).
- [ ] Improve `/automations/[id]` layout:
  - Tabs for Intake, Files, AI Draft, Blueprint, Quote.
  - Intake progress indicator.
- [ ] Add empty states + toasts for AI success/failure.
- [ ] Tests: snapshot/DOM-level tests for blueprint rendering, requirement list.
- [ ] Commit after blueprint UI stable.

---

## 6. Quotes & Projects (Phase 4)

- [ ] Backfill `projects` table tying to `automation_versions`.
- [ ] `quotes` API:
  - `POST /api/automation-versions/:id/quotes` (create draft)
  - `PATCH /api/quotes/:id` (edit fields, change status to `sent`, `accepted`, `rejected`)
  - `GET /api/quotes/:id`
- [ ] Business logic:
  - “Submit for pricing” → create project + draft quote stub.
  - Accepting quote updates automation_version + project status (`NeedsPricing/AwaitingClientApproval` → `BuildInProgress`) and writes audit log; QA/Launch flows will take versions Live.
  - Rejecting quote updates quote status, logs reason.
- [ ] Admin UI:
  - `/admin/projects` list with filters (status/owner).
  - `/admin/projects/[id]` detail:
    - Quote editor (setup fee, unit price, estimated volume, notes, client message).
    - Status progression buttons.
    - Tabs for Messages and Tasks.
- [ ] Studio UI:
  - Quote panel showing latest quote.
  - Accept/Reject buttons (confirm dialogs) calling API.
  - [x] Build Status tab renders the canonical pipeline (separate from Blueprint tab, which now only shows blueprint status).
- [ ] Tests: acceptance flow (quote + status update + audit), permissions.
- [ ] Commit after admin + studio quote flows work end-to-end.

---

## 7. Messages & Tasks (Phase 4 continuation)

- [ ] `messages` API (GET/POST by project id); scope visibility by message type (client vs ops).
- [ ] `tasks` API (CRUD) for build checklist; store status, due dates, assignees.
- [ ] Frontend chat (simple polling) in Studio + Admin.
- [ ] Tasks UI within admin project detail (progress bar, mark complete).
- [ ] Tests: message visibility, task status transitions.
- [ ] Commit following successful integration.

---

## 8. Audit Logs, Observability & Rate Limiting (Phase 5)

- [ ] Implement audit log helper + insertions for:
  - Automation create/update/delete
  - Status transitions
  - Quote create/send/accept/reject
  - Role changes
- [ ] Add simple admin view for audit logs (paginated table).
- [ ] Add structured logging middleware (request_id, userId, tenantId).
- [ ] Integrate Sentry (or chosen tool) for error tracking.
- [ ] Implement rate limiting (per tenant) for:
  - File uploads (10/hr)
  - AI jobs (5/hr)
  - General API (1000/hr)
- [ ] Commit once monitoring + limits active and documented.

---

## 9. Testing & Release

- [ ] Ensure Vitest suite covers:
  - Auth/tenant isolation
  - Status transitions
  - Quote acceptance flow
  - File upload validations
  - AI job lifecycle (with mocked providers)
- [ ] Optional E2E smoke test (Playwright) for golden path (client creates automation → uploads files → AI draft → ops sends quote → client accepts).
- [ ] Document testing commands in README.
- [ ] Final review + tag v1.0 release once tests green.

---

## 10. Outstanding USER ACTIONS Summary

- [x] Provide Auth0 credentials + callback URLs.
- [x] Provide Neon database URLs (dev/staging) + credentials.
- [x] Provide OpenAI (vision-enabled) API key and billing account.
- [x] Provide storage credentials (Vercel Blob or S3) + tokens.
- [x] Confirm GitHub branching/PR expectations.
- [x] (Optional) Provide Sentry DSN or logging preferences.

---

## 11. Commit & Collaboration Guidelines

- Commit after each completed checklist item or small batch (e.g., “Add automations schema + migrations”).
- PR template should reference plan section (e.g., “Phase 2 – File Uploads”).
- Keep README/PROJECT_OVERVIEW updated when scope evolves.
- Surface blockers or needed user input (from USER ACTION section) promptly.

---

_Last updated: 2025-12-02 – Cursor internal tracking doc. Update as work progresses._



# WRK Copilot v1 – Cursor Instructions

You are the primary implementation engine for **WRK Copilot v1**.

The repo already contains high-level docs (PROJECT_OVERVIEW, BACKEND_ARCHITECTURE, FRONTEND_ARCHITECTURE, user_flows, etc.).  
Those describe the **long-term vision**.  

This document defines the **authoritative scope and priorities for v1**.  
If there is any conflict, **this file wins**.

---

## 0. Goal

Build a secure, multi-tenant web app where:

- Clients can:
  - Log in via an external IdP
  - Describe business processes in natural language
  - Upload docs (PDF, DOCX, etc.) and screenshots (PNG/JPG)
  - Get an AI-generated *draft* workflow blueprint
  - See a quote and accept it
- Ops can:
  - See a projects pipeline
  - Refine pricing and send quotes
  - Move automations through a simplified status lifecycle
  - See tasks/checklists and messages per project

v1 must be **usable by paying customers** (no fake mocks in the UI), but does **not** need full billing, WRK runtime integration, or real-time collaboration.

---

## 1. Tech Stack & Repo Guardrails

Use / maintain what already exists in the repo:

- **Frontend**
  - Next.js 14 App Router
  - TypeScript (strict)
  - TailwindCSS
  - shadcn/ui + Radix UI
  - React Flow for blueprints
- **Backend / Data**
  - Node/TypeScript backend (either Next.js API routes or small service in `src/server/`)
  - PostgreSQL (Neon)
  - Drizzle ORM (preferred) or Prisma, but be consistent
- **Auth**
  - External IdP (use **Auth0** for v1 unless the repo already clearly commits to another)
  - JWT-based session with `tenantId`, `userId`, `roles[]`
- **AI**
  - OpenAI / Anthropic style LLMs, plus **vision** for screenshots
  - Keep all AI calls abstracted behind `lib/ai/*`

### Hard rules

- All DB queries must be **tenant-scoped** using `tenantId` from the authenticated session, never from request bodies or query params.
- All mutations must go through a central **authorization helper** (e.g., `can(user, action, resource)`).
- No long-running background worker infra yet; use a simple **job table** or in-process queue for AI jobs.

---

## 2. v1 Feature Scope (What MUST Exist)

### 2.1 Authentication & Multi-tenancy

- External IdP integration (Auth0 for v1) with:
  - Login / logout
  - Basic user profile (name, email, avatar)
- Server-side session helper (e.g., `getSession()`):
  - Returns `{ userId, tenantId, roles[] }`
- Middleware that:
  - Protects app routes
  - Attaches tenant context
- Single workspace/tenant per user for now:
  - Multi-workspace is a **post-v1** concern

### 2.2 Core Entities (v1 DB Schema)

Implement these tables first:

- `tenants`
- `users`
- `automation` and `automation_versions`
- `projects`
- `quotes`
- `messages`
- `tasks`
- `audit_logs`
- `ai_jobs`
- (Optionally) `automation_version_files` for uploaded docs/images

You can base the fields on BACKEND_ARCHITECTURE.md, but **simplify**:

**automation_versions.status** must support this minimal status set:

- `Intake`
- `Needs Pricing`
- `Awaiting Client Approval`
- `Build in Progress`
- `Ready to Launch`
- `Live`
- `Paused`
- `Archived`

### 2.3 Roles & RBAC

Use a **simple** role model:

- `workspace_admin` (client-side)
- `workspace_member` (client-side)
- `ops_admin` (internal)
- `ops_member` (internal)

Create a central authorization helper:

```ts
can(user, action, resource): boolean
```

Use this in **every** mutation handler.  
No complex project-level RBAC in v1.

### 2.4 Studio (Client) Features

Studio routes live under the `(studio)` group (already described in FRONTEND_ARCHITECTURE).

For v1, implement:

1. **Automations List** – `/automations`
   - List automations for current tenant
   - Show name, status, owner, created_at
   - Filter by status, simple text search

2. **Automation Detail** – `/automations/[id]`
   - Show current version/status
   - **Intake panel**:
     - Free-text description (saved to DB on the version)
     - List of uploaded files (PDF/doc/image)
   - **Blueprint tab**:
     - React Flow canvas rendering `blueprint_json` for the current version
   - **Quote tab**:
     - If a quote exists and `status !== 'draft'`, show setup fee, unit price, estimated volume, notes
     - If quote is in `sent` status, show “Accept quote” button
   - Buttons:
     - “Submit for pricing” → updates version status to `Needs Pricing`

3. **Quote Acceptance**
   - Client-facing “Accept quote” button
   - On click:
     - Confirm dialog with basic terms
     - Update `quote.status` to `signed`
     - Update automation_version status to `Build in Progress`
     - Write an audit log entry

### 2.5 Admin (Ops) Features

Admin routes live under `/admin`.

For v1, implement:

1. **Projects List** – `/admin/projects`
   - List projects (linked to automation_versions)
   - Columns: client/tenant name, automation name, status, owner, updated_at
   - Filters: status, owner

2. **Project Detail** – `/admin/projects/[id]`
   - Show:
     - Linked automation + version
     - Blueprint canvas view
     - Status + simple timeline
   - **Pricing panel**:
     - Fields: setup_fee, unit_price, estimated_volume, notes
     - Buttons:
       - “Save draft”
       - “Send quote” → sets quote.status to `sent`
   - **Status controls**:
     - Buttons to move version and project through the simplified lifecycle:
       - `Needs Pricing → Awaiting Client Approval`
       - `Awaiting Client Approval → Build in Progress` (after signing)
       - `Build in Progress → Ready to Launch`
       - `Ready to Launch → Live`
       - `Live → Paused` / `Live → Archived`
   - **Tasks tab**:
     - Show tasks for this project (`kind='build_checklist'` etc.)
   - **Messages tab**:
     - Chat thread for this project (client + ops messages)

3. **Messages**
   - Backend:
     - `POST /v1/projects/:id/messages`
     - `GET /v1/projects/:id/messages`
   - Types:
     - `client`
     - `ops`
   - Frontend:
     - Simple chat UI in both Studio and Admin
     - Polling (e.g., every 5–10 seconds) is fine; no WebSockets yet

4. **Tasks**
   - Backend:
     - Basic CRUD for tasks
   - Frontend:
     - Checklists in project detail
     - Ability to mark tasks complete and see progress (%)

### 2.6 AI Ingestion (Text + PDFs + Screenshots)

This is the **core differentiator** and must work in v1.

#### 2.6.1 Inputs

Per automation_version:

- Intake text (multi-turn or a big textarea; you can store as `intake_notes`)
- Uploaded documents:
  - PDFs
  - DOCX or other office docs (optional)
  - Screenshots: PNG/JPG (UI screenshots, flow diagrams, etc.)

Keep files in object storage (e.g., S3 or a similar service) and store metadata + URLs in DB.

#### 2.6.2 Jobs

Create an `ai_jobs` table:

- `id`
- `tenant_id`
- `automation_version_id`
- `type` (`requirements_to_blueprint`)
- `status` (`pending`, `running`, `succeeded`, `failed`)
- `input_summary` (short string, no PII)
- `output_ref` (JSON result reference)
- `error_message` (nullable)
- `created_at`, `updated_at`

A simple in-process worker can:

- Periodically poll for `pending` jobs
- Run them
- Update status + outputs

No message queue service is required in v1; just a job table and worker loop.

#### 2.6.3 AI Pipeline Behavior

For a `requirements_to_blueprint` job:

1. Gather inputs:
   - Intake text from `automation_versions`
   - For each PDF/DOC:
     - Extract raw text using a simple parser
   - For each screenshot (PNG/JPG):
     - Use a **vision-capable model** (OpenAI vision or equivalent) to:
       - Extract UI labels, flow hints, and text
       - Summarize what the screenshot shows in terms of process/steps
2. Construct a single prompt to the LLM:
   - Include:
     - Tenant/automation context (short description)
     - Intake text
     - Summaries of each document
     - Summaries of each screenshot
   - Ask for:
     - A structured `requirements_json` (systems, triggers, actions, data, exceptions)
     - A `blueprint_json` that matches the canonical Blueprint schema (sections + steps; React Flow derives edges from `steps.nextStepIds`)
3. Save outputs:
   - `requirements_json` in a JSONB column on the version (or in a dedicated table)
   - `blueprint_json` on `automation_versions`
4. Update:
   - `ai_jobs.status` → `succeeded`
   - `automation_versions.intake_progress` → a reasonable number (e.g., 70–80%)

#### 2.6.4 Frontend Integration

- In Admin project detail:
  - Show a “Generate draft blueprint” button if:
    - Intake text or files exist
    - No job is currently `running`
  - On click:
    - Create an AI job via API
    - Show loading state & job status via polling
    - Once `succeeded`, reload the blueprint canvas
- In Studio:
  - Show a read-only "AI Draft" notice near the canvas if blueprint was AI-generated.

#### 2.6.5 AI Code Guardrails

- Wrap all AI calls behind `lib/ai/*` modules.
- Do not log raw user content or documents.
- Logs may include:
  - job id, tenant id, automation_version_id, timestamps, token usage
- Make prompts & response schemas explicit and strongly typed.

---

## 3. Explicitly Out of Scope for v1

Do **not** implement these yet, even if they exist in other docs:

- Multi-workspace switching and complex workspace picker UI
- Public/partner APIs (Flow 7)
- Full WRK Platform runtime integration:
  - No real `workflow_bindings`, `run_events`, `usage_aggregates` beyond stubs
- Billing periods, invoices, or automated billing jobs (Flow 20)
- Change-order quotes, committed volume upgrades (Flow 17)
- Client health scoring & churn workflows (Flow 34)
- Real-time collaboration (WebSockets, presence, CRDT)
- AI on screen recordings / videos
- Full-blown worker fleet or multi-queue message bus

You may keep the data structures shallowly present where needed (e.g., stub columns), but do not build the full flows.

---

## 4. Implementation Order (Phases / Epics)

Always work in small, vertical slices that go **end-to-end** (DB → API → UI).  
Follow this order unless the repo state dictates a small tweak.

### Phase 0 – Foundation

1. Clean up existing Next.js + Tailwind + shadcn setup.
2. Integrate Auth0 (or confirm existing IdP if already wired).
3. Implement `getSession()` + tenant middleware.
4. Add Drizzle/Prisma + base migrations for:
   - `tenants`, `users`, `automation`, `automation_versions`, `projects`, `quotes`, `messages`, `tasks`, `audit_logs`, `ai_jobs`, and file metadata table.

### Phase 1 – Studio Shell & Copilot (Micro Steps)

These micro-steps define the current P0/P1 roadmap. Each item is a checklist entry so we can track completion explicitly.

#### Track A – Studio Shell & Data Plumbing (P0–P1)
- [ ] **A1. Lock in “original” Blueprint layout (UI revert & cleanup)**  
  Goal: ensure the Blueprint page visually matches the original design (no Cursor improvisation).  
  Scope: `app/(studio)/automations/[automationId]/page.tsx`, `components/automations/*` layout files.  
  Type: Frontend.  
  Depends on: _None_ (already kicked off).
- [ ] **A2. Canonical blueprint state hook**  
  Goal: centralize reading/writing `automation_versions.blueprintJson` via a reusable hook/state container (e.g., `useBlueprint(automationVersionId)`).  
  Scope: new hook under `lib/blueprint/` or `hooks/`, plus wiring through page, canvas, inspector.  
  Type: Frontend.  
  Depends on: A1.
- [ ] **A3. Auto-save UX polish (no behavior change)**  
  Goal: keep existing PATCH logic but add saving/saved/error indicators without touching data contracts.  
  Scope: automation detail page + any auto-save components.  
  Type: Frontend.  
  Depends on: A2.

#### Track B – Copilot Chat (P1)
_Parallelization notes_: B1/B2 must ship first. B3, B4, B7 can run in parallel afterward. B5/B6 can branch once B1/B2 exist.
- [x] **B1. Persisted chat thread (no AI)**  
  Goal: add `copilot_messages` table, GET/POST API, and wire `StudioChat` to load/save per automation_version.  
  Scope: DB/migration (`db/schema.ts` + migration), API (`app/api/automation-versions/[id]/messages/route.ts`), UI (`components/automations/StudioChat.tsx`).  
  Type: Both.  
  Depends on: A2 (automationVersionId/auth context).
- [x] **B2. Basic message model & roles**  
  Goal: support `role` (`user`, `assistant`, `system`), timestamps, and deterministic ordering.  
  Scope: extend schema + API ordering; ensure `StudioChat` groups per role.  
  Type: Both.  
  Depends on: B1.
- [x] **B3. Chat error + retry UX**  
  Goal: failed POSTs show clear error with retry affordance (no silent failures).  
  Scope: `StudioChat.tsx`.  
  Type: Frontend.  
  Depends on: B1.
- [ ] **B4. Extract chat UI primitives**  
  Goal: split `StudioChat` into `MessageList`, `MessageBubble`, `Composer` without behavior change.  
  Scope: `components/automations/StudioChat*`.  
  Type: Frontend.  
  Depends on: B1.
- [ ] **B5. AI “reply” endpoint (non-streaming)**  
  Goal: POST `/automation-versions/[id]/copilot/reply` that pulls recent messages, calls OpenAI, persists assistant message, returns it.  
  Scope: `app/api/automation-versions/[id]/copilot/reply/route.ts`, `lib/ai/openai-client.ts`, `lib/ai/prompts.ts`.  
  Type: Backend.  
  Depends on: B1, B2.
- [ ] **B6. Wire StudioChat to AI reply**  
  Goal: after user send, hit `copilot/reply` and append assistant message with simple spinner (no streaming).  
  Scope: `StudioChat.tsx`.  
  Type: Frontend.  
  Depends on: B5.
- [ ] **B7. Token guardrails (simple)**  
  Goal: enforce max character length per message, emit “too long” error, log total token estimate.  
  Scope: `StudioChat.tsx` + `copilot/reply` route.  
  Type: Both.  
  Depends on: B6.

#### Track C – Canvas & Blueprint Nodes (P1–P2)
- [ ] **C1. BlueprintNode component + nodeTypes registration**  
  Goal: replace generic `CustomNode` with Blueprint-aware node reflecting step type.  
  Scope: `components/blueprint/BlueprintNode.tsx`, `StudioCanvas.tsx`.  
  Type: Frontend.  
  Depends on: A2.
- [ ] **C2. Node selection → Inspector wiring**  
  Goal: clicking a node selects the correct `BlueprintStep` and updates inspector with single source of truth.  
  Scope: `StudioCanvas.tsx`, `StudioInspector.tsx`, blueprint state hook.  
  Type: Frontend.  
  Depends on: C1.
- [ ] **C3. Persist node positions**  
  Goal: store XY positions in blueprint JSON and reload them (no drift on refresh).  
  Scope: `lib/blueprint/canvas-utils.ts`, blueprint types, PATCH logic.  
  Type: Both.  
  Depends on: C2.
- [ ] **C4. Canvas empty-state polish**  
  Goal: improved “No steps yet” CTA hooking into Add Step / Copilot triggers.  
  Scope: `StudioCanvas.tsx`.  
  Type: Frontend.  
  Depends on: C2.
- [ ] **C5. Edge editing rules**  
  Goal: prevent invalid connections (self-loops, banned types) and surface errors on drop.  
  Scope: `StudioCanvas.tsx`, `canvas-utils.ts`.  
  Type: Frontend.  
  Depends on: C1.

#### Track D – Sections & Validation (P1–P2)
- [ ] **D1. Canonical sections model binding**  
  Goal: ensure each of the 8 sections maps to explicit blueprint JSON fields + editor binding.  
  Scope: `lib/blueprint/types.ts`, section editor UI.  
  Type: Both.  
  Depends on: A2.
- [ ] **D2. SectionChip component**  
  Goal: extract reusable chip with props (label, active, completion, error count).  
  Scope: `components/blueprint/SectionChip.tsx` + header usage.  
  Type: Frontend.  
  Depends on: D1.
- [ ] **D3. Section validation module**  
  Goal: `lib/blueprint/section-validation.ts` returning per-section status + issues.  
  Scope: new module + possible updates to `completion.ts`.  
  Type: Logic.  
  Depends on: D1.
- [ ] **D4. Chips wired to validation**  
  Goal: chip completion state + tooltips derive from validation output.  
  Scope: Blueprint header component.  
  Type: Frontend.  
  Depends on: D3.
- [ ] **D5. Ready-for-Pricing disabled state (50% rule)**  
  Goal: button visible but disabled until minimum section completion, with tooltip explaining why.  
  Scope: Blueprint header actions.  
  Type: Frontend.  
  Depends on: D3, D4.

#### Track E – Inspector & Step Editing (P2)
- [ ] **E1. Inspector field mapping cleanup**  
  Goal: map every inspector field directly to `BlueprintStep` props, remove duplicate local state.  
  Scope: `StudioInspector.tsx`, blueprint types.  
  Type: Frontend.  
  Depends on: C2.
- [ ] **E2. System tags + integrations editor**  
  Goal: mini-UI for selecting systems/integrations; persist on step.  
  Scope: `StudioInspector.tsx`, possibly `SystemTagPicker`.  
  Type: Frontend.  
  Depends on: E1.
- [ ] **E3. Notifications & human touchpoints controls**  
  Goal: checkboxes/toggles for notifications and human review requirements.  
  Scope: `StudioInspector.tsx`, blueprint types.  
  Type: Frontend.  
  Depends on: E1.
- [ ] **E4. Delete step modal**  
  Goal: replace `confirm()` with design-system modal and ensure edges/positions cleanup.  
  Scope: `StudioInspector.tsx`, shared modal, canvas helpers.  
  Type: Frontend.  
  Depends on: C3.

#### Track F – Lifecycle & Actions (P2–P3)
- [ ] **F1. “Ready for Pricing” action wiring**  
  Goal: when enabled, button calls status transition API (Draft → Needs Pricing).  
  Scope: Blueprint header actions + relevant API route.  
  Type: Both.  
  Depends on: D5.
- [ ] **F2. Toasts + activity log hook**  
  Goal: show success/failure toasts and log action to activity feed/audit log.  
  Scope: Blueprint header, `lib/audit/log.ts`.  
  Type: Both.  
  Depends on: F1.

#### Track G – Tests & Docs (Cross-cutting, P1–P3)
- [ ] **G1. Messages API tests**  
  Goal: Vitest coverage for create/list, tenant isolation, bad auth.  
  Scope: `tests/app/api/automation-versions/messages-route.test.ts`.  
  Type: Backend.  
  Depends on: B1/B2.
- [ ] **G2. Copilot reply route tests**  
  Goal: ensure reply route reads last N messages, calls OpenAI client, writes assistant message.  
  Scope: `tests/app/api/automation-versions/copilot-reply-route.test.ts`.  
  Type: Backend.  
  Depends on: B5.
- [ ] **G3. Canvas conversion tests**  
  Goal: verify blueprintJson ↔ nodes/edges round-trip.  
  Scope: `tests/lib/blueprint/canvas-utils.test.ts`.  
  Type: Logic.  
  Depends on: C3.
- [ ] **G4. Section validation tests**  
  Goal: confirm section-validation returns correct statuses for sample blueprints.  
  Scope: `tests/lib/blueprint/section-validation.test.ts`.  
  Type: Logic.  
  Depends on: D3.
- [ ] **G5. Basic Studio render test**  
  Goal: render `/automations/[id]` with mocked automation_version and assert chat/canvas/inspector/chips mount.  
  Scope: `tests/app/(studio)/automations-page.test.tsx`.  
  Type: Frontend.  
  Depends on: A2, C2, D2.

---

### Phase 2 – Automations & Projects (Backend + Minimal UI)

1. Implement CRUD + list endpoints for:
   - `/v1/automations` & `/v1/automations/:id`
   - `/v1/automations/:id/versions` & `/v1/automation-versions/:id`
   - `/v1/admin/projects` & `/v1/admin/projects/:id`
2. Implement status transition endpoints and state machine checks for the simplified statuses.
3. Wire `/automations` and `/automations/[id]` pages to real APIs (no more mock data).

### Phase 3 – Quotes & Admin Pipeline

1. Implement `quotes` table + APIs:
   - Create/update draft
   - Send
   - Mark as signed/rejected
2. Wire Admin project detail UI:
   - Pricing panel
   - Status buttons
3. Wire Studio automation detail quote tab:
   - View quote
   - Accept quote button → updates quote + statuses

### Phase 4 – AI Ingestion (Text + PDFs + Screenshots)

1. Implement `ai_jobs` and a worker loop.
2. Implement file upload handling for PDFs + images (screenshots):
   - Store file metadata + URLs
   - Build pluggable extractors (text, vision).
3. Implement `requirements_to_blueprint` AI pipeline:
   - Integrate LLM + vision model
   - Produce `requirements_json` + `blueprint_json`
4. Hook “Generate draft blueprint” into Admin UI:
   - Create job
   - Poll status
   - Update canvas

### Phase 5 – Messages, Tasks, Audit & Hardening

1. Implement `messages` backend + UI with simple polling.
2. Implement `tasks` backend + UI for build checklist.
3. Implement `audit_logs` writes for all critical actions.
4. Add basic error handling, structured logs, and rate limiting on sensitive endpoints.

---

## 5. Coding Conventions

- TypeScript strict mode: no `any` unless absolutely necessary; then TODO it.
- Use path aliases (`@/`) consistently.
- Use Tailwind + shadcn primitives, not raw CSS.
- Keep backend code modular by domain:
  - `automations`, `projects`, `quotes`, `ai`, `messages`, `tasks`, `auth`
- Ensure **every** API handler:
  1. Gets the session.
  2. Validates input with Zod or similar.
  3. Checks authorization with `can()`.
  4. Uses `tenantId` from the session in all DB queries.
  5. Logs an audit record for important state changes.

---

## 6. How to Treat Existing Docs

When using existing docs in `project_details/`:

- Treat them as **context and vocabulary**, not as strict requirements.
- If a doc describes a deeper flow (billing, WRK runtime, health scoring, etc.) that conflicts with this file, follow this file.
- You may leave TODOs or comments referencing those docs to show where v2+ work belongs.

---

**Primary directive:**  
Optimize for **time-to-working v1** while preserving: tenant isolation, clean architecture, and the AI + blueprint + quote value proposition.

Do not build clever infrastructure we don’t need yet.  
Do build the golden path, end-to-end, and keep the code clean enough to extend.

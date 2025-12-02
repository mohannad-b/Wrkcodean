
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

### Phase 1 – Automations & Projects (Backend + Minimal UI)

1. Implement CRUD + list endpoints for:
   - `/v1/automations` & `/v1/automations/:id`
   - `/v1/automations/:id/versions` & `/v1/automation-versions/:id`
   - `/v1/admin/projects` & `/v1/admin/projects/:id`
2. Implement status transition endpoints and state machine checks for the simplified statuses.
3. Wire `/automations` and `/automations/[id]` pages to real APIs (no more mock data).

### Phase 2 – Quotes & Admin Pipeline

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

### Phase 3 – AI Ingestion (Text + PDFs + Screenshots)

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

### Phase 4 – Messages, Tasks, Audit & Hardening

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


# WRK Copilot – Cursor Build Instructions (v1.0 Scope)

> **Authority:**  
> When there is any conflict between this document and any other architecture / flow / product doc in the repo, **this file is the source of truth for v1.0 implementation**.  
> Long-term docs describe where we’re going; this file describes what we actually build *now*.

---

## 1. Goal of v1.0

Ship a **secure, multi-tenant WRK Copilot** that:

- Lets a client:
  - Create automations
  - Describe their process (text + PDFs + docs + screenshots)
  - Request and review a quote
- Lets ops:
  - See a project tied to that automation
  - Create/edit a simple quote
  - Move the automation through a **simplified status flow**
- Uses AI to:
  - Ingest requirements (text + PDFs + docs + screenshots)
  - Produce a structured `requirements_json`
  - Generate a **draft blueprint JSON** compatible with React Flow
- Enforces:
  - Strong tenant isolation
  - Basic RBAC (client vs ops vs admin)
  - Audit logging for critical changes

**Everything else** (real-time collab, full billing, WRK runtime integration, change-orders, partner APIs, etc.) is explicitly **post-v1.0**.

---

## 2. Product Scope – What We Are and Aren’t Building

### 2.1 In-Scope Features (v1.0)

#### Studio (Client-Facing)

- Authentication via managed IdP (Auth0 / Okta / Clerk). Example: Auth0 + Next.js.
- Single workspace per user (multi-workspace UX is out of scope).
- Automations:
  - List / filter automations
  - Create automation
  - View automation details
  - Create and view **versions**
- Requirements intake on an automation version:
  - Text input (rich description)
  - File uploads:
    - PDFs
    - Docs (e.g., `.docx`)
    - Images (screenshots: PNG/JPEG)
  - Trigger **AI Draft Blueprint** from these inputs
- Blueprint canvas:
  - React Flow canvas
  - Renders nodes/edges from `blueprint_json`
  - v1.0 requirement: **read-only** (no complex drag/drop editing needed)
- Quotes:
  - Client can see the latest quote for an automation version:
    - Setup fee
    - Unit price
    - Estimated volume
    - Client-facing message
  - Client can **Accept** or **Reject** a quote.

#### Admin / Ops (Internal)

- Admin console entry in sidebar.
- Projects:
  - List projects (each tied to an `automation_version`)
  - View project details: linked automation/version, status, tasks, messages
- Quotes:
  - Create and edit a simple quote for an automation version.
  - Fields:
    - `setup_fee` (number, dollars)
    - `unit_price` (number, dollars per execution)
    - `estimated_volume` (number, executions per month)
    - `notes` (text, **internal ops only**)
    - `client_message` (text, **visible to client**)
  - Transition quote status:
    - `draft` → `sent` → `accepted` / `rejected`
- Status transitions for automation versions:
  - **Simplified** pipeline:
    - `Intake` → `Needs Pricing` → `Awaiting Approval` → `Live` → `Archived`

#### AI System (v1.0)

- Inputs:
  - Freeform text description(s)
  - PDFs / docs
  - Screenshots (PNG/JPEG)
- For a given automation version:
  - Gather text + uploaded files
  - Extract text from docs/PDFs
  - Use a **vision model** for screenshots:
    - Identify systems, triggers, and key steps shown on screen
  - Call LLM with all extracted context
  - Produce:
    - `requirements_json` – structured representation of process requirements
    - `blueprint_json` – nodes/edges for React Flow
- Update automation version:
  - Store `requirements_json` + `blueprint_json`
  - Update `intake_progress` (e.g., 70–90%)

- UI:
  - “Generate Draft Blueprint” button
  - “AI is working…” status, polling for job completion
  - Clear error messaging + manual retry

#### Security & Foundations

- Multi-tenancy:
  - Every multi-tenant table has `tenant_id`
  - Every query filters by `tenant_id` from **session**, not from request payload
- Auth:
  - Managed IdP (Auth0/Okta/Clerk) issuing JWTs
  - Server-side validation
- RBAC:
  - Minimal roles:
    - `client_admin`
    - `client_member`
    - `ops_admin`
    - `admin` (superuser)
  - Central `can(user, action, resource)` helper used by all mutations
- Audit logs:
  - Immutable records for:
    - Automation creation/deletion
    - Status transitions
    - Quote changes
    - Role changes
- Observability:
  - Structured JSON logging
  - `request_id` on logs
  - Basic error tracking (e.g., Sentry)

---

### 2.2 Explicitly Out of Scope for v1.0

Do **not** implement now (only shape schema where necessary):

- Real-time collaboration
  - No WebSockets
  - No presence or live cursors
  - No CRDT/OT
- WRK runtime integration
  - No actual WRK Platform workflow execution
  - No `run_events`, `usage_aggregates`, or runtime webhooks
- Billing automation
  - No billing periods, invoicing, payment rails
- Change-order quotes / complex pricing workflows
- Public/partner API
- Advanced RBAC
  - No project-level permission matrix
  - No per-automation granular ACLs
- Multi-workspace UX
  - No subdomains per tenant
  - No workspace switching UI
- Advanced observability
  - No full SLO dashboards, complex alerting pipelines
- Recording/video ingestion
  - No screen recordings or audio for v1.0

---

## 3. Tech Stack & High-Level Architecture

### 3.1 Frontend

- **Framework**: Next.js 14 App Router
- **Language**: TypeScript (strict)
- **Styling**: TailwindCSS + shadcn/ui
- **Key libraries**:
  - React Flow (blueprint canvas, dynamically imported)
  - Lucide React (icons)
  - Optional: SWR / React Query for client-side fetching

**Patterns:**

- Use **Server Components** for simple data-fetching pages.
- Use **Client Components** for:
  - Canvas
  - File uploads
  - Interactive forms / chat
- Use Next.js **route handlers** (`app/api/.../route.ts`) as backend APIs.

### 3.2 Backend

- Implemented as **Next.js API route handlers** (no separate service for v1).
- **DB**: Neon Postgres
- **ORM**: Drizzle
- **Auth**: Auth0 (or similar) with JWTs
- **AI**: OpenAI (text + vision) or equivalent

No dedicated worker cluster yet. AI jobs can be:

- Processed synchronously in an API route (for smaller payloads), or
- Triggered and then polled with a simple queue (Upstash Redis) if needed.

### 3.3 v1.0 Database Schema (Tables We Actually Need)

All tables include: `id`, `tenant_id`, `created_at`, `updated_at`.

Core tables:

- `tenants`
- `users`
- `memberships` (user ↔ tenant + role)
- `automations`
- `automation_versions`
- `automation_version_files`
- `ai_jobs`
- `projects`
- `quotes`
- `messages`
- `tasks`
- `audit_logs`

**Not needed for v1.0** (but may exist later):

- `workflow_bindings`
- `run_events`
- `usage_aggregates`
- `billing_periods`
- `clients` separate from `tenants` (we can treat `tenants` as clients for now)

---

## 4. File Uploads & Storage

### 4.1 Storage Choice

For v1.0, use:

- **Vercel Blob** (preferred, simplest for Next.js)  
  or **AWS S3** if we’re self-hosting.

Assume **Vercel Blob** as default unless otherwise specified.

### 4.2 Supported File Types & Limits

- Allowed MIME types:
  - PDFs: `application/pdf`
  - Docs: `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
  - Images: `image/png`, `image/jpeg`
- Max file size:
  - **10 MB per file**
- Max total for an automation version:
  - **50 MB total** (sum of all file sizes for that version)

Enforce these limits in the upload URL creation handler.

### 4.3 Table: `automation_version_files`

```sql
automation_version_files (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  automation_version_id UUID NOT NULL REFERENCES automation_versions(id),
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  storage_key TEXT NOT NULL, -- internal blob key
  storage_url TEXT,          -- optional: last generated signed URL
  upload_status TEXT NOT NULL, -- 'pending' | 'uploaded' | 'failed'
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
```

### 4.4 Upload Flow (Client + API)

1. Client chooses a file on `automation_versions/[id]` page.
2. Client calls:
   - `POST /api/automation-versions/:id/files/upload-url`
   - Body: `{ filename, mime_type, size_bytes }`
3. Backend:
   - Authenticates user
   - Resolves `tenant_id` from session
   - Validates:
     - MIME type is allowed
     - File size ≤ 10 MB
     - Total existing size + new size ≤ 50 MB
   - Inserts `automation_version_files` row with:
     - `upload_status = 'pending'`
   - Requests a signed upload URL from Vercel Blob/S3
   - Returns:
     - `{ file_id, upload_url }`
4. Client:
   - Uploads file directly to Blob/S3 using `upload_url`
   - On success, calls:
     - `POST /api/automation-versions/:id/files/:file_id/confirm`
5. Backend:
   - Validates caller & tenant
   - Sets `upload_status = 'uploaded'`
   - Optionally updates `storage_url` with a signed URL (short expiry)

### 4.5 Security for File Handling

- **Never** expose raw `storage_key` publicly; always provide short-lived signed URLs.
- Check:
  - MIME type
  - Extension
  - If possible, check file magic bytes (basic validation).
- For PDFs:
  - Avoid executing any embedded scripts
  - If AV scanning is available, run ClamAV or similar; if not, we still enforce type/size limits.
- For images:
  - Validate pixel dimensions (width/height < 8000px).
  - Reject malformed images.
- Disallow:
  - Binaries and scripts: `.exe`, `.sh`, `.bat`, `.js`, `.php`, `.zip`, `.rar`, etc.

---

## 5. AI Pipeline – Requirements & Blueprint Generation

### 5.1 Table: `ai_jobs`

```sql
ai_jobs (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  automation_version_id UUID NOT NULL REFERENCES automation_versions(id),
  status TEXT NOT NULL, -- 'pending' | 'processing' | 'succeeded' | 'failed'
  job_type TEXT NOT NULL, -- e.g. 'requirements_blueprint_v1'
  input_summary TEXT, -- optional short description of inputs
  error_message TEXT, -- user-friendly error message on failure
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
```

### 5.2 Triggering an AI Job

**Route:** `POST /api/automation-versions/:id/ai/generate`

- Auth:
  - Get `tenant_id` and `user` from session.
- Validate:
  - Caller has permission to use this automation version.
  - There is at least:
    - Some text description, or
    - At least one `uploaded` file.
- Insert `ai_jobs` row with:
  - `status = 'pending'`
  - `job_type = 'requirements_blueprint_v1'`
- Start processing:
  - Either:
    - Call a handler synchronously, or
    - Push job to a simple queue (Upstash Redis); for v1.0, in-process is fine if we keep payloads moderate.
- Return:
  - `{ job_id, status }`

**Status check route:**  
`GET /api/ai-jobs/:id` → `{ status, error_message }`

### 5.3 Input Gathering Logic

Given `automation_version_id`:

1. Load automation version:
   - Basic text description, title, any existing structured fields.
2. Load `automation_version_files` with `upload_status = 'uploaded'`.
3. For each file:
   - **PDF / DOCX**:
     - Extract text with a simple library.
     - Normalize whitespace.
   - **Image (screenshot)**:
     - Call vision LLM (e.g., GPT-4o with vision) with a prompt to:
       - Identify the system (HubSpot, Gmail, Stripe, etc.)
       - Identify what the user is doing (e.g., “filtering leads”, “sending email”, “exporting CSV”)
       - Summarize steps in structured bullet points.
4. Compose a prompt with:
   - Automation context (name, description)
   - Extracted text
   - Screenshot summaries
   - Instructions to output:
     - `requirements_json`
     - `blueprint_json` (React Flow compatible)

### 5.4 Outputs Stored on Automation Version

On success:

- Update `automation_versions`:
  - `requirements_json` – the structured requirement object from the model
  - `blueprint_json` – React Flow compatible JSON
  - `intake_progress` – set to something like 70–90 based on completeness
- Update `ai_jobs.status = 'succeeded'`
- Clear `error_message`

On failure:

- See error handling below.

### 5.5 Blueprint JSON Format (React Flow Compatible)

**Store in**: `automation_versions.blueprint_json`

```json
{
  "nodes": [
    {
      "id": "node-1",
      "type": "trigger",
      "position": { "x": 0, "y": 0 },
      "data": {
        "label": "New lead submitted",
        "system": "HubSpot",
        "event": "contact.created"
      }
    },
    {
      "id": "node-2",
      "type": "action",
      "position": { "x": 250, "y": 0 },
      "data": {
        "label": "Enrich with Clearbit",
        "system": "Clearbit",
        "action": "enrich_person"
      }
    }
  ],
  "edges": [
    {
      "id": "edge-1",
      "source": "node-1",
      "target": "node-2",
      "type": "default"
    }
  ]
}
```

**Supported node types** (v1.0):

- `trigger`
- `action`
- `condition`
- `delay`
- `end`

React Flow canvas should:

- Render nodes by type
- Use `data.label` as the primary display label
- Respect `position` as given (we can let the model guess or lay them out linearly and then slightly adjust positions).

### 5.6 Error Handling Strategy (AI)

AI jobs fail for many reasons (rate limiting, bad files, model errors). For v1.0:

On any hard failure:

1. Set `ai_jobs.status = 'failed'`
2. Set `ai_jobs.error_message` to a **user-friendly** message:
   - Example: `"We couldn't process your files right now. Please try again or remove problematic files."`
3. Do **not** delete or overwrite existing `requirements_json` / `blueprint_json`.
4. Log detailed technical errors to our logging system (not in the DB).

Retries:

- v1.0: **manual retry only**:
  - UI shows “Retry AI Draft” when last job is `failed`.
  - Clicking it calls `POST /api/automation-versions/:id/ai/generate` again (new job).

Partial failures:

- If some files fail parsing but we still extract useful information:
  - Log warnings.
  - Proceed and mark job as `succeeded`.
  - Set a warning flag in UI:
    - `"Some files couldn't be processed. This blueprint is based on partial data."`
- Only mark job `failed` if **no usable content** was extracted.

---

## 6. Quotes & Status Flow

### 6.1 Table: `quotes`

```sql
quotes (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  automation_version_id UUID NOT NULL REFERENCES automation_versions(id),
  status TEXT NOT NULL, -- 'draft' | 'sent' | 'accepted' | 'rejected'
  setup_fee NUMERIC(12,2) NOT NULL,
  unit_price NUMERIC(12,4) NOT NULL,
  estimated_volume INTEGER,
  notes TEXT,          -- internal-only notes
  client_message TEXT, -- client-visible explanation
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
```

**Clarification of fields:**

- `setup_fee`:
  - One-time setup amount in dollars.
- `unit_price`:
  - Dollars per execution (or per unit).
- `estimated_volume`:
  - Number of executions per month (or other period).
- `notes`:
  - Internal ops commentary.
  - **Never** shown to the client.
- `client_message`:
  - Short, client-facing explanation of the quote.
  - Shown in Studio UI.

### 6.2 Quote Lifecycle (v1.0)

Minimal flow:

1. Ops creates a quote (`status = 'draft'`) for an automation version.
2. Ops clicks “Send to Client”:
   - `status = 'sent'`.
3. Client sees quote in Studio and clicks:
   - “Accept Quote” → `status = 'accepted'`
   - OR “Reject Quote” → `status = 'rejected'`

On **accept**:

- Update the quote:
  - `status = 'accepted'`
- Update `automation_versions.status`:
  - For v1.0, simplest path:
    - `Awaiting Approval` → `Live`
- Insert audit log:
  - `action_type = 'quote_accepted'`
  - `resource_type = 'quote'`
  - `resource_id = quote.id`
  - Include `automation_version_id` in `changes_json`.

### 6.3 Automation Version Statuses

v1.0 statuses:

- `Intake`
- `Needs Pricing`
- `Awaiting Approval`
- `Live`
- `Archived`

Allowed transitions:

- `Intake` → `Needs Pricing`
- `Needs Pricing` → `Awaiting Approval`
- `Awaiting Approval` → `Live` (on quote acceptance)
- Any of the above → `Archived`

Implement a helper:

```ts
type AutomationStatus = 'Intake' | 'Needs Pricing' | 'Awaiting Approval' | 'Live' | 'Archived';

function canTransition(from: AutomationStatus, to: AutomationStatus): boolean {
  // Implement allowed transitions
}
```

All status updates must use this helper.

---

## 7. Security, RBAC & Rate Limiting

### 7.1 Tenant Isolation (Non-Negotiable)

Rules:

- `tenant_id` for any operation must be derived from the **session/JWT**, not from:
  - Request body
  - Query params
  - URL segments
- Every DB query is filtered by `tenant_id`.

Example pattern:

```ts
const session = await getSession(); // includes tenantId, userId, roles
const { tenantId } = session;

const automation = await db.query.automations.findFirst({
  where: and(
    eq(automations.id, automationId),
    eq(automations.tenantId, tenantId)
  )
});
```

### 7.2 RBAC – Minimal Role Set

Define roles per membership:

- `client_admin` – full control within that tenant (Studio side)
- `client_member` – basic user (limited Studio permissions)
- `ops_admin` – internal ops, cross-tenant read/write where we explicitly allow
- `admin` – full system superuser

Implement:

```ts
function can(user, action, resource): boolean;
```

Use this in **all** mutation handlers (POST/PATCH/DELETE).

Examples:

- Only `ops_admin` or `admin` can create quotes.
- Only `client_admin` can accept/reject quotes.
- Only `admin` can change roles.

### 7.3 Rate Limiting (v1 Simple Approach)

Per **tenant**:

- **File uploads**: 10 per hour
- **AI job creation**: 5 per hour
- **General API calls**: 1000 per hour

Implementation:

- v1.0: In-memory store or lightweight KV (Upstash Redis if available).
- On limit exceeded:
  - Return `429 Too Many Requests` with a generic error.

---

## 8. Testing Requirements (Minimal but Critical)

We want **targeted** tests on critical flows rather than full coverage.

### 8.1 What Must Be Tested

1. **Auth & Tenant Isolation**
   - Unauthenticated requests → `401`.
   - User from tenant A cannot read or update data from tenant B.
   - `ops_admin` and `admin` behavior is correct where allowed.

2. **Status Transitions**
   - Valid transitions succeed.
   - Invalid transitions are rejected (e.g., `Live` → `Needs Pricing`).

3. **AI Pipeline**
   - Mock LLM + vision responses:
     - No real calls in unit tests.
   - Creating an AI job:
     - `ai_jobs` row created.
   - On success:
     - `requirements_json` + `blueprint_json` stored.
   - On failure:
     - `status = 'failed'`
     - `error_message` is set
     - Existing data is untouched.
   - Partial failure case:
     - Some files invalid → job still `succeeded` with a warning.

4. **Quotes**
   - Creating a draft quote.
   - Sending a quote:
     - `status` set to `sent`.
   - Accepting a quote:
     - `status` set to `accepted`.
     - `automation_versions.status` updated (e.g., `Awaiting Approval` → `Live`).
     - Audit log created.

5. **File Upload**
   - Allowed file types accepted.
   - Disallowed types rejected.
   - Size and total-limit enforcement.
   - Confirm endpoint transitions `upload_status` from `pending` to `uploaded`.

### 8.2 Tools

- **Unit / API tests**:
  - Vitest + supertest (or Next.js test helpers) for route handlers.
- **Optional E2E** (nice-to-have):
  - Playwright or Cypress for:
    - Login
    - Create automation
    - Upload file
    - Run AI
    - Create and accept quote

---

## 9. Local Development Setup

### 9.1 Prerequisites

- Node.js 18+
- `pnpm` (recommended) or `npm`
- Neon Postgres account (or local Postgres 15+)
- Auth0 (or equivalent) application
- OpenAI (or compatible) API key
- Vercel account (for Blob & deployment)

### 9.2 Setup Steps

1. **Clone repo**

   ```bash
   git clone <repo-url>
   cd <repo>
   ```

2. **Install dependencies**

   ```bash
   pnpm install
   # or
   npm install
   ```

3. **Environment config**

   ```bash
   cp .env.example .env.local
   ```

   Fill in `.env.local`:

   ```env
   DATABASE_URL=postgres://...
   AUTH0_DOMAIN=...
   AUTH0_CLIENT_ID=...
   AUTH0_CLIENT_SECRET=...
   NEXTAUTH_SECRET=...           # if using next-auth
   OPENAI_API_KEY=...
   BLOB_READ_WRITE_TOKEN=...     # for Vercel Blob
   ```

4. **Run migrations**

   ```bash
   pnpm db:migrate   # or whatever script we define
   ```

5. **Seed dev data (optional but recommended)**

   ```bash
   pnpm db:seed
   ```

   Seed script should create:

   - Tenant A with:
     - `client_admin` user: `client@example.com` / `password123`
   - Internal ops user:
     - `ops_admin`: `ops@example.com` / `password123`

6. **Run dev server**

   ```bash
   pnpm dev
   ```

7. **Open app**

   - http://localhost:3000

---

## 10. How to Use the Existing Long-Form Docs

### 10.1 When to Reference Them

Use the detailed docs (Backend Architecture, Frontend Architecture, Flow docs, etc.) when:

- You need the **vocabulary** and conceptual model:
  - `automation` vs `automation_version` vs `project` vs `client`
- You’re designing something that will be extended in v2/v3:
  - e.g., quote schema that later needs multiple pricing tiers.
- You need to understand the **long-term behavior** of a feature to avoid painting us into a corner.

### 10.2 When to Ignore Them

Ignore them when:

- They describe features explicitly **out of scope** for v1.0:
  - Full billing cycles, WRK runtime integration, partner APIs, etc.
- They specify infrastructure we’re **not building yet**:
  - Kafka, large worker fleets, microservices, etc.
- They conflict with this document:
  - **This document wins.**

---

## 11. Implementation Phases (Epics for Cursor)

Think in **vertical slices** (DB → API → UI). Each phase should result in something usable.

### Phase 0 – Foundation & Auth

- [ ] Align existing Next.js repo with this doc (cleanup dead code / figma artifacts as needed).
- [ ] Enable TypeScript strict mode; configure ESLint + Prettier.
- [ ] Confirm Tailwind + shadcn/ui are correctly wired.
- [ ] Integrate Drizzle with Neon Postgres.
- [ ] Implement base schema:
  - `tenants`, `users`, `memberships`, `automations`, `automation_versions`,
  - `projects`, `quotes`, `messages`, `tasks`, `audit_logs`.
- [ ] Integrate Auth0 (or chosen IdP):
  - Session retrieval helper (`getSession()`).
  - JWT validation.
- [ ] Implement tenant resolution:
  - `tenant_id` derived from session.
- [ ] Implement basic `can(user, action, resource)` helper.

### Phase 1 – Automations & Versions (Core CRUD + Status)

- [ ] API routes:
  - `GET /api/automations`
  - `POST /api/automations`
  - `GET /api/automations/:id`
  - `POST /api/automations/:id/versions`
  - `GET /api/automation-versions/:id`
  - `PATCH /api/automation-versions/:id/status`
- [ ] Enforce tenant isolation & RBAC on all endpoints.
- [ ] Implement `canTransition` helper for statuses.
- [ ] Frontend:
  - `/automations` list page with filters.
  - `/automations/[id]` detail page with versions.
  - “Create automation” flow.
- [ ] Tests:
  - CRUD + status transitions.
  - Tenant isolation checks.

### Phase 2 – File Uploads & AI Jobs

- [ ] Implement `automation_version_files` table + Drizzle schema.
- [ ] API:
  - `POST /api/automation-versions/:id/files/upload-url`
  - `POST /api/automation-versions/:id/files/:file_id/confirm`
  - `GET /api/automation-versions/:id/files`
- [ ] Integrate Vercel Blob for storage.
- [ ] Enforce file type & size limits.
- [ ] Implement `ai_jobs` table + schema.
- [ ] API:
  - `POST /api/automation-versions/:id/ai/generate`
  - `GET /api/ai-jobs/:id`
- [ ] AI handler:
  - Gather inputs.
  - Call LLM + vision.
  - Write `requirements_json` + `blueprint_json`.
  - Apply error strategy (Section 5.6).
- [ ] Frontend:
  - File upload UI on automation version page.
  - “Generate Draft Blueprint” button.
  - Job status view + retry.
- [ ] Tests:
  - File upload validation.
  - AI job creation & failure handling.

### Phase 3 – Blueprint Canvas & Studio UX

- [ ] Integrate React Flow (lazy-loaded client component).
- [ ] Use `blueprint_json` to render nodes/edges.
- [ ] Add:
  - Zoom/pan controls.
  - Node rendering by `type`.
- [ ] Show:
  - Requirements summary (`requirements_json`) alongside canvas.
- [ ] Polish `/automations/[id]` UX around:
  - Intake progress.
  - File list.
  - AI generation + canvas.

### Phase 4 – Quotes, Projects & Admin Console

- [ ] Implement `quotes` table + API routes:
  - `POST /api/automation-versions/:id/quotes`
  - `GET /api/quotes/:id`
  - `PATCH /api/quotes/:id` (update status, values)
- [ ] Implement simple `projects` table + API:
  - `GET /api/admin/projects`
  - `GET /api/admin/projects/:id`
  - Tie projects to automation_versions.
- [ ] Business logic:
  - On “Move to Pricing”, create project + draft quote stub.
  - On quote `accepted`, update automation_version status and audit log.
- [ ] Admin UI:
  - `/admin/projects` list.
  - `/admin/projects/[id]` detail with:
    - Linked automation/version.
    - Quote editor.
    - Tasks / messages.
- [ ] Studio UI:
  - Show quote summary on automation version page.
  - Allow client to accept/reject.

### Phase 5 – Audit, Observability, Rate Limiting & Polish

- [ ] Audit logs:
  - Insert on:
    - Automation create/update/delete.
    - Status changes.
    - Quote create/update/accept/reject.
    - Role/permission changes.
  - Admin UI to view logs (simple table).
- [ ] Logging:
  - Structured JSON logs with `request_id`.
  - Integrate Sentry for error reporting.
- [ ] Rate limiting:
  - Implement per-tenant limits for:
    - File uploads.
    - AI jobs.
    - General API.
- [ ] UX polish:
  - Loading states, error toasts.
  - Empty states on key pages.
  - Basic responsive behavior.

---

**End of v1.0 Instructions**

This file should live at something like:

`docs/WRK_COPILOT_CURSOR_V1_INSTRUCTIONS.md`

and is the **single source of truth** for Cursor and humans when implementing v1.0.

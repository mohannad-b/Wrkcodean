# WRK Copilot Backend Architecture

## Overview

The WRK Copilot backend is a multi-tenant, API-first, security-first service that powers the automation design and orchestration platform. It manages the complete lifecycle of business process automations—from requirements capture and blueprint design, through pricing and approval, to build orchestration and execution monitoring.

Key properties:

- Multi-tenant with strict tenant isolation
- Modular monolith (clear domain boundaries in a single service)
- API-first (everything is exposed over REST)
- Deeply integrated with the WRK Platform runtime
- Worker-backed for async, high-concurrency workloads

All critical business behaviors are expressed in the 35 user flows documented under `project_details/user_flows/`. Backend implementation must follow those flows and their state-machine rules.

---

## High-Level Architecture

The backend is structured into three layers:

1. Edge / API Gateway Layer
2. Core App Service (Modular Monolith)
3. Workers & Integrations

### 1. Edge / API Gateway Layer

**Responsibilities**

- TLS termination and SSL cert management
- Auth enforcement (JWT/API key validation)
- Rate limiting (per tenant and per API key)
- Request routing to the Core App service
- CORS + security headers
- Basic request/response logging and metrics

**Implementation**

- Cloud API Gateway (e.g., AWS API Gateway, Cloudflare)
- Edge middleware/functions to:
  - Validate JWT / API keys before hitting the app
  - Apply rate limits and reject excess traffic

**Security**

- All requests must carry either a valid JWT or valid API key.
- Tenant isolation starts at the edge: JWT/API key determines `tenant_id`; clients never choose a tenant via payload.

### 2. Core App Service (Modular Monolith)

**Architecture**

- Single TypeScript/Node.js service, structured as a modular monolith.
- Domain modules: Identity & Access, Automations & Versions, Execution & Integrations, Pricing & Billing, Admin & Ops, Collaboration & Observability.

**Modular Monolith Commitment**

We stay as one service with strong internal boundaries. We only split into microservices when:

- Team size and ownership justify it (>~20 engineers), and/or
- There is a clear scale bottleneck that’s easier to solve with service isolation, and/or
- Compliance/regulatory constraints require stricter isolation.

All current planning and implementation assumes a single modular monolith.

**Framework**

- Fastify or NestJS with:
  - Route modules per domain
  - Centralized auth/tenant middleware
  - Shared DB access & transaction helpers

**Database**

- PostgreSQL via Neon (dev, staging, prod)
- Connection pooling (e.g., PgBouncer)
- Future: read replicas if reporting/analytics require it
- Migrations via Drizzle ORM (or Prisma), committed to the repo.

**Caching**

- Redis for:
  - Rate limiting buckets
  - Session/blacklist tokens (optional)
  - Hot metadata (automation summaries, blueprint snapshots)

### 3. Workers & Integrations Layer

**Queue System**

- SQS / PubSub / equivalent message queue.

**Worker Types (aligned with flows)**

1. **Build Orchestrator Worker**
   - Triggered by “build requested” (Flow 21/22).
   - Calls WRK Platform to create/update workflows.
   - Updates `workflow_bindings` and version status (via Flow 13 rules).
2. **AI Ingestion Worker**
   - Processes upload artifacts from requirements capture (Flows 9/10).
   - Uses LLMs to extract requirements and draft blueprints.
   - Updates `automation_versions.blueprint_json` + `intake_progress`.
3. **Notification Worker**
   - Sends email (SES/SendGrid), Slack, in-app notifications.
   - Consumes notification events emitted by other flows (quotes, build complete, blocked, alerts, etc.).
4. **Usage & Alerts Worker**
   - Ingests run events / usage summaries from WRK Platform (Flows 27/28).
   - Upserts `usage_aggregates`.
   - Evaluates threshold configs and creates alerts (Flow 28’s aggregation + threshold logic).

All workers write directly to the same Postgres DB, respecting tenant isolation and the same state-machine rules.

**Integration Points**

- WRK Platform APIs (internal):
  - Workflow create/update/deactivate
  - Usage summary exports
  - Run event webhooks / push
- Third-Party APIs:
  - For credentials/actions at runtime (primarily run inside WRK Platform, but some metadata flows may touch Copilot).

---

## Services & Domain Modules

### Identity & Access

**Purpose**

Multi-tenant user management, auth, and RBAC.

**Entities**

- `tenants` – Workspaces (1:1 with “workspace” in the UI)
- `users` – Individual users
- `roles`, `user_roles` – Role assignments per tenant
- `api_keys` – Programmatic access keys
- `sessions` – Refresh tokens / long-lived sessions (if used)

**Key Rules**

- `tenant_id` and `user_id` always come from the JWT/API key, never from the request body or query string.
- Users can belong to multiple tenants (workspace switcher), but every request is scoped to exactly one active tenant.

**Typical APIs**

- `POST /v1/auth/login`, `POST /v1/auth/refresh`
- `GET /v1/users/me`
- `GET /v1/tenants/{tenantId}/users`
- `POST /v1/api-keys`, `DELETE /v1/api-keys/{id}`

---

### Automations & Versions

**Purpose**

Core domain for automation definitions, versions, and blueprints.

**Entities**

- `automations`
  - `id`, `tenant_id`, `name`, `description`, `department`, `owner_id`, timestamps
- `automation_versions`
  - `id`, `tenant_id`, `automation_id`, `version` (e.g., v1.0), `status`, `blueprint_json` (JSONB), `intake_progress`, timestamps

**Blueprint Storage**

- `blueprint_json` is JSONB: Blueprint object (sections + steps + metadata per canonical schema).
- If future query patterns demand it, we can add helper tables/materialized views (e.g., derived `blueprint_steps`), but v1 keeps everything in the JSON blob.
- For v1, Studio always reads/writes the entire `blueprint_json` document. Inspector/canvas edits update local state and persist through a single PATCH.
- JSONB is sufficient for dozens of steps and keeps validation centralized via the shared Zod schema.
- If/when blueprints approach thousands of nodes or analytics need SQL access to individual steps, we can project into helper tables without breaking the JSON contract.

**Status Lifecycle (enforced via Flow 13)**

`Intake in Progress → Needs Pricing → Awaiting Client Approval → Build in Progress → QA & Testing → Ready to Launch → Live → Archived`

Additional transitions:

- Paused (Flow 24A) / Resume (Flow 24B)
- Blocked (Flow 26)

All transitions go through the status router (Flow 13); no ad-hoc status toggles.

**Key Operations**

- Create automation + initial version (Flow 8).
- Update blueprint (Flow 10).
- Create new version (Flow 12).
- Update status via status router (Flow 13, 24, 24A/B, 26, 35).

**Sample APIs**

- `GET /v1/automations`
- `POST /v1/automations`
- `GET /v1/automations/{id}`
- `GET /v1/automations/{id}/versions`
- `POST /v1/automations/{id}/versions`
- `PUT /v1/automation-versions/{id}/blueprint`
- `PATCH /v1/automation-versions/{id}/status`

---

### Execution & Integrations

**Purpose**

Tie Copilot versions to WRK Platform workflows and ingest runtime execution.

**Entities**

- `workflow_bindings`
  - `tenant_id`, `automation_version_id`, `wrk_workflow_id`, `wrk_workflow_url`, `status` (active/inactive/error), timestamps
- `run_events`
  - `tenant_id`, `workflow_binding_id`, `run_id`, `status`, `started_at`, `completed_at`, `error_message`, `metadata_json`, timestamps
  - Unique `(workflow_binding_id, run_id)` for idempotency.
- `usage_aggregates`
  - `tenant_id`, `automation_version_id`, `period_start`, `period_end`, `run_count`, `success_count`, `failure_count`, `total_cost`, timestamps
  - Unique `(automation_version_id, period_start, period_end)`.

**Security & Idempotency**

- All WRK Platform webhooks and pushes use HMAC signatures (Flow 27), validated in constant time.
- Each `run_event` is idempotent on `(workflow_binding_id, run_id)`.

**Key Operations**

- Create/update workflow bindings (Build worker).
- Receive run event webhooks (Flow 27).
- Aggregate usage + evaluate thresholds (Flow 28).
- Expose run history + usage metrics to UI.

**Sample APIs**

- `GET /v1/automation-versions/{id}/workflow-binding`
- `GET /v1/automation-versions/{id}/runs`
- `GET /v1/automation-versions/{id}/usage`
- `POST /v1/webhooks/wrk-run-event` (internal; HMAC + idempotent)

---

### Pricing & Billing

**Purpose**

Quotes, overrides, usage-based spend, and billing periods.

**Entities**

- `quotes`
  - `tenant_id`, `automation_version_id`, `status` (draft/sent/signed/rejected), `setup_fee`, `unit_price`, `estimated_volume`, `effective_unit_price`, timestamps
- `pricing_overrides`
  - Admin knobs: `setup_fee_override`, `unit_price_override`, `reason`, `created_by`
- `usage_aggregates`
  - Shared with Execution for billing math.
- `billing_periods`
  - `tenant_id`, `period_start`, `period_end`, `total_spend`, `status` (draft/finalized)

**Notes (aligned with flows 11, 14–20)**

- Quotes are created automatically when a project moves into Needs Pricing (Flow 11).
- Ops adjust via Flow 14 / 19; they don’t send random quotes without an automation/project context.
- Flow 17 handles committed volume upgrades.
- Flow 20 finalizes billing periods using `usage_aggregates`.

**Sample APIs**

- `POST /v1/automation-versions/{id}/quotes`
- `GET /v1/quotes/{id}`
- `PATCH /v1/quotes/{id}/status`
- `POST /v1/automation-versions/{id}/pricing-overrides` (admin only)
- `GET /v1/tenants/{tenantId}/billing-summary`

---

### Admin & Ops

**Purpose**

Internal console to manage clients, projects, health, and pipeline.

**Client vs Tenant**

- `tenants` = actual workspace (auth + isolation)
- `clients` = ops/commercial view on top of tenants
- Relationship: 1:1 (`clients.tenant_id` UNIQUE → `tenants.id`)

**Entities**

- `clients`
  - `tenant_id`, `name`, `industry`, `health_status`, `owner_id`, `committed_monthly_spend`, timestamps
- `projects`
  - `tenant_id`, `client_id`, `automation_id`, `automation_version_id`, `name`, `type` (new_automation/revision), `status`, `pricing_status`, `owner_id`, `eta`, `checklist_progress`, timestamps

**Flows**

- Flow 33 – Create Client (link existing tenant → client)
- Flow 34 – Update Client Health (Good / At Risk / Churn Risk + alerts/tasks)
- Projects aligned with lifecycle flows 11, 21–24, 31–32

**Sample APIs**

- `GET /v1/admin/clients`, `GET /v1/admin/clients/{id}`
- `POST /v1/admin/clients` (link tenant → client)
- `PATCH /v1/admin/clients/{id}` (health updates only)
- `GET /v1/admin/projects`, `GET /v1/admin/projects/{id}`
- `PATCH /v1/admin/projects/{id}/status`

---

### Collaboration & Observability

**Purpose**

Messages, tasks, and audit logs for collaboration + compliance.

**Entities**

- `messages`
  - `tenant_id`, `project_id` OR `automation_version_id`, `type` (client/ops/internal_note/system), `sender_id`, `text`, `attachments_json`, `tags`, timestamps
- `tasks`
  - `tenant_id`, `context_type` (project/automation_version/client/internal), `context_id`, `kind` (build_checklist/credentials_issue/general_todo/client_retention…), `status`, `assignee_id`, `due_date`, `priority`, timestamps
- `audit_logs`
  - `tenant_id`, `user_id` (or null for system), `action_type`, `resource_type`, `resource_id`, `metadata_json`, `created_at`

**Flows**

- Flow 30 – Send Message (chat-like UX, visibility/tenant constraints)
- Flow 31 – Create Task (system auto-generated)
- Flow 32 – Update Task Status
- Audit logging is cross-cutting and applies to almost every flow

**Sample APIs**

- `POST /v1/messages`
- `GET /v1/projects/{id}/messages`
- `GET /v1/automations/{id}/messages`
- `POST /v1/tasks`, `GET /v1/tasks`, `PATCH /v1/tasks/{id}/status`
- `GET /v1/admin/audit-logs` (admin only)

---

## Data Model & Tenant Isolation

**Tenant-Scoped Tables**

Every tenant-scoped table includes `tenant_id` and is always queried with:

```
WHERE tenant_id = :tenant_from_session
```

Never trust `tenant_id` sent by clients.

Tenant-scoped tables include: `users`, `automations`, `automation_versions`, `workflow_bindings`, `run_events`, `usage_aggregates`, `quotes`, `clients`, `projects`, `messages`, `tasks`, `audit_logs`, etc.

Key patterns:

- `UNIQUE(automation_version_id, period_start, period_end)` for `usage_aggregates`
- `UNIQUE(workflow_binding_id, run_id)` for `run_events` idempotency
- `clients.tenant_id` UNIQUE for 1:1 tenant-client mapping

Indexes are primarily `(tenant_id, …)` for every hot access path.

---

## Security Model

### Authentication

- Primary via managed IdP (Auth0/Clerk/whatever):
  - JWT includes `sub` (user id), `tenant_id`, `roles[]`, `exp`.
- Optional local email/password for fallbacks (depending on environment).
- API keys stored hashed; scoped to a single tenant and a set of permissions.

### Authorization

- Every route gets an `AuthenticatedSession` with `tenantId`, `userId`, and `roles`.
- Every query is scoped by `tenantId` from the session.
- RBAC: route-level checks (e.g., only admin can create automations; only `{ops_admin, cs_admin, admin}` can hit `/v1/admin/*`).
- Resource-level membership checks for projects/automations.

### Input Validation

- Zod (or similar) schemas for every request body.
- Validation at the boundary before any DB calls.

### Secrets & Config

- Secrets in a proper secrets manager (AWS Secrets Manager / Vault).
- No secrets in git; `.env` only for local dev, gitignored.
- JWT signing keys, DB creds, WRK Platform tokens, webhook secrets all come from secrets manager.

### Audit & Logging

- JSON logs with `tenant_id`, `user_id`, `request_id`, level, etc.
- `audit_logs` table covers:
  - Status transitions
  - Quote sign/reject
  - Pricing overrides
  - Credential changes
  - Client health updates
  - Archive operations

---

## API Design

### Base & Versioning

- `https://api.wrkcopilot.com/v1` (prod)
- `https://api.staging.wrkcopilot.com/v1` (staging)

Versioning via path (`/v1`, `/v2` later).

### Auth Headers

- JWT: `Authorization: Bearer <access_token>`
- API key: `Authorization: Bearer <api_key>`

### Namespaces

- **Studio** (tenant-bound, client-facing) → `/v1/automations`, `/v1/automation-versions`, `/v1/quotes`, `/v1/messages`, `/v1/tasks`, etc.
- **Admin** (ops/admin roles only) → `/v1/admin/clients`, `/v1/admin/projects`, `/v1/admin/audit-logs`, etc.
- **Public/Partner** (API key only) → `/v1/public/*` for safe read-only surfaces.

Response format + pagination follow the standard `data + meta` / error envelopes. OpenAPI spec generation can sit on top later.

---

## Async Processing & Workers

Patterns:

- Queue per concern (build-requests, AI ingestion, notifications, usage-sync).
- Workers only touch DB and external APIs.
- Lifecycle transitions that affect `automation_versions.status` must go through the state-machine logic (Flow 13) even from workers.

Workers never bypass:

- Tenant isolation
- Status state machine
- Audit logging on sensitive changes

---

## Environments & Deployment

- **Dev**: Neon dev DB, dev API URL, single worker process.
- **Staging**: separate Neon DB, staging API, separate worker processes.
- **Prod**: separate Neon DB (+ pooling), worker fleet, blue/green deploys.

CI/CD: tests, lint, type-check, build, migrations, approval for prod.

Drizzle/Prisma migrations are versioned SQL and run per environment, with backups before prod.

Monitoring/alerts: latency, error rate, queue depth, DB pool, worker failures.

---

## Extensibility & Future Work

- New domains = new modules under `src/modules/*` + routes under `src/routes/v1/*`, same tenant + RBAC patterns.
- New public APIs = same REST style + API-key auth + OpenAPI docs.
- Microservices are a future refactor, not the design center. If/when needed, natural seams are:
  - Identity
  - Automations
  - Execution/Usage
  - Billing
  - Collaboration

Until then: one app, clean boundaries, no premature service-splitting.
# WRK Copilot Backend Architecture

## Overview

The WRK Copilot backend is a multi-tenant, API-first, security-first service designed to power the automation design and orchestration platform. It handles the complete lifecycle of business process automations—from requirements capture and blueprint design, through pricing and approval, to build orchestration and execution monitoring. The backend is architected for high concurrency, enterprise-grade security, and deep integration with the Wrk platform for actual workflow execution. All critical operations are exposed via REST APIs, enabling programmatic access for partners and future SDK generation.

---

## High-Level Architecture

The backend is structured in three main layers:

### 1. Edge / API Gateway Layer

**Responsibilities**:
- TLS termination and SSL certificate management
- Authentication and authorization (JWT validation, session management)
- Rate limiting per tenant and per API key
- Request routing to appropriate services
- CORS and security headers
- Request/response logging and metrics

**Implementation**:
- Cloud provider API Gateway (AWS API Gateway, Cloudflare Workers, or similar)
- Edge functions for auth validation before requests hit the core service
- Rate limiting middleware (e.g., Redis-based rate limiting)

**Security**:
- All requests must include valid JWT or API key
- Tenant isolation enforced at the edge
- IP allowlisting for sensitive endpoints (future)

### 2. Core App Service

**Architecture**: Modular monolith (TypeScript/Node.js) with clear domain boundaries. Each domain module is self-contained but shares the same process and database connection pool.

**Modular Monolith Commitment**: The backend will remain a **modular monolith** (multiple domain modules in a single service) until:
- The team is large enough (>20 engineers) to justify service boundaries, and/or
- There is a clear scale bottleneck that justifies splitting into microservices, and/or
- Regulatory requirements demand service isolation

The microservices discussion in "Extensibility & Future Work" is a **future option**, not a current plan. All development should assume a single service with clear module boundaries.

**Framework Options**:
- **Fastify**: Lightweight, high-performance, plugin-based
- **NestJS**: Enterprise-grade, dependency injection, decorator-based

**Domain Modules** (see Services & Modules section below):
- Identity & Access
- Automations & Versions
- Execution & Integrations
- Pricing & Billing
- Admin & Ops
- Collaboration & Observability

**Database**: PostgreSQL (Neon for all environments: dev, staging, and prod)
- Connection pooling (PgBouncer or similar)
- Read replicas for reporting queries (future: when scale requires)
- Migrations via Drizzle ORM
- **Note**: Future migration to RDS/Aurora is possible if/when scale or compliance requirements demand it, but Neon is the standard for v1

**Caching**: Redis for:
- Session storage
- Rate limiting counters
- Frequently accessed automation metadata
- Blueprint JSON caching

### 3. Workers & Integrations Layer

**Queue System**: AWS SQS, Google Cloud Tasks, or similar message queue

**Worker Types**:

1. **Build Orchestrator Worker**
   - Listens for `automation_version.build_requested` events
   - Calls Wrk platform APIs to create/update workflows
   - Updates build status in database
   - Triggers notifications on completion/failure

2. **AI Ingestion Worker**
   - Processes uploaded documents, screenshots, recordings
   - Extracts workflow requirements using LLM APIs
   - Generates draft blueprint JSON
   - Updates automation intake progress

3. **Notification Worker**
   - Sends emails (SendGrid, AWS SES)
   - Posts to Slack webhooks
   - Updates in-app notifications
   - Handles retries and dead-letter queues

4. **Usage Aggregation Worker**
   - Processes run events from Wrk platform webhooks
   - Aggregates usage metrics per automation, per tenant
   - Updates billing records
   - Triggers alerts for threshold crossings

**Integration Points**:
- **Wrk Platform APIs**: For workflow creation, execution, and status updates
- **Third-party APIs**: For future integrations (CRM systems, etc.)

---

## Services & Modules

### Identity & Access

**Purpose**: Multi-tenant user management, authentication, authorization, and API access.

**Entities**:
- `tenants`: Organizations/workspaces (clients)
- `users`: Individual users within tenants
- `roles`: Role definitions (admin, member, viewer, etc.)
- `user_roles`: User-role assignments (many-to-many)
- `api_keys`: API keys for programmatic access (OAuth2 client credentials)
- `sessions`: Active user sessions (JWT refresh tokens)

**Key Operations**:
- User registration and invitation (tenant-scoped)
- JWT token generation and validation
- Role-based access control (RBAC)
- API key management (create, rotate, revoke)
- Tenant switching (users can belong to multiple tenants)

**Security**:
- All queries filtered by `tenant_id` from authenticated session
- Password hashing (bcrypt/argon2)
- JWT tokens include `tenant_id`, `user_id`, `roles[]`
- API keys scoped to specific tenants and permissions

**API Endpoints**:
- `POST /v1/auth/login`
- `POST /v1/auth/refresh`
- `GET /v1/users/me`
- `GET /v1/tenants/{tenantId}/users`
- `POST /v1/api-keys`
- `DELETE /v1/api-keys/{keyId}`

### Automations & Versions

**Purpose**: Core domain for automation definitions, versioning, and blueprint management.

**Entities**:
- `automations`: Logical automation (e.g., "Invoice Processing")
  - `id`, `tenant_id`, `name`, `description`, `department`, `owner_id`, `created_at`, `updated_at`
- `automation_versions`: Specific version of an automation
  - `id`, `tenant_id`, `automation_id`, `version` (semver: v1.0, v1.1, v2.0), `status`, `blueprint_json`, `intake_progress`, `created_at`, `updated_at`

**Blueprint Storage**: Blueprint structure (nodes and edges) is stored as JSONB in the `blueprint_json` column of `automation_versions`. This JSONB approach provides flexibility and performance for the current scale. Future optimization: If querying patterns require it, we may extract nodes/edges into separate tables (`blueprint_nodes`, `blueprint_edges`) for more efficient querying, but this is not part of the v1 schema.

**Status Lifecycle**:
```
Intake in Progress → Needs Pricing → Awaiting Client Approval → 
Build in Progress → QA & Testing → Ready to Launch → Live → Archived
```

**Blueprint JSON Structure**:
```json
{
  "nodes": [
    { "id": "trigger-1", "type": "trigger", "data": { "system": "Gmail", "event": "new_email" } },
    { "id": "action-1", "type": "action", "data": { "system": "Xero", "action": "create_invoice" } }
  ],
  "edges": [
    { "id": "e1", "source": "trigger-1", "target": "action-1", "label": "on success" }
  ]
}
```

**Key Operations**:
- Create automation and initial version
- Update blueprint JSON (nodes/edges)
- Create new version from existing
- Update version status
- Query automations by tenant with filters (status, department, owner)

**API Endpoints**:
- `GET /v1/automations` (list with filters)
- `POST /v1/automations`
- `GET /v1/automations/{id}`
- `GET /v1/automations/{id}/versions`
- `POST /v1/automations/{id}/versions`
- `PUT /v1/automation-versions/{id}/blueprint`
- `PATCH /v1/automation-versions/{id}/status`

### Execution & Integrations

**Purpose**: Bindings between automation versions and actual Wrk workflows, plus execution monitoring.

**Entities**:
- `workflow_bindings`: Links automation_version to Wrk workflow
  - `id`, `tenant_id`, `automation_version_id`, `wrk_workflow_id`, `wrk_workflow_url`, `status`, `created_at`, `updated_at`
- `run_events`: Execution events from Wrk platform webhooks
  - `id`, `tenant_id`, `workflow_binding_id`, `run_id`, `status` (success/failure), `started_at`, `completed_at`, `error_message`, `metadata_json`, `created_at`
  - **Idempotency**: Unique constraint on `(workflow_binding_id, run_id)` ensures the same run event is never processed twice
- `usage_aggregates`: Pre-aggregated usage metrics (hourly/daily)
  - `id`, `tenant_id`, `automation_version_id`, `period_start`, `period_end`, `run_count`, `success_count`, `failure_count`, `total_cost`, `created_at`, `updated_at`

**Integration Flow**:
1. Automation version reaches "Build in Progress"
2. Build Orchestrator Worker calls Wrk API to create workflow
3. Wrk returns `workflow_id` and `workflow_url`
4. Worker creates `workflow_binding` record
5. Wrk platform sends webhooks on run events
6. Webhook handler validates HMAC signature and processes event idempotently
7. Handler creates `run_events` (with idempotency check) and updates aggregates

**Webhook Security**:
- All webhooks from the Wrk platform **MUST** be authenticated via HMAC signature verification or signed secret header
- Webhook endpoint validates signature before processing any events
- Invalid signatures result in 401 Unauthorized response

**Webhook Idempotency**:
- Webhook handlers **MUST** be idempotent to handle duplicate deliveries
- Unique constraint on `run_events(workflow_binding_id, run_id)` prevents double-counting
- Handler logic checks for existing `run_event` before inserting:
  ```typescript
  const existing = await db.getRunEvent(workflowBindingId, runId);
  if (existing) {
    return; // Already processed, skip
  }
  await db.createRunEvent(...);
  ```

**Key Operations**:
- Create workflow binding
- Receive and process run event webhooks
- Aggregate usage metrics
- Query run history and statistics

**API Endpoints**:
- `GET /v1/automation-versions/{id}/workflow-binding`
- `GET /v1/automation-versions/{id}/runs` (paginated)
- `GET /v1/automation-versions/{id}/usage` (aggregated metrics)
- `POST /v1/webhooks/wrk-run-event` (internal, webhook receiver)
  - **Security**: Validates HMAC signature from Wrk platform
  - **Idempotency**: Checks for existing run_event before processing

### Pricing & Billing

**Purpose**: Setup fees, per-unit pricing, quotes, and usage-based billing.

**Entities**:
- `quotes`: Pricing proposals for automation versions
  - `id`, `automation_version_id`, `tenant_id`, `status` (draft/sent/signed/rejected), `setup_fee`, `unit_price`, `estimated_volume`, `effective_unit_price`, `created_at`, `signed_at`
- `pricing_overrides`: Admin overrides for pricing (for ops console)
  - `id`, `automation_version_id`, `setup_fee_override`, `unit_price_override`, `reason`, `created_by`, `created_at`
- `usage_aggregates`: Pre-aggregated usage metrics (shared with Execution & Integrations module)
  - `id`, `tenant_id`, `automation_version_id`, `period_start`, `period_end`, `run_count`, `success_count`, `failure_count`, `total_cost`, `created_at`, `updated_at`
  - Used for billing calculations and usage reporting
- `billing_periods`: Monthly billing summaries
  - `id`, `tenant_id`, `period_start`, `period_end`, `total_spend`, `setup_fees_collected`, `unit_costs`, `status` (draft/finalized)

**Pricing Logic**:
- Base pricing from quote or automation defaults
- Admin overrides take precedence
- Effective unit price = base unit price (or override) with volume discounts applied
- Usage costs = `run_count * effective_unit_price`

**Key Operations**:
- Create quote for automation version
- Update quote status (send, sign, reject)
- Apply pricing overrides (admin only)
- Calculate monthly spend per tenant
- Generate billing summaries

**API Endpoints**:
- `POST /v1/automation-versions/{id}/quotes`
- `GET /v1/quotes/{id}`
- `PATCH /v1/quotes/{id}/status`
- `POST /v1/automation-versions/{id}/pricing-overrides` (admin only)
- `GET /v1/tenants/{tenantId}/billing-summary`

### Admin & Ops

**Purpose**: Internal operations console for managing clients, projects, and build pipeline.

**Clients vs Tenants Model**:
- **Each customer = one tenant**: The `tenants` table represents the actual customer organization/workspace
- **`clients` is an ops-facing view**: The `clients` table is a denormalized view with ops-specific metadata (health status, ops owner, committed spend) that references `tenants`
- **Relationship**: `clients.tenant_id` → `tenants.id` (1:1 relationship)
- **Rationale**: This allows ops team to track commercial relationships and health metrics separately from the core tenant identity, while maintaining a single source of truth for authentication and authorization

**Entities**:
- `clients`: Ops-facing view of customer organizations (1:1 with `tenants`)
  - `id`, `tenant_id` (FK to tenants, UNIQUE), `name`, `industry`, `health_status`, `owner_id` (ops team member), `committed_monthly_spend`, `created_at`, `updated_at`
- `projects`: Ops view of automation work (often 1:1 with automation_versions, but can span multiple)
  - `id`, `tenant_id`, `client_id`, `automation_id` (nullable), `automation_version_id` (nullable), `name`, `type` (new_automation/revision), `status`, `pricing_status`, `owner_id`, `eta`, `checklist_progress`, `created_at`, `updated_at`

**Status Mapping**:
- Project status aligns with `automation_version.status` but includes ops-specific states
- `checklist_progress` = percentage of tasks with `context_type='project'` and `kind='build_checklist'` that are complete

**Key Operations**:
- List clients with filters (health, owner, spend)
- View client detail with projects and spend summary
- Update project status and ETA
- Manage tasks (build checklist items and general TODOs)
- Override pricing (via Pricing module)

**API Endpoints**:
- `GET /v1/admin/clients` (admin only)
- `GET /v1/admin/clients/{id}`
- `GET /v1/admin/projects` (admin only, with filters)
- `GET /v1/admin/projects/{id}`
- `PATCH /v1/admin/projects/{id}/status`
- `GET /v1/admin/projects/{id}/tasks` (filtered by `context_type='project'` and optionally `kind='build_checklist'`)
- `POST /v1/admin/projects/{id}/tasks`

### Collaboration & Observability

**Purpose**: Messages, tasks, and audit logging for collaboration and compliance.

**Entities**:
- `messages`: Threaded messages (client ↔ ops, internal notes)
  - `id`, `tenant_id`, `project_id` (nullable), `automation_version_id` (nullable), `type` (client/ops/internal_note), `sender_id`, `text`, `attachments_json`, `tags`, `created_at`
- `tasks`: Unified task management (build checklist items, general TODOs, workflow items)
  - `id`, `tenant_id`, `context_type` (project/automation_version/internal), `context_id` (FK to project/automation_version, nullable), `kind` (build_checklist/general_todo/workflow_item), `title`, `description`, `status` (pending/in_progress/complete), `assignee_id`, `due_date`, `priority`, `created_at`, `updated_at`
- `audit_logs`: Immutable log of sensitive actions
  - `id`, `tenant_id`, `user_id`, `action_type`, `resource_type`, `resource_id`, `changes_json`, `ip_address`, `user_agent`, `created_at`

**Message Types**:
- `client`: Visible to client users
- `ops`: Visible to ops team only
- `internal_note`: Ops-only notes (not visible to client)

**Key Operations**:
- Create message in project thread
- List messages for project/automation
- Create and assign tasks (build checklist items or general TODOs)
- Query tasks by context (project, automation, or internal)
- Query audit logs (admin only, with filters)

**API Endpoints**:
- `POST /v1/messages`
- `GET /v1/projects/{id}/messages`
- `GET /v1/automations/{id}/messages`
- `POST /v1/tasks`
- `GET /v1/tasks` (filtered by assignee, status, etc.)
- `PATCH /v1/tasks/{id}/status`
- `GET /v1/admin/audit-logs` (admin only)

---

## Data Model (Core Entities)

### Tenant-Scoped Tables

**Critical Rule**: All multi-tenant tables include `tenant_id` as a column (typically the first foreign key after `id`). This includes:
- `users`
- `automations`
- `automation_versions`
- `workflow_bindings`
- `run_events`
- `usage_aggregates`
- `quotes`
- `projects`
- `messages`
- `tasks`
- `audit_logs`

All queries must filter by `tenant_id` from the authenticated session (never from request parameters). Indexes on `(tenant_id, ...)` are created for efficient tenant isolation.

**Core Tables**:

```sql
tenants (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  subdomain TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
)

users (
  id UUID PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  avatar_url TEXT,
  password_hash TEXT, -- nullable if SSO-only
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE(tenant_id, email)
)

automations (
  id UUID PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  name TEXT NOT NULL,
  description TEXT,
  department TEXT,
  owner_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
)

automation_versions (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  automation_id UUID REFERENCES automations(id),
  version TEXT NOT NULL, -- semver: v1.0, v1.1
  status TEXT NOT NULL, -- enum: Intake in Progress, Needs Pricing, etc.
  blueprint_json JSONB NOT NULL, -- stores nodes and edges as JSON
  intake_progress INTEGER DEFAULT 0, -- 0-100
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE(automation_id, version)
)

workflow_bindings (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  automation_version_id UUID REFERENCES automation_versions(id),
  wrk_workflow_id TEXT NOT NULL,
  wrk_workflow_url TEXT,
  status TEXT NOT NULL, -- active/inactive/error
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
)

run_events (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  workflow_binding_id UUID REFERENCES workflow_bindings(id),
  run_id TEXT NOT NULL, -- from Wrk platform
  status TEXT NOT NULL, -- success/failure
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  metadata_json JSONB,
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE(workflow_binding_id, run_id) -- idempotency: prevent duplicate processing
)

quotes (
  id UUID PRIMARY KEY,
  automation_version_id UUID REFERENCES automation_versions(id),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  status TEXT NOT NULL, -- draft/sent/signed/rejected
  setup_fee DECIMAL(10,2) NOT NULL,
  unit_price DECIMAL(10,4) NOT NULL,
  estimated_volume INTEGER,
  effective_unit_price DECIMAL(10,4),
  created_at TIMESTAMPTZ NOT NULL,
  signed_at TIMESTAMPTZ
)

usage_aggregates (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  automation_version_id UUID REFERENCES automation_versions(id),
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  run_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0,
  total_cost DECIMAL(12,4) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE(automation_version_id, period_start, period_end)
)

clients (
  id UUID PRIMARY KEY,
  tenant_id UUID UNIQUE REFERENCES tenants(id), -- 1:1 with tenants
  name TEXT NOT NULL,
  industry TEXT,
  health_status TEXT, -- Good/At Risk/Churn Risk
  owner_id UUID REFERENCES users(id), -- ops team member
  committed_monthly_spend DECIMAL(12,2),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
)

projects (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  client_id UUID REFERENCES clients(id),
  automation_id UUID REFERENCES automations(id), -- nullable
  automation_version_id UUID REFERENCES automation_versions(id), -- nullable
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- new_automation/revision
  status TEXT NOT NULL, -- aligns with automation_version.status
  pricing_status TEXT, -- Not Generated/Draft/Sent/Signed
  owner_id UUID REFERENCES users(id),
  eta DATE,
  checklist_progress INTEGER DEFAULT 0, -- calculated from tasks with context_type='project' and kind='build_checklist'
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
)

messages (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  project_id UUID REFERENCES projects(id), -- nullable
  automation_version_id UUID REFERENCES automation_versions(id), -- nullable
  type TEXT NOT NULL, -- client/ops/internal_note
  sender_id UUID REFERENCES users(id),
  text TEXT NOT NULL,
  attachments_json JSONB,
  tags TEXT[],
  created_at TIMESTAMPTZ NOT NULL
)

tasks (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  context_type TEXT NOT NULL, -- project/automation_version/internal
  context_id UUID, -- FK to project/automation_version, nullable for internal tasks
  kind TEXT NOT NULL, -- build_checklist/general_todo/workflow_item
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL, -- pending/in_progress/complete
  assignee_id UUID REFERENCES users(id),
  due_date DATE,
  priority TEXT, -- low/medium/high/critical
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
)

audit_logs (
  id UUID PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  user_id UUID REFERENCES users(id),
  action_type TEXT NOT NULL, -- create/update/delete/approve/reject
  resource_type TEXT NOT NULL, -- automation/quote/project/etc
  resource_id UUID NOT NULL,
  changes_json JSONB, -- before/after snapshot
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL
)
```

### Indexes

Critical indexes for performance:

```sql
-- Tenant isolation (on every tenant-scoped table)
CREATE INDEX idx_automations_tenant_id ON automations(tenant_id);
CREATE INDEX idx_automation_versions_tenant_id ON automation_versions(tenant_id);
CREATE INDEX idx_automation_versions_automation_id ON automation_versions(automation_id);
CREATE INDEX idx_automation_versions_status ON automation_versions(status);
CREATE INDEX idx_workflow_bindings_tenant_id ON workflow_bindings(tenant_id);
CREATE INDEX idx_workflow_bindings_automation_version_id ON workflow_bindings(automation_version_id);
CREATE INDEX idx_run_events_tenant_id ON run_events(tenant_id);
CREATE INDEX idx_run_events_workflow_binding_id ON run_events(workflow_binding_id);
CREATE INDEX idx_run_events_started_at ON run_events(started_at);
CREATE INDEX idx_usage_aggregates_tenant_id ON usage_aggregates(tenant_id);
CREATE INDEX idx_usage_aggregates_automation_version_id ON usage_aggregates(automation_version_id);
CREATE INDEX idx_usage_aggregates_period ON usage_aggregates(period_start, period_end);
CREATE INDEX idx_quotes_tenant_id ON quotes(tenant_id);
CREATE INDEX idx_quotes_automation_version_id ON quotes(automation_version_id);
CREATE INDEX idx_projects_tenant_id ON projects(tenant_id);
CREATE INDEX idx_projects_client_id ON projects(client_id);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_messages_tenant_id ON messages(tenant_id);
CREATE INDEX idx_messages_project_id ON messages(project_id);
CREATE INDEX idx_tasks_tenant_id ON tasks(tenant_id);
CREATE INDEX idx_tasks_context ON tasks(context_type, context_id);
CREATE INDEX idx_audit_logs_tenant_id_created_at ON audit_logs(tenant_id, created_at DESC);
```

### Relationship Patterns

- **Tenant Scoping**: Every multi-tenant table has `tenant_id` as a column. All queries filter by `tenant_id` from the authenticated session (never from request parameters). This ensures complete data isolation between tenants.

- **Tenants ↔ Clients**: One tenant = one client (1:1 relationship). `clients` is an ops-facing view with commercial metadata (health status, committed spend, ops owner) that references `tenants`. The `tenants` table is the source of truth for authentication and authorization.

- **Automation → Versions**: One automation has many versions. Both `automations` and `automation_versions` have `tenant_id` for direct tenant scoping. The "active" version is determined by status = "Live" and latest version number.

- **Projects ↔ Automations**: Projects often map 1:1 to automation_versions, but can exist independently during intake. `automation_id` and `automation_version_id` are nullable. Projects have `tenant_id` for direct tenant scoping and `client_id` for ops organization.

- **Quotes → Versions**: Each quote is tied to a specific automation_version. Multiple quotes can exist (draft, sent, signed) but only one "signed" quote per version. Quotes have `tenant_id` for direct tenant scoping.

- **Workflow Bindings**: One automation_version has one active workflow_binding (1:1 relationship). Workflow bindings have `tenant_id` for direct tenant scoping.

- **Run Events**: Many run_events belong to one workflow_binding. Run events have `tenant_id` for direct tenant scoping and a unique constraint on `(workflow_binding_id, run_id)` for idempotency.

- **Usage Aggregates**: Pre-aggregated metrics per automation_version per time period. Have `tenant_id` for direct tenant scoping.

- **Tasks**: Unified task table supporting multiple contexts (projects, automation_versions, or internal). Tasks have `tenant_id` for direct tenant scoping and `context_type` + `context_id` for flexible relationships.

---

## Security Model

### Authentication

**Managed IdP Integration**:
- Primary: Auth0, Clerk, or similar managed identity provider
- JWT tokens issued by IdP include:
  - `sub` (user ID)
  - `tenant_id` (from user's primary tenant or selected tenant)
  - `roles[]` (array of role names)
  - `exp` (expiration)
- Backend validates JWT signature and extracts `tenant_id`, `user_id` from token claims

**Session Management**:
- Refresh tokens stored in `sessions` table (or Redis)
- Access tokens short-lived (15 minutes)
- Refresh tokens longer-lived (7 days) with rotation

**API Key Authentication**:
- OAuth2 client credentials flow for programmatic access
- API keys stored in `api_keys` table with:
  - `key_hash` (hashed, never plaintext)
  - `tenant_id` (scoped to tenant)
  - `permissions` (JSON array of allowed operations)
  - `expires_at` (optional expiration)

### Authorization

**Tenant Isolation**:
- **Critical Rule**: Every query in the service layer takes `tenantId` from the authenticated session (JWT or API key), **never from request body or query parameters**.
- Example service method:
  ```typescript
  async function getAutomation(automationId: string, session: AuthenticatedSession) {
    // session.tenantId comes from JWT, not from request
    return db.query(
      'SELECT * FROM automations WHERE id = $1 AND tenant_id = $2',
      [automationId, session.tenantId]
    );
  }
  ```

**Role-Based Access Control (RBAC)**:
- Roles: `admin`, `member`, `viewer`, `ops_admin` (internal)
- Permissions checked at API route level:
  ```typescript
  // Only admins can create automations
  if (!session.roles.includes('admin')) {
    throw new ForbiddenError();
  }
  ```

**Resource-Level Authorization**:
- Users can only access resources within their tenant
- Ops admins can access multiple tenants (via special permission)

### Input Validation

**Schema Validation at API Boundaries**:
- All request bodies validated with Zod (or similar) schemas
- Validation happens before any business logic
- Invalid requests return 400 with detailed error messages

**Example**:
```typescript
const CreateAutomationSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  department: z.string().max(100).optional(),
});

// In route handler
const validated = CreateAutomationSchema.parse(req.body);
```

### Secrets & Configuration

**Secrets Management**:
- All secrets stored in AWS Secrets Manager, HashiCorp Vault, or similar secrets manager
- **No secrets in git**: Secrets are never committed to version control
- **Runtime injection**: Secrets are injected as environment variables at runtime (by the deployment platform or secrets manager integration)
- **Local development**: `.env` file is used for local development only and is gitignored
- Secrets rotated regularly
- Database credentials, API keys, JWT signing keys, webhook secrets all in secrets manager

**Configuration**:
- Environment-specific config (dev/staging/prod) in separate config files
- Feature flags for gradual rollouts
- Non-sensitive configuration (feature flags, API endpoints) can be in environment variables or config files

### Audit & Logging

**Structured Logging**:
- All logs in JSON format
- Include: `tenant_id`, `user_id`, `request_id`, `timestamp`, `level`, `message`, `metadata`
- Logs sent to centralized logging (Datadog, CloudWatch, etc.)

**Audit Logs**:
- Sensitive actions written to `audit_logs` table:
  - Automation creation/deletion
  - Quote signing/rejection
  - Pricing overrides
  - User role changes
  - API key creation/deletion
- Immutable records (no updates/deletes)
- Queryable by admins for compliance

---

## API Design

### REST API Structure

**Base URL**: `https://api.wrkcopilot.com/v1` (prod), `https://api.dev.wrkcopilot.com/v1` (dev)

**Versioning**: URL-based versioning (`/v1/`, `/v2/`). Current version is v1.

**Authentication**: Bearer token in `Authorization` header:
```
Authorization: Bearer <jwt_token>
```
or API key:
```
Authorization: Bearer <api_key>
```

### Endpoint Namespacing

**Studio Endpoints** (client-facing):
- `/v1/automations` - List/create automations
- `/v1/automations/{id}` - Get/update automation
- `/v1/automations/{id}/versions` - List/create versions
- `/v1/automation-versions/{id}` - Get/update version
- `/v1/automation-versions/{id}/blueprint` - Update blueprint JSON
- `/v1/automation-versions/{id}/runs` - Get run history
- `/v1/automation-versions/{id}/usage` - Get usage metrics
- `/v1/quotes/{id}` - Get quote details
- `/v1/messages` - Create/list messages
- `/v1/tasks` - Create/list tasks

**Admin Endpoints** (ops-facing, require `ops_admin` role):
- `/v1/admin/clients` - List clients
- `/v1/admin/clients/{id}` - Get client detail
- `/v1/admin/projects` - List projects with filters
- `/v1/admin/projects/{id}` - Get/update project
- `/v1/admin/projects/{id}/status` - Update project status
- `/v1/admin/automation-versions/{id}/pricing-overrides` - Override pricing
- `/v1/admin/audit-logs` - Query audit logs

**Public/Partner Endpoints** (API key authentication required):
- **Note**: "Public" means "for programmatic/partner use", not anonymous access. All `/v1/public/*` endpoints require valid API key authentication.
- `/v1/public/automations` - List automations (read-only, filtered by API key's tenant)
- `/v1/public/automation-versions/{id}/runs` - Get run history
- Future: Webhook registration endpoints

### Response Format

**Success Response**:
```json
{
  "data": { ... },
  "meta": {
    "request_id": "req_123",
    "timestamp": "2024-11-05T10:00:00Z"
  }
}
```

**Error Response**:
```json
{
  "error": {
    "code": "AUTOMATION_NOT_FOUND",
    "message": "Automation with ID 'abc123' not found",
    "request_id": "req_123"
  }
}
```

**Pagination**:
```json
{
  "data": [ ... ],
  "pagination": {
    "page": 1,
    "per_page": 20,
    "total": 150,
    "total_pages": 8
  }
}
```

### OpenAPI Specification

**Future**: Generate OpenAPI 3.0 spec from code annotations (using `@fastify/swagger` or NestJS Swagger). This enables:
- SDK generation for partners
- Interactive API documentation
- Contract testing

### Front-End Mapping

The backend REST endpoints map directly to front-end UI features:

- **Automations List** (`/automations`) → `GET /v1/automations`
- **Automation Detail** (`/automations/[id]`) → `GET /v1/automations/{id}`, `GET /v1/automations/{id}/versions`
- **Blueprint Canvas** → `GET /v1/automation-versions/{id}/blueprint`, `PUT /v1/automation-versions/{id}/blueprint`
- **Build Status** → `GET /v1/automation-versions/{id}` (includes status)
- **Usage Metrics** → `GET /v1/automation-versions/{id}/usage`
- **Admin Clients** → `GET /v1/admin/clients`
- **Admin Projects** → `GET /v1/admin/projects`
- **Project Chat** → `GET /v1/projects/{id}/messages`, `POST /v1/messages`
- **Pricing Panel** → `GET /v1/quotes/{id}`, `POST /v1/admin/automation-versions/{id}/pricing-overrides`

---

## Async Processing & Workers

### Queue Architecture

**Message Queue**: AWS SQS (or Google Cloud Tasks, RabbitMQ, etc.)

**Queue Types**:
1. `build-requests` - Automation build orchestration
2. `ai-ingestion` - Document/video processing
3. `notifications` - Email/Slack notifications
4. `usage-aggregation` - Run event processing

### Worker Implementation

**Build Orchestrator Worker**:

```typescript
// Listens to: build-requests queue
async function processBuildRequest(message: BuildRequestMessage) {
  const { automationVersionId } = message;
  
  // 1. Fetch automation version and blueprint
  const version = await db.getAutomationVersion(automationVersionId);
  
  // 2. Call Wrk platform API to create workflow
  const wrkWorkflow = await wrkClient.createWorkflow({
    blueprint: version.blueprint_json,
    name: version.automation.name,
  });
  
  // 3. Create workflow binding
  await db.createWorkflowBinding({
    automation_version_id: automationVersionId,
    wrk_workflow_id: wrkWorkflow.id,
    wrk_workflow_url: wrkWorkflow.url,
    status: 'active',
  });
  
  // 4. Update version status
  await db.updateAutomationVersionStatus(automationVersionId, 'Ready to Launch');
  
  // 5. Enqueue notification
  await queue.send('notifications', {
    type: 'build_complete',
    automation_version_id: automationVersionId,
  });
}
```

**AI Ingestion Worker**:

```typescript
// Listens to: ai-ingestion queue
async function processDocument(message: IngestionMessage) {
  const { automationId, documentUrl, documentType } = message;
  
  // 1. Download and parse document
  const content = await downloadDocument(documentUrl);
  
  // 2. Call LLM API to extract workflow requirements
  const requirements = await llmClient.extractWorkflowRequirements({
    content,
    documentType,
  });
  
  // 3. Generate draft blueprint JSON
  const blueprint = await llmClient.generateBlueprint(requirements);
  
  // 4. Update automation version
  await db.updateAutomationVersion({
    id: automationId,
    blueprint_json: blueprint,
    intake_progress: 75, // Updated based on completion
  });
}
```

**Notification Worker**:

```typescript
// Listens to: notifications queue
async function sendNotification(message: NotificationMessage) {
  const { type, automation_version_id, recipient_id } = message;
  
  // 1. Fetch recipient and automation details
  const recipient = await db.getUser(recipient_id);
  const version = await db.getAutomationVersion(automation_version_id);
  
  // 2. Send email via SendGrid
  await emailClient.send({
    to: recipient.email,
    template: `automation_${type}`,
    data: { automationName: version.automation.name },
  });
  
  // 3. Create in-app notification
  await db.createNotification({
    user_id: recipient_id,
    type,
    automation_version_id,
    message: `Automation "${version.automation.name}" build completed`,
  });
}
```

**Usage Aggregation Worker**:

```typescript
// Listens to: usage-aggregation queue (triggered by webhook)
async function aggregateUsage(message: RunEventMessage) {
  const { workflow_binding_id, run_id, status, started_at, completed_at } = message;
  
  // 1. Find workflow binding and automation version
  const binding = await db.getWorkflowBinding(workflow_binding_id);
  const version = await db.getAutomationVersion(binding.automation_version_id);
  
  // 2. Create run event record
  await db.createRunEvent({
    workflow_binding_id,
    run_id,
    status,
    started_at,
    completed_at,
  });
  
  // 3. Update hourly aggregate
  const periodStart = truncateToHour(started_at);
  await db.upsertUsageAggregate({
    automation_version_id: binding.automation_version_id,
    tenant_id: version.automation.tenant_id,
    period_start: periodStart,
    run_count: 1,
    success_count: status === 'success' ? 1 : 0,
    failure_count: status === 'failure' ? 1 : 0,
  });
}
```

### Worker Updates & UI Sync

- Workers update database directly
- Front-end polls or uses WebSockets for real-time updates
- Critical status changes trigger WebSocket notifications to connected clients

---

## Environments & Deployment

### Environment Structure

**Development**:
- Database: Neon PostgreSQL (serverless, easy setup)
- API: `https://api.dev.wrkcopilot.com`
- Workers: Single worker process (all queue types)
- Secrets: Local `.env` file (gitignored, for dev only)

**Staging**:
- Database: Neon PostgreSQL (separate instance)
- API: `https://api.staging.wrkcopilot.com`
- Workers: Separate worker processes per type
- Secrets: AWS Secrets Manager (staging namespace, injected as env vars)

**Production**:
- Database: Neon PostgreSQL (separate instance, with connection pooling)
- API: `https://api.wrkcopilot.com` (or custom domain)
- Workers: Auto-scaling worker fleet (ECS/EKS or Cloud Run)
- Secrets: AWS Secrets Manager (prod namespace, injected as env vars)
- CDN: CloudFront for static assets
- **Future**: Migration to RDS/Aurora is possible if/when scale, compliance, or feature requirements demand it, but Neon is the standard for v1

### CI/CD Pipeline

**Pull Request**:
1. Run tests (`npm test`)
2. Run linting (`npm run lint`)
3. Run type checking (`npm run type-check`)
4. Build Docker image (test build)
5. Post status to PR

**Merge to `develop` branch**:
1. Run full test suite
2. Build and push Docker image to dev registry
3. Deploy to dev environment (auto-deploy)
4. Run database migrations (dev)

**Merge to `main` branch** (requires approval):
1. Run full test suite + integration tests
2. Build and push Docker image to prod registry
3. Deploy to staging (auto-deploy)
4. Run database migrations (staging)
5. Manual approval for prod deployment
6. Deploy to production (blue/green deployment)
7. Run database migrations (prod, with backup)

### Database Migrations

**Tool**: Drizzle ORM or Prisma Migrate

**Strategy**:
- Migrations are versioned SQL files
- Applied automatically in dev/staging
- Applied manually (with approval) in prod
- Always create backups before prod migrations
- Rollback scripts for critical migrations

**Example Migration**:
```sql
-- migrations/001_create_automations.sql
CREATE TABLE automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_automations_tenant_id ON automations(tenant_id);
```

### Monitoring & Observability

**Metrics**:
- Request latency (p50, p95, p99)
- Error rates by endpoint
- Queue depth and processing time
- Database query performance
- Active tenant count

**Alerting**:
- Error rate > 1% for 5 minutes
- P95 latency > 2 seconds
- Database connection pool exhaustion
- Queue depth > 1000 messages
- Failed worker jobs > 10 in 1 minute

**Tools**: Datadog, New Relic, or CloudWatch

---

## Extensibility & Future Work

### Adding New Domain Modules

**Pattern**:
1. Create new module directory: `src/modules/new-domain/`
2. Define entities in database schema
3. Create service layer: `NewDomainService` with tenant-scoped methods
4. Create API routes: `src/routes/v1/new-domain.ts`
5. Register routes in main app
6. Add worker handlers if async processing needed

**Example**: Adding "Integrations" module for third-party system connections

```typescript
// src/modules/integrations/integrations.service.ts
export class IntegrationsService {
  async createIntegration(
    tenantId: string,
    data: CreateIntegrationDto
  ): Promise<Integration> {
    // Tenant-scoped creation
    return db.createIntegration({ ...data, tenant_id: tenantId });
  }
}

// src/routes/v1/integrations.ts
app.post('/v1/integrations', async (req, res) => {
  const session = req.session; // From auth middleware
  const integration = await integrationsService.createIntegration(
    session.tenantId,
    req.body
  );
  return res.json({ data: integration });
});
```

### Exposing New Capabilities via Public API

**Process**:
1. Design RESTful endpoint following existing patterns
2. Add to OpenAPI spec
3. Implement with API key authentication
4. Document rate limits and usage guidelines
5. Version appropriately (`/v1/` vs `/v2/`)

**Example**: Public webhook registration endpoint

```typescript
// src/routes/v1/public/webhooks.ts
app.post('/v1/public/webhooks', async (req, res) => {
  const apiKey = req.apiKey; // From API key auth middleware
  const webhook = await webhooksService.createWebhook(
    apiKey.tenantId,
    req.body
  );
  return res.json({ data: webhook });
});
```

### Migration to Microservices

**Current**: Modular monolith (all modules in one service)

**Future**: If scale requires, split into microservices:

**Potential Service Boundaries**:
- **Identity Service**: Auth, users, tenants, API keys
- **Automations Service**: Automations, versions, blueprints
- **Execution Service**: Workflow bindings, run events, usage
- **Billing Service**: Quotes, pricing, billing periods
- **Admin Service**: Clients, projects, ops workflows
- **Collaboration Service**: Messages, tasks, notifications

**Migration Strategy**:
- Start with read-only APIs in new service
- Gradually move write operations
- Use event sourcing for cross-service communication
- Maintain API gateway for unified front-end access

**When to Consider**:
- Team size > 20 engineers
- Need for independent scaling of modules
- Different deployment cadences per module
- Regulatory requirements for service isolation

---

## Conclusion

This backend architecture provides a solid foundation for WRK Copilot that is:
- **Secure**: Multi-tenant isolation, input validation, audit logging
- **Scalable**: Queue-based async processing, connection pooling, read replicas
- **API-First**: All capabilities exposed via REST APIs
- **Maintainable**: Clear domain boundaries, modular structure
- **Future-Ready**: Extensible for new features and potential microservices migration

The architecture aligns with the front-end structure documented in `FRONTEND_ARCHITECTURE.md` and supports all current UI features while providing a clear path for future enhancements.


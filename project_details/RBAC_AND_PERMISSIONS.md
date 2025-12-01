<!-- RBAC_AND_PERMISSIONS.md -->
# WRK Copilot RBAC & Permissions Model

## 1. Goals

- Enforce **tenant isolation** and **least privilege** everywhere.
- Centralize authorization into a single **policy layer** (`can(user, action, resource)`).
- Make it easy to answer:
  - “Who can change this automation’s status?”
  - “Who can see this client message?”
  - “Who can change pricing?”

This doc defines roles, resources, actions, and the decision model.

---

## 2. Role Taxonomy

### 2.1 Tenant / Workspace Roles (Client-Side)

These roles live **within a tenant/workspace** (client org):

- `workspace_admin`
  - Full control over workspace: users, automations, credentials, billing details (within their tenant).
- `project_owner`
  - Owns specific automations/projects; can edit and transition their status.
- `project_admin`
  - Elevated project-level permissions, similar to owner but not workspace-wide.
- `member`
  - Regular user: can create/modify automations they own, participate in messaging.
- `viewer`
  - Read-only access to automations and metrics; no mutations.
- `billing_contact`
  - Can view quotes, billing summaries, and sign quotes (if configured).

> Note: `project_owner`/`project_admin` are *scoped* to specific automations/projects, not global.

### 2.2 Internal WRK Roles (Ops/Admin)

These roles can span multiple tenants:

- `ops_build`
  - Build automations, manage blueprints, update build-related statuses.
- `ops_qa`
  - Run QA, move automation versions between `Build in Progress` / `QA & Testing` / `Ready to Launch` (where flows permit).
- `ops_billing`
  - View/adjust quotes, apply pricing overrides (within policy).
- `ops_admin`
  - Full ops control: manage clients, projects, override statuses (subject to state machine).
- `cs_admin`
  - Customer success lead: manage `clients`, update health status, coordinate retention.
- `account_manager`
  - Owns a `client`, gets health alerts and retention tasks.
- `tenant_admin`
  - Superuser for a *single* tenant; can manage all resources within that tenant (client-side “super admin”).
- `admin`
  - Platform-level super admin (internal only). Full access across tenants.

---

## 3. Resources & Actions

### 3.1 Resource Types

- `tenant` / `workspace`
- `automation`
- `automation_version`
- `project`
- `quote`
- `pricing_override`
- `workflow_binding`
- `credential` (indirectly via Flow 25)
- `message`
- `task`
- `client` (ops-facing)
- `usage_aggregate` / `run_event`
- `audit_log` (read-only, admin-only)

### 3.2 Core Actions

- `read`
- `create`
- `update`
- `delete` (usually soft)
- `status_transition`
- `view_internal_fields`
- `override_pricing`
- `manage_members` (users/roles)
- `view_sensitive` (credentials references, not secrets)
- `manage_client_health`

---

## 4. Permissions Matrix (High Level)

### 4.1 Automations & Versions

| Role              | Create Automation | Edit Blueprint | Status Transition | View Usage | Archive Version |
|-------------------|-------------------|----------------|-------------------|-----------|-----------------|
| workspace_admin   | ✅                | ✅              | ✅ (per state machine) | ✅         | ✅              |
| project_owner     | ✅ (own)          | ✅ (own)        | ✅ (limited)       | ✅ (own)  | ⚠️ (policy)     |
| project_admin     | ✅ (own scope)    | ✅ (own scope)  | ✅ (limited)       | ✅        | ⚠️ (policy)     |
| member            | ✅ (own)          | ✅ (own)        | ⚠️ (intake only)   | ✅ (where collaborator) | ❌          |
| viewer            | ❌                | ❌              | ❌                 | ✅        | ❌              |
| ops_build         | ❌ (client-side)  | ✅              | ✅ between build-related statuses | ✅ | ⚠️ (via Flow 35 policy) |
| ops_qa            | ❌                | ✅ (QA-specific) | ✅ for QA states  | ✅        | ❌              |
| ops_admin / admin | ✅                | ✅              | ✅ (full)          | ✅        | ✅              |

> “Status transition” always flows through the **status router** and state machine (Flows 13/24/24A/24B/26/35), regardless of role.

### 4.2 Projects & Pricing

| Role            | View Project | Update Project Status | View Quote | Adjust Quote | Override Pricing |
|-----------------|-------------|-----------------------|-----------|--------------|------------------|
| workspace_admin | ✅           | ✅ (per state machine) | ✅         | ❌ (except client-side edits) | ❌ |
| project_owner   | ✅           | ✅ (own)              | ✅         | ❌           | ❌               |
| member          | ✅ (participant) | ⚠️ (comments only) | ✅ (if authorized) | ❌ | ❌ |
| ops_build       | ✅           | ✅ (build-related)    | ✅         | ⚠️ (minor tweaks) | ❌ |
| ops_billing     | ✅           | ✅ (billing statuses) | ✅         | ✅           | ✅ (Flow 19)     |
| ops_admin       | ✅           | ✅                    | ✅         | ✅           | ✅               |
| admin           | ✅           | ✅                    | ✅         | ✅           | ✅               |

### 4.3 Messages & Tasks

| Role              | Send Client Msg | Send Ops Msg | Create Internal Note | Create Task | Update Task Status |
|-------------------|-----------------|-------------|----------------------|------------|--------------------|
| workspace_admin   | ✅              | ❌          | ❌                   | ✅ (project scope) | ✅ (own workspace) |
| project_owner     | ✅              | ❌          | ❌                   | ✅ (project scope) | ✅ (project scope) |
| member            | ✅ (where participant) | ❌  | ❌                   | ✅ (own tasks) | ✅ (own tasks) |
| ops_build         | ✅              | ✅          | ✅                   | ✅          | ✅                |
| ops_qa            | ✅              | ✅          | ✅                   | ✅          | ✅                |
| ops_admin/admin   | ✅              | ✅          | ✅                   | ✅          | ✅                |

**Message type rules** (Flow 30):

- `client` → visible to client + ops.  
- `ops` → internal only (no clients).  
- `internal_note` → restricted to elevated ops roles.

### 4.4 Clients & Health

| Role          | View Client | Create Client (Flow 33) | Update Health (Flow 34) |
|---------------|-------------|-------------------------|-------------------------|
| ops_admin     | ✅          | ✅                       | ✅                      |
| cs_admin      | ✅          | ✅                       | ✅                      |
| account_manager | ✅        | ❌                       | ⚠️ (policy-based)       |
| admin         | ✅          | ✅                       | ✅                      |

---

## 5. Authorization Decision Model

All mutations MUST go through a centralized policy function, e.g.:

```ts
type Action =
  | "read"
  | "create"
  | "update"
  | "delete"
  | "status_transition"
  | "override_pricing"
  | "view_internal_fields"
  | "manage_members"
  | "manage_client_health";

function can(user: UserContext, action: Action, resource: ResourceContext): boolean;

5.1 Inputs
	•	UserContext
	•	userId
	•	tenantId
	•	roles: string[] (workspace roles + internal roles)
	•	memberships: { projectId, role }[]
	•	ResourceContext
	•	type (automation, project, client, etc.)
	•	tenantId
	•	ownerId
	•	projectId / automationId / clientId
	•	status (for state machine decisions)
	•	kind (for tasks/messages)

5.2 Rules
	1.	Tenant gate
If user.tenantId !== resource.tenantId and user is not an internal ops role with explicit cross-tenant permission → deny.
	2.	Role gate
Check resource-specific rules (matrix above). If user lacks any qualifying role → deny.
	3.	State machine check (for status_transition)
Even if can() returns true, the relevant Flow (13/24/24A/24B/26/35/32/34) enforces allowed transitions separately.
	4.	Special constraints
	•	System-only fields (e.g. created_by_system, system tasks.kind) cannot be set by user roles.
	•	System messages (type='system') never allowed via public APIs.

⸻

6. Implementation Notes
	•	Prefer a single policy module (rbac.ts) imported by all route handlers/services.
	•	Write unit tests for can() covering:
	•	Cross-tenant access attempts
	•	Non-admin trying to override pricing
	•	Client user trying to send ops or internal_note messages
	•	All DB queries should still be tenant-scoped. RBAC is additional, not instead of tenant isolation.

⸻

7. Future Extensions
	•	Attribute-based rules (e.g. region-based ops teams).
	•	Feature flags by role (early access to AI features).
	•	Per-tenant custom policies (large enterprise customers).


### Flow 31: Create Task (System Auto-Generated)

> **Scope**: Flow 31 describes the internal `create_auto_task` helper used by other flows (e.g., credential blocking, deploy validation) to generate tasks automatically. User-created tasks via `POST /v1/tasks` may reuse the same helper, but Flow 31 itself is about system-generated tasks.

**Trigger**: Internal validation engines detect missing items / errors and call the `create_auto_task` helper

---

### Access & Auth

- **Auth**:
  - System auto-generated tasks originate from an internal service identity (worker, orchestration engine).
  - Public task APIs (`POST /v1/tasks`, `PATCH /v1/tasks/{id}/status`) require a JWT session. Customer API keys are read-only (if exposed) and MUST NOT create/update tasks.
- **Authorization**:
  - For public APIs: user must belong to the tenant and be a member of the project/automation context.
  - Only internal service identities may create tasks with `user_id=null` and privileged kinds reserved for system use.
- **Tenant isolation**:
  - `tenant_id` derived from auth or from the owning project/automation (never trusted from payload).
  - All task reads/writes scoped by `(tenant_id, project_id)` or `(tenant_id, automation_version_id)`.
  - Auto-generation resolves project/automation via internal IDs and uses their tenant, ignoring caller hints.

---

### Flow Diagram**:
```
System detects missing items or validation failures (internal validation engines, not arbitrary client payloads):
    - Missing credentials for required integrations
    - Blueprint validation errors
    - Missing required fields
    - Build checklist items not completed
    ↓
System auto-generates tasks:
    - context_type = 'project' or 'automation_version'
    - context_id = project.id or automation_version.id
    - kind = 'build_checklist' or 'general_todo'
    - title = auto-generated based on missing item
    - status = 'pending'
    - priority = determined by system (e.g., 'high' for blocking items)
    ↓
Validate context exists (project/automation_version) AND belongs to the resolved tenant_id; if mismatch, log + abort (no task)
    ↓
Create task record
    ↓
Create audit log entry
    ↓
If kind = 'build_checklist' and context_type = 'project':
    Recalculate project.checklist_progress
    ↓
If assignee specified:
    Send notification to assignee
    ↓
If due_date specified and < 7 days:
    Schedule reminder notification
    ↓
Return task
```

**API Endpoints**:
- Internal helper `create_auto_task(...)` – invoked by system workflows (this flow).
- `POST /v1/tasks` – User-created tasks (reuses helper with user AuthZ). Backend resolves tenant/project/automation, enforces membership, derives `created_by` from auth, and forbids user_id=null/system-only kinds.
- `GET /v1/tasks` – List tasks (server-side tenant/role filtering).
- `PATCH /v1/tasks/{id}/status` – Update task status (only members with permission).

**Database Changes**:
- Insert into `tasks` with fields:
  - `tenant_id`
  - `project_id` XOR `automation_version_id` (exactly one non-null)
  - `context_type`
  - `kind` enum (e.g., `build_checklist`, `credentials_issue`, `general_todo`)
  - `title`, `description`, `status`, `priority`, `assignee_id`, `due_date`
  - `created_by` (user ID) or `created_by_system=true`
  - `created_at`, `updated_at`
- Indexes: `(tenant_id, project_id, status)` and `(tenant_id, automation_version_id, status)` for dashboards.
- Update `projects.checklist_progress` when `context_type='project'` and `kind='build_checklist'`. Calculation:
  - numerator = count of checklist tasks with `status='complete'`
  - denominator = count of all checklist tasks
  - recompute inside the same transaction as task insert/update to avoid inconsistencies.
- `tasks` must never store secrets/tokens in text/attachments.
- Flow 31 never updates `automation_versions.status` or pricing; lifecycle transitions stay with Flows 13/24/24A/24B/26.
- Insert `audit_logs` (action_type='create_task') capturing `{ context_type, context_id, kind, title, priority, created_by_system }`. For system tasks, `user_id=null` (actor='system'); user-created tasks must log the authenticated user ID. Metadata never includes raw validation payloads/secrets.

**Note**: `checklist_progress` on projects is calculated using the formula above; user-created checklist tasks go through the same helper to keep logic consistent.

**Important**: Tasks described here are system auto-generated based on validation rules. User-created tasks via `POST /v1/tasks` call the same helper but must pass AuthZ/membership, set `created_by`, and cannot spoof system-only fields.

**Notifications**:
- **Email**: Task assigned notification (template: `task_assigned`)
- **In-app**: Notification to assignee
- **Email**: Task due reminder (template: `task_due_reminder`, scheduled)

**Exceptions**:
- **Forbidden (403)**: user not in tenant/project context or attempting to create prohibited kind.
- **Invalid context**: 404 when project/automation not found for tenant.
- **Invalid assignee**: 400.
- **Missing required fields**: 400.
- **Rate limits**: 429 (server may enforce per-user/per-project limits on public POST /v1/tasks).

**Manual Intervention**: None

---

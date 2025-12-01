### Flow 35: Archive Automation

**Trigger**: Ops/admin archives an automation version (via status router) or deletes an automation (which archives all versions).

---

## Access & Auth

- **Auth**:
  - `PATCH /v1/automation-versions/{id}/status` (with `status='Archived'`) and `DELETE /v1/automations/{id}` require a JWT session.
  - Customer API keys (wrk_api_…) are read-only at most; they MUST NOT archive or delete automations.
- **Authorization**:
  - Single-version archive via PATCH: roles `{project_owner, project_admin, ops_build, ops_qa, ops_billing, ops_admin, admin}`.
  - DELETE (archive all versions of an automation): restricted to `{ops_admin, admin}` (see RBAC policy).
- **Tenant isolation**:
  - `tenant_id` is derived from auth context or from the owning project/tenant—never from request payload.
  - All reads/writes MUST be scoped by `(tenant_id, automation_version_id)` and `(tenant_id, project_id)`.
  - AuthN/AuthZ MUST succeed before disclosing automation existence or status.
- **Router behavior (shared status endpoint)**:
  - When `requested_status='Archived'`, the router loads the automation_version row scoped by `(tenant_id, id)`, validates caller permissions, and:
    - If current_status is in the allowed set for archiving (e.g., Draft, Build in Progress, QA & Testing, Ready to Launch, Paused, Blocked, Live per policy), dispatches to the Flow 35 helper.
    - Otherwise returns 409 `invalid_status_transition` (Flow 13/24/24A/24B are not invoked for Archived target state).

---

## Flow Diagram
```
User/admin requests archive (status='Archived' via PATCH or DELETE)
    ↓
Router loads automation_version by (tenant_id, id), validates caller + current_status in allowed set
    ↓
If current_status='Live' and policy expects replacement:
    - Check for valid replacement Live version per product policy
    - If not satisfied → 409 (policy documented, no archive)
    ↓
If workflow_binding exists:
    - Lookup binding by (tenant_id, automation_version_id)
    - If binding.status='active', call WRK Platform PATCH /wrk-api/workflows/{workflow_id}/deactivate using workflow_id from binding (never from client payload)
    - If deactivation fails → do NOT archive; return domain error archive_remote_deactivation_failed
    ↓
Begin DB transaction (only after remote deactivation succeeds or no active binding exists):
    - Re-select automation_version FOR UPDATE scoped by (tenant_id, id)
    - Re-validate current_status is still in the allowed set; if not, abort with 409 (invalid_status_transition or concurrency_conflict if hints used)
    - Update automation_version.status='Archived', set archived_at=now(), archived_by_user_id=actor_user_id, updated_at=now()
    - If a workflow_binding exists, set workflow_bindings.status='inactive' for that version
    - (Optional, future policy) If no other non-archived versions remain for (tenant_id, project_id), update projects.status='Archived' inside the same transaction
    - Insert audit log entry for this archive operation
    ↓
Commit transaction
    ↓
Send notifications scoped to the automation’s tenant/project (email + in-app)
    ↓
Return success (200) with idempotent behavior if the version was already archived and nothing else changed
```

---

## API Endpoints

- **PATCH `/v1/automation-versions/{id}/status`**
  - Body:
    - `status="Archived"` (required for Flow 35).
    - Optional optimistic concurrency hints: `last_known_status`, `last_known_updated_at` (409 on stale hints when a mutation would occur).
    - Optional `archive_reason` notes recorded in audit metadata.
  - Behavior:
    - Shared router dispatches to Flow 35 helper when `status='Archived'`.
    - Flow 35 helper owns WRK Platform deactivation + DB updates.
    - Idempotency: if already archived and no new side effects, return `200 { already_applied: true, automation_version: … }` even if hints are stale.

- **DELETE `/v1/automations/{id}`**
  - Admin-only orchestrator:
    - Loads the automation (tenant-scoped) plus all automation_versions.
    - For each version, calls the same status router with `status='Archived'` (invoking Flow 35 helper); honors the same deactivation + validation rules.
    - SHOULD be implemented as all-or-nothing: either every version archives successfully or none do (single transaction or saga rollback).
    - DELETE MUST NOT bypass Flow 35 or skip WRK Platform deactivation.

---

## Database Changes

- **automation_versions**:
  - `status='Archived'`
  - `archived_at=now()`
  - `archived_by_user_id=actor_user_id`
  - `updated_at=now()`
  - Flow 35 MUST NOT mutate pricing/billing/commitment fields.

- **workflow_bindings**:
  - For the archived version: `status='inactive'` if binding existed/was active.
  - No new bindings are created.

- **projects**:
  - v1 default: no change to `projects.status`.
  - Future project-archive policy must run “no other non-Archived versions remain” check inside the same transaction before updating `projects.status='Archived'`.

- **audit_logs**:
  - Insert `{ action_type='archive_automation', resource_type='automation_version', resource_id=automation_version_id, tenant_id, actor_user_id, metadata_json={ previous_status, new_status:'Archived', had_active_binding, workflow_binding_id, invoked_via, archive_reason? } }`.
  - Metadata MUST NOT contain secrets, workflow tokens, or credentials.

---

## Notifications

- **Email**: template `automation_archived` to the automation/project owner + collaborators within the same tenant.
- **In-app**: notifications to users with access to the project/automation (same tenant scope).

All notifications should fire after the DB transaction commits and be idempotent (e.g., de-dup by `(automation_version_id, 'automation_archived')`).

---

## Exceptions

- **404 automation_not_found**: no `(tenant_id, automation_version_id)` row visible to caller.
- **403 forbidden**: caller lacks required role for this project/automation or outside admin scope for DELETE.
- **409 invalid_status_transition**:
  - current_status not in allowed set for archiving; or
  - policy prohibits `Live → Archived` without replacement.
- **409 concurrency_conflict** (optional): when `last_known_*` hints are provided and stale while a mutation would occur.
- **archive_remote_deactivation_failed**: WRK Platform deactivate call failed; automation stays unarchived. Server should log + alert ops.
- Any unexpected DB failure MUST roll back, leaving the automation_version non-archived.

---

## Manual Intervention

- Ops/admin may archive automations manually via admin tools (subject to policy).
- Clients may request archive; product policy may require ops/admin approval.
- If WRK Platform deactivation repeatedly fails, ops may need to reconcile manually in WRK Platform before retrying Flow 35.

---

## Summary

This document covers all major user flows in WRK Copilot, including:

- **Identity & Access**: SSO-first signup with workspace creation, invitation, login, password reset (local only), API keys, workspace switching, partner API access (optional/future)
- **Automation Lifecycle**: Create, requirements capture & AI ingestion, update blueprint, move to pricing (with auto-quote), create version, update status (with state machine including Paused state), pause/resume workflows
- **Pricing & Billing**: Auto-generate and send quote (Flow 11), ops adjust quote, client view/accept/reject, sign (with payment), volume adjustments (with credit/payment checks), overrides, billing finalization
- **Build & Deployment**: Request build, orchestration (future/v1 manual), QA (manual status changes in v1), deploy to production (manual status changes in v1), credentials management, credential failure handling
- **Execution & Monitoring**: Run event webhooks, usage aggregation, threshold alerts
- **Collaboration**: Messages (chat-like, real-time), tasks (auto-generated by system), task status updates
- **Admin & Ops**: Associate client with existing workspace (users create own accounts), update health status, archive automation

**Key Architectural Alignments**:
- **Workspace-Centric UX**: Users authenticate first, then create workspace (name + subdomain) if they don't belong to any workspace. Workspace = Tenant (1:1 mapping, no extra abstraction). Access via `https://{workspace_slug}.wrk.com/app`. Terminology: "Workspace" in UX, "tenant" in backend/DB. The first user who creates a workspace is that workspace's admin/owner. Invited users join that same workspace/tenant, they don't create new workspaces/clients.
- **SSO-First Authentication**: SSO/IdP is primary mode with minimal friction (no email verification, no password setup). If user already mapped to workspace, skip workspace creation. Local email/password is fallback with configurable verification.
- **Workspace-Scoped Invitations**: Admins invite colleagues into their current workspace. Invited users land directly in the inviting workspace.
- **Multi-Workspace Support**: Users can belong to multiple workspaces via memberships table. Workspace switcher in UX, multi-tenant logic in backend.
- **State Machine**: Automation status transitions follow strict state machine rules (see Automation Status State Machine section). Includes 'Paused' status (client-driven) vs 'Blocked' (system/ops-driven). Supports backward transitions from QA & Testing.
- **Auto-Pricing**: In v1, pricing is auto-generated and immediately sent to the client when a project is created (Flow 11). Ops can adjust existing quotes but don't originate them.
- **Project Creation Timing**: Projects created when moving from "Intake in Progress" to "Needs Pricing", not during automation creation
- **Task Creation Timing**: Build checklist tasks created when build starts or when project created for pricing, not during automation creation. Tasks are auto-generated by the system based on missing items/validation rules.
- **Manual Status Changes (v1)**: In v1, status changes for QA & Testing → Ready to Launch and Ready to Launch → Live are performed manually by ops team in admin panel, not automatic.
- **User Account Creation**: Users create their own accounts/workspaces via signup flow. Ops does not create client accounts/workspaces; ops can only associate existing workspaces with client records.
- **Audit Logging**: All user-initiated changes to system state must create audit log entries, even if not explicitly called out in each flow.
- **Tenant Isolation**: All flows enforce `tenant_id` from authenticated session (JWT or API key), never from request parameters
- **Payment Integration**: Quote signing includes payment method collection and setup fee charging. Volume adjustments check credit/payment before applying changes.
- **Credentials Security**: Credentials stored in secrets manager, only references in database

**Flow Structure**: Each flow includes Trigger, Flow Diagram, API Endpoints, Database Changes, Tenant Isolation (where relevant), Notifications, Exceptions, and Manual Intervention points.

These flows serve as the foundation for backend API design and implementation, aligned with the WRK Copilot Backend Architecture (modular monolith, Neon, workers, webhooks, HMAC, idempotency).


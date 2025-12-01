### Flow 24: Deploy to Production

**Note**: In v1, status changes here ('Ready to Launch' → 'Live') are performed manually by the ops team in the admin panel. There is no automatic state change based purely on deployments succeeding.

**Trigger**: Ops user clicks "Mark as Live / Deploy to Production" in admin panel

---

### Access & Auth

- **Auth**: JWT session (ops/admin console). Customer API keys (`wrk_api_…`) are invalid (401/403).
- **Authorization**:
  - Caller must be an ops/admin user with deploy privileges (e.g., roles `{ops_admin, ops_build, ops_release, admin}`).
  - Caller MUST belong to (or have delegated access to) the tenant that owns the automation_version.
- **Tenant isolation**:
  - `tenant_id` comes from the auth context or the automation_version’s owning tenant in the admin panel—never from client payload/query.
  - All reads/writes MUST filter by `(tenant_id, automation_version_id)` and associated project rows.
  - AuthN/AuthZ MUST be evaluated before exposing automation state or workflow_binding details.
- **Router behavior for `PATCH /v1/automation-versions/{id}/status`**:
  - When `requested_status='Live'`, the router loads the automation_version (tenant-scoped) and:
    - If `current_status='Ready to Launch'`, dispatches to Flow 24 (deploy helper).
    - If `current_status∈{'Paused','Live'}`, dispatches to Flow 24B (resume helper) for resume/idempotent handling.
    - Otherwise returns 409 `invalid_status_transition` (no other flow handles it).

**Flow Diagram**:
```
Status is 'Ready to Launch'
    ↓
Ops user manually clicks "Mark as Live / Deploy to Production"
    ↓
Router sees requested status='Live' → dispatches to Flow 24 deploy helper (current_status must be 'Ready to Launch')
    ↓
Deploy helper validates auth/tenant isolation (auth already passed) and re-loads automation_version/project/workflow_binding
    ↓
Validate workflow_binding exists and is in a deployable state (e.g., 'provisioned'/'ready'); fail with 409 precondition_failed if not
    ↓
Call WRK Platform API to activate workflow (`PATCH /wrk-api/workflows/{workflow_id}/activate`), using `workflow_id` loaded from the persisted workflow_binding (never from client payload/query)
    ↓
[WRK Platform activates workflow]
    ↓
Single DB transaction (only after activation succeeds):
    - Re-select automation_version (+ related rows) `FOR UPDATE` scoped by `(tenant_id, automation_version_id)`
    - Re-validate `automation_version.status` is still `'Ready to Launch'`; if not, abort with 409 (`concurrency_conflict` or `invalid_status_transition`)
    - Update automation_version.status='Live' (with deployment metadata)
    - Archive previous Live version (if any) and mark previous workflow_binding inactive
    - Update new workflow_binding.status='active'
    - Insert audit log entry (+ optional project.status='Live')
    ↓
Send notifications
    ↓
Ensure monitoring/observability pipelines track run events for the newly Live version (handled by activation hooks)
```

**Note**: Keep the same backend effects (status updates, previous Live version archived, etc.), but the trigger is ops user clicking "Mark as Live / Deploy to Production" in the admin panel. No mention of automated state transitions based solely on system checks; they can be added later as an enhancement.

**API Endpoints**:
- `PATCH /v1/automation-versions/{id}/status` (status='Live') – Manual trigger by ops.
  - Body requirements:
    - `status="Live"` (required).
    - `last_known_status` / `last_known_updated_at` (optional optimistic concurrency hints).
    - `deployment_reason` / notes (optional; recorded in audit logs).
  - Behavior:
    - Router inspects requested status and current status (via DB) to choose Flow 24 vs Flow 24B.
    - Flow 24 applies concurrency hints only when performing the Ready to Launch → Live mutation; mismatches return 409 `concurrency_conflict`.
    - If dispatching to Flow 24B (Paused → Live or Live idempotent), Flow 24B’s concurrency rules apply. All `'Live'` requests with `current_status∈{'Live','Paused'}` are handled by Flow 24B.
- `PATCH /wrk-api/workflows/{workflow_id}/activate` (external API)

**Database Changes**:
- All updates occur inside a single transaction AFTER WRK Platform activation succeeds:
  - Update `automation_versions` (status='Live', timestamps, deployment metadata).
  - Archive any previous Live version for the same `(tenant_id, project_id)`; mark its workflow_binding inactive.
  - Update the new workflow_binding row to `status='active'` (if not already).
  - Optionally set `projects.status='Live'` if product policy mirrors automation state.
  - Insert `audit_logs` (action_type='deploy', capturing previous/new statuses, workflow_binding ids, deployment_reason, invoked_via, actor).
- Invariant: after commit, there MUST be at most one automation_version with `status='Live'` per `(tenant_id, project_id)`. If archiving/deactivation fails at the DB layer, roll back the transaction (no double-live worlds).

**Notifications**:
- **Email**: Automation live notification to client (template: `automation_live`)
- **Email**: Deployment success to ops team (template: `deployment_success`)
- **In-app**: Notification to all collaborators
- **Slack** (optional): Automation live alert

**Exceptions**:
- **WRK Platform activation fails**: Do NOT set `status='Live'`. Retry per policy; if exhausted, leave automation_version in `'Ready to Launch'` (or transition to a defined deployment-error state owned by Flow 13) and alert ops.
- **Previous version DB updates fail**: Roll back the transaction and return `deployment_failed` (500/502); never commit two Live versions.
- **Previous version remote deactivation fails**: Commit the DB transaction (new Live, old Archived) and log a high-severity alert; remote system reconciliation happens separately.
- **No workflow_binding / binding not deployable**: Return 409 `precondition_failed` (no mutation); Flow 21/build must complete first.
- **Invalid status transition**: Return 409 `invalid_status_transition` when `current_status ∉ {'Ready to Launch','Live','Paused'}` for a deploy/resume request.

**Manual Intervention**: 
- Ops team manually clicks "Mark as Live / Deploy to Production" in admin panel
- Ops team can manually activate in WRK Platform if API fails
- Ops team reviews before deploying (optional approval step)

---

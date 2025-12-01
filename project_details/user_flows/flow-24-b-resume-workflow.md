### Flow 24B: Resume Workflow

**Scope**  
Flow 24B owns the lifecycle transition `Paused → Live` for an `automation_version`. It updates `automation_versions.status='Live'`, re-enables new runs, records audit logs, and emits notifications. Flow 24B never edits pricing/quotes/change-orders, never touches billing artifacts (invoices, usage, commitments), and never modifies `projects.pricing_status`. All other lifecycle transitions remain owned by Flow 13 (plus Flows 21/23/24A where applicable).

**Trigger**  
Client or ops user clicks “Resume Workflow” on a Paused automation (or calls the resume API).

---

### Access & Auth

- **PATCH `/v1/automation-versions/{id}/status`**
  - Body:
    - `status` (required) MUST be `"Live"` for Flow 24B.
    - Optional `last_known_status` / `last_known_updated_at` for optimistic concurrency.
  - Auth: JWT session.
  - Authorization:
    - Caller must belong to the tenant that owns the automation_version.
    - Caller must have resume permission (roles such as `{project_owner, project_admin, ops_build, ops_qa, ops_billing, admin}`).
    - Customer API keys (`wrk_api_…`) are invalid (401/403).
  - Router behavior (shared `PATCH /v1/automation-versions/{id}/status`):
    - If requested status ≠ `"Live"`, route to other flows (13/21/23/24A); Flow 24B is not invoked.
    - If requested status = `"Live"`, the router loads the automation_version (tenant-scoped) and:
      - If `current_status='Ready to Launch'`, dispatches to Flow 24 (deploy helper).
      - If `current_status∈{'Paused','Live'}`, dispatches to Flow 24B’s resume helper, which then:
        - Performs the `Paused → Live` transition when `current_status='Paused'`.
        - Returns `200 { already_applied: true, automation_version: … }` when `current_status='Live'`.
      - Otherwise returns 409 `invalid_status_transition` (router does not reroute elsewhere).
  - Concurrency hints:
    - If a mutation (Paused→Live) would occur and hints mismatch → 409 `concurrency_conflict`.
    - If no mutation is needed (already `'Live'`), ignore mismatched hints and return the idempotent 200 response.

- **POST `/v1/automation-versions/{id}/resume`**
  - Optional body: `reason`, `last_known_status`, `last_known_updated_at`.
  - Auth/authorization identical to PATCH.
  - Behavior: convenience wrapper that always calls the shared resume helper when the intent is “resume”; MUST go through the same router/state-machine logic (requested status = `"Live"`).

- **Tenant & security rules**
  - `tenant_id` derived from auth context only; ignore payload/query hints.
  - All reads/writes filter by `(tenant_id, automation_version_id)` and join to projects when needed.
  - Apply per-user/per-IP rate limiting to prevent pause/resume flapping.
  - AuthN/AuthZ MUST be evaluated before exposing whether an automation is Paused vs. Live vs. any other status.
  - All admin/ops resume actions MUST be captured in `audit_logs`.

---

### Flow Diagram (textual)
```
User/ops clicks “Resume Workflow” (or calls API)
    ↓
Shared router sees requested status = 'Live'
    ↓
Validate auth/permissions/tenant isolation
    ↓
Call shared resume helper
    ↓
Helper loads automation_version (tenant-scoped), checks current_status
    ↓
If current_status='Paused' → attempt Paused→Live transition
If current_status='Live' → return already_applied (idempotent)
Else → 409 invalid_status_transition
    ↓
Begin DB transaction (only when mutation is required)
    - Re-select automation_version (+ project) FOR UPDATE
    - Re-validate status='Paused'
    - Evaluate concurrency hints if provided
    - Update automation_version.status='Live' (adjust pause metadata per policy)
    - Optionally update project.status if product policy mirrors active automation (default: no change)
    - Insert audit log entry
    ↓
Commit transaction
    ↓
Ensure orchestration layer treats status='Live' as runnable
    ↓
Send notifications (email / in-app / Slack)
    ↓
Return 200 with updated automation_version
```

---

### Shared Resume Helper

All entry points MUST call a single helper:
```
request_resume(tenant_id, automation_version_id, actor_context, concurrency_hints?)
```
`actor_context` includes `user_id`, roles, and `invoked_via` (`'patch_status' | 'resume_endpoint' | 'admin_panel'`). The helper centralizes tenant/permission checks, state validation (`Paused → Live`), concurrency handling, atomic DB updates, audit logging, and returns `{ automation_version, already_applied }`.

---

### Database Changes (single transaction)

- **automation_versions**
  - Preconditions: row re-selected `FOR UPDATE` filtering by `(tenant_id, id)`; if a `Paused → Live` mutation is to be applied, status must still be `'Paused'` at commit. If the row is already `'Live'`, the helper returns idempotent success and no mutation occurs.
  - Updates:
    - `status='Live'`
    - `updated_at=now()`
    - Optional: retain pause metadata (e.g., `paused_at`, `paused_by`) for historical reference.
  - Flow 24B MUST NOT modify pricing/quote/billing columns.

- **projects** (optional)
  - Recommended v1: leave `projects.status` unchanged; resume is automation-scoped.
  - If future policy requires mirroring to project-level status, document separately and reference here.
  - Never modify `projects.pricing_status`.

- **audit_logs**
  - Insert `{ action_type='resume_workflow', resource_type='automation_version', resource_id, tenant_id, actor_user_id/token }` with metadata including `previous_status`, `new_status='Live'`, `project_previous_status`, `project_new_status` (if changed), `invoked_via`, `had_resume_permission`, `concurrency_hint_used`.

Transaction MUST be atomic—partial updates are not permitted.

---

### Runtime / Orchestration Behavior

- Resume is a lifecycle flag; enforcement occurs in trigger/execution layers.
- Every trigger entry point (scheduled, webhook, “Run Now”, replay, etc.) MUST read `automation_versions.status` from the authoritative DB (or strongly consistent cache) immediately before enqueueing a run. Only active states (including `'Live'`) may run; `'Paused'` MUST block new runs. No separate, eventually consistent “enabled/disabled” flag may override or lag the DB status for pause/resume semantics.
- After resume:
  - New runs are allowed immediately (subject to other blockers).
  - In-flight runs from before the resume continue unaffected.
  - Flow 24B MUST NOT adjust billing periods, invoices, rated usage, commitments, or pricing artifacts.

---

### Notifications (post-commit, idempotent)

- **Email** (`workflow_resumed`): to automation/project owner (plus optional AM/ops list) with tenant/project/automation names, actor, timestamp.
- **In-app**: notify workspace collaborators with link to automation details and current status.
- **Slack / Ops channel** (optional): broadcast for high-value automations.

Notifications MUST enqueue after commit and SHOULD be idempotent (e.g., de-duplicate by automation_version_id + event id).

---

### Exceptions & Idempotency

- `invalid_status_transition` (409): current status is neither `'Paused'` nor `'Live'`. The resume helper returns this after re-reading the row; the router still dispatches based on `requested_status='Live'`.
- `concurrency_conflict` (409): `last_known_*` hints mismatch only when a `Paused → Live` mutation would occur (row still `'Paused'` but hints stale); idempotent `Live → Live` responses MUST NOT use 409 even if hints mismatch.
- `automation_not_found` (404): no `(tenant_id, id)` row.
- `forbidden` (403): caller lacks resume permission/tenant access.
- **Idempotent repeat (MUST)**: If `automation_versions.status` already equals `'Live'` and Flow 24B would not change additional fields, return `200 { already_applied:true, automation_version:… }` even when `last_known_*` hints are stale. Only return 409 when another state change occurred and a mutation would now be invalid.

---

### Manual Intervention

- Routine resumes require no manual ops.
- Ops can review `audit_logs` to see who resumed and when.
- Billing or commercial adjustments tied to pause/resume cycles are handled separately via Flows 11/16/17/20; Flow 24B does not imply billing changes.

---

## Execution & Monitoring Flows

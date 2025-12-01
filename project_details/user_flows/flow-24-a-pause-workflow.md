### Flow 24A: Pause Workflow

**Scope**  
Flow 24A owns the lifecycle transition `Live → Paused` (and the explicit `Ready to Launch → Paused` edge if that state is considered launch-ready in your state machine) for an `automation_version`. It is responsible for updating the status to `'Paused'`, ensuring new runs are not triggered while paused, and auditing/notifying stakeholders. Flow 24A never edits pricing, quotes, billing artifacts, or `projects.pricing_status`. Launch/operational lifecycle outside the pause/unpause pair (`Live ↔ Paused`) remains owned by Flow 13.

**Trigger**  
Client or ops user clicks “Pause Workflow” on a Live automation (or calls the public API).

---

### Access & Auth

- **PATCH `/v1/automation-versions/{id}/status`**
  - Body MUST include `{"status":"Paused"}`.
  - Auth: JWT session.
  - Authorization:
    - Caller must belong to the tenant that owns the automation_version.
    - Caller must have pause permissions on the project (e.g., roles in `{project_owner, project_admin, ops_build, ops_qa, ops_billing, admin}` per product policy).
  - Router behavior:
    - Whenever the requested status is `'Paused'`, the router invokes the shared pause helper after auth/tenant scoping.
    - The helper inspects the persisted `current_status` and:
      - Mutates when `current_status ∈ {'Live','Ready to Launch'}`.
      - Returns `200 { already_applied: true, automation_version: … }` when `current_status='Paused'`.
      - Returns 409 `invalid_status_transition` for all other states. The router does not reroute these calls to other flows.

- **POST `/v1/automation-versions/{id}/pause`**
  - Convenience wrapper around the same internal helper used by the PATCH endpoint.
  - Auth & authorization identical to PATCH; MUST NOT bypass the state machine.

- Tenant & security rules:
  - `tenant_id` MUST be derived from auth context; ignore tenant hints in payloads/query params.
  - All reads/writes MUST filter by `(tenant_id, automation_version_id)` (and associated project) to enforce tenant isolation.
  - Customer API keys (`wrk_api_…`) are invalid for pause operations (401/403).
  - Apply per-IP / per-user rate limiting to mitigate pause/unpause flapping.
  - AuthN/AuthZ MUST be evaluated before exposing whether an automation is Live vs Paused vs any other status.

Current status MUST be derived from the database by the pause helper; client-supplied “from” statuses are ignored. When the requested status is `'Paused'`, the router forwards the request to the pause helper (after tenant scoping); the helper then enforces the state machine (mutate, idempotent, or 409). No other flow should be invoked for this transition.

---

### Flow Diagram (textual)
```
User/ops clicks “Pause Workflow” (or calls API)
    ↓
Shared router sees requested status = 'Paused'
    ↓
Validate auth/permissions/tenant isolation
    ↓
Call Flow 24A pause helper
    ↓
Pause helper loads automation_version (tenant-scoped), inspects current_status
    ↓
If Live/Ready to Launch → mutate to Paused
If Paused → return already_applied (idempotent)
Else → 409 invalid_status_transition
    ↓
Validate transition (must be Live/Ready to Launch → Paused)
    ↓
DB transaction:
    - Re-select automation_version (+ project) FOR UPDATE
    - Re-validate current_status (defend against races)
    - Update automation_version.status='Paused' (and paused_at / paused_by / reason if present)
    - Optionally update project.status='Paused' (per product policy)
    - Insert audit log entry
    ↓
Commit transaction
    ↓
Apply pause guard in orchestration layer by honoring status (no separate laggy flag; status check itself blocks new runs)
    ↓
Send notifications
    ↓
Return 200 with updated automation_version
```

---

### API Details

- **PATCH `/v1/automation-versions/{id}/status`**
  - Request body:
    - `status` (required) — MUST be `"Paused"` for Flow 24A.
    - `reason` (optional) — freeform text (≤ 1 000 chars).
    - `last_known_status` / `last_known_updated_at` (optional) — concurrency hints; if a mutation would be applied and these hints mismatch, return 409 `concurrency_conflict`. If no mutation is needed (e.g., already `'Paused'`), ignore mismatches and return idempotent 200.
  - Behavior:
    - Router verifies requested status = `'Paused'`, derives tenant context, and forwards to the shared pause helper with any concurrency hints and reason.
    - The helper loads the row, evaluates `last_known_*` only when it is about to apply a `Live/Ready → Paused` mutation, and enforces the state machine (mutate, idempotent, or 409).

- **POST `/v1/automation-versions/{id}/pause`**
  - Request body: optional `reason`.
  - Behavior: thin wrapper that calls the shared helper.

All entry points (including future auto-pause logic) MUST call a shared helper, e.g.:
```
request_pause(tenant_id, automation_version_id, actor_context, reason?, concurrency_hints?)
```
The helper centralizes permission checks, state validation, idempotency, and audit logging.

---

### Database Changes (single transaction)

- **automation_versions**
  - Preconditions: row re-selected `FOR UPDATE`; if a mutation will be applied the status must still be `'Live'` (or `'Ready to Launch'` if allowed) at commit. If the row is already `'Paused'`, the helper returns idempotent success and skips the mutation.
  - Updates:
    - `status='Paused'`
    - `updated_at=now()`
    - Optional metadata: `paused_at=now()`, `paused_by_user_id`, `paused_reason`.
  - Flow 24A MUST NOT change pricing/quote/billing columns.

- **projects** (optional; only if your project model mirrors automation pause)
  - Recommended v1 behavior: leave `projects.status` unchanged (pause is automation-scoped). If product policy later requires project-level pause, document that decision separately and reference it here.
  - Flow 24A MUST NOT modify `projects.pricing_status`.

- **audit_logs**
  - Insert row with:
    - `action_type='pause_workflow'`
    - `resource_type='automation_version'`
    - `resource_id`, `tenant_id`, `actor_user_id` (or token/system actor)
    - `metadata` including `{ previous_status, new_status:'Paused', project_previous_status, project_new_status, reason, invoked_via ∈ {'patch_status','pause_endpoint','admin_panel'}, had_pause_permission, concurrency_hint_used }`

Transaction MUST be atomic—no partial updates on failure.

---

### Runtime / Orchestration Behavior

- Pausing is purely a lifecycle flag; enforcement happens at trigger/execution layers.
- Any trigger entry point (scheduled, webhook, manual “Run Now”, replay, etc.) MUST read `automation_versions.status` from the authoritative database (or a strongly consistent cache) immediately before enqueueing a run. Cached/asynchronous copies MUST NOT override the DB source of truth, and no separate, eventually consistent feature flag may supersede the status check. Only `status='Live'` (and other explicitly allowed active states) may run; `status='Paused'` MUST block new triggers.
- While `status='Paused'`:
  - New runs are blocked; triggers either drop invocations or return a clear “automation paused” error.
  - In-flight runs are not cancelled in v1; they complete naturally. Hard-stop semantics are out of scope.
- Flow 24A MUST NOT change billing periods, invoices, rated usage artifacts, or any pricing/commitment fields. Pausing affects future triggers only; billing for already-consumed usage is handled by Flows 11/16/17/20.

---

### Notifications (post-commit, idempotent)

- **Email** (`workflow_paused`)
  - Recipients: automation/project owner, optional account manager/ops list.
  - Payload: automation/project name, tenant, who paused, timestamp, optional reason.

- **In-app**
  - Notify workspace collaborators; include link to automation details and current status.

- **Slack / Ops channel** (optional)
  - Alert for high-value automations: include actor and reason.

---

### Exceptions & Idempotency

- `invalid_status_transition` (409): current status is neither `'Live'` nor `'Ready to Launch'` nor `'Paused'`. The pause helper returns this after re-reading the row; the router still dispatches based on `requested_status='Paused'`.
- `concurrency_conflict` (409): `last_known_*` hints mismatch only when the helper intends to mutate state (i.e., row still `'Live'/'Ready to Launch'`).
- `automation_not_found` (404): no row for `(tenant_id, id)`.
- `forbidden` (403): caller lacks pause permissions.
- Idempotency (MUST, enforced inside the helper):
  - If `automation_versions.status` is already `'Paused'` and no additional changes would occur, the helper returns `200 { already_applied: true, automation_version: … }` (even if concurrency hints mismatch). Only use `409` when another actor moved the automation to a different state and a mutation would now be invalid.

---

### Manual Intervention

- None for routine pauses; action is user/ops-driven.
- Ops may investigate pauses via audit logs or coordinate with billing separately (Flows 11/16/17/20).
- Resume/unpause (`Paused → Live`) is handled by Flow 24B.

---

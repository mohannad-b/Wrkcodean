### Flow 23: QA Testing & Approval

**Note**: In v1, status changes here ('QA & Testing' → 'Ready to Launch', 'QA & Testing' → 'Build in Progress', etc.) are performed manually by the ops team in the admin panel. There is no automatic state change based purely on tests passing or deployments succeeding. Flow 23 is a QA sub-flow under the broader lifecycle engine (Flow 13). It only owns manual transitions out of QA & Testing and the recording of QA test runs. It never edits pricing fields, never changes quote status, never manipulates billing artifacts, and never touches `projects.pricing_status` (owned by Flows 11/16/17/20).

**Trigger**: Ops team runs QA tests and manually updates status

**Flow Diagram**:
```
Status is 'QA & Testing'
    ↓
Ops team runs test executions
    ↓
Test results recorded (success/failure)
    ↓
Ops/user action in admin panel:
    - Mark as Ready to Launch
    - Mark as Needs Fixes
    - Flag commercial/pricing concerns (no status change)
    ↓
If marked Ready to Launch:
    - Update automation_version.status = 'Ready to Launch'
    - Update project.status = 'Ready to Launch'
If marked Needs Fixes:
    - Update automation_version.status = 'Build in Progress'
    - Update project.status = 'Build in Progress'
    - Create qa_fix tasks (pending)
    - Notify solutions engineer
If flagged for pricing/commercial concerns:
    - No status change
    - Create qa_pricing_review task / notify pricing ops
    - Any re-pricing happens via Flow 11/17 (new quote/change order); Flow 23 MUST NOT set `automation_versions.status='Needs Pricing'`
    ↓
Create audit log entry
    ↓
Send notifications / await client approval
```

### Access & Auth

- **POST `/v1/automation-versions/{id}/test`**
  - Auth: JWT session.
  - Authorization: caller must belong to the tenant that owns the automation_version and have QA/test permissions (e.g., roles in `{ops_build, ops_qa, admin}`).
- **GET `/v1/automation-versions/{id}/test-results`**
  - Auth: JWT session.
  - Authorization: tenant members with read access to the project; ops/admin can see full details.
- **PATCH `/v1/automation-versions/{id}/status`** (QA transitions owned by Flow 23)
  - Auth: JWT with role in `{ops_build, ops_qa, admin}`.
  - Authorization: automation_version and project must belong to the authenticated tenant.
  - Flow 23 only accepts transitions `'QA & Testing' → 'Ready to Launch'` or `'QA & Testing' → 'Build in Progress'`. Any other requested source/target MUST return 409 `invalid_status_transition` with no state change.

Tenant & security rules:
- `tenant_id` MUST always be derived from the auth context; ignore any tenant_id in payloads or query params.
- All reads/writes MUST filter by `(tenant_id, automation_version_id/project_id)` to enforce tenant isolation.
- Customer API keys (`wrk_api_…`) are invalid for all QA endpoints (return 401/403).
- Apply per-IP / per-user rate limiting to `POST /test` and `PATCH /status` to prevent abuse.

---

**API Endpoints**:
- `POST /v1/automation-versions/{id}/test` – Records a QA test execution as an append-only artifact (each submission inserts a new immutable row, never mutates or deletes prior runs) and **never** changes automation/project status automatically; all lifecycle transitions remain manual in v1.
- `GET /v1/automation-versions/{id}/test-results` – Read-only list of historical QA runs (no side effects).
- `PATCH /v1/automation-versions/{id}/status` – Manual status update by ops; Flow 23 only allows `'QA & Testing' → 'Ready to Launch'` or `'QA & Testing' → 'Build in Progress'`. Requests SHOULD include `last_known_status` / `last_known_updated_at` for optimistic concurrency; if supplied hints do not match the current row, the server MUST return 409 `concurrency_conflict` and MUST NOT mutate automation_version or project status. Flow 23 is only invoked by the shared `PATCH /v1/automation-versions/{id}/status` router when the current status is `'QA & Testing'` and the requested status is in `{ 'Ready to Launch', 'Build in Progress' }`; the router MUST derive current status from the database row, treat any client-supplied “from_status” hints as advisory-only, and MUST NOT call Flow 23 for any other combination (those route to Flow 13, or Flow 21 for `Ready for Build → Build in Progress`). Any other requested transition on this endpoint MUST NOT execute Flow 23 logic.

**Database Changes**:
- `automation_versions`:
  - `'QA & Testing' → 'Ready to Launch'` when QA passes.
  - `'QA & Testing' → 'Build in Progress'` when fixes are needed.
  - Flow 23 MUST NOT move automation_versions into any other state (`Needs Pricing`, `Live`, `Paused`, etc.). `Live/Paused` transitions remain exclusively owned by Flow 13’s launch/operational lifecycle; QA can never launch or operate an automation directly.
- `projects`:
  - When QA passes, set `projects.status='Ready to Launch'`.
  - When reverting, set `projects.status='Build in Progress'`.
  - Flow 23 MUST NOT modify `projects.pricing_status`.
- `tasks`:
  - Functional fixes: insert/upsert `{ context_type='project', context_id=project.id, kind='qa_fix', status='pending' }` (optionally include `template_slug`/metadata) with uniqueness on `(context_type, context_id, kind, template_slug)`.
  - Pricing/commercial concerns (optional v1 feature): insert/upsert `{ context_type='project', context_id=project.id, kind='qa_pricing_review', status='pending' }` with the same uniqueness guard; no lifecycle status change occurs here (Flows 11/17 own re-pricing).
- Flow 23 MUST NOT create, modify, or void quotes, change-orders, pricing overrides, or other commercial artifacts; any pricing follow-up stemming from QA concerns is always executed via Flows 11/17.
- `audit_logs`:
  - `action_type='qa_test_run'` for `POST /test` (persisting inputs/results).
  - `action_type='qa_status_update'` for manual transitions with metadata including:
    - `automation_version_previous_status`
    - `automation_version_new_status`
    - `project_previous_status`
    - `project_new_status`
    - `qa_summary` / `qa_notes`
    - `invoked_via='admin_panel'`
    - `qa_decision ∈ {'ready_to_launch','needs_fixes','pricing_concerns_only'}`
    - Flags such as `has_pricing_concerns`, `created_qa_fix_tasks`, `created_qa_pricing_review_task`.
    - Decision semantics:
      - `'ready_to_launch'` → status changed to `'Ready to Launch'`.
      - `'needs_fixes'` → status changed to `'Build in Progress'` and `qa_fix` tasks created.
      - `'pricing_concerns_only'` → no lifecycle status change; optional `qa_pricing_review` task created for Flow 11/17 follow-up.

**Notifications**:
- Emails:
  - `qa_passed` – QA passed; automation marked `'Ready to Launch'` (may include test summary).
  - `qa_failed` – QA failed/needs fixes; automation reverted to `'Build in Progress'` and `qa_fix` tasks created.
- In-app:
  - Notify client/workspace owners when automation is `'Ready to Launch'` and awaiting client approval.
  - Notify solutions engineer / build owner when `qa_fix` tasks are created.
- Optional:
  - Notify pricing ops or create a task when a `qa_pricing_review` task is inserted (no lifecycle change).

All notifications MUST enqueue after the transaction commits and SHOULD be idempotent.

**Exceptions**:
- Tests not run / partial failures → status remains `'QA & Testing'` until ops takes action.
- Invalid status transition → 409 `invalid_status_transition` (only `'QA & Testing' → 'Ready to Launch'` or `'QA & Testing' → 'Build in Progress'` are allowed; all other lifecycle transitions remain owned by Flow 13 / Flow 21).
- `concurrency_conflict` (409) → `last_known_status` / `last_known_updated_at` mismatch indicates another operator already changed the state.
- Idempotent repeat (MUST): if the automation is already in the requested status and Flow 23 would not create additional tasks, audit logs, or side effects, the server MUST return `200 { already_applied: true, automation_version: …, project: … }` and MUST NOT mutate state—even when `last_known_*` hints are stale. `concurrency_conflict` is reserved for scenarios where a mutation would occur but the hints do not match.

**Manual Intervention**: 
- Ops team runs QA tests manually
- Ops team manually clicks "Mark as Ready to Launch" or "Mark as Needs Fixes" in admin panel
- Client launch approval (where supported) is mediated by ops via the admin panel; Flow 23 only records the resulting `'Ready to Launch'` status change and does not expose a client-facing launch toggle.
- Ops team decides on partial failures

---

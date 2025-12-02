### Flow 21: Request Build

**Trigger**: Client or ops initiates a build request (manual or automatic), resulting in a validated transition from `Ready for Build` → `Build in Progress` via Flow 21. When auto-build is enabled (see Flow 16), the system SHOULD call the same internal “request build” helper used here rather than re-implementing build-start logic inline.

Flow 21 owns the lifecycle transition from `Ready for Build` → `Build in Progress` and the creation of the internal build artifacts (workflow_binding + build checklist tasks). It never edits pricing or quotes, and it never calls the billing provider or WRK Platform build APIs directly. Any actual workflow creation/orchestration is handled manually in v1 (or by the future Build Orchestrator in Flow 22).

---

### Access & Auth

| Endpoint | Auth | Authorization |
| --- | --- | --- |
| `PATCH /v1/automation-versions/{id}/status` (body `{"status":"Build in Progress"}`) | JWT session | Caller must belong to the tenant that owns the automation_version and have build/start permissions on the project (e.g., roles in `{project_owner, project_admin, ops_build, admin}`). This endpoint only supports the lifecycle transition `Ready for Build → Build in Progress`; any other source/target status MUST return 409 `invalid_status_transition`. |
| `POST /v1/admin/projects/{id}/request-build` | JWT with role ∈ `{ops_build, admin}` | Tenant-scoped; project must belong to the authenticated tenant. |

- `tenant_id` MUST always come from the auth context; ignore any tenant_id in payloads or query params.
- All reads/writes filter by `(tenant_id, automation_version_id/project_id)` to enforce tenant isolation.
- Customer API keys (`wrk_api_…`) are invalid for both endpoints (return 401/403).
- Apply per-IP / per-user rate limiting on both endpoints to prevent automated abuse.

Flow 21 is only invoked by the shared `PATCH /v1/automation-versions/{id}/status` router when the current status is `'Ready for Build'` and the requested status is `'Build in Progress'`. All other status transitions on that endpoint are handled by the main lifecycle engine (Flow 13) or QA flow (Flow 23) and MUST NOT execute Flow 21 logic.

**Flow Diagram**:
```
Client/ops requests build (manual button or automation trigger)
    ↓
*Flow 21 only allows `automation_versions.status:'Ready for Build' → 'Build in Progress'`. Any other source/target status MUST return 409 `invalid_status_transition`.*
    ↓
Validate prerequisites (see below):
    - Signed initial-commitment quote exists (resolved via the same pricing/contract helper used in Flows 16/17: `quote_type='initial_commitment'`, `status='signed'`, not voided/expired, effective now)
    - `projects.pricing_status='Signed'`
    - `automation_versions.status='Ready for Build'` (otherwise 409 `invalid_status_transition`)
    - Blueprint completeness check passes (all required sections populated + minimum viable steps); otherwise 400 `blueprint_incomplete`
    - No blocking tasks/flags marked as build blockers; otherwise 400 `missing_prerequisites` with details
    ↓
Single DB transaction:
    - Re-select automation_version + project FOR UPDATE
    - Idempotent shortcut if already Build in Progress with pending/active workflow_binding
    - Enforce prerequisites again
    - Update automation_versions.status='Build in Progress'
    - Update projects.status='Build in Progress', projects.checklist_progress=0
    - Upsert workflow_binding (status 'pending')
    - Upsert build checklist tasks (if missing)
    - Insert audit log
    ↓
Commit transaction
    ↓
Enqueue build job (server-derived payload only; optional in v1 – may be a no-op while builds remain manual)
    ↓
Send notifications
    ↓
[Build Orchestrator Worker picks up job]
```

*In v1 this enqueue step MAY be a no-op and builds can remain fully manual; Flow 22 documents the future worker-driven orchestration path.*

**API Endpoints**:
- `PATCH /v1/automation-versions/{id}/status` (body must include `{"status":"Build in Progress"}` and MAY include `last_known_status` / `last_known_updated_at` for optimistic concurrency). If the provided hint does not match the current row, the server MUST return 409 `concurrency_conflict` and MUST NOT start a build.
- `POST /v1/admin/projects/{id}/request-build` (admin only) - Manual trigger; server resolves the target automation_version by selecting the single version for that project with `status='Ready for Build'` (return 400/404 if none, 409 `multiple_ready_for_build_versions` if more than one).
- Both endpoints MUST call the same internal “request build” helper so prerequisites, idempotency, and status checks remain consistent across all entry points (including auto-build initiated from Flow 16).

All entry points (including auto-build from Flow 16) MUST call a shared `request_build(tenant_id, automation_version_id, actor_context, concurrency_hints?)` helper to centralize prerequisite checks, idempotency, and audit logging.

**Database Changes** (within one transaction):
- Re-select `automation_versions` and `projects` FOR UPDATE.
- If `automation_versions.status='Build in Progress'` **and** a `workflow_bindings` row already exists with `status IN ('pending','active')`, treat as idempotent → return 200 `{ already_applied: true }` (no updates).
- Otherwise:
  - Update `automation_versions.status='Build in Progress'`, `updated_at=now()`.
  - Update `projects.status='Build in Progress'`, `projects.checklist_progress=0`.
  - Upsert `workflow_bindings` (`automation_version_id`, `status='pending'`, unique constraint on `automation_version_id`).
  - Upsert build checklist `tasks` for the project (enforce uniqueness on `{context_type='project', context_id, kind='build_checklist', template_slug}` to avoid duplicates).
  - Insert `audit_logs` entry with `action_type='request_build'`, `resource_type='automation_version'`, `resource_id`, `tenant_id`, `user_id`, and metadata capturing `{ previous_status, new_status, project_previous_status, project_new_status, had_signed_quote, blueprint_check_passed, missing_prerequisites: [], invoked_via: ('patch_status' | 'admin_request_build' | 'auto_build_from_flow_16') }`.
- Transaction is atomic: any failure rolls back all state changes before enqueue/notifications.

Flow 21 is the only flow allowed to move an automation_version from `Ready for Build` to `Build in Progress`. All subsequent lifecycle transitions (`Build in Progress → QA & Testing → Ready to Launch → Live/Paused`) remain owned by Flow 13 and Flow 23; Flow 21 MUST NOT advance states beyond `Build in Progress` and MUST NEVER set `automation_versions.status` to `'QA & Testing'` or beyond.
It also MUST NOT modify `projects.pricing_status` or any quote/billing artifacts; those remain exclusively owned by Flows 11/16/17/20.

**Note**: Build checklist tasks are created here (when build starts), not during automation creation. The `checklist_progress` on projects is calculated as: percentage of tasks with `context_type='project'` and `kind='build_checklist'` that have `status='complete'`.

**Notifications** (post-commit):
- **Email**: Build started notification to client (`build_started`)
- **Email**: Build assignment notification to solutions engineer (`build_assigned`)
- **In-app**: Project owner notification
- **Slack** (optional): New build alert to ops channel

**Exceptions**:
- `quote_not_signed` (400) – triggered when the shared pricing/contract helper (used in Flows 16/17) cannot find an active, non-voided signed initial-commitment quote for this automation_version effective as of “now”.
- `blueprint_incomplete` (400) – blueprint completeness check failed.
- `missing_prerequisites` (400) – blocking tasks/flags remain open; response SHOULD list unmet items.
- `ready_for_build_version_not_found` (404) – admin `POST /v1/admin/projects/{id}/request-build` could not find any automation_version for that project with `status='Ready for Build'` (project exists but has no build-ready version).
- `multiple_ready_for_build_versions` (409) – more than one `Ready for Build` automation_version exists; ops must resolve ambiguity before retrying.
- `invalid_status_transition` (409) – source/target status not exactly `'Ready for Build' → 'Build in Progress'`. Flow 21 MUST NOT be used for any other lifecycle transitions (those remain owned by Flow 13).
- `build_already_in_progress` (409) – when `automation_versions.status='Build in Progress'` and the existing `workflow_bindings` row is in a terminal/error state (e.g., `status IN ('error','failed')`) that does **not** qualify for the idempotent shortcut; ops must resolve the build state manually before retrying.
- `concurrency_conflict` (409) – optional `last_known_status/last_known_updated_at` mismatch (see API note below).

**Manual Intervention**: 
- Ops team manually assigns build to solutions engineer
- Ops team reviews prerequisites before starting build

---

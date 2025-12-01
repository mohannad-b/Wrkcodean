### Flow 13: Update Automation Status

**Trigger**: Ops users (Studio/admin), client-facing flows (e.g., Flow 16 after quote signature), and internal workers advance an automation version through mid-lifecycle states, block/unblock it, or archive it.

> **Scope**: Flow 13 owns only these transitions on `automation_versions`:
> - `Awaiting Client Approval → Build in Progress`
> - `Build in Progress → QA & Testing`
> - `QA & Testing → Ready to Launch`
> - `Any non-terminal (except Archived) → Blocked`
> - `Blocked → previous_status`
> - `Any status → Archived` (restricted to admins/ops-release)
>
> Flow 13 **MUST reject** target statuses owned by other flows:
> - Pricing transitions (`Intake in Progress`, `Needs Pricing`, `Awaiting Client Approval`) → **Flow 11**.
> - Go-live/runtime transitions (`Ready to Launch → Live`, `Live ↔ Paused`) → **Flow 24/24A/24B**.
> - Workflow bindings, WRK Platform activation, and pause/resume semantics are handled exclusively in Flow 24-family flows and MUST NOT be implemented here.
>
> Flow 13 MUST NOT create projects or quotes (Flow 11), MUST NOT manipulate workflow bindings, and MUST NOT call WRK Platform runtime activation APIs.

---

### Canonical Status Model

| Status | Description | Owning Flow |
| --- | --- | --- |
| `Intake in Progress` | Blueprint authoring state after Flow 8/12; editable via Flow 10. | Flow 8 / Flow 12 |
| `Needs Pricing` | Pricing project created, blueprint locked. | Flow 11 |
| `Awaiting Client Approval` | Quote sent, awaiting client decision. | Flow 11 |
| `Build in Progress` | Signed quote; build tasks underway. | **Flow 13** |
| `QA & Testing` | Build complete; QA checklist active. | **Flow 13** / Flow 23 |
| `Ready to Launch` | QA complete; awaiting go-live approval. | **Flow 13** / Flow 24 |
| `Live` | Workflow active in WRK Platform. | Flow 24 |
| `Paused` | Runtime paused (client/ops). | Flow 24A / Flow 24B |
| `Blocked` | Forced stop due to critical issue (`blocked_reason` required). | **Flow 13** / Flow 26 |
| `Archived` | Historical version; no runtime traffic. | **Flow 13** / Flow 35 |

Statuses apply to `automation_versions`; parent `automations.status` remains `active` until Flow 35 archives the automation itself.

---

### Allowed Transition Matrix (Flow 13 Perspective)

| From | To | Owner | Core prerequisites |
| --- | --- | --- | --- |
| `Intake in Progress` | `Needs Pricing` | Flow 11 | Latest version, blueprint valid (Flow 9/10). Not handled here. |
| `Needs Pricing` | `Awaiting Client Approval` | Flow 11 | Project + sent quote. Not handled here. |
| `Awaiting Client Approval` | `Build in Progress` | **Flow 13** | Project exists; latest quote `status='signed'`; payment captured if required. |
| `Build in Progress` | `QA & Testing` | **Flow 13** | Build checklist 100%; artifacts/runbook attached. |
| `QA & Testing` | `Ready to Launch` | **Flow 13** | QA checklist approved; regression tests ≥ threshold; deployment & rollback plan recorded. |
| `Ready to Launch` | `Live` | Flow 24 | Workflow binding activation; not handled here. |
| `Live` | `Paused` / `Paused → Live` | Flow 24A / Flow 24B | Runtime toggles; not handled here. |
| `Any (except Archived)` | `Blocked` | **Flow 13 / Flow 26** | `blocked_reason` provided; remediation task created. |
| `Blocked` | `previous_status` | **Flow 13** | Remediation task resolved; stability confirmed; `blocked_reason` cleared. |
| `Any status` | `Archived` | **Flow 13 / Flow 35** | Ops/admin approval; no active traffic routed to this version. |

Flow 13 MUST return `invalid_status_transition` for any target outside its scope (pricing/go-live/runtime).

---

### Canonical Error Codes

- `invalid_status_transition`
- `status_prerequisite_missing`
- `blocked_reason_required`
- `project_missing_for_transition`
- `quote_missing_for_transition`
- `concurrency_conflict`

Workflow binding errors (e.g., activation failures) live in Flow 24.

---

### Flow Diagram (High-Level)

```
Request to PATCH /v1/automation-versions/{id}/status
    ↓
Global auth + tenant resolution (Flows 1A–7; JWT only; customer API keys cause 401)
    ↓
Load automation_version + automation + project/quote (tenant scoped)
    ↓
Reject targets owned by Flows 11 or 24 (invalid_status_transition)
    ↓
Validate state-machine transition + prerequisites
    ↓
Optional optimistic concurrency check (If-Match / last_known_updated_at)
    ↓
Begin transaction:
    - Update automation_versions (status, blocked_reason, metadata)
    - Update project lifecycle fields
    - Manage remediation task (Blocked only)
    - Insert audit_logs (action_type='update_status')
    ↓
Commit transaction
    ↓
Emit automation_status_changed event
    ↓
Send notifications (post-commit, async)
    ↓
Return updated automation_version snapshot
```

---

### Detailed Steps

1. **Entry Point**  
   - The only public entry is `PATCH /v1/automation-versions/{id}/status`.  
   - Internal workers MUST invoke the same domain service and set `system_initiated=true`.

2. **Auth & Tenant Resolution**  
   - Shared middleware MUST validate session/JWT authenticity, active membership, and tenant activity.  
   - Requests authenticated with customer API keys (`Authorization` starts with `wrk_api_`) MUST return 401.  
   - `tenant_id` MUST be derived from session context; payload-provided `tenant_id` MUST be ignored, and every SELECT/UPDATE MUST include `(tenant_id, id)` filters.

3. **Input & Concurrency Validation**  
   - The server MUST ensure the requested `status` is part of the canonical enum.  
   - If the target is `Needs Pricing`, `Awaiting Client Approval`, `Live`, or `Paused`, Flow 13 MUST respond 409 `invalid_status_transition` (callers must use Flows 11 or 24-family).  
   - When the request provides `If-Match` or `last_known_updated_at`, the server MUST compare it to `automation_versions.updated_at` and return 409 `concurrency_conflict` on mismatch.  
   - `blocked_reason` MUST be trimmed and capped to the configured length when transitioning into `Blocked`.

4. **Load Context**  
   - The service MUST select `automation_versions` by `(id, tenant_id)` and join the parent automation (which MUST be `status='active'`), related project, and latest quote.  
   - If the automation_version is missing, respond 404; if the parent automation is inactive, respond 409 `invalid_status_transition`.

5. **State Machine Enforcement**  
   - Flow 13 MUST validate `(current_status, target_status)` against the matrix.  
   - Attempts to revert to `Intake in Progress` or transition away from `Archived` MUST be rejected with 409 `invalid_status_transition`.

6. **Prerequisite Checks**  
   - `Build in Progress`: a project row MUST exist; the latest quote MUST have `status='signed'`; payment MUST be recorded when required by pricing config.  
   - `QA & Testing`: the build checklist MUST be 100% complete; build artifacts/runbook MUST be attached to the project.  
   - `Ready to Launch`: the QA checklist MUST be approved; regression/integration tests MUST meet the configured pass-rate; deployment and rollback plans MUST be stored.  
   - `Blocked`: a non-empty `blocked_reason` MUST be provided; a remediation task MUST exist or be created.  
   - `Blocked → previous_status`: the remediation task MUST be closed; monitoring/KPIs MUST show stability; `blocked_reason` MUST be cleared.  
   - `Archived`: ops/admin approval MUST be present; runtime traffic MUST already be routed elsewhere (verified via Flow 24).  
   - If any prerequisite fails, Flow 13 MUST return 400 `status_prerequisite_missing` with `details[]`, or `project_missing_for_transition` / `quote_missing_for_transition` when those specific rows are missing.

7. **Transactional Updates**  
   - All writes MUST occur inside a single DB transaction.  
   - Update `automation_versions` (`status`, `blocked_reason`, `blocked_at`, `status_metadata`, `status_changed_at`, `status_changed_by_user_id`, `updated_at`, `archived_at`).  
   - Update associated `projects` status / delivery phase (if row exists).  
   - Insert remediation `tasks` entry when entering Blocked; close it when exiting if resolved.  
   - Insert `audit_logs` row (`action_type='update_status'`, metadata `{from_status,to_status,project_id,quote_id,blocked_reason,system_initiated}`).  
   - Optionally append to `automation_versions_status_history` for analytics.  
   - On any failure the transaction MUST roll back; partial updates are forbidden.

8. **Post-Commit Side Effects**  
   - After commit, the service MUST publish `automation_status_changed` (tenant_id, automation_id, version_id, from/to statuses, actor, metadata).  
   - Notifications and follow-up jobs (e.g., auto-creating QA tasks) MUST be queued after the commit and MUST be idempotent.  
   - Flow 24/24A/24B consume these events for runtime/binding work; Flow 13 MUST NOT call WRK Platform directly.

9. **Response**  
   - 200 OK with:
     ```json
     {
       "automation_version": {
         "id": "av_123",
         "automation_id": "a_456",
         "tenant_id": "t_789",
         "status": "Ready to Launch",
         "blocked_reason": null,
         "status_changed_at": "2025-02-10T18:42:00Z",
         "updated_at": "2025-02-10T18:42:00Z"
       },
       "project": { "id": "proj_123", "status": "Ready to Launch" },
       "already_applied": false
     }
     ```
   - If no change occurred, the response MUST set `already_applied=true`.

---

### API Endpoints

#### `PATCH /v1/automation-versions/{id}/status`

- **Auth**: JWT session (SSO/local) or WRK service token. Customer API keys MUST receive 401.  
- **Authorization**:
  - `workflows_write` or automation owner: baseline access.  
  - `ops_build`: required for Build/QA transitions.  
  - `ops_release` or `admin`: required for `Ready to Launch`.  
  - `admin`: required for Archive outside normal retirement.  
- **Tenant Isolation**: all operations MUST be scoped by `(tenant_id_from_context, automation_version_id)`; payload `tenant_id` MUST be ignored.  
- **Request Body**:
  ```json
  {
    "status": "QA & Testing",
    "blocked_reason": "Only when status = Blocked",
    "status_metadata": { "qa_owner": "usr_123" },
    "last_known_updated_at": "2025-01-01T00:00:00Z"
  }
  ```
  - Server-owned fields (tenant_id, project_id, created_at, etc.) MUST be ignored.
- **Behavior**:
  - The endpoint MUST reject targets owned by Flow 11 or Flow 24-family (409 `invalid_status_transition`).  
  - For valid targets, the service MUST execute the validations and single-transaction updates described above.  
  - Idempotency: if nothing changes, the service MUST return 200 with `already_applied=true`.
- **Response**: see Detailed Steps.

---

### Database Changes (single transaction)

- **`automation_versions`**: MUST update `status`, `blocked_reason`, `blocked_at`, `status_metadata`, `status_changed_at`, `status_changed_by_user_id`, `updated_at`, `archived_at` (when applicable).  
- **`projects`**: if linked, MUST update lifecycle status and `delivery_phase` to mirror automation state.  
- **`tasks`**: MUST create/close remediation task when entering/exiting Blocked.  
- **`audit_logs`**: MUST insert canonical `update_status` row with metadata capturing before/after statuses, project/quote IDs, and whether the action was system-initiated.  
- **Events**: after commit, the service MUST emit `automation_status_changed`. No workflow binding updates or WRK Platform calls may occur in Flow 13.

---

### Notifications

| Status | Audience | Channel / Template | Notes |
| --- | --- | --- | --- |
| `Build in Progress` | Client + ops | Email `build_started`, in-app | MUST include project checklist link. |
| `QA & Testing` | Ops QA team | In-app + optional Slack `qa_started` | Client email OPTIONAL. |
| `Ready to Launch` | Ops release + client champion | Email `ready_to_launch`, Slack optional | MUST align with Flow 24 approvals. |
| `Blocked` | Client + ops + on-call | Email `automation_blocked`, critical Slack | MUST include remediation task link & instructions. |
| `Archived` | Ops + analytics | In-app log; email optional | Client email ONLY if explicitly required. |

Notifications for `Needs Pricing`, `Awaiting Client Approval`, `Live`, and `Paused` are specified in Flows 11 and 24-family and MUST NOT be duplicated here. All notifications MUST be sent post-commit and MUST be idempotent.

---

### Exceptions

| Condition | Response |
| --- | --- |
| No valid session / API key used | 401 Unauthorized |
| Caller lacks required role | 403 Forbidden |
| Automation version not found for tenant | 404 Not Found |
| Unsupported/illegal transition | 409 Conflict (`invalid_status_transition`) |
| Optimistic concurrency mismatch | 409 Conflict (`concurrency_conflict`) |
| Missing prerequisites | 400 Bad Request (`status_prerequisite_missing`, `project_missing_for_transition`, or `quote_missing_for_transition`) |
| Missing `blocked_reason` when targeting Blocked | 400 Bad Request (`blocked_reason_required`) |

Workflow binding and runtime activation errors belong to Flow 24/24A/24B.

---

### Manual Intervention & Security Notes

- Ops/admin console MUST enforce the state machine and surface prerequisite checklists before enabling transitions.  
- Flow 26 (monitoring) MAY call this flow to set `Blocked`; ops MUST unblock only after remediation tasks are resolved.  
- Tenant isolation is mandatory: every query/update MUST filter by `tenant_id` from auth context.  
- Only JWT users or WRK service tokens MAY mutate statuses; customer API keys remain read-only.  
- Every transition MUST be audit-logged for compliance (SOC2) and historical analysis.  
- `automation_status_changed` events MUST feed observability dashboards and downstream runtime flows (Flow 24-family).  
- Flow 13 remains stateless beyond DB writes; runtime systems consume the emitted events to manage bindings/activation.
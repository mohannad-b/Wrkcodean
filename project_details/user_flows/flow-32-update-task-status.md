### Flow 32: Update Task Status

**Trigger**: User or worker updates task status (e.g., pending → in_progress → complete)

---

### Access & Auth

- **Auth**: `PATCH /v1/tasks/{id}/status` requires a JWT session. Customer API keys are read-only (if ever exposed) and MUST NOT update tasks.
- **Authorization**:
  - Caller must belong to the task’s tenant and be a member of the project/automation context.
  - Optional policy: only ops/owners can complete system-generated `build_checklist` tasks.
- **Tenant isolation**:
  - `tenant_id` derived from auth or owning project/automation (never trusted from payload).
  - Backend MUST load the task via `WHERE tenant_id = :tenant_id AND id = :id`; 404 if not found (no leakage across tenants).
  - Any related queries (project/automation_version) are also tenant-scoped.

---

### Flow Diagram**:
```
User updates task status (e.g., pending → in_progress → complete)
    ↓
Backend loads task by (tenant_id from auth, task.id), validates caller membership/role
    ↓
Validate status transition via state machine (allowed transitions only)
    ↓
Update task.status
    ↓
If kind='build_checklist' and context_type='project':
    Recompute projects.checklist_progress inside same transaction
    ↓
If status = 'complete':
    Check if all build_checklist tasks complete
    If all complete: Notify ops (ready for next step)
    ↓
If status = 'complete' and due_date passed:
    Log completion delay (for metrics)
    ↓
Create audit log entry
    ↓
Send notifications
    ↓
Return updated task
```

**API Endpoints**:
- `PATCH /v1/tasks/{id}/status` – Update task status
  - Derives tenant_id/user_id from auth.
  - Loads task by `(tenant_id, task_id)` and validates permissions/role.
  - Applies allowed state transition inside a DB transaction (optional `last_known_status/updated_at` hints may return 409 if stale when a mutation would occur).
  - Recomputes checklist_progress within same transaction if applicable.

**Database Changes**:
- Update `tasks` (status, updated_at) scoped by tenant.
- Update `projects.checklist_progress` for project-level `build_checklist` tasks using:
  - numerator = count of checklist tasks with `status='complete'`
  - denominator = count of all checklist tasks
  - Recomputed inside the same transaction as the status update.
- Flow 32 MUST NOT change `automation_versions.status`, pricing, or lifecycle fields. All lifecycle transitions are owned by Flows 13/24/24A/24B/26.
- Insert into `audit_logs` (`action_type='update_task_status'`) capturing `{ old_status, new_status, kind, context_type, context_id }`; `user_id` is always the authenticated user (never null for status updates). Metadata must not include secrets or full task text.

**Notifications**:
- **In-app**: Task status updated (assignee + project owner within same tenant/context).
- **Email**: All build tasks complete (`build_tasks_complete`) when relevant—sent only to contacts within the task’s tenant/context.

**Exceptions**:
- **Task not found (404)**: no task with `(tenant_id, id)` for caller’s tenant.
- **Invalid status transition (400)**: state machine reject.
- **No permission (403)**: user not member of context or not allowed to change this kind.
- **Rate limiting (429)**: optional per-user/per-project limits to prevent spammy updates.

**Manual Intervention**: None

---

## Admin & Ops Flows

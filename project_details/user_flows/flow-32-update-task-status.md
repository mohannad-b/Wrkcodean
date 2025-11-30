### Flow 32: Update Task Status

**Trigger**: User updates task status (pending → in_progress → complete)

**Flow Diagram**:
```
User updates task status
    ↓
Validate status transition
    ↓
Update task.status
    ↓
If kind = 'build_checklist' and context_type = 'project':
    Recalculate project.checklist_progress
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
- `PATCH /v1/tasks/{id}/status` - Update task status

**Database Changes**:
- Update `tasks` (status, updated_at)
- Update `projects` (checklist_progress) if build_checklist
- Insert into `audit_logs` (action_type='update_task_status', resource_type='task', resource_id=task_id, user_id, tenant_id, created_at=now(), metadata_json={'old_status': old_status, 'new_status': status})

**Note**: `checklist_progress` is recalculated as: (count of complete build_checklist tasks / total build_checklist tasks) * 100, where tasks have `context_type='project'` and `kind='build_checklist'`.

**Notifications**:
- **In-app**: Task status updated notification (to assignee and project owner)
- **Email**: All build tasks complete (template: `build_tasks_complete`, if all complete)

**Exceptions**:
- **Task not found**: Return 404
- **Invalid status**: Return 400
- **No permission**: Return 403

**Manual Intervention**: None

---

## Admin & Ops Flows

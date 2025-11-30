### Flow 24A: Pause Workflow

**Trigger**: User (client) or ops clicks "Pause Workflow" on a Live automation

**Flow Diagram**:
```
User/ops clicks "Pause Workflow"
    ↓
Validate automation_version.status = 'Live' (or optionally 'Ready to Launch')
    ↓
Check if transition 'Live' → 'Paused' is allowed (per state machine)
    ↓
Update automation_version.status = 'Paused'
    ↓
Prevent new runs from being triggered while paused
    ↓
Create audit log entry
    ↓
Send notifications
    ↓
Return success
```

**API Endpoints**:
- `PATCH /v1/automation-versions/{id}/status` (status='Paused')
- `POST /v1/automation-versions/{id}/pause` - Pause workflow

**Database Changes**:
- Update `automation_versions` (status='Paused')
- Insert into `audit_logs` (action_type='pause_workflow', resource_type='automation_version')

**Notifications**:
- **Email**: Workflow paused notification (template: `workflow_paused`, to owner and ops)
- **In-app**: Notification to collaborators

**Exceptions**:
- **Invalid status transition**: Return 400 (can only pause from 'Live' or optionally 'Ready to Launch')
- **Automation not found**: Return 404
- **No permission**: Return 403

**Manual Intervention**: None (user/ops-driven)

---

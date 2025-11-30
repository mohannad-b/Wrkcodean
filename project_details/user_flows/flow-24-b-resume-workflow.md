### Flow 24B: Resume Workflow

**Trigger**: User (client) or ops clicks "Resume Workflow" on a Paused automation

**Flow Diagram**:
```
User/ops clicks "Resume Workflow"
    ↓
Validate automation_version.status = 'Paused'
    ↓
Check if transition 'Paused' → 'Live' is allowed (per state machine)
    ↓
Update automation_version.status = 'Live'
    ↓
Re-enable new runs to be triggered
    ↓
Create audit log entry
    ↓
Send notifications
    ↓
Return success
```

**API Endpoints**:
- `PATCH /v1/automation-versions/{id}/status` (status='Live')
- `POST /v1/automation-versions/{id}/resume` - Resume workflow

**Database Changes**:
- Update `automation_versions` (status='Live')
- Insert into `audit_logs` (action_type='resume_workflow', resource_type='automation_version')

**Notifications**:
- **Email**: Workflow resumed notification (template: `workflow_resumed`, to owner and ops)
- **In-app**: Notification to collaborators

**Exceptions**:
- **Invalid status transition**: Return 400 (can only resume from 'Paused' to 'Live')
- **Automation not found**: Return 404
- **No permission**: Return 403

**Manual Intervention**: None (user/ops-driven)

---

## Execution & Monitoring Flows

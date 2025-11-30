### Flow 13: Update Automation Status

**Trigger**: User or system updates status (e.g., "Mark as Live")

**Flow Diagram**:
```
User/system requests status change (new_status, optional blocked_reason)
    ↓
Validate current status exists
    ↓
Check allowed transition (reference Automation Status State Machine):
    - Is transition from current_status → new_status allowed?
    - If not allowed: Return 400 with error code INVALID_STATUS_TRANSITION
    ↓
If new_status = 'Blocked':
    Validate blocked_reason is provided
    Store blocked_reason in automation_version
    ↓
Check prerequisites for specific transitions:
    - 'Needs Pricing' → 'Awaiting Client Approval':
        * Requires at least one quote with status='sent'
    - 'Awaiting Client Approval' → 'Build in Progress':
        * Requires quote with status='signed'
        * Optionally: Payment confirmed (see Flow 15)
    - 'Ready to Launch' → 'Live':
        * Requires workflow_binding.status='active' OR successful WRK Platform activation
    ↓
If prerequisites not met: Return 400 with specific missing prerequisites
    ↓
Update automation_version.status
    ↓
If status = 'Blocked':
    Store blocked_reason
    ↓
Update project.status (if linked)
    ↓
If status = 'Live':
    - Archive previous Live version (if exists, status='Archived')
    - Activate workflow binding
    ↓
Create audit log entry
    ↓
Trigger status-specific actions
    ↓
Send notifications
```

**API Endpoints**:
- `PATCH /v1/automation-versions/{id}/status` - Update status
  - Body: `{ status: string, blocked_reason?: string }`
- `GET /v1/automation-versions/{id}` - Get version with status

**Database Changes**:
- Update `automation_versions` (status, blocked_reason if Blocked)
- Update `projects` (status) if linked
- Update previous Live version (status='Archived') if new version going Live
- Insert into `audit_logs` (action_type='update_status', resource_type='automation_version', changes_json with before/after status)

**Notifications** (status-specific):
- **'Needs Pricing'**: Email to ops team (template: `needs_pricing`)
- **'Awaiting Client Approval'**: Email to client (template: `quote_sent`)
- **'Build in Progress'**: Email to client (template: `build_started`)
- **'QA & Testing'**: Email to client (template: `qa_started`)
- **'Ready to Launch'**: Email to client (template: `ready_to_launch`)
- **'Live'**: Email to client (template: `automation_live`)
- **'Blocked'**: Email to client + ops (template: `automation_blocked`, includes blocked_reason)

**Exceptions**:
- **Invalid status transition**: Return 400 with error code `INVALID_STATUS_TRANSITION` (e.g., can't go from 'Intake in Progress' directly to 'Live')
- **Missing prerequisites**: Return 400 with specific missing items (e.g., 'Awaiting Client Approval' → 'Build in Progress' requires signed quote)
- **Blocked without reason**: Return 400, `blocked_reason` required when status='Blocked'
- **No permission**: Return 403 (only ops can set certain statuses)
- **Invalid status value**: Return 400, status must be one of the valid statuses

**Manual Intervention**: 
- Ops team manually sets status in some cases (e.g., 'Blocked', 'Archived')
- Status transitions may require manual approval for sensitive changes
- Ops team reviews prerequisites before allowing transitions

---

## Pricing & Billing Flows

**Global Note**: The system only generates and sends quotes in response to a client-initiated automation (new automation or new version). Ops cannot send unsolicited quotes without a corresponding project / automation version. Quotes are created automatically when a new automation / new version becomes a project. Ops can tweak them, but they don't start by "sending" a quote out of nowhere.

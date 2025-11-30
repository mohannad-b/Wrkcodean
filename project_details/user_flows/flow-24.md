### Flow 24: Deploy to Production

**Note**: In v1, status changes here ('Ready to Launch' → 'Live') are performed manually by the ops team in the admin panel. There is no automatic state change based purely on deployments succeeding.

**Trigger**: Ops user clicks "Mark as Live / Deploy to Production" in admin panel

**Flow Diagram**:
```
Status is 'Ready to Launch'
    ↓
Ops user manually clicks "Mark as Live / Deploy to Production"
    ↓
Validate workflow_binding exists and is 'active'
    ↓
Call WRK Platform API to activate workflow:
    PATCH /wrk-api/workflows/{workflow_id}/activate
    ↓
[WRK Platform activates workflow]
    ↓
Update automation_version.status = 'Live'
    ↓
Update project.status = 'Live'
    ↓
If previous Live version exists:
    Archive previous version (status='Archived')
    Deactivate previous workflow_binding
    ↓
Update workflow_binding.status = 'active' (if not already)
    ↓
Create audit log entry
    ↓
Send notifications
    ↓
Start monitoring run events
```

**Note**: Keep the same backend effects (status updates, previous Live version archived, etc.), but the trigger is ops user clicking "Mark as Live / Deploy to Production" in the admin panel. No mention of automated state transitions based solely on system checks; they can be added later as an enhancement.

**API Endpoints**:
- `PATCH /v1/automation-versions/{id}/status` (status='Live') - Manual trigger by ops
- `PATCH /wrk-api/workflows/{workflow_id}/activate` (external API)

**Database Changes**:
- Update `automation_versions` (status='Live')
- Update previous Live version (status='Archived')
- Update `projects` (status='Live')
- Update `workflow_bindings` (status='active' for new, 'inactive' for old)
- Insert into `audit_logs` (action_type='deploy', resource_type='automation_version')

**Notifications**:
- **Email**: Automation live notification to client (template: `automation_live`)
- **Email**: Deployment success to ops team (template: `deployment_success`)
- **In-app**: Notification to all collaborators
- **Slack** (optional): Automation live alert

**Exceptions**:
- **WRK Platform activation fails**: Retry, if fails mark status='error', notify ops
- **Previous version deactivation fails**: Log warning, continue with new version
- **No workflow_binding**: Return 400, build must complete first
- **Invalid status transition**: Return 400 (must be 'Ready to Launch' → 'Live')

**Manual Intervention**: 
- Ops team manually clicks "Mark as Live / Deploy to Production" in admin panel
- Ops team can manually activate in WRK Platform if API fails
- Ops team reviews before deploying (optional approval step)

---

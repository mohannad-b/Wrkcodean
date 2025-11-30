### Flow 22: Build Orchestration (Worker)

**Note**: This flow represents a future build orchestration capability. It is not yet implemented in Wrk and is out of scope for the initial WRK Copilot v1. Current builds are handled manually by the ops/solutions team.

**Trigger**: Build Orchestrator Worker processes queue message

**Flow Diagram**:
```
Worker receives build request message
    ↓
Fetch automation_version and blueprint_json
    ↓
Call WRK Platform API to create workflow:
    POST /wrk-api/workflows
    {
        name: automation.name,
        blueprint: blueprint_json,
        tenant_id: tenant_id
    }
    ↓
[WRK Platform returns workflow_id and workflow_url]
    ↓
Update workflow_binding:
    - wrk_workflow_id = workflow_id
    - wrk_workflow_url = workflow_url
    - status = 'active'
    ↓
Update automation_version.status = 'QA & Testing'
    ↓
Update project.status = 'QA & Testing'
    ↓
Update build tasks (mark integration tasks as complete)
    ↓
Create audit log entry
    ↓
Send notifications
    ↓
Enqueue notification job
```

**API Endpoints** (External):
- `POST /wrk-api/workflows` - Create workflow in WRK Platform (external API)

**Database Changes**:
- Update `workflow_bindings` (wrk_workflow_id, wrk_workflow_url, status='active')
- Update `automation_versions` (status='QA & Testing')
- Update `projects` (status='QA & Testing')
- Update `tasks` (status='complete' for integration tasks)
- Insert into `audit_logs` (action_type='build_complete', resource_type='automation_version', resource_id=automation_version_id, user_id=null, tenant_id, created_at=now(), metadata_json={'workflow_id': wrk_workflow_id}) - system-initiated by worker

**Notifications** (via Notification Worker):
- **Email**: Build complete notification to client (template: `build_complete`)
- **Email**: QA ready notification to ops team (template: `qa_ready`)
- **In-app**: Notification to project owner

**Exceptions**:
- **WRK Platform API error**: Retry 3 times, then mark workflow_binding.status='error', notify ops
- **Blueprint validation fails in WRK Platform**: Mark status='error', notify ops with error details
- **Network timeout**: Retry with exponential backoff
- **Invalid blueprint structure**: Return error, don't retry, notify ops

**Manual Intervention**: 
- Ops team reviews build errors and fixes blueprint if needed
- Ops team manually retries failed builds

---

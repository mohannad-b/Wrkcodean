### Flow 21: Request Build

**Trigger**: Automation version status changes to 'Build in Progress' (manual or automatic)

**Flow Diagram**:
```
Status changes to 'Build in Progress'
    ↓
Validate prerequisites:
    - Quote is signed
    - Blueprint is complete
    - No blocking issues
    ↓
Create workflow_binding record (status='pending')
    ↓
Enqueue build request to 'build-requests' queue
    ↓
Update project.checklist_progress = 0%
    ↓
Create initial build tasks (if not exists)
    ↓
Send notifications
    ↓
[Build Orchestrator Worker picks up job]
```

**API Endpoints**:
- `PATCH /v1/automation-versions/{id}/status` (status='Build in Progress') - Manual trigger
- `POST /v1/admin/projects/{id}/request-build` (admin only) - Manual trigger

**Database Changes**:
- Update `automation_versions` (status='Build in Progress')
- Update `projects` (status='Build in Progress', checklist_progress=0)
- Insert into `workflow_bindings` (automation_version_id, status='pending')
- Insert into `tasks` (context_type='project', context_id=project.id, kind='build_checklist', status='pending') - multiple build checklist tasks

**Note**: Build checklist tasks are created here (when build starts), not during automation creation. The `checklist_progress` on projects is calculated as: percentage of tasks with `context_type='project'` and `kind='build_checklist'` that have `status='complete'`.

**Notifications**:
- **Email**: Build started notification to client (template: `build_started`)
- **Email**: Build assigned to solutions engineer (template: `build_assigned`)
- **In-app**: Notification to project owner
- **Slack** (optional): New build alert to ops channel

**Exceptions**:
- **Quote not signed**: Return 400, must sign quote first
- **Blueprint incomplete**: Return 400, blueprint must have nodes/edges
- **Build already in progress**: Return 409
- **Missing prerequisites**: Return 400, list missing items

**Manual Intervention**: 
- Ops team manually assigns build to solutions engineer
- Ops team reviews prerequisites before starting build

---

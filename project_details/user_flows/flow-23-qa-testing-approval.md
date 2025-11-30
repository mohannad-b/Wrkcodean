### Flow 23: QA Testing & Approval

**Note**: In v1, status changes here ('QA & Testing' → 'Ready to Launch', 'QA & Testing' → 'Build in Progress', etc.) are performed manually by the ops team in the admin panel. There is no automatic state change based purely on tests passing or deployments succeeding.

**Trigger**: Ops team runs QA tests and manually updates status

**Flow Diagram**:
```
Status is 'QA & Testing'
    ↓
Ops team runs test executions
    ↓
Test results recorded (success/failure)
    ↓
Ops user manually clicks "Mark as Ready to Launch" (if tests pass)
    ↓
If ops marks as Ready to Launch:
    Update automation_version.status = 'Ready to Launch'
    Update project.status = 'Ready to Launch'
    ↓
If ops marks as needs fixes:
    Update automation_version.status = 'Build in Progress'
    Create tasks for fixes
    Notify solutions engineer
    ↓
If ops marks as needs re-pricing:
    Update automation_version.status = 'Needs Pricing'
    (triggers Flow 11 again for new quote)
    ↓
[Client can also approve for launch via ops panel]
    ↓
Create audit log entry
    ↓
Send notifications
```

**API Endpoints**:
- `POST /v1/automation-versions/{id}/test` - Run test execution
- `GET /v1/automation-versions/{id}/test-results` - Get test results
- `PATCH /v1/automation-versions/{id}/status` (status='Ready to Launch' or 'Build in Progress' or 'Needs Pricing') - Manual status update by ops

**Database Changes**:
- Update `automation_versions` (status='Ready to Launch' or 'Build in Progress' or 'Needs Pricing')
- Update `projects` (status)
- Insert into `tasks` (if fixes needed, status='pending')
- Insert into `audit_logs` (action_type='update_status', resource_type='automation_version')

**Notifications**:
- **Email**: QA passed, ready to launch (template: `qa_passed`)
- **Email**: QA failed, needs fixes (template: `qa_failed`)
- **In-app**: Notification to client (can approve launch)

**Exceptions**:
- **Tests not run**: Status remains 'QA & Testing'
- **Partial test failures**: Ops decides whether to proceed or fix
- **Invalid status transition**: Return 400 (must follow state machine rules)

**Manual Intervention**: 
- Ops team runs QA tests manually
- Ops team manually clicks "Mark as Ready to Launch" or "Mark as Needs Fixes" in admin panel
- Client can approve launch after reviewing test results (via ops panel)
- Ops team decides on partial failures

---

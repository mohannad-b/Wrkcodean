### Flow 10: Update Blueprint

**Trigger**: User edits blueprint canvas and saves

**Flow Diagram**:
```
User edits blueprint (adds/removes nodes/edges)
    ↓
Validate blueprint JSON structure
    ↓
Check user has edit permission
    ↓
Update automation_version.blueprint_json
    ↓
Update intake_progress (if nodes added, recalculate percentage)
    ↓
Create audit log entry
    ↓
Send notifications
    ↓
Return updated blueprint
```

**API Endpoints**:
- `PUT /v1/automation-versions/{id}/blueprint` - Update blueprint
- `GET /v1/automation-versions/{id}/blueprint` - Get blueprint

**Database Changes**:
- Update `automation_versions` (blueprint_json, intake_progress)
- Insert into `audit_logs` (action_type='update', resource_type='automation_version', resource_id)

**Note**: This flow does NOT automatically change status to 'Needs Pricing'. Moving from "Intake in Progress" to "Needs Pricing" happens through a separate explicit flow (Flow 11), not just by saving the blueprint.

**Notifications**:
- **In-app**: Blueprint updated notification (to collaborators)

**Exceptions**:
- **Invalid JSON structure**: Return 400, validation errors
- **Missing required nodes**: Return 400 (must have at least one trigger)
- **No edit permission**: Return 403
- **Version is Live**: Return 400, must create new version to edit
- **Version not in 'Intake in Progress'**: Return 400 (can only edit during intake)

**Manual Intervention**: None

---

### Flow 12: Create New Version

**Trigger**: User clicks "Create New Version" from existing automation

**Flow Diagram**:
```
User selects base version (e.g., v1.0)
    ↓
Validate base version exists and is Live/Archived
    ↓
Calculate next version number (semver increment)
    ↓
Copy blueprint_json from base version
    ↓
Create new automation_version:
    - automation_id (same as base)
    - version (next semver, e.g., v1.1 or v2.0)
    - blueprint_json (copied from base)
    - status = 'Intake in Progress'
    - intake_progress = 0
    ↓
Link to same automation_id
    ↓
Create audit log entry
    ↓
Send notifications
    ↓
Redirect to new version detail page
```

**API Endpoints**:
- `POST /v1/automations/{id}/versions` - Create new version
- `GET /v1/automations/{id}/versions` - List all versions

**Database Changes**:
- Insert into `automation_versions` (automation_id, version, blueprint_json copied, status='Intake in Progress', intake_progress=0)
- Insert into `audit_logs` (action_type='create_version', resource_type='automation_version', resource_id=automation_version_id, user_id, tenant_id, created_at=now(), metadata_json={'base_version_id': base_version_id, 'new_version': version})

**Note**: The `projects` record for this revision will be created later when moving from "Intake in Progress" to "Needs Pricing" (via Flow 11). Build checklist tasks are also created at that time, not during version creation.

**Notifications**:
- **Email**: New version created (to owner, template: `version_created`)
- **In-app**: Notification to owner

**Exceptions**:
- **Base version not found**: Return 404
- **Base version not Live/Archived**: Return 400, can only version from Live/Archived
- **Version number conflict**: Return 409, auto-increment and retry

**Manual Intervention**: None

---

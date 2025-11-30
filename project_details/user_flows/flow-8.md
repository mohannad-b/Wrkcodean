### Flow 8: Create New Automation

**Trigger**: User clicks "New Automation" button

**Flow Diagram**:
```
User submits automation form (name, description, department)
    ↓
Validate name uniqueness in tenant
    ↓
Create automation record
    ↓
Create initial automation_version:
    - version = 'v1.0'
    - status = 'Intake in Progress'
    - blueprint_json = {} (empty or minimal skeleton)
    - intake_progress = 0
    ↓
Assign default owner (current user)
    ↓
Send notifications
    ↓
Redirect to automation detail page
```

**API Endpoints**:
- `POST /v1/automations` - Create automation + initial version
- `GET /v1/automations/{id}` - Get automation details

**Database Changes**:
- Insert into `automations` (tenant_id, name, description, department, owner_id)
- Insert into `automation_versions` (automation_id, version='v1.0', status='Intake in Progress', blueprint_json={}, intake_progress=0)

**Note**: The ops-facing `projects` record will be created later when moving from "Intake in Progress" to "Needs Pricing" (see Flow 10). Build checklist tasks are also created at that time, not during automation creation.

**Notifications**:
- **Email**: Automation created (to owner, template: `automation_created`)
- **In-app**: Notification to owner

**Exceptions**:
- **Duplicate name**: Return 409, suggest different name
- **Invalid department**: Return 400
- **Missing required fields**: Return 400

**Manual Intervention**: None (automated)

---

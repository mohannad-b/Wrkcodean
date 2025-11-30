### Flow 25: Provide / Update Integration Credentials

**Trigger**: Client needs to connect systems (e.g., HubSpot, Salesforce, Gmail, Xero) for an automation

**Flow Diagram**:
```
User opens "Connections / Credentials" UI for automation or tenant
    ↓
User selects system to connect
    ↓
Option A: OAuth connection:
    Redirect to provider OAuth flow (HubSpot, Salesforce, etc.)
    User authorizes access
    Provider returns access_token and refresh_token
    ↓
Option B: API key / secret entry:
    User enters API key, secret, or other credentials
    ↓
Backend stores credentials securely:
    - Store in WRK Platform's secrets store OR
    - Store in dedicated secrets manager (AWS Secrets Manager, HashiCorp Vault)
    - Never store plaintext in Copilot database
    - Only store reference (credential_id) in Copilot DB
    ↓
Link credential to automation_version or tenant
    ↓
Mark related tasks as complete:
    - Find tasks with kind='build_checklist' and title matching system
    - Update task.status = 'complete'
    - Recalculate project.checklist_progress
    ↓
If automation was previously Blocked due to credential issues:
    Check if all required credentials are now valid
    If all valid:
        Option A: Automatically move status back to previous healthy state
        Option B: Require ops approval to unblock
    ↓
Create audit log entry
    ↓
Send notifications
    ↓
Return success
```

**API Endpoints**:
- `POST /v1/automation-versions/{id}/credentials` - Add/update credentials
- `GET /v1/automation-versions/{id}/credentials` - List credentials (masked)
- `POST /v1/credentials/oauth/{provider}` - Initiate OAuth flow
- `GET /v1/credentials/oauth/{provider}/callback` - OAuth callback

**Database Changes**:
- Store credentials in secrets manager (not in Copilot DB)
- Insert/update credential reference in `credentials` table (if exists): credential_id, automation_version_id, system_name, credential_type, stored_at
- Update `tasks` (status='complete' for related credential tasks)
- Update `projects` (checklist_progress recalculated)
- Update `automation_versions` (status, if unblocking from Blocked)
- Insert into `audit_logs` (action_type='add_credentials', resource_type='automation_version', resource_id=automation_version_id, user_id, tenant_id, created_at=now(), metadata_json={'system_name': system_name, 'credential_type': credential_type}) - when credentials added/updated

**Notifications**:
- **Email**: Credentials added notification (template: `credentials_added`, to ops when all required credentials provided)
- **In-app**: Notification to owner

**Exceptions**:
- **Invalid OAuth response**: Return 400, retry OAuth flow
- **Invalid API key format**: Return 400, validate format
- **Credential storage failure**: Return 500, log error, alert ops
- **Missing required credentials**: Return 400, list missing systems

**Manual Intervention**: 
- Ops team may manually verify credentials
- Ops team approves unblocking from Blocked state (if configured)

**Security Note**: Credentials are never stored in plaintext. They are stored in a secrets manager, and only references (credential_id) are stored in the Copilot database.

---

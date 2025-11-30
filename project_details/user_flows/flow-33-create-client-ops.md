### Flow 33: Create Client (Ops)

**Important**: Ops does not create client accounts/workspaces. Users must sign up themselves to create their own workspace (tenant) via the signup flow (Flow 1A or 1B). This flow is for ops to tag/associate existing workspaces/tenants with client records for ops management purposes.

**Trigger**: Ops admin creates or associates client record with existing workspace/tenant

**Flow Diagram**:
```
Ops admin creates client form (name, industry, owner_id)
    ↓
Check if tenant already exists (by email/domain or subdomain)
    ↓
If tenant exists:
    Link client record to existing tenant (1:1)
    - tenant_id (from existing tenant)
    - name, industry, owner_id
    ↓
If tenant doesn't exist:
    Return error: "Tenant/workspace must be created by user signup. Please have the user sign up first."
    Do NOT create tenant record
    ↓
Set default health_status = 'Good'
    ↓
Assign ops owner
    ↓
Create audit log entry
    ↓
Return client (linked to existing tenant)
```

**API Endpoints**:
- `POST /v1/admin/clients` (admin only)
- `GET /v1/admin/clients/{id}` - Get client details

**Database Changes**:
- Insert into `clients` (tenant_id UNIQUE, name, industry, health_status='Good', owner_id) - only if tenant exists
- Insert into `audit_logs` (action_type='create_client' or 'associate_client')

**Notifications**:
- **In-app**: New client notification to ops team

**Exceptions**:
- **Tenant doesn't exist**: Return 400, error message directing ops to have user sign up first
- **Tenant already has client**: Return 409
- **Invalid ops owner**: Return 400
- **Duplicate client name**: Return 409, suggest different name

**Manual Intervention**: Ops admin manually creates/associates client record with existing tenant (not automated). Workspace/tenant creation always originates from a user signup.

---

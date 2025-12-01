### Flow 33: Create Client (Ops)

**Important**: Ops does not create client accounts/workspaces. Users must sign up themselves to create their own workspace (tenant) via Flow 1A/1B. Flow 33 merely links an existing tenant row to a “client” record for internal ops tracking.

**Trigger**: Ops/admin user links an existing tenant to a new client record

---

### Access & Auth

- **Auth**: `POST /v1/admin/clients` and `GET /v1/admin/clients/{id}` require a JWT session. Customer API keys are never valid here.
- **Authorization**:
  - Only global/admin roles `{ops_admin, cs_admin, admin}` may call these endpoints.
  - Endpoints operate at the tenants table level (cross-workspace admin scope).
- **Tenant isolation**:
  - `tenant_id` for the client link MUST come from the selected tenants row (by ID). Never trust tenant identifiers supplied by the caller.
  - AuthN/AuthZ must succeed before disclosing whether a tenant exists.

---

### Flow Diagram
```
Ops admin completes client form (name, industry, owner_id, tenant_id)
    ↓
Backend receives tenant_id, loads tenant row by ID
    ↓
If tenant exists:
    Enforce 1:1: ensure tenant_id not already linked to a client
    Link client record to tenant (tenant_id, name, industry, owner_id, health_status='Good')
    ↓
If tenant doesn't exist:
    Return error: "Tenant/workspace must be created by user signup..."
    DO NOT insert into tenants (Flow 33 never creates tenants)
    ↓
Validate owner_id belongs to same tenant and has allowed role
    ↓
Create audit log entry
    ↓
Return client record (linked to existing tenant)
```

**API Endpoints**:
- `POST /v1/admin/clients` – admin-only create/link client (requires tenant_id reference)
- `GET /v1/admin/clients/{id}` – admin-only view (same auth rules)

**Database Changes**:
- Insert into `clients`:
  - `tenant_id` (UNIQUE – one client per tenant)
  - `name`, `industry`
  - `health_status='Good'`
  - `owner_id` (validated user belonging to tenant, optional role restriction `{ops_admin, cs_admin, account_manager, admin}`)
  - `created_at`, `updated_at`
- Insert into `audit_logs`:
  - `action_type='create_client'` or `'associate_client'`
  - `resource_type='client'`, `resource_id=client_id`, `tenant_id`, `actor_user_id`
  - `metadata_json={ tenant_id, name, industry, owner_id }` (no secrets/credentials)

**Notifications**:
- **In-app**: New client notification to ops team (same tenant scope)

**Exceptions**:
- **Tenant doesn't exist**: 400 `tenant_not_found_for_client_association` (must sign up first).
- **Tenant already has client**: 409 (enforced by UNIQUE constraint on tenant_id).
- **Invalid ops owner**: 400 (user missing, belongs to different tenant, or not in allowed roles).
- **Duplicate client name**: 409 (scope depends on product policy; if name must be unique, document accordingly).

    **Manual Intervention**: Ops admin manually creates/associates client record with existing tenant (not automated). Workspace/tenant creation always originates from a user signup.

    ---

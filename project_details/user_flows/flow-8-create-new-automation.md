### Flow 8: Create New Automation

**Trigger**: User clicks "New Automation" button

**Flow Diagram**:
```
User submits automation form (name, description, department)
    ↓
Backend: Resolve tenant_id from authenticated context (session/JWT)
    - tenant_id MUST come from server-side session/JWT, never from client input
    - User must be authenticated (valid session/JWT)
    - Verify user has active membership in tenant_id
    - Verify tenant is active (not deleted/suspended)
    - Verify user has permission to create automations (tenant role ≥ 'workflows_write', or 'admin', per shared permission matrix)
    - If session invalid → 401 Unauthorized
    - If no active membership / inactive tenant / insufficient role → 403 Forbidden
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
    - Owner MUST be a valid active member of the same tenant_id.
    - If current user is not active or tenant becomes inactive mid-request → 403 Forbidden.
    ↓
Create audit log entry
    ↓
Send notifications
    ↓
Return JSON (201 Created) → frontend navigates to /app/automations/{automation_id}.
Backend MUST NOT perform HTTP redirects.
```

**API Endpoints**:
- `POST /v1/automations` - Create automation + initial version
  - **Auth required**: User must be authenticated via user session/JWT (NOT via API key). If the Authorization header contains a token starting with `wrk_api_`, this endpoint MUST return 401 Unauthorized.
  - **Authorization required**: User must have tenant role ≥ 'workflows_write' (or 'admin') to create automations, enforced via shared permission matrix. If insufficient role: Return 403 Forbidden.
  - **Behavior**:
    - Resolve tenant_id from authenticated context (session/JWT), never from client input.
    - This endpoint MUST NOT accept tenant_id from client body or query—ignore if present.
    - Validate active membership + active tenant (handled by shared global auth middleware).
    - Validate payload fields (name, description, department):
      - Reject empty or whitespace-only `name` → 400 Bad Request.
      - `name` must NOT contain control characters or newline characters → 400 Bad Request.
      - `name` must be trimmed and lowercased for uniqueness comparison, but stored as originally provided.
      - `description` is optional but if present must be ≤ 10,000 chars.
      - `department` must match a defined enum list (e.g., ['sales','marketing','finance','hr','ops','it']) per shared permission matrix. Invalid values → 400 Bad Request.
      - `department` enum MUST be stored lowercase regardless of input casing.
    - Validate name uniqueness PER TENANT: (tenant_id, lower(trim(name))) must be unique. If duplicate within same tenant: Return 409 Conflict.
  - **Response**: 201 Created
    - Body: { id, name, description, department, owner_id, tenant_id, created_at, initial_version: { id, version, status, intake_progress } }
- `GET /v1/automations/{id}` - Get automation details
  - **Auth required**: Uses shared global auth middleware (can be JWT or API key).
  - **Tenant isolation**: Always filter by tenant_id from auth context (session/JWT for user, api_keys.tenant_id for API key). Never accept tenant_id from query/body.
  - **Authorization for API keys**: API-key-authenticated callers MUST have permission "workflows_read" or higher in api_keys.permissions; otherwise return 403 Forbidden.
  - **Behavior**: Select automation WHERE id = :id AND tenant_id = :tenant_id_from_context. If not found: Return 404 Not Found.
  - **Blueprint access rules**:
      - If JWT user role ≥ 'workflows_write' OR user is the owner → return full `blueprint_json`.
      - If JWT user role = 'workflows_read' → return summarized blueprint (structure only, no credential-like or sensitive metadata).
      - If API key is used:
          * If api_keys.permissions includes 'workflows_write' → return full blueprint_json.
          * If api_keys.permissions includes 'workflows_read' → return summarized blueprint_json.
          * Otherwise → 403 Forbidden.
      - Summarization must remove internal node metadata, timestamps, prompts, embeddings, internal IDs, and any non-essential fields.

**Database Changes**:
- Insert into `automations` (tenant_id, name, description, department, owner_id, created_by_user_id, created_at=now())
- Insert into `automation_versions` (automation_id, tenant_id, version='v1.0', status='Intake in Progress', blueprint_json={}, intake_progress=0)
  - `automation_versions` MUST include a `tenant_id` column mirroring the parent automation's tenant_id.
  - A foreign key constraint MUST enforce `(automation_versions.tenant_id = automations.tenant_id)`.
  - All queries on automation_versions MUST include tenant_id filters for isolation.
- Insert into `audit_logs` (action_type='create_automation', resource_type='automation', resource_id=automation_id, user_id, tenant_id, created_at=now(), metadata_json={'department': department})
- Insert into `audit_logs` (action_type='create_automation_version', resource_type='automation_version', resource_id=automation_version_id, user_id, tenant_id, created_at=now(), metadata_json={'version': 'v1.0'})
- Enforce a unique constraint on (tenant_id, lower(name)) to guarantee name uniqueness per tenant.
- **Requirements**:
  - `automation_versions.blueprint_json` column MUST default to '{}' and be validated as valid JSON.
  - `automation_versions.status` must be ENUM with controlled allowed values.
  - Add index on (automation_id, created_at DESC) for fast lookup of latest version.

**Note**: The ops-facing `projects` record will be created later when moving from "Intake in Progress" to "Needs Pricing" (see Flow 10). Build checklist tasks are also created at that time, not during automation creation.

**Notifications**:
- **Email**: Automation created (to owner, template: `automation_created`)
- **In-app**: Notification to owner

**Exceptions**:
- **Unauthenticated user**: Return 401 Unauthorized.
- **If the request uses an API key**: always 401 Unauthorized for POST /v1/automations (never 403).
- **No active membership / inactive tenant**: Return 403 Forbidden (enforced by shared global auth middleware).
- **Insufficient permission to create automations**: Return 403 Forbidden (tenant role < 'workflows_write').
- **API-key-authenticated caller without workflows_read permission**: Return 403 Forbidden.
- **Whitespace-only name**: Return 400 Bad Request.
- **If both name and description missing/empty**: still allowed (description optional), only name is required.
- **Invalid or disallowed department value**: Return 400 Bad Request.
- **Duplicate name**: Return 409, suggest different name
- **Missing required fields**: Return 400
- **If automation_versions insert fails**: return 500 but MUST roll back parent automation insert in a single DB transaction.

**Manual Intervention**: None (automated)

**Security Notes**:
- **Tenant isolation**: tenant_id always comes from authenticated context (sessions.tenant_id/JWT or api_keys.tenant_id), never from client input.
- **Global auth middleware**: validates session, active membership, and active tenant on every request, returning 401 for invalid session and 403 for missing/inactive membership or tenant.
- **Permissions**: Automation creation requires tenant role ≥ 'workflows_write' (or 'admin') per the shared permission matrix.
- **Name uniqueness**: Enforced per tenant via (tenant_id, lower(name)) unique constraint to prevent collisions across workspaces.
- **Server-side validation**: Automation creation endpoints MUST NOT rely on frontend validation; all permission, membership, and uniqueness checks occur server-side.
- **Transaction safety**: Automation creation MUST be executed in a single DB transaction so that automations and automation_versions are never partially created.
- **Concurrency safety**: Unique constraint violations MUST be caught at the DB layer to prevent race conditions where two names collide under concurrent requests.
- **Role verification**: When returning automation details, server MUST never trust user role supplied in JWT without verifying via DB membership join inside auth middleware.

---

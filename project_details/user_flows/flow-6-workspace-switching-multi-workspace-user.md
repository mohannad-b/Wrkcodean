### Flow 6: Workspace Switching (Multi-Workspace User)

**Trigger**: User belongs to multiple workspaces and needs to switch

**Flow Diagram**:
```
User authenticates (via login or SSO)
    ↓
Backend returns list of workspace memberships:
    - Query user_tenants/memberships table for user_id
    - Filter by status='active' (only return active memberships)
    - Filter by tenant status='active' (exclude deleted/suspended tenants)
    - Returns: [{ workspace_name, workspace_slug, role }, ...]
    - Format: [{ name: "Acme", subdomain: "acme", role: "admin" }, ...]
    ↓
If only one workspace:
    Set tenant_id in session (sessions.tenant_id)
    Update users.last_active_tenant_id = tenant_id
    Update JWT claims with tenant_id (JWT derived from sessions.tenant_id)
    Return JSON response with workspace context (tokens + tenant info)
    Frontend handles redirect to workspace: https://{subdomain}.wrk.com/app
    Backend does NOT perform HTTP redirect (3xx) - this follows Pattern A: auth endpoints return JSON, frontend handles redirects
    ↓
If multiple workspaces:
    Show workspace picker UI:
        - Display workspace names and subdomains
        - Show user's role in each workspace
        - UX: "Select workspace" or "Switch workspace"
    ↓
User selects workspace
    ↓
POST /v1/auth/switch-workspace
    Backend validates user is authenticated
    If not authenticated:
        Return 401 Unauthorized
    ↓
    Extract requested tenant_id from request body
    ↓
    Verify user has active membership in requested tenant_id:
        - Query user_tenants/memberships for user_id and requested tenant_id
        - Filter by status='active' (or equivalent active state in membership table)
        - Verify tenant is active (not deleted/suspended)
        - If no active membership found: Return 403 Forbidden
        - If tenant is inactive/deleted: Return 403 Forbidden
    ↓
    Use tenant_id from membership record as authoritative (not from request body)
    ↓
    Update sessions.tenant_id = tenant_id (from membership)
    Update users.last_active_tenant_id = tenant_id (from membership)
    Update JWT claims with new tenant_id (JWT derived from sessions.tenant_id - sessions is source of truth)
    ↓
    Create audit log entry:
        - action_type='switch_workspace'
        - resource_type='user'
        - resource_id=user_id
        - tenant_id=selected_tenant_id (new workspace, from membership record)
        - created_at=now()
    ↓
    Return JSON response (200 OK):
        - { tenant_id, workspace_name, workspace_slug, message: "Workspace switched successfully" }
        - Frontend handles redirect: https://{workspace_slug}.wrk.com/app
        - Backend does NOT perform HTTP redirect (3xx) - this is a JSON API endpoint
    ↓
All subsequent API calls:
    - **Global Auth Middleware Rule** (platform-wide, not just Flow 6):
        - Shared auth middleware loads session → tenant_id
        - Confirms user has active membership in sessions.tenant_id (status='active')
        - Confirms tenant is active (not deleted/suspended)
        - If session invalid: Return 401 Unauthorized
        - If membership missing/inactive or tenant inactive: Return 403 Forbidden
        - All services MUST use this shared middleware, not roll their own membership checks
    - Extract tenant_id from session/JWT (never from request body/query)
    - Shared auth middleware centralizes tenant_id extraction (ignores tenant_id in request payloads)
    - Filter all queries by tenant_id from session
    - Enforce tenant isolation
```

**API Endpoints**:
- `GET /v1/auth/workspaces` - List user's workspace memberships
  - **Auth required**: User must be authenticated
  - If not authenticated: Return 401 Unauthorized
  - **Behavior**:
    - Query `user_tenants`/`memberships` table for authenticated user_id
    - Filter by status='active' (only return active memberships)
    - Filter by tenant status='active' (exclude deleted/suspended tenants)
    - Filter by user_id from authenticated context (session/JWT), not from client input
  - **Response**: 200 OK
    - Body: `[{ workspace_name, workspace_slug, role, tenant_id }, ...]` (only active memberships)
  - **Edge case - Zero workspaces**:
    - If user has no active memberships after filtering: Return empty array []
    - This aligns with Flow 3 login behavior: user with zero workspaces proceeds to "Create your workspace" flow
    - Do NOT return error - empty array indicates user needs to create a workspace
- `POST /v1/auth/switch-workspace` - Switch active workspace (updates session/JWT)
  - **Auth required**: User must be authenticated
  - If not authenticated: Return 401 Unauthorized
  - **Request body**: `{ tenant_id }` (used as selector only, not source of truth)
  - **Behavior**:
    - Extract requested tenant_id from request body
    - Verify user has active membership in requested tenant_id:
        - Query user_tenants/memberships for user_id and requested tenant_id
        - Filter by status='active' (membership must be active)
        - Verify tenant is active (not deleted/suspended)
        - If no active membership found: Return 403 Forbidden
        - If tenant is inactive/deleted: Return 403 Forbidden
    - Use tenant_id from membership record as authoritative (not from request body)
    - Update sessions.tenant_id = tenant_id (from membership record)
    - Update users.last_active_tenant_id = tenant_id (from membership record)
    - Update JWT claims with new tenant_id (JWT derived from sessions.tenant_id - sessions is source of truth)
    - Create audit log entry (action_type='switch_workspace')
  - **Response**: 200 OK (JSON only, no HTTP redirect)
    - Body: { tenant_id, workspace_name, workspace_slug, message: "Workspace switched successfully" }
    - Frontend handles redirect to https://{workspace_slug}.wrk.com/app
    - **Hard rule**: POST /v1/auth/switch-workspace must always reply JSON only. Redirects are frontend responsibility only. Do NOT add HTTP redirects (3xx) to this endpoint.

**Database Changes**:
- **Session/JWT Update**:
  - Update `sessions` SET tenant_id = selected_tenant_id (from membership record)
  - **Source of Truth**: Sessions table is ALWAYS the source of truth for tenant context
  - JWT claims are updated to reflect sessions.tenant_id (JWT is short-lived reflection of session state)
  - **Critical**: Auth middleware must ALWAYS trust sessions.tenant_id when re-issuing access tokens, not whatever the client claims in JWT
  - JWT is derived from sessions, not the other way around - sessions is never "optional"
  - Update `users` SET last_active_tenant_id = selected_tenant_id (from membership record)
- **Audit Logs**:
  - Insert into `audit_logs` (action_type='switch_workspace', resource_type='user', resource_id=user_id, user_id=user_id, tenant_id=selected_tenant_id, created_at=now())
    - resource_type='user', resource_id=user_id (the user who switched)
    - tenant_id=selected_tenant_id (the new workspace the user switched to - context where the action occurred)
  - **Audit log action type convention** (locked in):
    - `login_workspace_switch` = workspace switch during login flow (Flow 3, when user selects workspace from picker after login)
    - `switch_workspace` = manual workspace switch after login (Flow 6, when user switches workspace later in the app)
    - Both use same semantics: resource_type='user', resource_id=user_id, tenant_id=selected_tenant_id
    - Use the appropriate action_type based on context (login-time vs post-login) to maintain accurate analytics
    - **These are the only two action_types for workspace switching; do not introduce new variants**

**Global Auth Middleware Rule** (platform-wide invariant):
- **Shared auth middleware** (used by all services, not just workspace switching):
  - Loads session and reads `sessions.tenant_id` (this MAY be `null` for pre-workspace flows such as initial signup/login before any workspace exists or is selected).
  - If `sessions.tenant_id` is `null`:
      - Skip tenant membership and tenant-status checks.
      - Allow endpoints that operate before workspace creation/selection to run (e.g., "Create your workspace" flows in Flow 1A/1B/3, `GET /v1/auth/workspaces` when the user has zero memberships).
  - If `sessions.tenant_id` is NOT `null`:
      - Confirm user has active membership in `sessions.tenant_id` (status='active').
      - Confirm tenant is active (not deleted/suspended).
      - If membership missing/inactive or tenant inactive: Return 403 Forbidden.
  - If session is invalid or missing: Return 401 Unauthorized.
  - All services MUST use this shared middleware, not roll their own membership checks.
  - This is a platform-wide invariant, not just a Flow 6 concern.

**Tenant Isolation**: 
- `tenant_id` for API operations always from authenticated session (sessions.tenant_id, reflected in JWT claims)
- **Centralized in Auth Middleware**: All services MUST use shared auth middleware that:
  - Extracts tenant_id from session/JWT context ONLY
  - IGNORES tenant_id in request body/query parameters completely
  - Downstream handlers never read tenant_id from body/query for auth decisions
  - This prevents microservice devs from "just taking tenant_id from the request" to save a lookup
- When switching workspace: requested tenant_id is validated against membership, then membership record's tenant_id is used as authoritative source
- All subsequent API calls extract tenant_id from session/JWT context, never from request parameters

**Response Pattern** (Pattern A - consistent across auth flows):
- **Auth endpoints always return JSON** (+ tokens/context); frontend always handles redirects
- Backend does NOT perform HTTP redirects (3xx) in auth endpoints
- Frontend receives JSON response and handles redirects client-side
- This pattern applies to:
  - Login flows (Flow 3): Return JSON with tokens + workspace context, frontend redirects
  - Workspace switching (Flow 6): Return JSON with updated context, frontend redirects
- **Exception**: SSO callback redirects to IdP are server-side (OAuth flow requirement), but final response to frontend is JSON

**Notifications**: None

**Exceptions**:
- **401 vs 403 Semantics** (explicit rule):
  - **401 Unauthorized**: User is not authenticated / invalid session / session expired
  - **403 Forbidden**: User is authenticated but not allowed (no active membership, inactive membership, or inactive tenant)
  - **Hard rule**: If user has a valid session but is not allowed in a tenant (no membership, inactive membership, or inactive tenant), always return 403, not 401
  - When `sessions.tenant_id` is `null` (pre-workspace flows), the global auth middleware MUST treat this as "no tenant context yet", not as a 403 condition. In this case, tenant-scoped checks are skipped and endpoints that operate before workspace creation/selection are allowed to proceed.
- **Unauthenticated user**: Return 401 Unauthorized (on GET /v1/auth/workspaces or POST /v1/auth/switch-workspace)
- **User not member of requested workspace**: Return 403 Forbidden (membership verification failed)
- **Membership not active**: Return 403 Forbidden (membership exists but status != 'active')
- **Tenant inactive/deleted**: Return 403 Forbidden (tenant exists but is deleted/suspended)
- **Invalid tenant_id format**: Return 400 Bad Request (should never happen if validated against memberships)
- **Workspace not found**: Return 404 Not Found (if tenant_id doesn't exist in tenants table)

**Edge Cases - Workspace Deleted or User Removed Mid-Session**:
- **GET /v1/auth/workspaces**:
  - If membership no longer exists or status != 'active': Exclude from results (filter out)
  - If tenant is deleted/suspended: Exclude from results (filter out)
  - Return only active memberships in active tenants
- **POST /v1/auth/switch-workspace**:
  - If membership no longer exists or status != 'active': Return 403 Forbidden
  - If tenant is deleted/suspended: Return 403 Forbidden
- **Subsequent API calls with old sessions.tenant_id**:
  - Global auth middleware (platform-wide) validates sessions.tenant_id on every request:
    - Check if user has active membership in sessions.tenant_id (status='active')
    - Check if tenant is active (not deleted/suspended)
    - If session invalid: Return 401 Unauthorized
    - If membership missing/inactive or tenant inactive: Return 403 Forbidden
  - **Policy**: If membership no longer exists or tenant is inactive → 403 Forbidden on any request where sessions.tenant_id is now invalid
  - This validation happens in shared auth middleware used by all services, not just workspace-service

**Manual Intervention**: None

**Security Notes**:
- **Tenant Isolation**: `tenant_id` always from authenticated session (JWT reflects session state), never from request body/query parameters
- **Global Auth Middleware**: Platform-wide shared auth middleware validates active membership on every request:
  - Loads session → tenant_id
  - Confirms user has active membership (status='active') in sessions.tenant_id
  - Confirms tenant is active (not deleted/suspended)
  - Returns 401 if session invalid, 403 if membership missing/inactive or tenant inactive
  - All services MUST use this shared middleware (not just workspace-service)
- **Centralized Auth Middleware**: All services MUST use shared auth middleware that extracts tenant_id from session/JWT ONLY and ignores tenant_id in request payloads. Downstream handlers never read tenant_id from body/query for auth decisions.
- **Active Membership Verification**: Requested tenant_id from POST body is validated against user_tenants/memberships table with status='active' filter. The tenant_id from the active membership record (not the request body) is used as the authoritative source for session/JWT updates and audit logs.
- **Source of Truth**: Sessions table is ALWAYS the source of truth for tenant context. JWT claims are updated to reflect sessions.tenant_id (JWT is short-lived reflection of session state). Auth middleware must ALWAYS trust sessions.tenant_id when re-issuing access tokens, not client claims.
- **401 vs 403 Semantics**: 401 = not authenticated/invalid session. 403 = authenticated but not allowed (no active membership, inactive membership, or inactive tenant). If user has valid session but is not allowed in tenant, always return 403, not 401.
- **User Tracking**: users.last_active_tenant_id is updated on every workspace switch to maintain "last active workspace" state
- **Audit Log Semantics**: Audit logs use resource_type='user', resource_id=user_id, tenant_id=selected_tenant_id (new workspace) to indicate the context where the switch action occurred
- **Audit Log Action Types** (locked in): 
  - `login_workspace_switch` = switch during login flow (Flow 3)
  - `switch_workspace` = manual switch after login (Flow 6)
  - These are the only two action_types for workspace switching; do not introduce new variants
  - Use appropriate action_type based on context to maintain accurate analytics
- **Mid-Session Membership Changes**: If membership is removed or tenant is deleted mid-session, subsequent API calls with old sessions.tenant_id will return 403 Forbidden. Auth middleware validates active membership on every request.
- **Zero Workspaces Behavior**: If user has zero active memberships, return empty array [] and proceed to "Create your workspace" flow (consistent with Flow 3 login behavior)

---

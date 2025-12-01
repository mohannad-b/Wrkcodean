### Flow 5: API Key Creation & Usage

**Trigger**: Authenticated user (with proper role) creates API key for programmatic access to a specific workspace/tenant.

**Flow Diagram**:
```
User (authenticated) opens "Create API Key" form
    ↓
User submits API key form (name, permissions, expires_at)
    ↓
Backend: Resolve tenant_id from authenticated context
    - tenant_id MUST come from server-side session/JWT, never from client input
    - Verify user has active membership in tenant_id
    - Verify user has permission to create API keys for this tenant
    If no membership or insufficient permission:
        Return 403 Forbidden
    ↓
Validate request payload:
    - name: non-empty, max length (e.g., 255 chars)
    - permissions: non-empty array, values must be in allowed permission set
        - Allowed permissions: ['read_only', 'workflows_read', 'workflows_write', 'admin']
        - Permission set is centrally defined and enforced via shared permission matrix
    - expires_at:
        - Optional
        - If present: must be > now()
        - Enforce max TTL (e.g., <= 1 year)
    If validation fails:
        Return 400 Bad Request
    ↓
Generate API key (canonical process):
    1. Generate random_bytes (32+ bytes, cryptographically secure)
    2. Encode random_bytes as base64url or hex string
    3. Build raw_key string: "wrk_api_{env}_{encoded_random_string}"
        - {env} is cosmetic only (for human identification, e.g., "prod", "staging", "dev")
        - Backend NEVER parses or validates {env} - treat entire key as opaque string
        - {env} does NOT affect key validation or lookup
    4. Compute key_hash = HMAC-SHA256(raw_key, server_secret_key)
        - Use server-side secret key (stored in secure config, not in code)
        - This is the canonical hashing scheme (use everywhere: creation, lookup, tests, docs)
        - **HMAC Secret Rotation**: Assume a single active secret for now. Rotation strategy will be handled separately (may require KID versioning or multiple active secrets in future)
    - NEVER use SHA-256 alone (HMAC provides additional security)
    - NEVER use bcrypt/argon2 (salted hashes are not suitable for lookup)
    - NEVER store raw key in database
    ↓
Insert into api_keys table:
    - tenant_id
    - key_hash
    - name
    - permissions (JSON/array)
    - expires_at (nullable)
    - created_by_user_id
    - created_at = now()
    - last_used_at = NULL
    - revoked_at = NULL
    - revoked_by_user_id = NULL
    - status = 'active'
    ↓
Create audit log entry:
    - action_type = 'create_api_key'
    - resource_type = 'api_key'
    - resource_id = api_key_id
    - user_id = authenticated user id
    - tenant_id = tenant_id (from membership)
    - created_at = now()
    - metadata_json: { name, permissions, expires_at }
    ↓
Send notification email (optional but recommended):
    - template: `api_key_created`
    - includes: key name, tenant name, creator, created_at, last 4 chars of key
    ↓
Return plaintext key ONCE:
    - Include: raw_key, api_key_id, name, permissions, expires_at
    - UI shows "Copy this key now – it won't be shown again"
    ↓
User copies key and stores it securely
    ↓
[Subsequent API requests use: Authorization: Bearer <api_key>]
    ↓
Backend API key auth (per request):
    - Extract token from Authorization: Bearer header
    - **Centralized auth middleware**: Route authentication based on token prefix
        - If token starts with "wrk_api_": treat as API key, route to API key auth handler
        - Else: treat as JWT Bearer token, route to JWT auth handler
        - This routing logic MUST be centralized in shared auth middleware (not reimplemented per-service)
    - **No fallback**: If token starts with "wrk_api_" and HMAC lookup fails → Return 401 Unauthorized and STOP
        - Do NOT then try to parse it as a JWT
        - Do NOT implement fallback authentication
        - API key auth and JWT auth are mutually exclusive based on prefix
    - Compute key_hash = HMAC-SHA256(provided_token, server_secret_key) (same canonical scheme as creation)
    - Lookup api_keys by key_hash (unique index on key_hash, direct equality lookup)
    - If no match:
        Return 401 Unauthorized (stop here, do not fall back to JWT)
    - If status != 'active':
        Return 401 Unauthorized (Key revoked or invalid)
    - Note: revoked_at is informational; enforcement is based on status='revoked'
    - If expires_at IS NOT NULL AND expires_at < now():
        Return 401 Unauthorized (Key expired)
    ↓
    Determine tenant context:
        - tenant_id = api_keys.tenant_id
        - Do NOT accept tenant_id from client for API key auth
        - **API key auth bypasses user session**: For API-key-authenticated requests, ignore user sessions completely
        - Auth context comes solely from the key row: tenant_id, permissions
        - Do NOT augment key auth with current user session data
        - Do NOT check user membership or user roles for API-key-authenticated requests
        - This is a hard rule to maintain tenant isolation
        - Attach tenant_id and permissions to request context from api_keys row only
    ↓
    Permissions check:
        - **Enforcement happens ONLY at creation time**:
            - On create: Check requested_permission <= creator_role, else Return 403 Forbidden
            - This ensures effective permission = min(creator_user_role, api_key_permission) is enforced at creation
        - **At usage time**: 
            - ONLY check api_keys.permissions against the requested operation
            - NO dynamic user role lookups
            - NO recomputation of min(role, key) at runtime
            - API key permissions are the authoritative source for API-key-authenticated requests
        - If operation not allowed by api_keys.permissions: Return 403 Forbidden (Insufficient permissions)
    ↓
    Update usage metadata (async / best-effort):
        - last_used_at = now()
        - last_used_ip = request IP (optional)
    ↓
    Rate limiting and anomaly detection:
        - API key auth endpoints are protected by generic rate limiting
        - Feed usage patterns into security monitoring:
            - Sudden high volume from single key
            - Repeated invalid key attempts
            - Unusual access patterns
    ↓
    Proceed with requested operation under tenant_id
```

**API Endpoints**:
- `POST /v1/api-keys` - Create API Key
  - **Auth required**: User must be authenticated via user session/JWT (NOT via API key). If the Authorization header contains a token starting with `wrk_api_`, this endpoint MUST return 401 Unauthorized.
  - **Authorization required**: User must have tenant role ≥ 'admin' (or 'workflows_write' + explicit API key management permission)
  - **Explicit rule**: Requires tenant role ≥ admin (or equivalent permission level)
  - If insufficient role: Return 403 Forbidden
  - **Request body**:
    - name (string, required, max 255 chars)
    - permissions (array of strings, required, values must be in allowed set)
      - Allowed permissions: ['read_only', 'workflows_read', 'workflows_write', 'admin']
      - Permission set is centrally defined and enforced via shared permission matrix
    - expires_at (ISO8601, optional; must be > now() and ≤ max TTL, e.g., 1 year)
  - **Behavior**:
    - Resolve tenant_id from authenticated context (session/JWT), not from client input
    - Validate user membership in tenant_id
    - Validate user has tenant role ≥ 'admin' (or equivalent permission)
    - If insufficient role: Return 403 Forbidden
    - Validate payload (name, permissions, expires_at)
    - **Permission enforcement at creation**: Check requested_permission <= creator_role, else Return 403 Forbidden
    - **Generate raw key** (canonical process, in order):
        1. Generate random_bytes (32+ bytes, cryptographically secure)
        2. Encode random_bytes as base64url or hex string
        3. Build raw_key string: "wrk_api_{env}_{encoded_random_string}"
           - {env} is cosmetic only (e.g., "prod", "staging", "dev") - never parsed by backend
        4. Compute key_hash = HMAC-SHA256(raw_key, server_secret_key)
        - Note: key_hash is computed FROM the raw_key, not embedded in it
        - Use canonical hashing scheme (HMAC-SHA256 with server secret) everywhere
        - HMAC secret rotation: Assume single active secret for now (rotation strategy handled separately)
    - Insert into api_keys table (store key_hash, not raw_key)
    - Create audit_logs entry (action_type='create_api_key')
    - Send api_key_created email notification
  - **Response**: 201 Created
    - Body: { id, name, permissions, expires_at, created_at, key: <plaintext_once> }
    - **Note**: key field is only returned in this response, never again
- `GET /v1/api-keys` - List Tenant API Keys
  - **Auth required**: User must be authenticated via user session/JWT (NOT via API key). If the Authorization header contains a token starting with `wrk_api_`, this endpoint MUST return 401 Unauthorized.
  - **Authorization required**: 
    - Verify user has active membership in tenant (from authenticated context)
    - If no membership: Return 403 Forbidden
    - This prevents "I'm logged in but not in this workspace" information leakage
  - **Behavior**:
    - Lists API keys for current tenant that the user is allowed to see
    - Filter by tenant_id derived from server-side context (session/JWT)
    - **Visibility rules** (explicit):
      - Admins (users with 'admin' role for tenant): can see all API keys for the tenant
      - Non-admins: can only see API keys they created (created_by_user_id = current_user_id)
    - Never return key_hash or raw key
  - **Response**: 200 OK
    - Body: Array of { id, name, permissions, created_at, expires_at, last_used_at, status, created_by_user_id, revoked_at }
- `DELETE /v1/api-keys/{keyId}` - Revoke API Key
  - **Auth required**: User must be authenticated via user session/JWT (NOT via API key). If the Authorization header contains a token starting with `wrk_api_`, this endpoint MUST return 401 Unauthorized.
  - **Authorization required**: 
    - Requires tenant role ≥ 'admin' to revoke any key
    - Non-admins can only revoke keys they created (created_by_user_id = current_user_id)
    - If insufficient permission: Return 403 Forbidden
  - **Behavior**:
    - Lookup api_keys by id and tenant_id (from auth context, not client input)
    - If not found: Return 404 Not Found
    - Verify revocation permission:
      - If user is admin: can revoke any key in tenant
      - If user is non-admin: can only revoke if created_by_user_id = current_user_id
      - If permission check fails: Return 403 Forbidden
    - Update api_keys:
      - Set revoked_at = now()
      - Set revoked_by_user_id = current_user_id
      - Set status = 'revoked'
    - Create audit_logs entry (action_type='revoke_api_key')
    - Send api_key_revoked notification email
  - **Response**: 204 No Content

**Database Changes**:
- **api_keys table** (recommended columns):
  - id (PK)
  - tenant_id (FK → tenants, NOT NULL)
  - key_hash (unique index, NOT NULL)
    - Must use canonical hashing scheme: HMAC-SHA256(raw_key, server_secret_key)
    - This is the single, canonical scheme (use everywhere: creation, lookup, tests, docs)
    - NOT SHA-256 alone (HMAC provides additional security)
    - NOT bcrypt/argon2 (salted hashes cannot be used for WHERE key_hash = ?)
  - name (string, NOT NULL, max 255 chars)
  - permissions (JSON/array, NOT NULL)
  - expires_at (nullable timestamp)
  - status (enum: 'active' | 'revoked', default 'active')
  - created_by_user_id (FK → users, NOT NULL)
  - created_at (timestamp, NOT NULL, default now())
  - last_used_at (nullable timestamp)
  - last_used_ip (optional string)
  - revoked_at (nullable timestamp)
  - revoked_by_user_id (nullable FK → users)
- **On create**:
  - Insert into `api_keys` (tenant_id, key_hash, name, permissions, expires_at, created_by_user_id, created_at, status='active')
  - Insert into `audit_logs` (action_type='create_api_key', resource_type='api_key', resource_id=api_key_id, user_id=current_user_id, tenant_id=tenant_id, created_at=now(), metadata_json={'name': name, 'permissions': permissions, 'expires_at': expires_at})
- **On revoke**:
  - Update `api_keys` SET status='revoked', revoked_at=now(), revoked_by_user_id=current_user_id WHERE id=key_id AND tenant_id=tenant_id_from_auth
  - Insert into `audit_logs` (action_type='revoke_api_key', resource_type='api_key', resource_id=api_key_id, user_id=current_user_id, tenant_id=tenant_id, created_at=now())
- **On use** (optional/best-effort, async):
  - Update `api_keys` SET last_used_at=now(), last_used_ip=request_ip WHERE id=api_key_id
- **On user deactivation or membership removal**:
  - **Policy (canonical)**: API keys remain valid until explicitly revoked (keys are independent of creator's current status)
  - **Rationale**: Keys may be used by automated systems; revoking on membership change could break integrations
  - **Behavior**: When user is removed from tenant or account is suspended, their created API keys remain active
  - Keys must be explicitly revoked by an admin or through the DELETE endpoint
  - This policy is fixed and must be implemented consistently

**Role Requirements** (explicit rules):
- **POST /v1/api-keys** (Create): Requires tenant role ≥ 'admin' (or 'workflows_write' + explicit API key management permission)
- **GET /v1/api-keys** (List): 
  - Admins: can see all API keys for the tenant
  - Non-admins: can only see API keys they created (created_by_user_id = current_user_id)
- **DELETE /v1/api-keys/{id}** (Revoke):
  - Admins: can revoke any key in tenant
  - Non-admins: can only revoke keys they created (created_by_user_id = current_user_id)

**Permission Model**:
- **Allowed permissions**: ['read_only', 'workflows_read', 'workflows_write', 'admin']
- Permission set is centrally defined and enforced via a shared permission matrix
- **Key creation permission check** (enforcement happens ONLY here):
  - On create: Check requested_permission <= creator_role, else Return 403 Forbidden
  - User can only create API keys with permissions ≤ their own role
  - Effective permission at creation = min(creator_user_role, requested_key_permission)
  - Example: Non-admin user cannot create 'admin' permission key (enforced at creation time)
  - This is the ONLY place where effective permission is computed
- **Key usage permission check** (no role lookup):
  - For API-key-authenticated requests, api_keys.permissions is the authoritative source
  - ONLY check api_keys.permissions against the requested operation
  - NO dynamic user role lookups at usage time
  - NO recomputation of min(role, key) at runtime
  - Permissions are validated against the requested operation during API key usage
  - Enforcement happens at the API endpoint level based on the permission matrix

**Authentication Middleware**:
- **Centralized token routing**: Token prefix detection (wrk_api_ vs JWT) MUST be implemented in shared auth middleware
- Shared middleware checks Authorization: Bearer header:
  - If token starts with "wrk_api_": route to API key authentication handler
  - Else: route to JWT Bearer token authentication handler
- This routing logic must NOT be reimplemented per-service or per-endpoint
- All endpoints use the same shared auth middleware for consistent authentication routing
- **Management endpoints restriction**:
  - The `/v1/api-keys` management endpoints (POST /v1/api-keys, GET /v1/api-keys, DELETE /v1/api-keys/{id}) MUST ONLY accept JWT-based user authentication.
  - If the shared auth middleware sees an Authorization token starting with `wrk_api_` for any `/v1/api-keys` endpoint:
      - It MUST reject the request with 401 Unauthorized.
      - It MUST NOT treat the token as a valid JWT.
  - API keys are for calling tenant APIs, not for managing API keys themselves.

**Tenant Isolation**:
- tenant_id is always taken from authenticated context (session/JWT) for API key creation/listing/revocation
- Never trust any client-provided tenant_id for API key operations
- API key auth always infers tenant from the key row (api_keys.tenant_id), not from headers/body
- For API-key-authenticated requests, do not check user membership or roles; tenant context comes exclusively from api_keys.tenant_id and permissions from api_keys.permissions.
- All API key operations are scoped to the tenant_id from the authenticated context or the key's tenant_id

**Notifications**:
- **Email**: `api_key_created` - Sent when API key is created
  - To: key creator's email (and optionally security/admin contact)
  - Include: key name, tenant name, creator, timestamp, IP, last few chars of key (for identification)
  - **Tenant isolation**: tenant name and tenant admins are derived from tenant_id (from authenticated context), not from client input
- **Email**: `api_key_revoked` - Sent when API key is revoked
  - To: key creator and/or tenant admins
  - Include: key name, tenant name, revoker, timestamp
  - **Tenant isolation**: tenant name and tenant admins are derived from tenant_id (from authenticated context), not from client input

**Exceptions**:
- **Invalid permissions / invalid payload**: Return 400 Bad Request
- **Unauthenticated user**: Return 401 Unauthorized
- **No membership or insufficient permission (user-auth endpoints)**: For POST/GET/DELETE /v1/api-keys (which ONLY accept JWT-based user authentication), if the caller has no active membership in the tenant or lacks the required role, return 403 Forbidden.
- **API-key-authenticated requests**:
    - API keys MUST NOT be used to call POST/GET/DELETE /v1/api-keys.
    - If an Authorization token starting with `wrk_api_` is presented to any `/v1/api-keys` endpoint, the middleware MUST return 401 Unauthorized.
- **Key expired** (using as Bearer token): Return 401 Unauthorized, message: "API key has expired"
- **Key revoked**: Return 401 Unauthorized, message: "API key has been revoked"
- **Key not found / invalid token**: Return 401 Unauthorized, message: "Invalid API key"
- **Insufficient permissions for operation**: Return 403 Forbidden, message: "Insufficient permissions"
- **Key not found** (on revoke): Return 404 Not Found

**Security Notes**:
- **Key Storage**: Raw API keys are NEVER stored in the database. Only key_hash is stored using canonical hashing scheme: HMAC-SHA256(raw_key, server_secret_key). bcrypt/argon2 are NOT used for API keys (they are salted and not suitable for direct equality lookup).
- **Canonical Hashing Scheme**: HMAC-SHA256 with server secret key is the single, canonical hashing scheme. Use this everywhere: key creation, key lookup, tests, documentation. Do not use SHA-256 alone or any other hashing scheme.
- **HMAC Secret Rotation**: Assume a single active secret for now. Rotation strategy will be handled separately (may require KID versioning or multiple active secrets in future). Do not over-engineer rotation support initially.
- **Key Format**: API keys MUST have "wrk_api_" prefix to distinguish them from JWT Bearer tokens.
  - Format: "wrk_api_{env}_{encoded_random_string}"
  - {env} is cosmetic only (for human identification) - backend NEVER parses or validates it
  - Treat entire key as opaque string for lookup
- **Centralized Auth Middleware**: Token prefix routing (wrk_api_ vs JWT) MUST be implemented in shared auth middleware, not reimplemented per-service. This ensures consistent authentication routing across all endpoints.
- **No Fallback Authentication**: If token starts with "wrk_api_" and HMAC lookup fails → Return 401 Unauthorized and STOP. Do NOT try to parse it as a JWT. API key auth and JWT auth are mutually exclusive based on prefix.
- **API Key Auth Bypasses User Session**: For API-key-authenticated requests, ignore user sessions completely. Auth context comes solely from the key row: tenant_id, permissions. Do NOT augment key auth with current user session data. This is a hard rule to maintain tenant isolation.
- **Key Display**: Plaintext key is only returned once in the creation response. It cannot be retrieved again.
- **Tenant Isolation**: tenant_id is always derived from server-side authenticated context or from the api_keys.tenant_id row. Never trust client-provided tenant_id.
- **Key Validation**:
  - For user-authenticated endpoints (POST/GET/DELETE /v1/api-keys), validate both tenant membership and role-based permissions before proceeding.
  - For API-key-authenticated requests, validate ONLY api_keys.permissions against the requested operation (no user session, no membership or role checks at usage time).
- **Key Expiration**: Keys can have optional expiration. Expired keys are rejected with 401 Unauthorized.
- **Key Revocation**: Revoked keys are immediately invalidated (status='revoked'). Enforcement is based on status field; revoked_at is informational. Revocation is logged in audit_logs.
- **User Deactivation Policy**: API keys remain valid when creator is removed from tenant or account is suspended. Keys must be explicitly revoked. This policy is fixed and must be implemented consistently.
- **Usage Tracking**: last_used_at and last_used_ip are updated on each API key usage (best-effort, async to avoid blocking requests).
- **Rate Limiting**: API key auth endpoints are protected by generic rate limiting. Usage patterns are monitored for anomalies (sudden high volume, repeated invalid keys, unusual access patterns).

**Note**: API keys provide programmatic access to a specific tenant. They should be treated with the same security considerations as passwords - stored securely by users, rotated regularly, and revoked immediately if compromised.

---

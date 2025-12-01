### Flow 3: User Login

**Trigger**: User initiates login (either via SSO or local email/password)

**Security Requirements**:
- **PKCE (Proof Key for Code Exchange)**: Required for OAuth 2.0 authorization code flow
  - Generate `code_verifier` (random string, 43-128 chars)
  - Generate `code_challenge` = SHA256(code_verifier)
  - Send `code_challenge` + `code_challenge_method=S256` in authorization request
  - Verify `code_verifier` matches `code_challenge` on callback
- **Anti-replay protection**: 
  - Validate `state` parameter (random nonce, stored in session)
  - Reject if `state` missing, expired, or already used
  - State expires after 10 minutes
  - State must be single-use: mark as used immediately after validation, reject if already used
- **Nonce validation** (for OpenID Connect):
  - Generate random nonce, store in session
  - Include nonce in authorization request
  - Validate nonce in ID token matches stored nonce
  - Reject if nonce missing or mismatched
  - Nonce must be single-use: mark as used immediately after validation, reject if already used
  - Nonce expires after 10 minutes
- **Rate limiting**: Max 10 SSO callback attempts per IP per minute
- **Refresh token rotation**: Mandatory on every successful login - generate new refresh token and invalidate all old refresh tokens for the user
- **Identity resolution**: Never use tenant context for identity lookup
  - Primary: lookup by `idp_sub` (most reliable)
  - Fallback: lookup by `email` only (global lookup, not tenant-scoped)
  - Never merge or auto-convert between local and SSO accounts

**Flow Diagram - SSO Login**:
```
User clicks "Continue with SSO"
    ↓
Generate PKCE parameters (same as Flow 1A):
    - code_verifier (random, 43-128 chars)
    - code_challenge = SHA256(code_verifier)
    - state (random nonce, stored in session, expires 10 min, single-use)
    - nonce (random, for OpenID Connect, stored in session, expires 10 min, single-use)
    ↓
Redirect to IdP (Auth0/Okta/Google/Microsoft/etc.):
    - Include: code_challenge, code_challenge_method=S256, state, nonce
    - Store code_verifier, state, nonce in session
    ↓
User authenticates at IdP
    ↓
IdP redirects to callback URL with authorization code/token
    ↓
IdP redirects to callback with:
    - authorization_code
    - state (must match stored state)
    ↓
Validate state parameter:
    - Check state exists in session
    - Check state not expired (10 min)
    - Check state not already used (mark as used immediately)
    - If invalid: Return 401, log security event, redirect to login
    ↓
Exchange authorization_code for tokens:
    - POST to IdP token endpoint
    - Include: code, code_verifier (verify matches code_challenge)
    - IdP returns: access_token, id_token
    ↓
Validate ID token:
    - Verify signature (JWT)
    - Verify issuer matches expected IdP
    - Verify audience matches client_id
    - Verify expiration (not expired)
    - Validate nonce in ID token matches stored nonce (mark nonce as used immediately)
    - If invalid: Return 401, log security event, redirect to login
    ↓
Rate limit check:
    - Check IP address against rate limit (max 10 attempts/min)
    - If exceeded: Return 429, log security event
    ↓
Backend validates token and extracts claims:
    - email (from IdP claims)
    - idp_sub (IdP subject identifier)
    - email_verified (from IdP claims)
    ↓
Identity resolution (NEVER use tenant context):
    - Primary: Lookup user by idp_sub
    - If not found: Fallback lookup by email (global, not tenant-scoped)
    - If both idp_sub and email lookup succeed but refer to different user records:
        Reject login with 409 "Account conflict detected. Please contact support."
        Flag for admin cleanup (log to monitoring/alerts)
    - If email lookup returns more than one user record:
        Reject login with 409 "Multiple accounts with this email exist. Please contact support."
        Flag for admin cleanup (log to monitoring/alerts)
    ↓
If user found:
    If user exists but auth_provider != 'idp':
        Reject immediately (Return 400, "Please use local login")
        Do NOT auto-convert auth_provider
    ↓
If user found and active:
    Check user status (active, not suspended)
    Check workspace memberships:
        - Query user_tenants/memberships for user_id
        - If user has workspace(s): Get workspace list
    ↓
    If user has workspace(s):
        Determine tenant_id:
            - Use last_active_tenant_id from users.last_active_tenant_id (if set and user still has membership)
            - Otherwise: use first available workspace from user_tenants/memberships
        Generate JWT access token (15 min expiry, includes tenant_id of last active workspace)
        Generate NEW refresh token (7 day expiry) - MANDATORY rotation to prevent session fixation
        Invalidate ALL old refresh tokens for this user (mandatory, not optional)
        Create/update session record with new refresh token
        Update users.last_active_tenant_id = tenant_id
        Update users.last_login_at = now()
        Create audit log entry (action_type='user_login', resource_type='user', resource_id=user_id, user_id, tenant_id, created_at=now())
        If only one workspace:
            Redirect to: https://{subdomain}.wrk.com/app
        If multiple workspaces:
            Show workspace picker, then redirect to selected workspace
            When user selects workspace:
                Backend validates user has membership in selected tenant_id (never trust client-provided tenant_id)
                Backend updates session's tenant_id to the selected workspace (after validation)
                Update users.last_active_tenant_id to the selected workspace
                Create audit log entry (action_type='user_login', resource_type='user', resource_id=user_id, user_id, tenant_id, created_at=now()) (action_type='login_workspace_switch', resource_type='user', resource_id=user_id, user_id, tenant_id=selected_tenant_id, created_at=now())
    ↓
    If user has NO workspace membership:
        Generate JWT access token (no tenant_id yet)
        Show "Create your workspace" step (Flow 1A workspace creation)
    ↓
If user not found but has a valid pending invitation:
    Check for valid invitation token:
        - Lookup invitation by email (invitation_token exists, not expired, not used)
        - Only allowed if exactly ONE valid invitation exists for this email
        - If multiple invitations or no invitation: proceed to workspace creation flow
    ↓
    Auto-provision according to Flow 2 (SSO Invitation branch):
        - Create user record with:
            - idp_sub (from IdP)
            - email (from IdP)
            - email_verified=true (IdP is source of truth)
            - status='active'
            - auth_provider='idp'
        - Clear/mark invitation token as used
        - Create membership (user_id, tenant_id from invitation, role from invitation)
        - Invitation login ALWAYS lands the user in the tenant that issued the invite (use invitation tenant_id as login context)
    Generate JWT access token (includes tenant_id from invitation)
    Generate NEW refresh token (7 day expiry) - MANDATORY rotation
    Invalidate ALL old refresh tokens for this user (mandatory)
    Create session record with new refresh token
    Update users.last_active_tenant_id = tenant_id (from invitation)
    Update users.last_login_at = now()
    Create audit log entries:
        - action_type='accept_invitation', resource_type='invitation', resource_id=invitation_id, user_id, tenant_id=invitation_tenant_id, created_at=now()
        - action_type='join_workspace_via_invite', resource_type='membership', resource_id=membership_id, user_id, tenant_id=invitation_tenant_id, created_at=now()
        - action_type='user_login', resource_type='user', resource_id=user_id, user_id, tenant_id=invitation_tenant_id, created_at=now()
    Return tokens + user info + workspace context (tenant_id from invitation)
    ↓
[Front-end stores tokens]
    ↓
[Subsequent requests include Bearer token with tenant_id in JWT]
```

**Note**: Flow 3 uses the same PKCE/state/nonce validation rules as Flow 1A. The SSO callback MUST enforce full validation (state parameter single-use and expiry, code_verifier, ID token signature/issuer/audience/expiration, nonce single-use and expiry).

**Flow Diagram - Local Login**:
```
User submits email + password
    ↓
Lookup user globally by email (NEVER use tenant context for identity resolution)
    ↓
If user not found:
    Return 401 Unauthorized
    ↓
Check user.auth_provider = 'local' (reject if 'idp'):
    If auth_provider != 'local':
        Return 400, "Please use SSO to sign in"
        Do NOT auto-convert auth_provider
    ↓
Verify password hash (bcrypt)
    ↓
Check user status (active, not suspended)
    ↓
Check email_verified = true (only if email verification is enabled for tenant/environment)
    ↓
Check workspace memberships:
    - Query user_tenants/memberships for user_id
    ↓
If user has workspace(s):
    Determine tenant_id:
        - Use last_active_tenant_id from users.last_active_tenant_id (if set and user still has membership)
        - Otherwise: use first available workspace from user_tenants/memberships
    Generate JWT access token (15 min expiry, includes tenant_id of last active workspace)
    Generate NEW refresh token (7 day expiry) - MANDATORY rotation to prevent session fixation
    Invalidate ALL old refresh tokens for this user (mandatory, not optional)
    Create/update session record with new refresh token
    Update users.last_active_tenant_id = tenant_id
    Update users.last_login_at = now()
    Create audit log entry (action_type='user_login', resource_type='user', resource_id=user_id, user_id, tenant_id, created_at=now())
    If only one workspace:
        Return tokens + user info
    If multiple workspaces:
        Show workspace picker, then redirect to selected workspace
        When user selects workspace:
            Backend validates user has membership in selected tenant_id (never trust client-provided tenant_id)
            Backend updates session's tenant_id to the selected workspace (after validation)
            Update users.last_active_tenant_id to the selected workspace
            Create audit log entry (action_type='user_login', resource_type='user', resource_id=user_id, user_id, tenant_id, created_at=now()) (action_type='login_workspace_switch', resource_type='user', resource_id=user_id, user_id, tenant_id=selected_tenant_id, created_at=now())
        Return tokens + user info
    ↓
If user has NO workspace membership:
    Generate JWT access token (no tenant_id yet)
    Show "Create your workspace" step (Flow 1B workspace creation)
    ↓
[Front-end stores tokens]
    ↓
[Subsequent requests include Bearer token]
```

**API Endpoints**:
- `GET /v1/auth/sso/:provider/login` - Initiate SSO login (redirects to IdP with PKCE, state, nonce)
  - **Note**: This same endpoint is used for both login (Flow 3) and signup (Flow 1A). The UX context differs (login page vs signup page), but the endpoint and OAuth flow are identical.
  - Generates: code_verifier, code_challenge, state (single-use, 10 min expiry), nonce (single-use, 10 min expiry)
  - **Note**: This same endpoint is used for both login (Flow 3) and signup (Flow 1A). The UX context differs (login page vs signup page), but the endpoint and OAuth flow are identical.
- `GET /v1/auth/sso/:provider/callback` - Handle IdP callback, validate PKCE/state/nonce, create session
  - **Note**: This callback enforces PKCE, state (single-use, 10 min expiry), and nonce (single-use, 10 min expiry) validation exactly as defined in Flow 1A before validating the IdP token and creating a session
  - **Rate limiting**: Max 10 callback attempts per IP per minute
  - Validates: state (exists, not expired, not used, mark as used), nonce (matches stored, not used, mark as used), code_verifier, ID token signature/issuer/audience/expiration
  - Rotates refresh tokens after successful login to prevent session fixation (mandatory)
- `POST /v1/auth/login` - Authenticate with email/password (local auth only)
  - Validates email at global users table, not per-tenant
  - Rotates refresh tokens after successful login to prevent session fixation (mandatory)
- `POST /v1/auth/refresh` - Refresh access token using refresh token

**Database Changes**:
- Upsert `sessions` (user_id, tenant_id, refresh_token, expires_at, last_used_at) - with NEW refresh token (rotated, mandatory)
- Update `users` (idp_sub, email_verified=true, last_active_tenant_id, last_login_at=now()) - on successful SSO login
- Update `users` (last_active_tenant_id, last_login_at=now()) - on successful local login
- Update `users` (last_active_tenant_id) - when user switches workspaces via picker
- Invalidate ALL old refresh tokens (mandatory): Mark all old sessions as invalid or delete them for this user
- Insert into `audit_logs` (action_type='user_login', resource_type='user', resource_id=user_id, user_id, tenant_id, created_at=now(), metadata_json={'login_method': 'sso'|'local'}) - on successful login
- Insert into `audit_logs` (action_type='accept_invitation', resource_type='invitation', resource_id=invitation_id, user_id, tenant_id=invitation_tenant_id, created_at=now()) - if SSO invited user auto-provisioning
- Insert into `audit_logs` (action_type='auto_provision_workspace_join', resource_type='user', resource_id=user_id, user_id, tenant_id, created_at=now(), metadata_json={'domain': email_domain}) - if domain auto-provision for SSO users
- Insert into `audit_logs` (action_type='login_workspace_switch'
- Insert into `system_alerts` or monitoring logs - if account conflict or duplicate email detected (for admin cleanup), resource_type='user', resource_id=user_id, user_id, tenant_id=selected_tenant_id, created_at=now()) - when user switches workspace via picker
- Insert into `audit_logs` (action_type='join_workspace_via_invite', resource_type='membership', resource_id=membership_id, user_id, tenant_id=invitation_tenant_id, created_at=now()) - if SSO invited user auto-provisioning

**Tenant Isolation**: `tenant_id` for sessions and audit_logs must always be derived from backend membership resolution (e.g., last active workspace or selected workspace), never from any client-provided request data. Users with no workspace membership must have `tenant_id=null` in sessions and audit logs.

**Notifications**:
- **Email**: Login from new device/IP (template: `login_new_device`) - optional security feature

**Exceptions**:
- **Invalid email/password** (local): Return 401 Unauthorized
- **User not verified** (local, if verification enabled): Return 403, resend verification email
- **User suspended**: Return 403, contact admin
- **Too many failed attempts** (local): Rate limit, temporary lockout (15 min)
- **Too many SSO callback attempts**: Return 429, rate limit exceeded (max 10 attempts/IP/min)
- **Invalid IdP token** (SSO): Return 401, redirect to IdP login
- **State parameter invalid/missing/expired/used** (SSO): Return 401, log security event, redirect to login
- **Nonce invalid/missing/mismatched/used** (SSO): Return 401, log security event, redirect to login
- **PKCE verification failed** (SSO): Return 401, log security event, redirect to login
- **Account conflict (idp_sub vs email mismatch)**: Return 409 "Account conflict detected. Please contact support." Flag for admin cleanup.
- **Multiple accounts with same email**: Return 409 "Multiple accounts with this email exist. Please contact support." Flag for admin cleanup.
- **User has auth_provider='idp' but trying local login**: Return 400, redirect to SSO login with message "Please use SSO to sign in". Do NOT auto-convert auth_provider.
- **User has auth_provider='local' but trying SSO**: Return 400, instruct user to use local login or a separate explicit account-linking flow. Do NOT auto-convert auth_provider in this flow.
- **Email verification errors for SSO users**: Must NOT appear - SSO users are always told to use their IdP for any account issues
- **Invalid workspace selection from picker**: Return 403 "You do not have access to this workspace"

**Manual Intervention**: None

**Note**: In SSO mode, password reset and email verification errors must **not** appear. Users are always told to use their IdP for account management. Email verification check only applies for `auth_provider='local'` and only if verification is enabled for that environment/tenant.

**Last Active Workspace**: Stored in `users.last_active_tenant_id` and updated on every successful login and workspace switch. Used to determine which workspace to redirect the user to when they have multiple workspace memberships. If last_active_tenant_id is null or user no longer has membership, use first available workspace from user_tenants/memberships.

**Identity Resolution**: Always lookup by `idp_sub` first (most reliable), then by `email` if not found. Never use "email + tenant context" for identity lookup. Never merge or auto-convert between local and SSO accounts.

**Session Fixation Prevention**: Refresh tokens are rotated (regenerated) after every successful login (mandatory). ALL old refresh tokens must be invalidated (mandatory, not optional) for enhanced security.

**Invited User Auto-Provisioning**:
- **SSO**: Only allowed if exactly ONE valid invitation token exists for the email. Invitation login always lands the user in the tenant that issued the invite (use invitation tenant_id as login context). Multiple invitations or no invitation with no domain auto-provision results in workspace creation flow.
- **Local**: Only allowed if exactly ONE valid invitation token exists for the email. Invitation login always lands the user in the tenant that issued the invite. Multiple invitations or no invitation results in workspace creation flow.

**Domain Auto-Provisioning** (SSO only): When a user has NO workspace membership and NO invitation, check for domain-based auto-provision rules:
- Extract email domain from user email (e.g., `@acme.com`)
- Query `tenant_auto_provision_domains` for matching domain
- If exactly ONE tenant matches: Auto-create membership, assign tenant_id, redirect to workspace
- If ZERO or MULTIPLE matches: Show "Create your workspace" flow (no auto-provision)
- Only applies to SSO users (not local auth)

**Account Conflict Detection**: If `idp_sub` lookup and `email` lookup both succeed but refer to different user records, this indicates a data integrity issue. The login must be rejected immediately, and the conflict must be flagged for admin cleanup. Do NOT attempt to merge or auto-reconcile accounts.

**Duplicate Email Detection**: If email lookup returns more than one user record (rare edge case), reject login and flag for admin cleanup. This should never occur in normal operations but may happen due to data migration or manual intervention.

**No Automatic Account Conversion**: This flow explicitly prohibits automatic conversion between local and SSO accounts. If a user exists with `auth_provider='local'` but attempts SSO login, or vice versa, the login must be rejected with a clear error message directing the user to use the correct authentication method. Account linking must be handled through a separate, explicit account-linking flow with proper user consent and verification.
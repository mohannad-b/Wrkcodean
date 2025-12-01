### Flow 3: User Login

**Trigger**: User initiates login (either via SSO or local email/password)

**Flow Diagram - SSO Login**:
```
User clicks "Continue with SSO"
    ↓
Generate PKCE parameters (same as Flow 1A):
    - code_verifier (random, 43-128 chars)
    - code_challenge = SHA256(code_verifier)
    - state (random nonce, stored in session, expires 10 min)
    - nonce (random, for OpenID Connect, stored in session)
    ↓
Redirect to IdP (Auth0/Okta/Google/Microsoft/etc.):
    - Include: code_challenge, code_challenge_method=S256, state, nonce
    - Store code_verifier, state, nonce in session
    ↓
User authenticates at IdP
    ↓
IdP redirects to callback URL with authorization code/token
    ↓
Validate PKCE/state/nonce (MUST perform full validation exactly like Flow 1A):
    - Validate state parameter (exists, not expired, not used, mark as used)
    - Exchange authorization_code for tokens with code_verifier
    - Validate ID token signature, issuer, audience, expiration
    - Validate nonce in ID token matches stored nonce
    - Rate limit: max 10 callback attempts per IP per minute
    ↓
Backend validates token and extracts claims:
    - email (from IdP claims)
    - idp_sub (IdP subject identifier)
    - email_verified (from IdP claims)
    ↓
Lookup user by idp_sub (primary). If not found, lookup by email (fallback). Never use tenant context to resolve identity.
    ↓
If user found:
    If user exists but auth_provider != 'idp':
        Reject immediately as per Exceptions (Return 400, use local login)
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
        Generate NEW refresh token (7 day expiry) - rotated to prevent session fixation
        Invalidate any old refresh tokens for this user (optional, for enhanced security)
        Create/update session record with new refresh token
        Update users.last_active_tenant_id = tenant_id
        Update users.last_login_at = now()
        Create audit log entry
        If only one workspace:
            Redirect to: https://{subdomain}.wrk.com/app
        If multiple workspaces:
            Show workspace picker, then redirect to selected workspace
            When user selects workspace:
                Backend updates session's tenant_id to the selected workspace
                Update users.last_active_tenant_id to the selected workspace
    ↓
    If user has NO workspace membership:
        Generate JWT access token (no tenant_id yet)
        Show "Create your workspace" step (Flow 1A workspace creation)
    ↓
If user not found but has a valid pending invitation or tenant domain auto-provision is enabled:
    Check for valid invitation token:
        - Lookup invitation by email (invitation_token exists, not expired, not used)
        - Only allowed if exactly ONE valid invitation exists for this email
        - If multiple invitations or no invitation: Return 401, user not found
    ↓
    Auto-provision according to Flow 2 (SSO Invitation branch):
        - Create user record with idp_sub, email_verified=true, status='active'
        - Clear/mark invitation token as used
        - Create membership (user_id, tenant_id from invitation, role from invitation)
        - Invitation login ALWAYS lands the user in the tenant that issued the invite
    Generate JWT access token (includes tenant_id from invitation)
    Generate NEW refresh token - rotated to prevent session fixation
    Create session record
    Update users.last_active_tenant_id = tenant_id (from invitation)
    Update users.last_login_at = now()
    Create audit log entries (accept_invitation, join_workspace_via_invite, user_login)
    Return tokens + user info + workspace context (tenant_id from invitation)
    ↓
[Front-end stores tokens]
    ↓
[Subsequent requests include Bearer token with tenant_id in JWT]
```

**Note**: Flow 3 uses the same PKCE/state/nonce validation rules as Flow 1A. The SSO callback MUST enforce full validation (state parameter, code_verifier, ID token signature/issuer/audience/expiration, nonce).

**Flow Diagram - Local Login**:
```
User submits email + password
    ↓
Lookup user globally by email
    ↓
Check user.auth_provider = 'local' (reject if 'idp')
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
    Generate NEW refresh token (7 day expiry) - rotated to prevent session fixation
    Invalidate any old refresh tokens for this user (optional, for enhanced security)
    Create/update session record with new refresh token
    Update users.last_active_tenant_id = tenant_id
    Update users.last_login_at = now()
    Create audit log entry
    If only one workspace:
        Return tokens + user info
    If multiple workspaces:
        Show workspace picker, then redirect to selected workspace
        When user selects workspace:
            Backend updates session's tenant_id to the selected workspace
            Update users.last_active_tenant_id to the selected workspace
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
- `GET /v1/auth/sso/:provider/callback` - Handle IdP callback, validate PKCE/state/nonce, create session
  - **Note**: This callback enforces PKCE, state, and nonce validation exactly as defined in Flow 1A before validating the IdP token and creating a session
  - **Rate limiting**: Max 10 callback attempts per IP per minute
  - Validates: state, nonce, code_verifier, ID token signature/issuer/audience/expiration
  - Rotates refresh tokens after successful login to prevent session fixation
- `POST /v1/auth/login` - Authenticate with email/password (local auth only)
  - Validates email at global users table, not per-tenant
  - Rotates refresh tokens after successful login to prevent session fixation
- `POST /v1/auth/refresh` - Refresh access token using refresh token

**Database Changes**:
- Upsert `sessions` (user_id, tenant_id, refresh_token, expires_at, last_used_at) - with NEW refresh token (rotated)
- Update `users` (idp_sub, email_verified=true, last_active_tenant_id, last_login_at=now()) - on successful login
- Update `users` (last_active_tenant_id) - when user switches workspaces via picker
- Invalidate old refresh tokens (optional): Mark old sessions as invalid or delete them for enhanced security
- Insert into `audit_logs` (action_type='user_login', resource_type='user', resource_id=user_id, user_id, tenant_id, created_at=now()) - on successful login
- Insert into `audit_logs` (action_type='accept_invitation', join_workspace_via_invite) - if SSO invited user auto-provisioning

**Tenant Isolation**: `tenant_id` for sessions and audit_logs must always be derived from backend membership resolution (e.g., last active workspace or selected workspace), never from any client-provided request data. Users with no workspace membership must have `tenant_id=null` in sessions and audit logs.

**Notifications**:
- **Email**: Login from new device/IP (template: `login_new_device`) - optional security feature

**Exceptions**:
- **Invalid email/password** (local): Return 401 Unauthorized
- **User not verified** (local, if verification enabled): Return 403, resend verification email
- **User suspended**: Return 403, contact admin
- **Too many failed attempts** (local): Rate limit, temporary lockout (15 min)
- **Invalid IdP token** (SSO): Return 401, redirect to IdP login
- **User has auth_provider='idp' but trying local login**: Return 400, redirect to SSO login with message "Please use SSO to sign in"
- **User has auth_provider='local' but trying SSO**: Return 400, instruct user to use local login or a separate explicit account-linking flow. Do not auto-convert auth_provider in this flow.
- **Email verification errors for SSO users**: Must NOT appear - SSO users are always told to use their IdP for any account issues

**Manual Intervention**: None

**Note**: In SSO mode, password reset and email verification errors must **not** appear. Users are always told to use their IdP for account management. Email verification check only applies for `auth_provider='local'` and only if verification is enabled for that environment/tenant.

**Last Active Workspace**: Stored in `users.last_active_tenant_id` and updated on every successful login and workspace switch. Used to determine which workspace to redirect the user to when they have multiple workspace memberships. If last_active_tenant_id is null or user no longer has membership, use first available workspace from user_tenants/memberships.

**Identity Resolution**: Always lookup by `idp_sub` first (most reliable), then by `email` if not found. Never use "email + tenant context" for identity lookup.

**Session Fixation Prevention**: Refresh tokens are rotated (regenerated) after every successful login. Old refresh tokens may be invalidated for enhanced security.

**Invited User Auto-Provisioning**: Only allowed for SSO login if exactly ONE valid invitation token exists for the email. Invitation login always lands the user in the tenant that issued the invite. Multiple invitations or no invitation results in 401 user not found.
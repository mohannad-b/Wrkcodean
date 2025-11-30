### Flow 3: User Login

**Trigger**: User initiates login (either via SSO or local email/password)

**Flow Diagram - SSO Login**:
```
User clicks "Continue with SSO"
    ↓
Redirect to IdP (Auth0/Okta/Google/Microsoft/etc.)
    ↓
User authenticates at IdP
    ↓
IdP redirects to callback URL with authorization code/token
    ↓
Backend validates token and extracts claims:
    - email (from IdP claims)
    - idp_sub (IdP subject identifier)
    - email_verified (from IdP claims)
    ↓
Lookup user by idp_sub OR (email + tenant context)
    ↓
If user found and active:
    Check user status (active, not suspended)
    Check workspace memberships:
        - Query user_tenants/memberships for user_id
        - If user has workspace(s): Get workspace list
    ↓
    If user has workspace(s):
        Generate JWT access token (15 min expiry, includes tenant_id of last active workspace)
        Generate refresh token (7 day expiry)
        Create/update session record
        Create audit log entry
        If only one workspace:
            Redirect to: https://{subdomain}.wrk.com/app
        If multiple workspaces:
            Show workspace picker, then redirect to selected workspace
    ↓
    If user has NO workspace membership:
        Generate JWT access token (no tenant_id yet)
        Show "Create your workspace" step (Flow 1A workspace creation)
    ↓
If user not found but allowed (e.g., invited user):
    Auto-provision according to Flow 2 (SSO Invitation branch)
        Create session
        Create audit log entry
    Return tokens + user info + workspace context
    ↓
[Front-end stores tokens]
    ↓
[Subsequent requests include Bearer token with tenant_id in JWT]
```

**Flow Diagram - Local Login**:
```
User submits email + password
    ↓
Validate email exists in tenant
    ↓
Check user.auth_provider = 'local' (reject if 'idp')
    ↓
Verify password hash (bcrypt)
    ↓
Check user status (active, not suspended)
    ↓
Check email_verified = true (only if email verification is enabled for tenant/environment)
    ↓
Generate JWT access token (15 min expiry)
    ↓
Generate refresh token (7 day expiry)
    ↓
Create/update session record
    ↓
Create audit log entry
    ↓
Return tokens + user info
    ↓
[Front-end stores tokens]
    ↓
[Subsequent requests include Bearer token]
```

**API Endpoints**:
- `GET /v1/auth/sso/:provider/login` - Initiate SSO login (redirects to IdP)
  - **Note**: This same endpoint is used for both login (Flow 3) and signup (Flow 1A). The UX context differs (login page vs signup page), but the endpoint and OAuth flow are identical.
- `GET /v1/auth/sso/:provider/callback` - Handle IdP callback, validate token, create session
- `POST /v1/auth/login` - Authenticate with email/password (local auth only)
- `POST /v1/auth/refresh` - Refresh access token using refresh token

**Database Changes**:
- Upsert `sessions` (user_id, tenant_id, refresh_token, expires_at, last_used_at)
- Update `users` (idp_sub, email_verified=true) - if SSO login and user was invited/not yet fully provisioned
- Insert into `audit_logs` (action_type='user_login', resource_type='user', resource_id=user_id, user_id, tenant_id, created_at=now()) - on successful login

**Notifications**:
- **Email**: Login from new device/IP (template: `login_new_device`) - optional security feature

**Exceptions**:
- **Invalid email/password** (local): Return 401 Unauthorized
- **User not verified** (local, if verification enabled): Return 403, resend verification email
- **User suspended**: Return 403, contact admin
- **Too many failed attempts** (local): Rate limit, temporary lockout (15 min)
- **Invalid IdP token** (SSO): Return 401, redirect to IdP login
- **User has auth_provider='idp' but trying local login**: Return 400, redirect to SSO login with message "Please use SSO to sign in"
- **User has auth_provider='local' but trying SSO**: Return 400, use local login (or allow SSO and update auth_provider if business rules allow)
- **Email verification errors for SSO users**: Must NOT appear - SSO users are always told to use their IdP for any account issues

**Manual Intervention**: None

**Note**: In SSO mode, password reset and email verification errors must **not** appear. Users are always told to use their IdP for account management. Email verification check only applies for `auth_provider='local'` and only if verification is enabled for that environment/tenant.

---

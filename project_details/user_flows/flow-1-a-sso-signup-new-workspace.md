### Flow 1A: SSO Signup (New Workspace)

**Trigger**: User clicks "Continue with SSO" on signup page

**Flow Diagram**:
```
User clicks "Continue with SSO"
    ↓
Redirect to IdP (Auth0/Okta/Google/Microsoft/etc.)
    ↓
User authenticates at IdP
    ↓
IdP redirects to callback with authorization code/token
    ↓
Backend validates token, extracts claims:
    - email (from IdP)
    - idp_sub (IdP subject identifier)
    - email_verified (from IdP, trusted)
    ↓
Check if user exists and has workspace membership:
    - Lookup user by idp_sub OR email
    - If user exists: Check user_tenants or memberships table
    ↓
If user exists and belongs to workspace(s):
    Create session (JWT access + refresh tokens)
    If only one workspace:
        Redirect to last active workspace: {subdomain}.wrk.com/app
    If multiple workspaces:
        Show workspace picker, then redirect to selected workspace
    ↓
If user exists but has NO workspace membership:
    Create/update user record (if needed):
        - email (from IdP)
        - auth_provider='idp'
        - idp_sub (from IdP)
        - email_verified=true (trusted from IdP)
        - password_hash=null
    Show "Create your workspace" step
    ↓
If user does not exist (new user):
    Create user record:
        - email (from IdP)
        - auth_provider='idp'
        - idp_sub (from IdP)
        - email_verified=true (trusted from IdP)
        - password_hash=null
    Show "Create your workspace" step
    ↓
[Workspace Creation Step]
User submits workspace details:
    - workspace_name (e.g., "Acme Inc")
    - workspace_slug (e.g., "acme")
    ↓
Validate subdomain:
    - Check uniqueness across all tenants
    - Validate format (lowercase alphanumeric + hyphens, 3-30 chars)
    ↓
If subdomain taken:
    Suggest alternatives: {slug}-1, {slug}-hq, {slug}-{random}
    User selects or enters new slug
    ↓
Create tenant record:
    - name = workspace_name
    - subdomain = workspace_slug
    - created_at = now()
    ↓
Create membership:
    - user_id
    - tenant_id (new tenant)
    - role = 'admin' or 'workspace_owner' (first user is workspace owner)
    ↓
Create session (JWT access + refresh tokens, includes tenant_id)
    ↓
Redirect to workspace: https://{workspace_slug}.wrk.com/app
```

**API Endpoints**:
- `GET /v1/auth/sso/:provider/login` - Initiate SSO (redirects to IdP)
- `GET /v1/auth/sso/:provider/callback` - Handle IdP callback, validate token, check workspace membership
- `POST /v1/auth/create-workspace` - Create workspace (name, subdomain) after authentication
  - Body: `{ workspace_name, workspace_slug }`
  - Requires: authenticated user (no workspace membership)
- `GET /v1/auth/check-subdomain?slug={slug}` - Check subdomain availability

**Database Changes**:
- Insert/update `users` (id, email, auth_provider='idp', idp_sub, email_verified=true, password_hash=null) - if new user
- Insert into `tenants` (id, name, subdomain, created_at) - when workspace created
- Insert into `user_tenants` or `memberships` (user_id, tenant_id, role='admin' or 'workspace_owner') - create membership
- Insert into `sessions` (user_id, tenant_id, refresh_token, expires_at)

**Tenant Isolation**: `tenant_id` extracted from JWT session, never from request body.

**Notifications**:
- **Email**: Welcome email (template: `welcome_sso`, includes workspace URL: `https://{subdomain}.wrk.com`)

**Exceptions**:
- **Invalid IdP token**: Return 401, redirect to IdP login
- **IdP token expired**: Return 401, redirect to IdP login
- **Email exists with different auth_provider**: Return 409, suggest using existing auth method
- **User already has workspace membership**: Skip workspace creation, redirect to existing workspace
- **Subdomain taken**: Return 409, suggest alternatives
- **Invalid subdomain format**: Return 400, show format requirements
- **IdP callback error**: Return 400, log error, redirect to signup

**Manual Intervention**: None (fully automated)

**Note**: SSO users authenticate first, then create workspace if needed. If user already mapped to workspace, skip creation and go to workspace. No email verification step for SSO.

---

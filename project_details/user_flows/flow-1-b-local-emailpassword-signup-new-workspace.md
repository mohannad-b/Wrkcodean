### Flow 1B: Local Email/Password Signup (New Workspace)

**Trigger**: User submits local email/password registration (fallback path, only when SSO not configured)

**Flow Diagram**:
```
User submits authentication form:
    - Email
    - Password
    ↓
Validate email format & uniqueness
    ↓
Check if user exists and has workspace membership:
    - Lookup user by email
    - If user exists: Check user_tenants or memberships table
    ↓
If user exists and belongs to workspace(s):
    Verify password hash (bcrypt)
    Check email_verified (if verification enabled)
    Create session (JWT access + refresh tokens)
    If only one workspace:
        Redirect to last active workspace: {subdomain}.wrk.com/app
    If multiple workspaces:
        Show workspace picker, then redirect to selected workspace
    ↓
If user exists but has NO workspace membership:
    Verify password hash (bcrypt)
    Check email_verified (if verification enabled)
    Show "Create your workspace" step
    ↓
If user does not exist (new user):
    Create user record:
        - email
        - auth_provider='local'
        - password_hash (bcrypt hash)
        - email_verified=false (if verification enabled)
        - email_verified=true (if verification disabled)
        - idp_sub=null
    ↓
    If email verification enabled:
        Generate email verification token
        Send verification email
        User must verify before proceeding
        ↓
        [User clicks email link]
        ↓
        Verify token & activate (email_verified=true, status='active')
        Show "Create your workspace" step
    ↓
    If email verification disabled:
        Mark user active immediately
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
Create tenant record (workspace backed by tenant row):
    - name = workspace_name
    - subdomain = workspace_slug
    - created_at = now()
    ↓
Create membership:
    - user_id
    - tenant_id (new tenant)
    - role = 'admin' or 'workspace_owner' (first user is workspace owner/admin)
    ↓
Create session (JWT access + refresh tokens, includes tenant_id)
    ↓
Redirect to workspace: https://{workspace_slug}.wrk.com/app
```

**API Endpoints**:
- `POST /v1/auth/signup` - Create user account (local auth only)
  - Body: `{ email, password }`
- `POST /v1/auth/login` - Authenticate with email/password
  - Body: `{ email, password }`
- `GET /v1/auth/verify-email?token={token}` - Verify email (only if verification enabled)
- `POST /v1/auth/create-workspace` - Create workspace (name, subdomain) after authentication
  - Body: `{ workspace_name, workspace_slug }`
  - Requires: authenticated user (no workspace membership)
- `GET /v1/auth/check-subdomain?slug={slug}` - Check subdomain availability

**Database Changes**:
- Insert/update `users` (id, email, auth_provider='local', password_hash, email_verified, idp_sub=null) - if new user
- Insert into `tenants` (id, name, subdomain, created_at) - when workspace created
- Insert into `user_tenants` or `memberships` (user_id, tenant_id, role='admin' or 'workspace_owner') - create membership
- Insert into `sessions` (user_id, tenant_id, refresh_token, expires_at)

**Tenant Isolation**: `tenant_id` extracted from JWT session, never from request body.

**Notifications**:
- **Email**: Verification email (template: `verify_email`) - only if verification enabled
- **Email**: Welcome email (template: `welcome`, includes workspace URL: `https://{subdomain}.wrk.com`) - after workspace creation

**Exceptions**:
- **Email already exists**: Return 409, suggest password reset (if local) or SSO login (if SSO user exists)
- **User already has workspace membership**: Skip workspace creation, redirect to existing workspace
- **Invalid email format**: Return 400
- **Subdomain taken**: Return 409, suggest alternatives
- **Invalid subdomain format**: Return 400, show format requirements
- **Verification token expired**: Return 401, allow resend (only if verification enabled)
- **Token already used**: Return 400, user already verified
- **Weak password**: Return 400, enforce password policy

**Manual Intervention**: None (fully automated)

**Note**: Fallback path only. User authenticates first, then creates workspace if needed. Email verification configurable per environment/workspace (ON by default, can be disabled).

---

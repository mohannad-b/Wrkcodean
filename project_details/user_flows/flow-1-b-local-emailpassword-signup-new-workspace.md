### Flow 1B: Local Email/Password Signup (New Workspace)

**Trigger**: User submits local email/password registration (fallback path, only when SSO not configured)

**Note**: This flow handles **signup only** (new users or existing users with NO workspace). If a user already exists and has workspace membership, they should use Flow 3 (Login) instead.

**Flow Diagram**:
```
User submits signup form:
    - Email
    - Password
    ↓
Validate email format
    ↓
Check if user exists:
    - Lookup user by email
    ↓
If user exists:
    Check user.auth_provider:
        If auth_provider='idp':
            Return 409 Conflict with error:
            "This email is registered with SSO. Please use SSO to sign in."
            Do NOT proceed with local signup
        ↓
    If auth_provider='local':
        Check user_tenants/memberships table for workspace membership
        ↓
        If user has workspace membership:
            Return 409 Conflict with error:
            "Account already exists. Please use the login page to sign in."
            Note: Wrk will standardize on: backend returns 409 JSON and frontend redirects to /login (Flow 3)
        ↓
        If user has NO workspace membership:
            Verify password hash (bcrypt)
            Check email_verified (if verification enabled)
            If password invalid: Return 401, suggest login or password reset
            If email not verified (and verification enabled): Return 403, resend verification email
            Show "Create your workspace" step
    ↓
If user does not exist (new user):
    Create user record:
        - email
        - auth_provider='local'
        - password_hash (bcrypt hash)
        - email_verified=false (if verification enabled)
        - email_verified=true (if verification disabled)
        - status='pending_verification' (if verification enabled)
        - status='active' (if verification disabled)
        - idp_sub=null
    ↓
    Create audit log entry (tenant_id=null, pre-workspace)
    ↓
    If email verification enabled:
        Generate email verification token
        Send verification email
        User must verify before proceeding
        ↓
        [User clicks email link]
        ↓
        Verify token & activate (email_verified=true, status='active')
        Create audit log entry (tenant_id=null, pre-workspace)
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
Create audit log entry (now with tenant_id)
    ↓
Redirect to workspace: https://{workspace_slug}.wrk.com/app
```

**API Endpoints**:
- `POST /v1/auth/signup` - Create user account (local auth only)
  - Body: `{ email, password }`
  - Returns: User created (or existing user with no workspace), proceed to workspace creation
  - If user exists with workspace: Returns 409, redirect to login
  - If user exists with auth_provider='idp': Returns 409, error message to use SSO
- `GET /v1/auth/verify-email?token={token}` - Verify email (only if verification enabled)
  - Handles both new users and existing users with no workspace
  - If a verified local user has no workspace membership after email verification, redirect them to the workspace creation step
- `POST /v1/auth/create-workspace` - Create workspace (name, subdomain) after authentication
  - Body: `{ workspace_name, workspace_slug }`
  - Requires: authenticated user (no workspace membership)
  - **Note**: "Authenticated" here means a pre-tenant user context (user_id in a temporary session/cookie after signup/verification), not a tenant-scoped session. Full tenant-scoped sessions are only created after workspace creation.
- `GET /v1/auth/check-subdomain?slug={slug}` - Check subdomain availability

**Note**: Login functionality is handled by Flow 3. This endpoint (`POST /v1/auth/login`) is not part of Flow 1B.

**Database Changes**:
- Insert into `users` (id, email, auth_provider='local', password_hash, email_verified, status='pending_verification' or 'active', idp_sub=null) - if new user
- Insert into `tenants` (id, name, subdomain, created_at) - when workspace created
- Insert into `user_tenants` or `memberships` (user_id, tenant_id, role='admin' or 'workspace_owner') - create membership
- Insert into `sessions` (user_id, tenant_id, refresh_token, expires_at) - only after workspace created
- Insert into `audit_logs` (action_type='create_user', resource_type='user', resource_id=user_id, user_id, tenant_id=null, created_at=now()) - if new user created (tenant_id=null, pre-workspace)
- Insert into `audit_logs` (action_type='verify_email', resource_type='user', resource_id=user_id, user_id, tenant_id=null, created_at=now()) - when email verified (if verification enabled, tenant_id=null, pre-workspace)
- Insert into `audit_logs` (action_type='create_workspace', resource_type='tenant', resource_id=tenant_id, user_id, tenant_id, created_at=now()) - when workspace created (now tenant_id is available)

**Tenant Isolation**: 
- Before workspace creation: No `tenant_id` exists yet. The user only has a pre-tenant user context (temporary session/cookie after signup/verification), not a tenant-scoped session. See the note under `POST /v1/auth/create-workspace` for details.
- After workspace creation: `tenant_id` extracted from JWT session, never from request body.

**Notifications**:
- **Email**: Verification email (template: `verify_email`) - only if verification enabled
- **Email**: Welcome email (template: `welcome`, includes workspace URL: `https://{subdomain}.wrk.com`) - after workspace creation

**Exceptions**:
- **Email already exists with auth_provider='idp'**: Return 409, error message: "This email is registered with SSO. Please use SSO to sign in."
- **Email already exists with auth_provider='local' AND has workspace membership**: Return 409 JSON with error message: "Account already exists. Please use the login page to sign in." Wrk will standardize on: backend returns 409 JSON and frontend redirects to /login (Flow 3)
- **Email already exists with auth_provider='local' AND NO workspace membership**: If password is valid, proceed to workspace creation; if invalid, return 401 and suggest login or password reset
- **Invalid email format**: Return 400
- **Subdomain taken**: Return 409, suggest alternatives
- **Invalid subdomain format**: Return 400, show format requirements
- **Verification token expired**: Return 401, allow resend (only if verification enabled)
- **Token already used**: Return 400, user already verified
- **Weak password**: Return 400, enforce password policy
- **Password invalid** (for existing user with no workspace): Return 401, suggest login or password reset

**Manual Intervention**: None (fully automated)

**Note**: This flow is for **signup only** (new users or existing users with NO workspace). All login behavior (including existing users with workspaces) is handled by Flow 3. Email verification configurable per environment/workspace (ON by default, can be disabled). Audit logs allow `tenant_id=null` for pre-workspace actions (create_user, verify_email) since the user doesn't have a workspace yet.

---

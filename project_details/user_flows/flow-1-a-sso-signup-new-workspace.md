### Flow 1A: SSO Signup (New Workspace)

**Trigger**: User clicks "Continue with SSO" on signup page

**Note**: This flow primarily handles **first workspace creation** (new users or existing users with NO workspace membership). If the user already has workspace membership, the callback instead performs a normal login (session + redirect). Users who already belong to one or more workspaces may create additional workspaces via a separate flow (not Flow 1A).

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
- **Nonce validation** (for OpenID Connect):
  - Generate random nonce, store in session
  - Include nonce in authorization request
  - Validate nonce in ID token matches stored nonce
  - Reject if nonce missing or mismatched

**Flow Diagram**:
```
User clicks "Continue with SSO"
    ↓
Generate PKCE parameters:
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
IdP redirects to callback with:
    - authorization_code
    - state (must match stored state)
    ↓
Validate state parameter:
    - Check state exists in session
    - Check state not expired (10 min)
    - Check state not already used (mark as used)
    - If invalid: Return 401, log security event, redirect to signup
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
    - Verify nonce matches stored nonce
    - Verify expiration (exp claim)
    - Extract claims: email, idp_sub, email_verified
    ↓
Backend validates token and extracts claims:
    - email (from IdP ID token)
    - idp_sub (IdP subject identifier, unique per IdP)
    - email_verified (from IdP, **always trusted** - IdP is source of truth)
    ↓
Lookup user by idp_sub (primary) OR email (fallback):
    - First: Lookup by idp_sub (most reliable)
    - If not found: Lookup by email
    ↓
If user found:
    Check user.auth_provider:
        If auth_provider='idp':
            Check user_tenants/memberships table for workspace membership
            ↓
            If user has workspace membership:
                This is a LOGIN operation, not signup
                Create session (JWT access + refresh tokens, includes tenant_id of last active workspace)
                Create audit log entry (user_login via SSO)
                If only one workspace:
                    Redirect to last active workspace: https://{subdomain}.wrk.com/app
                If multiple workspaces:
                    Show workspace picker
                    When user selects workspace:
                        Update session tenant_id to selected workspace (if different from last active)
                        Redirect to selected workspace: https://{subdomain}.wrk.com/app
                Do NOT create or modify workspace
                Do NOT return an error (this is normal behavior)
                Note: This implements Flow 3 (Login SSO) behavior directly in the callback, avoiding a redirect loop
            ↓
            If user has NO workspace membership:
                Update user record (if idp_sub changed or email updated):
                    - idp_sub (from IdP, if different)
                    - email (from IdP, if different)
                    - email_verified=true (always trusted from IdP)
                Note: This is an existing user who previously signed up but never created a workspace
                Create audit log entry (tenant_id=null, pre-workspace)
                Show "Create your workspace" step
        ↓
        If auth_provider='local':
            Return 409 Conflict with error:
            "This email is registered with local authentication. Please use email/password to sign in, or contact support to link your SSO account."
            Do NOT proceed with SSO signup
            Do NOT update auth_provider (requires explicit user action or admin)
    ↓
If user not found (new user):
    Check if email exists with different auth_provider:
        - Lookup by email only (not idp_sub, since new user)
        - If found with auth_provider='local':
            Return 409 Conflict with error:
            "This email is registered with local authentication. Please use email/password to sign in, or contact support to link your SSO account."
            Do NOT create user
    ↓
    If email not found (truly new user):
        Create user record:
            - email (from IdP)
            - auth_provider='idp'
            - idp_sub (from IdP)
            - email_verified=true (always trusted from IdP)
            - password_hash=null
        Create audit log entry (tenant_id=null, pre-workspace)
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
- `GET /v1/auth/sso/:provider/login` - Initiate SSO (redirects to IdP with PKCE, state, nonce)
  - Generates: code_verifier, code_challenge, state, nonce
  - Stores in session: code_verifier, state, nonce (with expiration)
  - Redirects to IdP with: code_challenge, state, nonce
  - **Note**: This same endpoint is used for both signup (Flow 1A) and login (Flow 3). The UX context differs (signup page vs login page), but the endpoint and OAuth flow are identical.
- `GET /v1/auth/sso/:provider/callback` - Handle IdP callback, validate PKCE/state/nonce, check workspace membership
  - Validates: state (from session), nonce (from ID token), code_verifier (matches code_challenge)
  - If user has workspace: Implements login behavior directly (creates session, redirects to workspace) - this is Flow 3 (Login SSO) behavior, not an error
  - If user has no workspace: Proceeds to workspace creation
- `POST /v1/auth/create-workspace` - Create workspace (name, subdomain) after authentication
  - Body: `{ workspace_name, workspace_slug }`
  - Requires: authenticated user (no workspace membership)
  - **Note**: "Authenticated" here means having a valid SSO callback context (temporary session/cookie from successful IdP authentication), not a full tenant-scoped session. Full tenant-scoped sessions are only created after workspace creation.
- `GET /v1/auth/check-subdomain?slug={slug}` - Check subdomain availability

**Note**: The endpoint `GET /v1/auth/sso/:provider/login` is used for both signup (Flow 1A) and login (Flow 3), with different UX contexts. If a user already has workspace membership, the callback implements Flow 3 (Login SSO) behavior directly (creates session, redirects to workspace) without a redirect loop. This avoids redoing the OAuth flow or requiring Flow 3 to understand special authentication contexts.

**Database Changes**:
- Insert into `users` (id, email, auth_provider='idp', idp_sub, email_verified=true, password_hash=null) - if new user
- Update `users` (idp_sub, email, email_verified=true) - if existing user with auth_provider='idp' and no workspace (upsert by idp_sub or email)
- Insert into `tenants` (id, name, subdomain, created_at) - when workspace created
- Insert into `user_tenants` or `memberships` (user_id, tenant_id, role='admin' or 'workspace_owner') - create membership
- Insert into `sessions` (user_id, tenant_id, refresh_token, expires_at) - after workspace created OR if user has existing workspace (login case, tenant_id = last active workspace)
- Update `sessions` (tenant_id) - if user has multiple workspaces and selects a different workspace from the picker
- Insert into `audit_logs` (action_type='create_user', resource_type='user', resource_id=user_id, user_id, tenant_id=null, created_at=now()) - if new user created (tenant_id=null, pre-workspace)
- Insert into `audit_logs` (action_type='update_user', resource_type='user', resource_id=user_id, user_id, tenant_id=null, created_at=now(), metadata_json={'updated_fields': ['idp_sub', 'email']}) - if existing user updated (tenant_id=null, pre-workspace)
- Insert into `audit_logs` (action_type='create_workspace', resource_type='tenant', resource_id=tenant_id, user_id, tenant_id, created_at=now()) - when workspace created (now tenant_id is available)
- Insert into `audit_logs` (action_type='user_login', resource_type='user', resource_id=user_id, user_id, tenant_id, created_at=now()) - if user has existing workspace (login case, implements Flow 3 behavior)

**Upsert Rules for Mixed-Provider Identities**:
- **Primary lookup**: Always by `idp_sub` first (most reliable, unique per IdP)
- **Fallback lookup**: By `email` if `idp_sub` not found
- **If user found with auth_provider='idp'**: Update `idp_sub` and `email` if changed (normal upsert)
- **If user found with auth_provider='local'**: Do NOT update or create. Return 409 error. User must explicitly link accounts or use local auth.
- **If user not found**: Create new user with `auth_provider='idp'`
- **Never auto-convert**: Never change `auth_provider` from 'local' to 'idp' or vice versa without explicit user action or admin intervention

**Tenant Isolation**: 
- After workspace creation: `tenant_id` extracted from JWT session, never from request body
- Before workspace creation: No `tenant_id` exists yet. The user only has a temporary SSO callback context (not a tenant-scoped session). See the note under `POST /v1/auth/create-workspace` for details.

**Notifications**:
- **Email**: Welcome email (template: `welcome_sso`, includes workspace URL: `https://{subdomain}.wrk.com`) - sent after workspace creation

**Exceptions**:
- **Invalid state parameter**: Return 401, log security event, redirect to signup (PKCE/anti-replay failure)
- **State expired**: Return 401, redirect to signup (state expires after 10 minutes)
- **State already used**: Return 401, log security event, redirect to signup (replay attack)
- **Invalid nonce**: Return 401, log security event, redirect to signup (OpenID Connect nonce mismatch)
- **Code verifier mismatch**: Return 401, log security event, redirect to signup (PKCE validation failure)
- **Invalid IdP token signature**: Return 401, redirect to IdP login
- **IdP token expired**: Return 401, redirect to IdP login
- **IdP token issuer mismatch**: Return 401, log security event, redirect to signup
- **IdP token audience mismatch**: Return 401, log security event, redirect to signup
- **Email exists with auth_provider='local'**: Return 409, error message: "This email is registered with local authentication. Please use email/password to sign in, or contact support to link your SSO account."
- **User already has workspace membership**: Treat this as a login - create session and redirect to workspace (Flow 3 behavior implemented in this callback). This is normal behavior, not an error. Users who want to create additional workspaces should use the separate "Create Additional Workspace" flow (not Flow 1A).
- **Subdomain taken**: Return 409, suggest alternatives
- **Invalid subdomain format**: Return 400, show format requirements
- **IdP callback error**: Return 400, log error, redirect to signup

**Manual Intervention**: None (fully automated)

**Clarifications**:
- **"User exists but has NO workspace membership"**: This means the user record exists in the database (they previously signed up via SSO or were invited) but they have no entries in the `user_tenants` or `memberships` table. They need to create their first workspace.
- **Users with existing workspaces**: If a user already has workspace membership, the callback implements login behavior directly (creates session, redirects to workspace) - this is normal behavior, not an error. Flow 1A is specifically for first workspace creation. Users who want to create additional workspaces should use a separate flow (not Flow 1A).
- **IdP email_verified is always trusted**: When `email_verified` comes from the IdP's ID token, it is **always trusted** and set to `true` in our database. We do not perform additional email verification for SSO users. The IdP is the source of truth for email verification.
- **Session creation**: Sessions are created either (a) after workspace creation for first-time workspace users, or (b) immediately in the login case when the user already has workspace membership (Flow 3 behavior implemented in this callback).
- **Audit logs**: Pre-workspace actions (create_user, update_user) use `tenant_id=null` since the user doesn't have a workspace yet. Only after workspace creation do audit logs include `tenant_id`.

---

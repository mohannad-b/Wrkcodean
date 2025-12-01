### Flow 2: User Invitation (Workspace-Scoped)

**Trigger**: Workspace admin invites colleague to their workspace

**Flow Diagram**:
```
Admin (already in workspace) submits invitation form (email, role)
    ↓
Extract tenant_id from authenticated session (admin's current workspace)
    - Always take tenant_id from the current workspace in the authenticated session
    - Ignore any tenant_id from URL, request body, or query params
    - Backend: Get tenant_id from JWT claims, never from request body, URL, or query params
    - Note: users table never stores tenant_id; tenant/workspace binding is via membership only
    ↓
Validate email (check for existing membership via email + tenant_id)
    - First check for existing membership: lookup user_tenants/memberships by (email, tenant_id)
    - If user already a member of this workspace: Return 409 immediately, suggest different email
    ↓
Determine workspace auth mode:
    - Check if workspace is SSO-based (all users have auth_provider='idp' OR tenant config says "SSO only")
    - OR workspace is local-only (all users have auth_provider='local')
    ↓
If workspace is SSO-based:
    Generate invitation token (expires in 7 days)
    Check if user already exists with this email:
        - Lookup users by email
        ↓
    If user exists:
        Check auth_provider:
            If auth_provider != 'idp':
                Return 409 Conflict with error:
                "This email is already registered with a different login method. Please use {auth_provider} to join."
                Do NOT proceed with invitation
            ↓
        If auth_provider='idp':
            Update user record:
                - status='invited'
                - invitation_token_hash
                - invitation_expires_at
            Do NOT create new user
    ↓
    If user does not exist:
        Create user record (global):
            - email
            - auth_provider='idp'
            - status='invited'
            - email_verified=false (initially, until SSO login)
            - password_hash=null
            - idp_sub=null (set on first SSO login)
            - invitation_token_hash
            - invitation_expires_at
    ↓
    Assign role to user (stored with invitation, applied when membership created)
    Send invitation email:
        - Template: `team_invitation_sso`
        - Includes workspace name and URL: {subdomain}.wrk.com
        - Link: "Continue with SSO to join {workspace_name}"
    Return success to admin
    ↓
    [Invited user clicks link]
    ↓
    GET /v1/auth/accept-invitation?token={token}
    Validate invitation token (hash + not expired + not used)
    If invalid/expired/used: Return 400, show 'invitation invalid or already accepted'
    ↓
    Redirect to IdP login (with PKCE, state, nonce - same as Flow 1A)
    ↓
    On SSO callback (GET /v1/auth/sso/:provider/callback):
        Validate PKCE, state, nonce (same as Flow 1A)
        Validate invitation token (hash + not expired + not used)
        Match user by email (and/or IdP sub)
        If user doesn't exist: Create user record
        After successful SSO login + token validation:
            - status='active'
            - email_verified=true (always trusted from IdP - IdP is source of truth)
            - set idp_sub from IdP claims
            - clear/mark invitation token used
            - Only then create membership (user_id, tenant_id, role)
        Create session (includes tenant_id of inviting workspace)
        Create audit log entries (accept_invitation, join_workspace_via_invite)
        Redirect directly to inviting workspace: https://{subdomain}.wrk.com/app
    ↓
If workspace is local-only:
    Generate invitation token (expires in 7 days)
    Check if user already exists with this email:
        - Lookup users by email
        ↓
    If user exists:
        Check auth_provider:
            If auth_provider != 'local':
                Return 409 Conflict with error:
                "This email is already registered with a different login method. Please use {auth_provider} to join."
                Do NOT proceed with invitation
            ↓
        If auth_provider='local':
            Update user record:
                - status='invited'
                - invitation_token_hash
                - invitation_expires_at
            Do NOT create new user
    ↓
    If user does not exist:
        Create user record (global, no tenant):
            - email
            - auth_provider='local'
            - status='invited'
            - email_verified=false (if verification enabled)
            - password_hash=null (set on acceptance)
            - idp_sub=null
            - invitation_token_hash
            - invitation_expires_at
    ↓
    Assign role to user (stored with invitation, applied when membership created)
    Send invitation email:
        - Template: `team_invitation`
        - Includes workspace name and URL: {subdomain}.wrk.com
        - Link: "Join {workspace_name}"
    Return success to admin
    ↓
    [Invited user clicks link]
    ↓
    GET /v1/auth/accept-invitation?token={token}
    Validate invitation token (hash + not expired + not used) before showing password form
    If invalid/expired/used: Return 400, show 'invitation invalid or already accepted'
    ↓
    Validate token & show signup form (pre-filled email, workspace context shown)
    ↓
    User sets password
    ↓
    POST /v1/auth/accept-invitation
    After password set:
        - password_hash (bcrypt hash)
        - status='active'
        - email_verified=true (if verification disabled) OR email_verified=false (if verification enabled)
    ↓
    If email verification enabled:
        Send verification email
        User must verify before full access (membership created, but email_verified gates full access)
    ↓
    Create membership (user_id, tenant_id, role) - only after valid token + password
    Create session (includes tenant_id of inviting workspace)
    Create audit log entry (accept_invitation)
    Redirect directly to inviting workspace: https://{subdomain}.wrk.com/app
```

**API Endpoints**:
- `POST /v1/workspace/users/invite` (admin only)
  - Body: `{ email, role }`
  - Backend: Extract `tenant_id` **only** from authenticated session (admin's current workspace), never from URL, request body, or query params
- `GET /v1/auth/accept-invitation?token={token}` - Validate invitation token, then:
  - SSO: Redirect to IdP login (with PKCE, state, nonce)
  - Local: Show signup/password form (pre-filled email, workspace context shown)
- `POST /v1/auth/accept-invitation` - Complete signup with password (local only)
  - Body: `{ token, password }`
  - Validates token, sets password, creates membership
- `GET /v1/auth/sso/:provider/callback` - Handle SSO callback for invited users
  - Validates PKCE, state, nonce, invitation token
  - Creates membership after successful SSO login + token validation

**Database Changes**:
- For users (invitation creation):
  - SSO: Insert into `users` (email, auth_provider='idp', status='invited', email_verified=false, password_hash=null, idp_sub=null, invitation_token_hash, invitation_expires_at) - if user doesn't exist
  - SSO: If user exists with auth_provider='idp', update `users` (status='invited', invitation_token_hash, invitation_expires_at)
  - Local: Insert into `users` (email, auth_provider='local', status='invited', email_verified=false or true depending on config, password_hash=null, idp_sub=null, invitation_token_hash, invitation_expires_at) - if user doesn't exist
  - Local: If user exists with auth_provider='local', update `users` (status='invited', invitation_token_hash, invitation_expires_at)
- Status flow: 'invited' → 'active'
  - SSO: After valid invitation token + successful SSO login (PKCE/state/nonce validated)
  - Local: After valid invitation token + password set (and optional email verification)
- For memberships:
  - Insert into `user_tenants` or `memberships` (user_id, tenant_id, role) - **ONLY** after invite acceptance (SSO login + token validation OR local password + token validation)
- For activation:
  - SSO: Update `users` (idp_sub, email_verified=true, status='active', clear/mark invitation_token_hash as used) on first successful SSO login tied to this invitation
  - Local: Update `users` (password_hash, email_verified=true or false depending on config, status='active', clear/mark invitation_token_hash as used) on acceptance
- Audit logs:
  - Insert into `audit_logs` (action_type='invite_user', resource_type='user', resource_id=user_id, user_id=admin_user_id, tenant_id, created_at=now()) - when admin sends invitation
  - Insert into `audit_logs` (action_type='accept_invitation', resource_type='user', resource_id=user_id, user_id, tenant_id, created_at=now()) - when user accepts invitation (both SSO and local)
  - Insert into `audit_logs` (action_type='join_workspace_via_invite', resource_type='membership', resource_id=membership_id, user_id, tenant_id, created_at=now()) - when invited SSO user logs in for the first time and membership is created

**Note**: Ensure no tenant_id field is mentioned on the users table itself; tenant/workspace binding is via membership only. Invitations create or update a user (global), and only create the workspace membership after the invite is accepted. IdP email_verified is always trusted for SSO users; no additional email verification step beyond IdP login.

**Tenant Isolation**: 
- Admin invitation: `tenant_id` extracted from admin's workspace via JWT/session, never from request body, URL, or query params
- Invited users: Before acceptance, no `tenant_id` exists; binding occurs only via membership after invitation acceptance

**Notifications**:
- **Email**: Invitation email (template: `team_invitation_sso` for SSO, `team_invitation` for local)
  - Includes workspace name and URL: `https://{subdomain}.wrk.com`
  - Clear message: "You've been invited to join {workspace_name} workspace"
- **Email**: Admin notification when invitation accepted (template: `invitation_accepted`)

**Exceptions**:
- **Email already member of workspace**: Return 409, suggest different email (check membership via email + tenant_id)
- **Email exists but auth_provider incompatible with workspace auth mode**: Return 409 with message: "This email is already registered with a different login method. Please use {auth_provider} to join."
- **Invitation token expired**: Return 401, admin must resend invitation
- **Invitation token invalid/used**: Return 400, show 'invitation invalid or already accepted'
- **Invalid role**: Return 400, role must be valid (admin/member/viewer)
- **SSO user trying to use local invite**: Return 400, redirect to SSO login
- **Local user trying SSO in SSO-only tenant**: Return 400, use local signup flow
- **Any token integrity issue**: Return 400 (invalid hash, tampered token, etc.)

**Manual Intervention**: None (admin-initiated, automated)

**Note**: Invitations are workspace-scoped. Admin invites colleague into their current workspace. Invited user authenticates and lands directly in the inviting workspace. SSO users authenticate via IdP; local users set password. No email verification for SSO users beyond IdP login. Invited users join that same workspace/tenant; they don't create new workspaces/clients.

---

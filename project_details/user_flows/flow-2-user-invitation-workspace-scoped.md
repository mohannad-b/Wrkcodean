### Flow 2: User Invitation (Workspace-Scoped)

**Trigger**: Workspace admin invites colleague to their workspace

**Flow Diagram**:
```
Admin (already in workspace) submits invitation form (email, role)
    ↓
Extract tenant_id from authenticated session (admin's current workspace)
    - tenant_id is taken from the current workspace in the JWT/session, ignore any tenant_id in URL or request body
    - Backend: Get tenant_id from JWT claims, never from request body
    ↓
Validate email (not already a member of this workspace/tenant)
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
    Redirect to IdP login
    ↓
    On first successful SSO login:
        Match user by email (and/or IdP sub)
        Validate invitation token (if present and not expired)
        If user doesn't exist: Create user record
        Mark status='active', email_verified=true
        Set idp_sub from IdP claims
        Only then create membership (user_id, tenant_id, role)
    Create session (includes tenant_id of inviting workspace)
    Create audit log entry
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
    Validate invitation token (not expired, not already used) before accepting password and creating membership
    ↓
    Validate token & show signup form (pre-filled email, workspace context shown)
    ↓
    User sets password
    ↓
    Activate user:
        - password_hash (bcrypt hash)
        - email_verified=true (if verification disabled) OR email_verified=false (if verification enabled)
        - status='active' (or 'invited' if verification required)
    ↓
    If email verification required:
        Send verification email
        User must verify before full access
    ↓
    Create membership (user_id, tenant_id, role) - only after token validation and password set
    Create session (includes tenant_id of inviting workspace)
    Create audit log entry
    Redirect directly to inviting workspace: https://{subdomain}.wrk.com/app
```

**API Endpoints**:
- `POST /v1/workspace/users/invite` (admin only)
  - Body: `{ email, role }`
  - Backend: Extract `tenant_id` from authenticated session (admin's current workspace), never from URL or request body
- `GET /v1/auth/accept-invitation?token={token}` - Show signup form (local) OR redirect to SSO (SSO)
- `POST /v1/auth/accept-invitation` - Complete signup with password (local only)
- `GET /v1/auth/sso/:provider/callback` - Handle SSO callback for invited users

**Database Changes**:
- For users:
  - Insert into `users` (email, auth_provider, status='invited', invitation_token_hash, invitation_expires_at, password_hash=null, idp_sub=null) - if user doesn't exist
  - If user exists with compatible auth_provider, update `users` (status='invited', invitation_token_hash, invitation_expires_at)
- For memberships:
  - Insert into `user_tenants` or `memberships` (user_id, tenant_id, role) - only when invitation is accepted (SSO login or local password set)
- For activation:
  - Local: Update `users` (password_hash, email_verified=true or false depending on config, status='active') on acceptance
  - SSO: Update `users` (idp_sub, email_verified=true, status='active') on first successful SSO login tied to this invitation
- Audit logs:
  - Insert into `audit_logs` (action_type='invite_user', resource_type='user', resource_id=user_id, user_id=admin_user_id, tenant_id, created_at=now()) - when admin sends invitation
  - Insert into `audit_logs` (action_type='accept_invitation', resource_type='user', resource_id=user_id, user_id, tenant_id, created_at=now()) - when user accepts invitation
  - Insert into `audit_logs` (action_type='join_workspace_via_invite', resource_type='membership', resource_id=membership_id, user_id, tenant_id, created_at=now()) - when invited SSO user logs in for the first time and membership is created

**Note**: Ensure no tenant_id field is mentioned on the users table itself; tenant/workspace binding is via membership only. Invitations create or update a user (global), and only create the workspace membership after the invite is accepted.

**Tenant Isolation**: `tenant_id` extracted from authenticated session (admin's current workspace), never from request body or URL parameters.

**Notifications**:
- **Email**: Invitation email (template: `team_invitation_sso` for SSO, `team_invitation` for local)
  - Includes workspace name and URL: `https://{subdomain}.wrk.com`
  - Clear message: "You've been invited to join {workspace_name} workspace"
- **Email**: Admin notification when invitation accepted (template: `invitation_accepted`)

**Exceptions**:
- **Email already member of workspace**: Return 409, suggest different email
- **If a user with this email already exists and auth_provider != workspace auth mode**: Return 409 and surface a clear error: "This email is already registered with a different login method. Please use {auth_provider} to join."
- **Invitation token expired**: Return 401, admin must resend invitation
- **Invitation token already used or invalid**: Return 400, show 'invitation invalid or already accepted'
- **Invalid role**: Return 400, role must be valid (admin/member/viewer)
- **SSO user trying to set password**: Return 400, redirect to SSO login
- **Local user trying to use SSO**: Return 400, use local signup flow

**Manual Intervention**: None (admin-initiated, automated)

**Note**: Invitations are workspace-scoped. Admin invites colleague into their current workspace. Invited user authenticates and lands directly in the inviting workspace. SSO users authenticate via IdP; local users set password. No email verification for SSO users beyond IdP login. Invited users join that same workspace/tenant; they don't create new workspaces/clients.

---

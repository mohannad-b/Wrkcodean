### Flow 2: User Invitation (Workspace-Scoped)

**Trigger**: Workspace admin invites colleague to their workspace

**Flow Diagram**:
```
Admin (already in workspace) submits invitation form (email, role)
    ↓
Extract tenant_id from authenticated session (admin's current workspace)
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
    Create user record:
        - tenant_id (current workspace)
        - email
        - auth_provider='idp'
        - status='invited'
        - email_verified=false (initially)
        - password_hash=null
        - idp_sub=null (set on first SSO login)
    Assign role to user
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
        If user doesn't exist: Create user record
        Mark status='active', email_verified=true
        Set idp_sub from IdP claims
        Create membership (user_id, tenant_id, role)
        Create session (includes tenant_id of inviting workspace)
        Redirect directly to inviting workspace: https://{subdomain}.wrk.com/app
    ↓
If workspace is local-only:
    Generate invitation token (expires in 7 days)
    Create user record:
        - tenant_id (current workspace)
        - email
        - auth_provider='local'
        - status='invited'
        - email_verified=false (if verification enabled)
        - password_hash=null (set on acceptance)
    Assign role to user
    Send invitation email:
        - Template: `team_invitation`
        - Includes workspace name and URL: {subdomain}.wrk.com
        - Link: "Join {workspace_name}"
    Return success to admin
    ↓
    [Invited user clicks link]
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
    Create membership (user_id, tenant_id, role)
    Create session (includes tenant_id of inviting workspace)
    Redirect directly to inviting workspace: https://{subdomain}.wrk.com/app
```

**API Endpoints**:
- `POST /v1/tenants/{tenantId}/users/invite` (admin only)
  - Body: `{ email, role }`
  - Backend: Extract `tenant_id` from authenticated session (admin's current workspace), never from URL or request body
- `GET /v1/auth/accept-invitation?token={token}` - Show signup form (local) OR redirect to SSO (SSO)
- `POST /v1/auth/accept-invitation` - Complete signup with password (local only)
- `GET /v1/auth/sso/:provider/callback` - Handle SSO callback for invited users

**Database Changes**:
- Insert into `users` (email, auth_provider, status='invited', invitation_token, invitation_expires_at, password_hash=null for SSO, idp_sub=null initially) - if user doesn't exist
- Insert into `user_tenants` or `memberships` (user_id, tenant_id, role) - create workspace membership
- Update `users` (password_hash, email_verified=true, status='active') on acceptance - local only
- Update `users` (idp_sub, email_verified=true, status='active') on first SSO login - SSO only

**Tenant Isolation**: `tenant_id` extracted from authenticated session (admin's current workspace), never from request body or URL parameters.

**Notifications**:
- **Email**: Invitation email (template: `team_invitation_sso` for SSO, `team_invitation` for local)
  - Includes workspace name and URL: `https://{subdomain}.wrk.com`
  - Clear message: "You've been invited to join {workspace_name} workspace"
- **Email**: Admin notification when invitation accepted (template: `invitation_accepted`)

**Exceptions**:
- **Email already member of workspace**: Return 409, suggest different email
- **Invitation token expired**: Return 401, admin must resend invitation
- **Invalid role**: Return 400, role must be valid (admin/member/viewer)
- **SSO user trying to set password**: Return 400, redirect to SSO login
- **Local user trying to use SSO**: Return 400, use local signup flow

**Manual Intervention**: None (admin-initiated, automated)

**Note**: Invitations are workspace-scoped. Admin invites colleague into their current workspace. Invited user authenticates and lands directly in the inviting workspace. SSO users authenticate via IdP; local users set password. No email verification for SSO users beyond IdP login. Invited users join that same workspace/tenant; they don't create new workspaces/clients.

---

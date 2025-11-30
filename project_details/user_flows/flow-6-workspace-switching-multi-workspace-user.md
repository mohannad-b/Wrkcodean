### Flow 6: Workspace Switching (Multi-Workspace User)

**Trigger**: User belongs to multiple workspaces and needs to switch

**Flow Diagram**:
```
User authenticates (via login or SSO)
    ↓
Backend returns list of workspace memberships:
    - Query user_tenants/memberships table for user_id
    - Returns: [{ workspace_name, workspace_slug, role }, ...]
    - Format: [{ name: "Acme", subdomain: "acme", role: "admin" }, ...]
    ↓
If only one workspace:
    Set active_tenant_id in session/JWT
    Redirect to workspace: https://{subdomain}.wrk.com/app
    ↓
If multiple workspaces:
    Show workspace picker UI:
        - Display workspace names and subdomains
        - Show user's role in each workspace
        - UX: "Select workspace" or "Switch workspace"
    ↓
User selects workspace
    ↓
Backend validates user is member of selected workspace
    ↓
Set active_tenant_id in session/JWT (update JWT claims)
    ↓
All subsequent API calls:
    - Extract tenant_id from JWT (never from request body/query)
    - Filter all queries by tenant_id from session
    - Enforce tenant isolation
    ↓
Redirect to selected workspace: https://{workspace_slug}.wrk.com/app
```

**API Endpoints**:
- `GET /v1/auth/workspaces` - List user's workspace memberships
  - Returns: `[{ workspace_name, workspace_slug, role, tenant_id }, ...]`
  - Backend: Query `user_tenants`/`memberships` table
- `POST /v1/auth/switch-workspace` - Switch active workspace (updates session/JWT)
  - Body: `{ tenant_id }` (validated against user's memberships)
  - Backend: Update JWT claims with new `tenant_id`

**Database Changes**:
- Update `sessions` (active_tenant_id) - or store in JWT claims (stateless)
- No database changes if using JWT claims (stateless)

**Tenant Isolation**: `tenant_id` always from authenticated session (JWT), never from request body/query.

**Notifications**: None

**Exceptions**:
- **User not member of requested workspace**: Return 403
- **Invalid tenant_id**: Return 400 (should never happen if validated against memberships)
- **Workspace not found**: Return 404

**Manual Intervention**: None

**Security Note**: Critical for multi-tenant isolation. `tenant_id` always from session context, never from request parameters. User can only switch to workspaces they are members of.

---

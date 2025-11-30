# WRK Copilot User Flows

## Table of Contents

1. [Identity & Access Flows](#identity--access-flows)
2. [Automation Lifecycle Flows](#automation-lifecycle-flows)
3. [Pricing & Billing Flows](#pricing--billing-flows)
4. [Build & Deployment Flows](#build--deployment-flows)
5. [Execution & Monitoring Flows](#execution--monitoring-flows)
6. [Collaboration Flows](#collaboration-flows)
7. [Admin & Ops Flows](#admin--ops-flows)

---

## Identity & Access Flows

### Auth Assumptions

**V1 Implementation**: Flows 1-5 are described assuming first-party email/password authentication implemented in our backend. This includes:
- User signup with email verification
- Password-based login
- Password reset flows
- Session management with JWT tokens

**Future IdP Integration**: We plan to support a managed IdP (Auth0, Clerk, etc.) where:
- Signup/login/password reset would primarily happen at the IdP
- Our backend would handle:
  - Mapping IdP `sub` → `users` table
  - Creating tenants for first user
  - Managing tenant membership & roles
  - Session management (JWT tokens with tenant_id, user_id, roles)

**Note**: The flows stay structurally the same from our backend's perspective (user + tenant creation, sessions, roles), but implementation details can later be delegated to an IdP. The backend architecture's security contract remains: `tenant_id` and `user_id` always come from the authenticated session, never from request bodies or query parameters.

---

### Flow 1: User Signup (New Tenant)

**Trigger**: User visits signup page and submits registration form

**Flow Diagram**:
```
User submits signup form
    ↓
Validate email format & uniqueness
    ↓
Create tenant record
    ↓
Create user record (tenant_id, email, hashed password)
    ↓
Assign default role: "admin" (first user is admin)
    ↓
Generate email verification token
    ↓
Send verification email
    ↓
Return success (user not yet active)
    ↓
[User clicks email link]
    ↓
Verify token & activate user
    ↓
Create session (JWT access + refresh tokens)
    ↓
Redirect to onboarding/dashboard
```

**API Endpoints**:
- `POST /v1/auth/signup` - Create tenant + user
- `GET /v1/auth/verify-email?token={token}` - Verify email
- `POST /v1/auth/login` - Login after verification

**Database Changes**:
- Insert into `tenants` (id, name, subdomain, created_at)
- Insert into `users` (id, tenant_id, email, password_hash, email_verified=false)
- Insert into `user_roles` (user_id, role='admin')
- Insert into `sessions` (user_id, tenant_id, refresh_token, expires_at)

**Notifications**:
- **Email**: Welcome email with verification link (SendGrid template: `welcome_verify`)
- **Email**: Verification success email

**Exceptions**:
- **Email already exists**: Return 409 Conflict, suggest password reset
- **Invalid email format**: Return 400 Bad Request
- **Verification token expired**: Return 401, allow resend verification email
- **Token already used**: Return 400, user already verified

**Manual Intervention**: None (fully automated)

---

### Flow 2: User Invitation (Existing Tenant)

**Trigger**: Admin invites team member via UI

**Flow Diagram**:
```
Admin submits invitation form (email, role)
    ↓
Validate email (not already in tenant)
    ↓
Generate invitation token (expires in 7 days)
    ↓
Create user record (email_verified=false, status='invited')
    ↓
Assign role to user
    ↓
Send invitation email with signup link
    ↓
Return success to admin
    ↓
[Invited user clicks link]
    ↓
Validate token & show signup form (pre-filled email)
    ↓
User sets password
    ↓
Activate user (email_verified=true, status='active')
    ↓
Create session
    ↓
Redirect to dashboard
```

**API Endpoints**:
- `POST /v1/tenants/{tenantId}/users/invite` (admin only)
- `GET /v1/auth/accept-invitation?token={token}` - Show signup form
- `POST /v1/auth/accept-invitation` - Complete signup with password

**Database Changes**:
- Insert into `users` (tenant_id, email, status='invited', invitation_token, invitation_expires_at)
- Insert into `user_roles` (user_id, role)
- Update `users` (password_hash, email_verified=true, status='active') on acceptance

**Notifications**:
- **Email**: Invitation email to new user (template: `team_invitation`)
- **Email**: Admin notification when invitation accepted (template: `invitation_accepted`)

**Exceptions**:
- **Email already in tenant**: Return 409, suggest different email
- **Invitation token expired**: Return 401, admin must resend invitation
- **Invalid role**: Return 400, role must be valid (admin/member/viewer)

**Manual Intervention**: None (admin-initiated, automated)

---

### Flow 3: User Login

**Trigger**: User submits login form

**Flow Diagram**:
```
User submits email + password
    ↓
Validate email exists in tenant
    ↓
Verify password hash
    ↓
Check user status (active, not suspended)
    ↓
Check email_verified = true
    ↓
Generate JWT access token (15 min expiry)
    ↓
Generate refresh token (7 day expiry)
    ↓
Create/update session record
    ↓
Return tokens + user info
    ↓
[Front-end stores tokens]
    ↓
[Subsequent requests include Bearer token]
```

**API Endpoints**:
- `POST /v1/auth/login` - Authenticate and get tokens
- `POST /v1/auth/refresh` - Refresh access token using refresh token

**Database Changes**:
- Upsert `sessions` (user_id, tenant_id, refresh_token, expires_at, last_used_at)

**Notifications**:
- **Email**: Login from new device/IP (template: `login_new_device`) - optional security feature

**Exceptions**:
- **Invalid email/password**: Return 401 Unauthorized
- **User not verified**: Return 403, resend verification email
- **User suspended**: Return 403, contact admin
- **Too many failed attempts**: Rate limit, temporary lockout (15 min)

**Manual Intervention**: None

---

### Flow 4: Password Reset

**Trigger**: User clicks "Forgot Password"

**Flow Diagram**:
```
User submits email
    ↓
Validate email exists
    ↓
Generate reset token (expires in 1 hour)
    ↓
Store token hash in user record
    ↓
Send password reset email
    ↓
Return success (don't reveal if email exists)
    ↓
[User clicks reset link]
    ↓
Validate token & show reset form
    ↓
User submits new password
    ↓
Validate password strength
    ↓
Hash new password
    ↓
Update user.password_hash
    ↓
Invalidate all existing sessions (security)
    ↓
Send confirmation email
    ↓
Redirect to login
```

**API Endpoints**:
- `POST /v1/auth/forgot-password` - Request reset
- `GET /v1/auth/reset-password?token={token}` - Validate token
- `POST /v1/auth/reset-password` - Set new password

**Database Changes**:
- Update `users` (password_reset_token_hash, password_reset_expires_at)
- Update `users` (password_hash, password_reset_token_hash=null) on reset
- Delete all `sessions` for user (force re-login)

**Notifications**:
- **Email**: Password reset link (template: `password_reset`)
- **Email**: Password reset confirmation (template: `password_reset_success`)

**Exceptions**:
- **Token expired**: Return 401, request new reset
- **Token already used**: Return 400
- **Weak password**: Return 400, enforce password policy

**Manual Intervention**: None

---

### Flow 5: API Key Creation

**Trigger**: User creates API key for programmatic access

**Flow Diagram**:
```
User submits API key form (name, permissions, expires_at)
    ↓
Validate permissions array
    ↓
Generate API key (random string, 32 chars)
    ↓
Hash key (store hash, not plaintext)
    ↓
Insert into api_keys table
    ↓
Return plaintext key ONCE (show in UI, never again)
    ↓
User copies key
    ↓
[Subsequent requests use Bearer token with API key]
    ↓
Validate key hash on each request
    ↓
Check permissions match requested operation
    ↓
Check expiration
    ↓
Update last_used_at
```

**API Endpoints**:
- `POST /v1/api-keys` - Create API key
- `GET /v1/api-keys` - List user's API keys
- `DELETE /v1/api-keys/{keyId}` - Revoke API key

**Database Changes**:
- Insert into `api_keys` (tenant_id, key_hash, name, permissions, expires_at)

**Notifications**:
- **Email**: API key created notification (template: `api_key_created`) - security alert
- **Email**: API key revoked notification (template: `api_key_revoked`)

**Exceptions**:
- **Invalid permissions**: Return 400
- **Key expired**: Return 401 on API requests
- **Key revoked**: Return 401 on API requests
- **Insufficient permissions**: Return 403 on API requests

**Manual Intervention**: None

---

### Flow 6: Tenant Switching (Multi-Tenant User)

**Trigger**: User belongs to multiple tenants and needs to switch workspace

**Flow Diagram**:
```
User authenticates (via login or SSO)
    ↓
Backend/IdP returns list of tenant memberships
    ↓
If only one tenant:
    Set active_tenant_id in session/JWT
    Redirect to that workspace
    ↓
If multiple tenants:
    Show workspace picker UI
    ↓
User selects tenant
    ↓
Set active_tenant_id in session/JWT
    ↓
All subsequent API calls:
    - Extract tenant_id from JWT (never from request body/query)
    - Filter all queries by tenant_id from session
    - Enforce tenant isolation
    ↓
Redirect to selected workspace
```

**API Endpoints**:
- `GET /v1/auth/tenants` - List user's tenant memberships
- `POST /v1/auth/switch-tenant` - Switch active tenant (updates session/JWT)

**Database Changes**:
- Update `sessions` (active_tenant_id) - or store in JWT claims
- No database changes if using JWT claims (stateless)

**Notifications**: None

**Exceptions**:
- **User not member of requested tenant**: Return 403
- **Invalid tenant_id in request**: Return 400 (should never happen if using session)
- **Tenant not found**: Return 404

**Manual Intervention**: None

**Critical Security Note**: This flow is essential for correct multi-tenant isolation. The backend architecture rule must be strictly enforced: `tenant_id` always comes from the authenticated session (JWT or API key), never from request body or query parameters. All service layer methods must take `tenantId` from the session context.

---

### Flow 7: Partner API Access (Public Endpoints)

**Trigger**: Partner uses API key to call `/v1/public/*` endpoints

**Flow Diagram**:
```
Partner obtains API key (Flow 5)
    ↓
Partner sends request:
    Authorization: Bearer <api_key>
    GET /v1/public/automations
    ↓
Edge / API Gateway:
    Validates key hash
    Resolves tenant_id + permissions from api_keys table
    Applies rate limiting (per tenant, per API key)
    ↓
Backend receives request:
    Extract tenant_id from API key context (not from request)
    Filter all queries by tenant_id
    Check permissions match requested operation
    ↓
Execute operation (read-only for public endpoints)
    ↓
Return response (tenant-scoped data only)
```

**API Endpoints**:
- `GET /v1/public/automations` - List automations (read-only, filtered by API key's tenant)
- `GET /v1/public/automation-versions/{id}/runs` - Get run history
- All `/v1/public/*` endpoints require API key authentication

**Database Changes**: None (read-only operations)

**Notifications**: None

**Exceptions**:
- **Invalid API key**: Return 401 Unauthorized
- **Key expired**: Return 401
- **Key revoked**: Return 401
- **Insufficient permissions**: Return 403 Forbidden
- **Rate limit exceeded**: Return 429 Too Many Requests

**Manual Intervention**: None

**Security Note**: "Public" means "for programmatic/partner use", not anonymous access. All `/v1/public/*` endpoints require valid API key authentication. Rate limiting is enforced per tenant and per API key.

---

## Automation Lifecycle Flows

### Automation Status State Machine

**Valid Statuses** for `automation_versions.status`:
- `Intake in Progress` - Requirements being captured
- `Needs Pricing` - Blueprint complete, pricing needed
- `Awaiting Client Approval` - Quote sent, waiting for client sign-off
- `Build in Progress` - WRK team building automation
- `QA & Testing` - Automation tested in staging
- `Ready to Launch` - Approved for production deployment
- `Live` - Running in production
- `Archived` - Superseded by newer version or cancelled
- `Blocked` - Paused due to issues (always requires `blocked_reason`)

**Allowed Status Transitions** (state machine):
- `Intake in Progress` → `Needs Pricing`
- `Needs Pricing` → `Awaiting Client Approval`
- `Awaiting Client Approval` → `Build in Progress`
- `Build in Progress` → `QA & Testing`
- `QA & Testing` → `Ready to Launch`
- `Ready to Launch` → `Live`
- Any status → `Blocked` (with `blocked_reason` required)
- `Live` → `Archived`
- `Blocked` → Previous status (when unblocked, if valid transition)

**Invalid Transitions**: Any transition not listed above must be rejected with HTTP 400 and error code `INVALID_STATUS_TRANSITION`.

**Prerequisites for Specific Transitions**:
- `Needs Pricing` → `Awaiting Client Approval`: Requires at least one quote with `status='sent'`
- `Awaiting Client Approval` → `Build in Progress`: Requires a quote with `status='signed'` (and optionally payment confirmed)
- `Ready to Launch` → `Live`: Requires `workflow_binding.status='active'` or successful WRK Platform activation

---

### Flow 8: Create New Automation

**Trigger**: User clicks "New Automation" button

**Flow Diagram**:
```
User submits automation form (name, description, department)
    ↓
Validate name uniqueness in tenant
    ↓
Create automation record
    ↓
Create initial automation_version:
    - version = 'v1.0'
    - status = 'Intake in Progress'
    - blueprint_json = {} (empty or minimal skeleton)
    - intake_progress = 0
    ↓
Assign default owner (current user)
    ↓
Send notifications
    ↓
Redirect to automation detail page
```

**API Endpoints**:
- `POST /v1/automations` - Create automation + initial version
- `GET /v1/automations/{id}` - Get automation details

**Database Changes**:
- Insert into `automations` (tenant_id, name, description, department, owner_id)
- Insert into `automation_versions` (automation_id, version='v1.0', status='Intake in Progress', blueprint_json={}, intake_progress=0)

**Note**: The ops-facing `projects` record will be created later when moving from "Intake in Progress" to "Needs Pricing" (see Flow 10). Build checklist tasks are also created at that time, not during automation creation.

**Notifications**:
- **Email**: Automation created (to owner, template: `automation_created`)
- **In-app**: Notification to owner

**Exceptions**:
- **Duplicate name**: Return 409, suggest different name
- **Invalid department**: Return 400
- **Missing required fields**: Return 400

**Manual Intervention**: None (automated)

---

### Flow 9: Requirements Capture & AI Ingestion

**Trigger**: User adds process description and/or uploads supporting material (docs, screenshots, recordings) while in "Intake in Progress"

**Flow Diagram**:
```
User submits description and/or uploads files
    ↓
System stores uploaded assets:
    - Upload to storage (S3 or similar)
    - Create records in uploaded_assets table (or similar)
    - Link to automation_version_id
    ↓
Enqueue job to 'ai-ingestion' queue:
    {
        tenant_id,
        automation_version_id,
        asset_references,
        description_text
    }
    ↓
[AI Ingestion Worker picks up job]
    ↓
AI Ingestion Worker:
    - Downloads assets
    - Runs extraction (LLM) to identify:
        * Steps in the process
        * Systems involved
        * Triggers and actions
        * Decision points
    - Generates or updates blueprint_json:
        * Creates nodes (triggers, actions, decisions)
        * Creates edges (connections with conditions)
    - Updates intake_progress (e.g., 0 → 50-80% depending on completeness)
    ↓
Update automation_version:
    - blueprint_json = generated draft
    - intake_progress = updated percentage
    - status remains 'Intake in Progress' (no auto-status change)
    ↓
Send notifications
    ↓
Return success
```

**API Endpoints**:
- `POST /v1/automation-versions/{id}/intake` - Upload description & files
- `GET /v1/automation-versions/{id}/intake-assets` - List uploaded assets

**Database Changes**:
- Insert into `uploaded_assets` (automation_version_id, file_url, file_type, uploaded_at) - if assets table exists
- Update `automation_versions` (blueprint_json, intake_progress)
- Status remains 'Intake in Progress' (not changed automatically)

**Notifications**:
- **Email**: AI-generated draft blueprint ready (template: `draft_blueprint_ready`, to owner)
- **In-app**: Notification to owner when draft is ready

**Exceptions**:
- **Malformed files**: Return 400, validate file types/sizes
- **AI extraction failure**: Mark as partial, notify ops team (template: `ai_extraction_failed`)
- **Automation version not in 'Intake in Progress'**: Return 400
- **File size too large**: Return 400, enforce limits

**Manual Intervention**: 
- Ops team reviews AI extraction failures and may manually process
- User can refine AI-generated blueprint manually

**Note**: This flow uses the AI Ingestion Worker from the backend architecture. It only updates `automation_versions.blueprint_json` and `intake_progress`. Status remains 'Intake in Progress' until explicitly moved to 'Needs Pricing' via Flow 10.

---

### Flow 10: Update Blueprint

**Trigger**: User edits blueprint canvas and saves

**Flow Diagram**:
```
User edits blueprint (adds/removes nodes/edges)
    ↓
Validate blueprint JSON structure
    ↓
Check user has edit permission
    ↓
Update automation_version.blueprint_json
    ↓
Update intake_progress (if nodes added, recalculate percentage)
    ↓
Create audit log entry
    ↓
Send notifications
    ↓
Return updated blueprint
```

**API Endpoints**:
- `PUT /v1/automation-versions/{id}/blueprint` - Update blueprint
- `GET /v1/automation-versions/{id}/blueprint` - Get blueprint

**Database Changes**:
- Update `automation_versions` (blueprint_json, intake_progress)
- Insert into `audit_logs` (action_type='update', resource_type='automation_version', resource_id)

**Note**: This flow does NOT automatically change status to 'Needs Pricing'. Moving from "Intake in Progress" to "Needs Pricing" happens through a separate explicit flow (Flow 11), not just by saving the blueprint.

**Notifications**:
- **In-app**: Blueprint updated notification (to collaborators)

**Exceptions**:
- **Invalid JSON structure**: Return 400, validation errors
- **Missing required nodes**: Return 400 (must have at least one trigger)
- **No edit permission**: Return 403
- **Version is Live**: Return 400, must create new version to edit
- **Version not in 'Intake in Progress'**: Return 400 (can only edit during intake)

**Manual Intervention**: None

---

### Flow 11: Move Automation to "Needs Pricing" (+ Project Creation)

**Trigger**: User (or ops) clicks "Send to Pricing" / "Ready for Pricing" on an automation version in "Intake in Progress"

**Flow Diagram**:
```
User/ops clicks "Ready for Pricing"
    ↓
Validate automation_version.status = 'Intake in Progress'
    ↓
Validate minimum requirements:
    - Non-empty blueprint_json
    - At least one trigger node exists
    - intake_progress >= 60% (configurable threshold)
    ↓
If validation fails: Return 400 with specific errors
    ↓
If validation passes:
    Find or create client record for tenant (1:1 with tenant)
    ↓
Create projects record:
    - tenant_id
    - client_id (from tenant mapping)
    - automation_id
    - automation_version_id
    - type = 'new_automation' or 'revision' (based on whether this is first version)
    - status = 'Needs Pricing'
    - pricing_status = 'Not Generated'
    - checklist_progress = 0
    ↓
Optionally create initial pricing-related tasks:
    - context_type = 'project'
    - context_id = project.id
    - kind = 'build_checklist' or 'general_todo'
    - status = 'pending'
    - Examples: "Review pricing model", "Calculate setup fee"
    ↓
Update automation_versions.status = 'Needs Pricing'
    ↓
Create audit log entry
    ↓
Send notifications
    ↓
Return success
```

**API Endpoints**:
- `POST /v1/automation-versions/{id}/move-to-pricing` - Move to Needs Pricing
- `PATCH /v1/automation-versions/{id}/status` (status='Needs Pricing') - Alternative endpoint

**Database Changes**:
- Insert into `projects` (tenant_id, client_id, automation_id, automation_version_id, type, status='Needs Pricing', pricing_status='Not Generated')
- Insert into `tasks` (context_type='project', context_id, kind='build_checklist' or 'general_todo', status='pending') - optional initial tasks
- Update `automation_versions` (status='Needs Pricing')
- Insert into `audit_logs` (action_type='move_to_pricing')

**Notifications**:
- **Email**: Blueprint ready for pricing (template: `blueprint_ready_for_pricing`, to ops/pricing team)
- **In-app**: Notification to ops team (new project in pricing queue)
- **Email**: Automation moved to pricing (template: `automation_moved_to_pricing`, to owner)

**Exceptions**:
- **Blueprint empty or invalid**: Return 400, must have at least one trigger node
- **Version not in 'Intake in Progress'**: Return 400, invalid status transition
- **intake_progress below threshold**: Return 400, must be >= 60% (configurable)
- **No permission**: Return 403 (only owner or ops can move to pricing)

**Manual Intervention**: 
- Ops team may manually move to pricing if user requests
- Ops team reviews blueprint before moving to pricing (optional approval step)

**Note**: This is the bridge between Studio (client-facing) and Ops. The `projects` record is created here, not during automation creation. This allows the ops team to track the automation work from the pricing stage forward.

---

### Flow 12: Create New Version

**Trigger**: User clicks "Create New Version" from existing automation

**Flow Diagram**:
```
User selects base version (e.g., v1.0)
    ↓
Validate base version exists and is Live/Archived
    ↓
Calculate next version number (semver increment)
    ↓
Copy blueprint_json from base version
    ↓
Create new automation_version:
    - automation_id (same as base)
    - version (next semver, e.g., v1.1 or v2.0)
    - blueprint_json (copied from base)
    - status = 'Intake in Progress'
    - intake_progress = 0
    ↓
Link to same automation_id
    ↓
Send notifications
    ↓
Redirect to new version detail page
```

**API Endpoints**:
- `POST /v1/automations/{id}/versions` - Create new version
- `GET /v1/automations/{id}/versions` - List all versions

**Database Changes**:
- Insert into `automation_versions` (automation_id, version, blueprint_json copied, status='Intake in Progress', intake_progress=0)

**Note**: The `projects` record for this revision will be created later when moving from "Intake in Progress" to "Needs Pricing" (via Flow 11). Build checklist tasks are also created at that time, not during version creation.

**Notifications**:
- **Email**: New version created (to owner, template: `version_created`)
- **In-app**: Notification to owner

**Exceptions**:
- **Base version not found**: Return 404
- **Base version not Live/Archived**: Return 400, can only version from Live/Archived
- **Version number conflict**: Return 409, auto-increment and retry

**Manual Intervention**: None

---

### Flow 13: Update Automation Status

**Trigger**: User or system updates status (e.g., "Mark as Live")

**Flow Diagram**:
```
User/system requests status change (new_status, optional blocked_reason)
    ↓
Validate current status exists
    ↓
Check allowed transition (reference Automation Status State Machine):
    - Is transition from current_status → new_status allowed?
    - If not allowed: Return 400 with error code INVALID_STATUS_TRANSITION
    ↓
If new_status = 'Blocked':
    Validate blocked_reason is provided
    Store blocked_reason in automation_version
    ↓
Check prerequisites for specific transitions:
    - 'Needs Pricing' → 'Awaiting Client Approval':
        * Requires at least one quote with status='sent'
    - 'Awaiting Client Approval' → 'Build in Progress':
        * Requires quote with status='signed'
        * Optionally: Payment confirmed (see Flow 15)
    - 'Ready to Launch' → 'Live':
        * Requires workflow_binding.status='active' OR successful WRK Platform activation
    ↓
If prerequisites not met: Return 400 with specific missing prerequisites
    ↓
Update automation_version.status
    ↓
If status = 'Blocked':
    Store blocked_reason
    ↓
Update project.status (if linked)
    ↓
If status = 'Live':
    - Archive previous Live version (if exists, status='Archived')
    - Activate workflow binding
    ↓
Create audit log entry
    ↓
Trigger status-specific actions
    ↓
Send notifications
```

**API Endpoints**:
- `PATCH /v1/automation-versions/{id}/status` - Update status
  - Body: `{ status: string, blocked_reason?: string }`
- `GET /v1/automation-versions/{id}` - Get version with status

**Database Changes**:
- Update `automation_versions` (status, blocked_reason if Blocked)
- Update `projects` (status) if linked
- Update previous Live version (status='Archived') if new version going Live
- Insert into `audit_logs` (action_type='update_status', resource_type='automation_version', changes_json with before/after status)

**Notifications** (status-specific):
- **'Needs Pricing'**: Email to ops team (template: `needs_pricing`)
- **'Awaiting Client Approval'**: Email to client (template: `quote_sent`)
- **'Build in Progress'**: Email to client (template: `build_started`)
- **'QA & Testing'**: Email to client (template: `qa_started`)
- **'Ready to Launch'**: Email to client (template: `ready_to_launch`)
- **'Live'**: Email to client (template: `automation_live`)
- **'Blocked'**: Email to client + ops (template: `automation_blocked`, includes blocked_reason)

**Exceptions**:
- **Invalid status transition**: Return 400 with error code `INVALID_STATUS_TRANSITION` (e.g., can't go from 'Intake in Progress' directly to 'Live')
- **Missing prerequisites**: Return 400 with specific missing items (e.g., 'Awaiting Client Approval' → 'Build in Progress' requires signed quote)
- **Blocked without reason**: Return 400, `blocked_reason` required when status='Blocked'
- **No permission**: Return 403 (only ops can set certain statuses)
- **Invalid status value**: Return 400, status must be one of the valid statuses

**Manual Intervention**: 
- Ops team manually sets status in some cases (e.g., 'Blocked', 'Archived')
- Status transitions may require manual approval for sensitive changes
- Ops team reviews prerequisites before allowing transitions

---

## Pricing & Billing Flows

### Flow 14: Generate Quote

**Trigger**: Ops team generates quote for automation version

**Flow Diagram**:
```
Ops user opens pricing panel
    ↓
System calculates base pricing:
    - Setup fee (from complexity/blueprint)
    - Per-unit price (from estimated volume)
    - Volume discounts applied
    ↓
Check for pricing overrides
    ↓
Ops user reviews/adjusts pricing
    ↓
Create quote record (status='draft')
    ↓
Link to automation_version
    ↓
Update project.pricing_status = 'Draft'
    ↓
Return quote details
    ↓
[Ops user reviews and sends]
```

**API Endpoints**:
- `POST /v1/automation-versions/{id}/quotes` - Create quote
- `GET /v1/quotes/{id}` - Get quote details
- `PATCH /v1/quotes/{id}/status` - Update quote status

**Database Changes**:
- Insert into `quotes` (automation_version_id, tenant_id, status='draft', setup_fee, unit_price, estimated_volume, effective_unit_price)
- Update `projects` (pricing_status='Draft')

**Notifications**: None (draft quote)

**Exceptions**:
- **Automation version not found**: Return 404
- **Quote already exists**: Return 409, update existing or create new
- **Invalid pricing values**: Return 400

**Manual Intervention**: Ops user manually reviews and adjusts pricing before sending

---

### Flow 15: Send Quote to Client

**Trigger**: Ops user clicks "Send Quote"

**Flow Diagram**:
```
Ops user clicks "Send Quote"
    ↓
Validate quote exists and is 'draft'
    ↓
Update quote.status = 'sent'
    ↓
Update project.pricing_status = 'Sent'
    ↓
If automation_version.status = 'Needs Pricing':
    Update to 'Awaiting Client Approval'
    ↓
Generate quote PDF (optional)
    ↓
Send email to client
    ↓
Create audit log entry
    ↓
Return success
```

**API Endpoints**:
- `PATCH /v1/quotes/{id}/status` (status='sent')
- `GET /v1/quotes/{id}/pdf` - Download quote PDF (optional)

**Database Changes**:
- Update `quotes` (status='sent', sent_at=now())
- Update `projects` (pricing_status='Sent')
- Update `automation_versions` (status='Awaiting Client Approval' if was 'Needs Pricing')
- Insert into `audit_logs` (action_type='send_quote')

**Notifications**:
- **Email**: Quote sent to client (template: `quote_sent`, includes quote PDF link)
- **In-app**: Notification to client users
- **Email**: Quote sent confirmation to ops team (template: `quote_sent_ops`)

**Exceptions**:
- **Quote not in 'draft' status**: Return 400
- **Quote already sent**: Return 409
- **Client email not found**: Return 404

**Manual Intervention**: None (automated after ops approval)

---

### Flow 16: Client Signs Quote

**Trigger**: Client clicks "Approve Quote" in email or UI

**Flow Diagram**:
```
Client clicks "Approve Quote"
    ↓
Validate quote exists and is 'sent'
    ↓
Check client has permission (tenant matches)
    ↓
Check payment method on file:
    Query tenant billing config for:
        - customer_id (Stripe/Payment provider ID)
        - default_payment_method
    ↓
If no payment method on file:
    Redirect to payment provider (Stripe Checkout or Billing Portal)
    Client enters payment method
    On success: Store customer_id and default_payment_method
    ↓
Charge setup fee:
    Call payment provider API to charge setup_fee
    Create invoice record (or payable invoice)
    ↓
If payment fails:
    Return error, show payment failure message
    Send email to client (template: `payment_failed`)
    Quote remains 'sent' (not signed)
    ↓
If payment succeeds:
    Optionally apply credits:
        - Check for "free trial" or "first $X free" credits
        - Apply to credit_balance (if credit system exists)
        - Deduct from setup fee charge if applicable
    ↓
Update quote.status = 'signed'
    ↓
Update quote.signed_at = now()
    ↓
Update project.pricing_status = 'Signed'
    ↓
If automation_version.status = 'Awaiting Client Approval':
    If auto-build enabled:
        Update to 'Build in Progress'
        Trigger build workflow
    Else:
        Keep as 'Awaiting Client Approval' (manual build trigger)
    ↓
Create audit log entry
    ↓
Send notifications
    ↓
Return success
```

**API Endpoints**:
- `PATCH /v1/quotes/{id}/status` (status='signed')
- `POST /v1/quotes/{id}/payment-method` - Add/update payment method
- `POST /v1/quotes/{id}/charge-setup-fee` - Charge setup fee
- `GET /v1/quotes/{id}` - Get quote (client view)

**Database Changes**:
- Update tenant billing config (customer_id, default_payment_method) - if new payment method
- Create invoice record (setup_fee, status='paid') - if invoice table exists
- Update `quotes` (status='signed', signed_at=now())
- Update `projects` (pricing_status='Signed')
- Update `automation_versions` (status='Build in Progress' if auto-build)
- Insert into `audit_logs` (action_type='sign_quote', changes_json with payment info)

**Notifications**:
- **Email**: Quote signed confirmation to client (template: `quote_signed_client`, includes payment receipt)
- **Email**: Quote signed notification to ops team (template: `quote_signed_ops`)
- **Email**: Payment failed notification (template: `payment_failed`, if payment fails)
- **In-app**: Notification to ops team (build can start)
- **Slack** (optional): Quote signed alert to ops channel

**Exceptions**:
- **Quote not in 'sent' status**: Return 400
- **Quote already signed**: Return 409
- **Unauthorized tenant**: Return 403
- **Payment failed / card declined**: Return 402 Payment Required, quote remains 'sent', send email to client
- **Billing provider error**: Return 500, log error, alert ops, do NOT mark quote as signed
- **Quote expired** (optional): Return 400, request new quote

**Manual Intervention**: 
- Ops team may manually trigger build after quote signed (if auto-build disabled)
- Ops team reviews signed quote before starting build
- Ops team handles payment provider errors and may manually mark quote as signed if payment confirmed externally

---

### Flow 17: Adjust Committed Volume / Plan Upgrade

**Trigger**: Client changes committed volume or plan (e.g., from 10k → 30k runs/month) in the UI

**Flow Diagram**:
```
User adjusts committed volume slider / input
    ↓
System recomputes effective unit price based on new volume tiers
    ↓
Present preview:
    - New per-unit price
    - Estimated monthly spend
    - Change in total cost
    ↓
User confirms change
    ↓
Option A: Create new quote (change order):
    Create new quote record:
        - automation_version_id (same)
        - status = 'draft'
        - setup_fee = 0 (no new setup fee for volume change)
        - unit_price = new price based on volume tier
        - estimated_volume = new committed volume
        - effective_unit_price = calculated with volume discounts
    ↓
    Client signs new quote (reuse Flow 15 mechanics)
    ↓
Option B: Create pricing override:
    Create pricing_override record:
        - automation_version_id
        - unit_price_override = new price
        - reason = "Volume upgrade: {old_volume} → {new_volume}"
        - effective_date = next billing period start
    ↓
Update future billing calculations:
    - Use new effective_unit_price for periods after change date
    - Keep old pricing for current period
    ↓
If decreasing volume below current period usage:
    Warn user: "Current usage exceeds new committed volume"
    Enforce new limit at next period start
    ↓
Create audit log entry
    ↓
Send notifications
    ↓
Return success
```

**API Endpoints**:
- `POST /v1/automation-versions/{id}/volume-adjustment` - Adjust committed volume
- `GET /v1/automation-versions/{id}/pricing-preview` - Preview pricing for new volume

**Database Changes**:
- Option A: Insert into `quotes` (new change order quote)
- Option B: Insert into `pricing_overrides` (automation_version_id, unit_price_override, reason, effective_date)
- Update billing logic to use new effective_unit_price for future periods
- Insert into `audit_logs` (action_type='volume_adjustment')

**Notifications**:
- **Email**: Plan changed / committed volume updated (template: `volume_adjustment`, to client and ops)
- **Email**: Volume decrease warning (template: `volume_decrease_warning`, if decreasing below current usage)

**Exceptions**:
- **Decreasing volume below current period usage**: Return 400 with warning, allow but enforce at next period
- **Invalid volume value**: Return 400
- **Automation version not found**: Return 404
- **No active quote or pricing**: Return 400, must have existing pricing to adjust

**Manual Intervention**: 
- Ops team may manually approve large volume increases
- Ops team reviews volume decreases that exceed current usage

**Note**: Billing logic uses `effective_unit_price` from the latest active quote or override. Volume changes can be implemented via new quotes (change orders) or pricing overrides, depending on business rules.

---

### Flow 18: Client Rejects Quote

**Trigger**: Client clicks "Reject Quote" or provides feedback

**Flow Diagram**:
```
Client clicks "Reject Quote" (optional: with feedback)
    ↓
Validate quote exists and is 'sent'
    ↓
Update quote.status = 'rejected'
    ↓
Update project.pricing_status = 'Not Generated' (or keep as 'Sent' for history)
    ↓
If automation_version.status = 'Awaiting Client Approval':
    Update to 'Needs Pricing'
    ↓
Store rejection reason (optional field)
    ↓
Create audit log entry
    ↓
Send notifications
    ↓
Return success
```

**API Endpoints**:
- `PATCH /v1/quotes/{id}/status` (status='rejected', rejection_reason optional)

**Database Changes**:
- Update `quotes` (status='rejected', rejection_reason)
- Update `automation_versions` (status='Needs Pricing')
- Insert into `audit_logs` (action_type='reject_quote')

**Notifications**:
- **Email**: Quote rejected notification to ops team (template: `quote_rejected`, includes client feedback)
- **Email**: Rejection confirmation to client (template: `quote_rejected_client`)
- **In-app**: Notification to ops team (needs new quote)

**Exceptions**:
- **Quote not in 'sent' status**: Return 400
- **Quote already signed/rejected**: Return 409

**Manual Intervention**: 
- Ops team reviews rejection reason and creates new quote with adjusted pricing
- Ops team may contact client to discuss pricing

---

### Flow 19: Pricing Override (Admin)

**Trigger**: Ops admin applies pricing override

**Flow Diagram**:
```
Ops admin opens pricing override panel
    ↓
Admin enters override values (setup_fee_override, unit_price_override, reason)
    ↓
Validate override values
    ↓
Create pricing_override record
    ↓
Link to automation_version
    ↓
Update effective pricing calculations
    ↓
Create audit log entry
    ↓
Send notifications
    ↓
Return success
```

**API Endpoints**:
- `POST /v1/admin/automation-versions/{id}/pricing-overrides` (admin only)
- `GET /v1/automation-versions/{id}/pricing-overrides` - List overrides

**Database Changes**:
- Insert into `pricing_overrides` (automation_version_id, setup_fee_override, unit_price_override, reason, created_by)
- Insert into `audit_logs` (action_type='pricing_override')

**Notifications**:
- **Email**: Pricing override notification to account manager (template: `pricing_override_applied`)
- **In-app**: Notification to ops team

**Exceptions**:
- **Not admin user**: Return 403
- **Invalid override values**: Return 400
- **Override already exists**: Return 409, update existing or create new

**Manual Intervention**: Admin manually reviews and applies overrides (not automated)

---

### Flow 20: Billing Period Finalization

**Trigger**: Monthly billing cycle (scheduled job)

**Flow Diagram**:
```
Scheduled job runs (monthly, e.g., 1st of month)
    ↓
For each tenant:
    Calculate previous month totals:
        - Sum usage_aggregates (run_count * effective_unit_price)
        - Sum setup fees from signed quotes
        - Calculate total spend
    ↓
Create billing_period record (status='draft')
    ↓
Generate invoice PDF (optional)
    ↓
Send invoice email to client
    ↓
Update billing_period.status = 'finalized'
    ↓
Create audit log entry
    ↓
Send notifications
```

**API Endpoints**:
- `GET /v1/tenants/{tenantId}/billing-summary` - Get billing summary
- `POST /v1/admin/billing-periods/finalize` (admin only, manual trigger)
- `GET /v1/billing-periods/{id}/invoice` - Download invoice PDF

**Database Changes**:
- Insert into `billing_periods` (tenant_id, period_start, period_end, total_spend, setup_fees_collected, unit_costs, status='draft')
- Update `billing_periods` (status='finalized', finalized_at=now())
- Insert into `audit_logs` (action_type='finalize_billing')

**Notifications**:
- **Email**: Invoice sent to client (template: `invoice_sent`, includes PDF)
- **Email**: Billing summary to ops team (template: `billing_summary_ops`)

**Exceptions**:
- **No usage data**: Create billing period with $0 spend
- **Billing period already finalized**: Skip, log warning
- **Missing tenant data**: Skip, log error, alert ops

**Manual Intervention**: 
- Ops team reviews billing periods before finalization (optional approval step)
- Ops team can manually trigger finalization if needed

---

## Build & Deployment Flows

### Flow 21: Request Build

**Trigger**: Automation version status changes to 'Build in Progress' (manual or automatic)

**Flow Diagram**:
```
Status changes to 'Build in Progress'
    ↓
Validate prerequisites:
    - Quote is signed
    - Blueprint is complete
    - No blocking issues
    ↓
Create workflow_binding record (status='pending')
    ↓
Enqueue build request to 'build-requests' queue
    ↓
Update project.checklist_progress = 0%
    ↓
Create initial build tasks (if not exists)
    ↓
Send notifications
    ↓
[Build Orchestrator Worker picks up job]
```

**API Endpoints**:
- `PATCH /v1/automation-versions/{id}/status` (status='Build in Progress') - Manual trigger
- `POST /v1/admin/projects/{id}/request-build` (admin only) - Manual trigger

**Database Changes**:
- Update `automation_versions` (status='Build in Progress')
- Update `projects` (status='Build in Progress', checklist_progress=0)
- Insert into `workflow_bindings` (automation_version_id, status='pending')
- Insert into `tasks` (context_type='project', context_id=project.id, kind='build_checklist', status='pending') - multiple build checklist tasks

**Note**: Build checklist tasks are created here (when build starts), not during automation creation. The `checklist_progress` on projects is calculated as: percentage of tasks with `context_type='project'` and `kind='build_checklist'` that have `status='complete'`.

**Notifications**:
- **Email**: Build started notification to client (template: `build_started`)
- **Email**: Build assigned to solutions engineer (template: `build_assigned`)
- **In-app**: Notification to project owner
- **Slack** (optional): New build alert to ops channel

**Exceptions**:
- **Quote not signed**: Return 400, must sign quote first
- **Blueprint incomplete**: Return 400, blueprint must have nodes/edges
- **Build already in progress**: Return 409
- **Missing prerequisites**: Return 400, list missing items

**Manual Intervention**: 
- Ops team manually assigns build to solutions engineer
- Ops team reviews prerequisites before starting build

---

### Flow 22: Build Orchestration (Worker)

**Trigger**: Build Orchestrator Worker processes queue message

**Flow Diagram**:
```
Worker receives build request message
    ↓
Fetch automation_version and blueprint_json
    ↓
Call WRK Platform API to create workflow:
    POST /wrk-api/workflows
    {
        name: automation.name,
        blueprint: blueprint_json,
        tenant_id: tenant_id
    }
    ↓
[WRK Platform returns workflow_id and workflow_url]
    ↓
Update workflow_binding:
    - wrk_workflow_id = workflow_id
    - wrk_workflow_url = workflow_url
    - status = 'active'
    ↓
Update automation_version.status = 'QA & Testing'
    ↓
Update project.status = 'QA & Testing'
    ↓
Update build tasks (mark integration tasks as complete)
    ↓
Send notifications
    ↓
Enqueue notification job
```

**API Endpoints** (External):
- `POST /wrk-api/workflows` - Create workflow in WRK Platform (external API)

**Database Changes**:
- Update `workflow_bindings` (wrk_workflow_id, wrk_workflow_url, status='active')
- Update `automation_versions` (status='QA & Testing')
- Update `projects` (status='QA & Testing')
- Update `tasks` (status='complete' for integration tasks)

**Notifications** (via Notification Worker):
- **Email**: Build complete notification to client (template: `build_complete`)
- **Email**: QA ready notification to ops team (template: `qa_ready`)
- **In-app**: Notification to project owner

**Exceptions**:
- **WRK Platform API error**: Retry 3 times, then mark workflow_binding.status='error', notify ops
- **Blueprint validation fails in WRK Platform**: Mark status='error', notify ops with error details
- **Network timeout**: Retry with exponential backoff
- **Invalid blueprint structure**: Return error, don't retry, notify ops

**Manual Intervention**: 
- Ops team reviews build errors and fixes blueprint if needed
- Ops team manually retries failed builds

---

### Flow 23: QA Testing & Approval

**Trigger**: Ops team or client runs QA tests

**Flow Diagram**:
```
Status is 'QA & Testing'
    ↓
Ops team runs test executions
    ↓
Test results recorded (success/failure)
    ↓
If tests pass:
    Update automation_version.status = 'Ready to Launch'
    Update project.status = 'Ready to Launch'
    ↓
If tests fail:
    Update automation_version.status = 'Build in Progress'
    Create tasks for fixes
    Notify solutions engineer
    ↓
[Client can also approve for launch]
    ↓
Send notifications
```

**API Endpoints**:
- `POST /v1/automation-versions/{id}/test` - Run test execution
- `GET /v1/automation-versions/{id}/test-results` - Get test results
- `PATCH /v1/automation-versions/{id}/status` (status='Ready to Launch') - Approve for launch

**Database Changes**:
- Update `automation_versions` (status='Ready to Launch' or 'Build in Progress')
- Update `projects` (status)
- Insert into `tasks` (if fixes needed, status='pending')

**Notifications**:
- **Email**: QA passed, ready to launch (template: `qa_passed`)
- **Email**: QA failed, needs fixes (template: `qa_failed`)
- **In-app**: Notification to client (can approve launch)

**Exceptions**:
- **Tests not run**: Status remains 'QA & Testing'
- **Partial test failures**: Ops decides whether to proceed or fix

**Manual Intervention**: 
- Ops team runs QA tests manually
- Client can approve launch after reviewing test results
- Ops team decides on partial failures

---

### Flow 24: Deploy to Production

**Trigger**: User/system sets status to 'Live'

**Flow Diagram**:
```
Status changes to 'Ready to Launch'
    ↓
User/client clicks "Deploy to Production"
    ↓
Validate workflow_binding exists and is 'active'
    ↓
Call WRK Platform API to activate workflow:
    PATCH /wrk-api/workflows/{workflow_id}/activate
    ↓
[WRK Platform activates workflow]
    ↓
Update automation_version.status = 'Live'
    ↓
Update project.status = 'Live'
    ↓
If previous Live version exists:
    Archive previous version (status='Archived')
    Deactivate previous workflow_binding
    ↓
Update workflow_binding.status = 'active' (if not already)
    ↓
Create audit log entry
    ↓
Send notifications
    ↓
Start monitoring run events
```

**API Endpoints**:
- `PATCH /v1/automation-versions/{id}/status` (status='Live')
- `PATCH /wrk-api/workflows/{workflow_id}/activate` (external API)

**Database Changes**:
- Update `automation_versions` (status='Live')
- Update previous Live version (status='Archived')
- Update `projects` (status='Live')
- Update `workflow_bindings` (status='active' for new, 'inactive' for old)
- Insert into `audit_logs` (action_type='deploy')

**Notifications**:
- **Email**: Automation live notification to client (template: `automation_live`)
- **Email**: Deployment success to ops team (template: `deployment_success`)
- **In-app**: Notification to all collaborators
- **Slack** (optional): Automation live alert

**Exceptions**:
- **WRK Platform activation fails**: Retry, if fails mark status='error', notify ops
- **Previous version deactivation fails**: Log warning, continue with new version
- **No workflow_binding**: Return 400, build must complete first

**Manual Intervention**: 
- Ops team can manually activate in WRK Platform if API fails
- Ops team reviews before deploying (optional approval step)

---

## Execution & Monitoring Flows

### Flow 25: Provide / Update Integration Credentials

**Trigger**: Client needs to connect systems (e.g., HubSpot, Salesforce, Gmail, Xero) for an automation

**Flow Diagram**:
```
User opens "Connections / Credentials" UI for automation or tenant
    ↓
User selects system to connect
    ↓
Option A: OAuth connection:
    Redirect to provider OAuth flow (HubSpot, Salesforce, etc.)
    User authorizes access
    Provider returns access_token and refresh_token
    ↓
Option B: API key / secret entry:
    User enters API key, secret, or other credentials
    ↓
Backend stores credentials securely:
    - Store in WRK Platform's secrets store OR
    - Store in dedicated secrets manager (AWS Secrets Manager, HashiCorp Vault)
    - Never store plaintext in Copilot database
    - Only store reference (credential_id) in Copilot DB
    ↓
Link credential to automation_version or tenant
    ↓
Mark related tasks as complete:
    - Find tasks with kind='build_checklist' and title matching system
    - Update task.status = 'complete'
    - Recalculate project.checklist_progress
    ↓
If automation was previously Blocked due to credential issues:
    Check if all required credentials are now valid
    If all valid:
        Option A: Automatically move status back to previous healthy state
        Option B: Require ops approval to unblock
    ↓
Send notifications
    ↓
Return success
```

**API Endpoints**:
- `POST /v1/automation-versions/{id}/credentials` - Add/update credentials
- `GET /v1/automation-versions/{id}/credentials` - List credentials (masked)
- `POST /v1/credentials/oauth/{provider}` - Initiate OAuth flow
- `GET /v1/credentials/oauth/{provider}/callback` - OAuth callback

**Database Changes**:
- Store credentials in secrets manager (not in Copilot DB)
- Insert/update credential reference in `credentials` table (if exists): credential_id, automation_version_id, system_name, credential_type, stored_at
- Update `tasks` (status='complete' for related credential tasks)
- Update `projects` (checklist_progress recalculated)
- Update `automation_versions` (status, if unblocking from Blocked)

**Notifications**:
- **Email**: Credentials added notification (template: `credentials_added`, to ops when all required credentials provided)
- **In-app**: Notification to owner

**Exceptions**:
- **Invalid OAuth response**: Return 400, retry OAuth flow
- **Invalid API key format**: Return 400, validate format
- **Credential storage failure**: Return 500, log error, alert ops
- **Missing required credentials**: Return 400, list missing systems

**Manual Intervention**: 
- Ops team may manually verify credentials
- Ops team approves unblocking from Blocked state (if configured)

**Security Note**: Credentials are never stored in plaintext. They are stored in a secrets manager, and only references (credential_id) are stored in the Copilot database.

---

### Flow 26: Credential Failure → Blocked Automation

**Trigger**: WRK Platform run_events or monitoring detect auth errors (e.g., 401, 403)

**Flow Diagram**:
```
Usage aggregation or monitoring detects auth errors:
    - Run events show status='failure' with error_message containing 'AUTH_ERROR' or '401' or '403'
    - OR monitoring detects repeated auth failures for integration step
    ↓
Check failure threshold:
    - X consecutive auth failures (e.g., 3)
    - OR Y% of runs failing for reason AUTH_ERROR (e.g., >50% in last hour)
    ↓
If threshold exceeded:
    Set automation_versions.status = 'Blocked'
    Set automation_versions.blocked_reason = 'Credentials invalid or expired for [system_name]'
    ↓
Create high-priority task for ops:
    - context_type = 'project' or 'automation_version'
    - kind = 'general_todo'
    - title = 'Fix credentials for [system_name]'
    - priority = 'high' or 'critical'
    - assignee = project owner or ops team
    ↓
Notify client to update credentials
    ↓
Notify ops team (high priority)
    ↓
[Once credentials fixed via Flow 24]
    ↓
Ops or system can move status from Blocked:
    - Check if transition from 'Blocked' → previous_status is allowed
    - If allowed: Update status via Flow 13
    - If not allowed: Move to nearest valid status (e.g., 'Blocked' → 'Build in Progress' if was in build)
    ↓
Clear blocked_reason
    ↓
Send unblocked notifications
```

**API Endpoints**: Internal monitoring/worker, no external API

**Database Changes**:
- Update `automation_versions` (status='Blocked', blocked_reason)
- Insert into `tasks` (context_type, context_id, kind='general_todo', title, priority='high', status='pending')
- Insert into `audit_logs` (action_type='block_automation', resource_type='automation_version', changes_json with blocked_reason)

**Notifications**:
- **Email**: Automation blocked notification (template: `automation_blocked`, to client, includes blocked_reason and instructions)
- **Email**: Critical: Credentials failed (template: `credentials_failed_critical`, to ops team, high priority)
- **In-app**: High-priority notification to ops team
- **Slack** (optional): Critical alert to ops channel

**Exceptions**:
- **Misconfigured alert thresholds**: Log warning, adjust thresholds, but don't flail statuses
- **False positive detection**: Ops team can manually unblock if false positive
- **Multiple systems failing**: Block with reason listing all failed systems

**Manual Intervention**: 
- Ops team reviews blocked automations and contacts client
- Ops team verifies credential fixes before unblocking
- Ops team may adjust failure thresholds if needed

**Note**: Once credentials are fixed (Flow 24), the automation can be unblocked via Flow 13 (Update Automation Status), respecting allowed transitions from the state machine.

---

### Flow 27: Run Event Webhook (WRK Platform → WRK Copilot)

**Trigger**: WRK Platform sends webhook on workflow execution

**Flow Diagram**:
```
WRK Platform executes workflow
    ↓
WRK Platform sends webhook:
    POST /v1/webhooks/wrk-run-event
    Headers: X-WRK-Signature (HMAC)
    Body: { workflow_id, run_id, status, started_at, completed_at, error_message }
    ↓
Validate HMAC signature
    ↓
If invalid signature: Return 401, log security event
    ↓
Find workflow_binding by wrk_workflow_id
    ↓
Check for existing run_event (idempotency):
    SELECT * FROM run_events 
    WHERE workflow_binding_id = ? AND run_id = ?
    ↓
If exists: Return 200 (already processed, idempotent)
    ↓
If not exists:
    Create run_event record
    Enqueue usage aggregation job
    ↓
If status = 'failure' and error is critical:
    Check failure threshold
    If threshold exceeded: Send alert
    ↓
Return 200 OK
```

**API Endpoints**:
- `POST /v1/webhooks/wrk-run-event` (internal, webhook receiver)

**Database Changes**:
- Insert into `run_events` (workflow_binding_id, run_id, status, started_at, completed_at, error_message, metadata_json)
- Idempotency: Unique constraint prevents duplicates

**Notifications** (conditional):
- **Email**: Critical failure alert (if failure rate > threshold, template: `automation_critical_failure`)
- **In-app**: Failure notification to automation owner (if failure)

**Exceptions**:
- **Invalid HMAC signature**: Return 401, log security event, alert ops
- **Workflow binding not found**: Return 404, log error
- **Duplicate run_id**: Return 200 (idempotent, already processed)
- **Malformed webhook payload**: Return 400, log error

**Manual Intervention**: 
- Ops team reviews critical failures
- Ops team investigates if failure rate exceeds threshold

---

### Flow 28: Usage Aggregation

**Trigger**: Usage Aggregation Worker processes run events

**Flow Diagram**:
```
Worker receives run event message
    ↓
Find workflow_binding and automation_version
    ↓
Calculate time period (hourly or daily):
    period_start = truncate_to_hour/day(started_at)
    period_end = period_start + 1 hour/day
    ↓
Find or create usage_aggregate for period
    ↓
Increment counters:
    - run_count += 1
    - success_count += 1 (if status='success')
    - failure_count += 1 (if status='failure')
    - total_cost += (effective_unit_price)
    ↓
Update usage_aggregate record
    ↓
Check usage thresholds:
    - If run_count > volume_threshold: Alert ops
    - If failure_rate > threshold: Alert ops
    ↓
If monthly period complete:
    Trigger billing calculation
```

**API Endpoints**: Internal worker, no external API

**Database Changes**:
- Upsert `usage_aggregates` (automation_version_id, period_start, period_end, run_count, success_count, failure_count, total_cost)
- Unique constraint on (automation_version_id, period_start, period_end) ensures one aggregate per period

**Notifications** (conditional):
- **Email**: Usage threshold exceeded (template: `usage_threshold_exceeded`)
- **Email**: Failure rate threshold exceeded (template: `failure_rate_threshold_exceeded`)

**Exceptions**:
- **Missing workflow_binding**: Skip, log error
- **Invalid period calculation**: Log error, use fallback period
- **Aggregate update conflict**: Retry with current values

**Manual Intervention**: None (fully automated)

---

### Flow 29: Threshold Alert

**Trigger**: Usage or failure rate exceeds threshold

**Flow Diagram**:
```
Usage aggregation detects threshold breach
    ↓
Check alert rules:
    - Usage > committed_volume * 1.2 (20% over)
    - Failure rate > 5%
    - Cost > estimated_monthly_spend * 1.5
    ↓
Create alert record (if not already sent for this period)
    ↓
Determine alert recipients:
    - Automation owner
    - Ops team (for critical alerts)
    - Account manager (for cost alerts)
    ↓
Send notifications
    ↓
Update alert sent timestamp (prevent spam)
```

**API Endpoints**: Internal, no external API

**Database Changes**:
- Insert into `alerts` (automation_version_id, alert_type, threshold_value, current_value, sent_at) - if alerts table exists
- Or: Store in audit_logs

**Notifications**:
- **Email**: Threshold alert (template: `usage_threshold_alert` or `failure_rate_alert`)
- **In-app**: Alert notification
- **Slack** (optional): Critical alert to ops channel

**Exceptions**:
- **Alert already sent**: Skip, prevent spam
- **Threshold not configured**: Use defaults
- **Missing recipient email**: Log warning, skip

**Manual Intervention**: 
- Ops team reviews alerts and takes action (e.g., contact client about overage)
- Ops team adjusts thresholds if needed

---

## Collaboration Flows

### Flow 30: Send Message

**Trigger**: User sends message in project/automation thread

**Flow Diagram**:
```
User composes message (text, optional attachments, tags)
    ↓
User selects message type:
    - 'client' (visible to client)
    - 'ops' (visible to ops only)
    - 'internal_note' (ops-only notes)
    ↓
Validate message type permissions
    ↓
Create message record
    ↓
Link to project or automation_version
    ↓
If type = 'client':
    Send email notification to client users
    ↓
If type = 'ops' or 'internal_note':
    Send in-app notification to ops team
    ↓
Create audit log entry (if sensitive)
    ↓
Return message
```

**API Endpoints**:
- `POST /v1/messages` - Create message
- `GET /v1/projects/{id}/messages` - List project messages
- `GET /v1/automations/{id}/messages` - List automation messages

**Database Changes**:
- Insert into `messages` (tenant_id, project_id or automation_version_id, type, sender_id, text, attachments_json, tags)

**Notifications**:
- **Email**: New message notification (template: `new_message`, only for 'client' type to client users)
- **In-app**: Notification to recipients (based on message type visibility)

**Exceptions**:
- **Invalid message type for user role**: Return 403 (e.g., client can't send 'internal_note')
- **Missing project/automation**: Return 404
- **Message too long**: Return 400, enforce character limit
- **Invalid attachments**: Return 400, validate file types/sizes

**Manual Intervention**: None

---

### Flow 31: Create Task

**Trigger**: User creates task (build checklist item, TODO, workflow item)

**Flow Diagram**:
```
User creates task form (title, description, context, kind, assignee, due_date, priority)
    ↓
Validate context exists (project/automation_version)
    ↓
Create task record
    ↓
If kind = 'build_checklist' and context_type = 'project':
    Recalculate project.checklist_progress
    ↓
If assignee specified:
    Send notification to assignee
    ↓
If due_date specified and < 7 days:
    Schedule reminder notification
    ↓
Return task
```

**API Endpoints**:
- `POST /v1/tasks` - Create task
- `GET /v1/tasks` - List tasks (filtered by context, assignee, status)
- `PATCH /v1/tasks/{id}/status` - Update task status

**Database Changes**:
- Insert into `tasks` (tenant_id, context_type, context_id, kind, title, description, status='pending', assignee_id, due_date, priority)
- Update `projects` (checklist_progress) if build_checklist task

**Note**: `checklist_progress` on projects is calculated as: percentage of tasks with `context_type='project'` and `kind='build_checklist'` that have `status='complete'`.

**Notifications**:
- **Email**: Task assigned notification (template: `task_assigned`)
- **In-app**: Notification to assignee
- **Email**: Task due reminder (template: `task_due_reminder`, scheduled)

**Exceptions**:
- **Invalid context**: Return 404
- **Invalid assignee**: Return 400
- **Missing required fields**: Return 400

**Manual Intervention**: None

---

### Flow 32: Update Task Status

**Trigger**: User updates task status (pending → in_progress → complete)

**Flow Diagram**:
```
User updates task status
    ↓
Validate status transition
    ↓
Update task.status
    ↓
If kind = 'build_checklist' and context_type = 'project':
    Recalculate project.checklist_progress
    ↓
If status = 'complete':
    Check if all build_checklist tasks complete
    If all complete: Notify ops (ready for next step)
    ↓
If status = 'complete' and due_date passed:
    Log completion delay (for metrics)
    ↓
Send notifications
    ↓
Return updated task
```

**API Endpoints**:
- `PATCH /v1/tasks/{id}/status` - Update task status

**Database Changes**:
- Update `tasks` (status, updated_at)
- Update `projects` (checklist_progress) if build_checklist

**Note**: `checklist_progress` is recalculated as: (count of complete build_checklist tasks / total build_checklist tasks) * 100, where tasks have `context_type='project'` and `kind='build_checklist'`.

**Notifications**:
- **In-app**: Task status updated notification (to assignee and project owner)
- **Email**: All build tasks complete (template: `build_tasks_complete`, if all complete)

**Exceptions**:
- **Task not found**: Return 404
- **Invalid status**: Return 400
- **No permission**: Return 403

**Manual Intervention**: None

---

## Admin & Ops Flows

### Flow 33: Create Client (Ops)

**Trigger**: Ops admin creates new client record

**Flow Diagram**:
```
Ops admin creates client form (name, industry, owner_id)
    ↓
Check if tenant already exists (by email/domain)
    ↓
If tenant exists:
    Link client to existing tenant
    ↓
If tenant doesn't exist:
    Create tenant record
    Create client record (1:1 with tenant)
    ↓
Set default health_status = 'Good'
    ↓
Assign ops owner
    ↓
Create audit log entry
    ↓
Send welcome email to tenant (if new)
    ↓
Return client
```

**API Endpoints**:
- `POST /v1/admin/clients` (admin only)
- `GET /v1/admin/clients/{id}` - Get client details

**Database Changes**:
- Insert into `tenants` (if new, name, subdomain)
- Insert into `clients` (tenant_id UNIQUE, name, industry, health_status='Good', owner_id)
- Insert into `audit_logs` (action_type='create_client')

**Notifications**:
- **Email**: Welcome email to tenant admin (template: `client_welcome`, if new tenant)
- **In-app**: New client notification to ops team

**Exceptions**:
- **Tenant already has client**: Return 409
- **Invalid ops owner**: Return 400
- **Duplicate client name**: Return 409, suggest different name

**Manual Intervention**: Ops admin manually creates client (not automated)

---

### Flow 34: Update Client Health Status

**Trigger**: Ops admin updates client health status

**Flow Diagram**:
```
Ops admin updates health_status ('Good' → 'At Risk' → 'Churn Risk')
    ↓
Validate status transition
    ↓
Update client.health_status
    ↓
If status = 'At Risk' or 'Churn Risk':
    Create alert record
    Assign to account manager
    ↓
If status = 'Churn Risk':
    Escalate to ops manager
    Create retention task
    ↓
Create audit log entry
    ↓
Send notifications
    ↓
Return updated client
```

**API Endpoints**:
- `PATCH /v1/admin/clients/{id}` (admin only, update health_status)
- `GET /v1/admin/clients` - List clients (filter by health_status)

**Database Changes**:
- Update `clients` (health_status)
- Insert into `tasks` (if churn risk, kind='general_todo', assignee=account_manager)
- Insert into `audit_logs` (action_type='update_client_health')

**Notifications**:
- **Email**: Client health status changed (template: `client_health_changed`, to account manager)
- **Email**: Churn risk alert (template: `client_churn_risk`, to ops manager)
- **In-app**: Notification to account manager

**Exceptions**:
- **Invalid status**: Return 400
- **Client not found**: Return 404
- **No permission**: Return 403

**Manual Intervention**: Ops admin manually updates health status based on metrics/observations

---

### Flow 35: Archive Automation

**Trigger**: User or ops admin archives automation version

**Flow Diagram**:
```
User/admin requests archive
    ↓
Validate automation_version exists
    ↓
If status = 'Live':
    Deactivate workflow in WRK Platform
    Update workflow_binding.status = 'inactive'
    ↓
Update automation_version.status = 'Archived'
    ↓
Update project.status = 'Archived' (if linked)
    ↓
Create audit log entry
    ↓
Send notifications
    ↓
Return success
```

**API Endpoints**:
- `PATCH /v1/automation-versions/{id}/status` (status='Archived')
- `DELETE /v1/automations/{id}` (soft delete, sets all versions to Archived)

**Database Changes**:
- Update `automation_versions` (status='Archived')
- Update `projects` (status='Archived')
- Update `workflow_bindings` (status='inactive' if was active)
- Insert into `audit_logs` (action_type='archive_automation')

**Notifications**:
- **Email**: Automation archived notification (template: `automation_archived`, to owner and collaborators)
- **In-app**: Notification to team

**Exceptions**:
- **Automation not found**: Return 404
- **Cannot archive Live version without replacement**: Return 400 (must have new Live version first)
- **No permission**: Return 403

**Manual Intervention**: 
- Ops admin may archive automations manually
- Client can request archive (requires approval)

---

## Summary

This document covers all major user flows in WRK Copilot, including:

- **Identity & Access**: Signup, invitation, login, password reset, API keys, tenant switching, partner API access
- **Automation Lifecycle**: Create, requirements capture & AI ingestion, update blueprint, move to pricing, create version, update status (with state machine)
- **Pricing & Billing**: Generate quote, send, sign (with payment), reject, volume adjustments, overrides, billing finalization
- **Build & Deployment**: Request build, orchestration, QA, deploy to production, credentials management, credential failure handling
- **Execution & Monitoring**: Run event webhooks, usage aggregation, threshold alerts
- **Collaboration**: Messages, tasks, task status updates
- **Admin & Ops**: Create client, update health status, archive automation

**Key Architectural Alignments**:
- **State Machine**: Automation status transitions follow strict state machine rules (see Automation Status State Machine section)
- **Project Creation Timing**: Projects are created when moving from "Intake in Progress" to "Needs Pricing", not during automation creation
- **Task Creation Timing**: Build checklist tasks are created when build starts or when project is created for pricing, not during automation creation
- **Tenant Isolation**: All flows enforce tenant_id from authenticated session, never from request parameters
- **Payment Integration**: Quote signing includes payment method collection and setup fee charging
- **Credentials Security**: Credentials stored in secrets manager, only references in database
- **IdP Ready**: Auth flows structured to support future IdP integration

Each flow includes:
- Clear text-based diagram
- API endpoints involved
- Database changes
- Notifications (email/SMS/in-app)
- Exception handling
- Manual intervention points

These flows serve as the foundation for backend API design and implementation, aligned with the WRK Copilot Backend Architecture (modular monolith, Neon, workers, webhooks, HMAC, idempotency).


# WRK Copilot User Flows Specification

**Version**: 2.0  
**Last Updated**: 2024  
**Status**: Engineering-Ready

---

## Table of Contents

1. [Introduction](#introduction)
2. [Terminology & Conventions](#terminology--conventions)
3. [Identity & Access Flows](#identity--access-flows)
4. [Automation Lifecycle Flows](#automation-lifecycle-flows)
5. [Pricing & Billing Flows](#pricing--billing-flows)
6. [Build & Deployment Flows](#build--deployment-flows)
7. [Execution & Monitoring Flows](#execution--monitoring-flows)
8. [Collaboration Flows](#collaboration-flows)
9. [Admin & Ops Flows](#admin--ops-flows)
10. [Summary & Validation](#summary--validation)

---

## Introduction

This document defines all user flows for WRK Copilot, a multi-tenant automation platform. Each flow specifies:

- **Trigger**: What initiates the flow
- **Flow Diagram**: Step-by-step process visualization
- **API Endpoints**: REST endpoints with HTTP methods
- **Database Changes**: Exact table modifications (using snake_case column names)
- **Tenant Isolation**: How `tenant_id` is enforced (always from session/JWT, never from request)
- **Notifications**: Email, in-app, and optional Slack notifications
- **Exceptions**: Error handling and edge cases
- **Manual Intervention**: Points requiring human action

**Architecture Alignment**: All flows align with the WRK Copilot Backend Architecture:
- Modular monolith design
- Neon PostgreSQL database
- Worker queues for async processing
- Event-driven ingestion
- WRK Platform external API integration
- HMAC-signed webhooks with idempotency
- Secrets manager for credentials

---

## Terminology & Conventions

### Database Naming
- **Table names**: snake_case (e.g., `automation_versions`, `workflow_bindings`)
- **Column names**: snake_case (e.g., `tenant_id`, `automation_id`, `blueprint_json`)
- **Foreign keys**: `{table}_id` (e.g., `automation_version_id`)

### API Endpoints
- **URLs**: kebab-case (e.g., `/v1/automation-versions/{id}`)
- **HTTP methods**: RESTful (GET, POST, PATCH, DELETE)
- **Versioning**: `/v1/` prefix for all endpoints

### Status Values
- **Automation statuses**: Exact strings as defined in state machine (e.g., `'Intake in Progress'`, `'Needs Pricing'`)
- **Quote statuses**: `'draft'`, `'sent'`, `'signed'`, `'rejected'` (lowercase)
- **Project statuses**: Align with automation version statuses

### Security Conventions
- **Tenant ID**: Always extracted from authenticated session (JWT claims or API key context), never from request body or query parameters
- **User ID**: Always from session, never from request
- **API Keys**: Stored as hashes, validated on each request
- **Webhooks**: HMAC signature verification required, idempotent processing
- **Credentials**: Stored in secrets manager (AWS Secrets Manager, HashiCorp Vault), only references in database

### Glossary

| Term | Definition |
|------|------------|
| **Automation** | Logical automation entity (e.g., "Invoice Processing") |
| **Automation Version** | Specific version of an automation (e.g., v1.0, v1.1) |
| **Blueprint** | JSON structure defining workflow nodes and edges |
| **Project** | Ops-facing entity tracking automation work from pricing stage forward |
| **Client** | 1:1 mapping with tenant, ops-facing commercial entity |
| **Tenant** | Multi-tenant isolation boundary, maps 1:1 to client |
| **Quote** | Pricing proposal for an automation version |
| **Workflow Binding** | Link between automation version and WRK Platform workflow |
| **Run Event** | Execution record from WRK Platform webhook |
| **Usage Aggregate** | Period-based aggregation of run counts and costs |

---

## Identity & Access Flows

### Authentication Assumptions

**V1 Implementation**: Flows 1-5 assume first-party email/password authentication:
- User signup with email verification
- Password-based login with JWT tokens
- Password reset flows
- Session management with refresh tokens

**Future IdP Integration**: Planned support for managed IdP (Auth0, Clerk, etc.):
- Signup/login/password reset at IdP
- Backend maps IdP `sub` → `users` table
- Creates tenants for first user
- Manages tenant membership & roles
- JWT tokens include `tenant_id`, `user_id`, `roles`

**Security Contract**: `tenant_id` and `user_id` **always** come from authenticated session (JWT or API key), **never** from request bodies or query parameters. All service layer methods receive `tenantId` from session context.

---

### Flow 1: User Signup (New Tenant)

**Trigger**: User submits registration form on signup page

**Flow Diagram**:
```
User submits signup form (email, password, name)
    ↓
Extract tenant_id from request: NONE (new tenant creation)
    ↓
Validate email format & global uniqueness
    ↓
Create tenant record:
    - id (UUID, auto-generated)
    - name (from form or derived)
    - subdomain (optional, derived from name)
    ↓
Create user record:
    - id (UUID, auto-generated)
    - tenant_id (from tenant just created)
    - email (from form)
    - password_hash (bcrypt hash of password)
    - email_verified = false
    ↓
Assign default role: "admin" (first user is admin)
    ↓
Generate email verification token (UUID, expires in 24h)
    ↓
Store token hash in user record
    ↓
Send verification email (template: welcome_verify)
    ↓
Return 201 Created (user not yet active)
    ↓
[User clicks email link]
    ↓
Validate token & activate user:
    - email_verified = true
    - Clear verification token
    ↓
Create session:
    - Generate JWT access token (15 min expiry)
    - Generate refresh token (7 day expiry)
    - Store refresh token hash in sessions table
    ↓
Return tokens + user info
    ↓
Redirect to onboarding/dashboard
```

**API Endpoints**:
- `POST /v1/auth/signup` - Create tenant + user
  - Request body: `{ email: string, password: string, name: string }`
  - Response: `201 Created` with `{ user: {...}, tenant: {...} }`
- `GET /v1/auth/verify-email?token={token}` - Verify email token
  - Response: `200 OK` or `401 Unauthorized` if expired
- `POST /v1/auth/login` - Login after verification (see Flow 3)

**Database Changes**:
- Insert into `tenants`:
  - `id` (UUID, primary key)
  - `name` (from form or email domain)
  - `subdomain` (optional, nullable)
  - `created_at` (timestamp)
  - `updated_at` (timestamp)
- Insert into `users`:
  - `id` (UUID, primary key)
  - `tenant_id` (FK to tenants.id)
  - `email` (unique within tenant)
  - `name` (from form)
  - `password_hash` (bcrypt hash)
  - `email_verified` = false
  - `created_at`, `updated_at`
- Insert into `sessions` (after verification):
  - `id` (UUID, primary key)
  - `user_id` (FK to users.id)
  - `refresh_token_hash` (bcrypt hash of refresh token)
  - `expires_at` (7 days from now)
  - `created_at`

**Tenant Isolation**: N/A (tenant creation flow). After tenant is created, all subsequent operations use `tenant_id` from session.

**Notifications**:
- **Email**: Welcome email with verification link (template: `welcome_verify`)
- **Email**: Verification success email (template: `email_verified`)

**Exceptions**:
- **Email already exists globally**: Return `409 Conflict`, suggest password reset
- **Invalid email format**: Return `400 Bad Request`
- **Weak password**: Return `400 Bad Request`, enforce password policy
- **Verification token expired**: Return `401 Unauthorized`, allow resend verification email
- **Token already used**: Return `400 Bad Request`, user already verified

**Manual Intervention**: None (fully automated)

---

### Flow 2: User Invitation (Existing Tenant)

**Trigger**: Admin invites team member via UI

**Flow Diagram**:
```
Admin submits invitation form (email, role)
    ↓
Extract tenant_id from authenticated session (JWT)
    ↓
Validate email not already in tenant
    ↓
Generate invitation token (UUID, expires in 7 days)
    ↓
Create user record:
    - tenant_id (from session)
    - email (from form)
    - email_verified = false
    - status = 'invited'
    - invitation_token_hash (bcrypt hash)
    - invitation_expires_at (7 days from now)
    ↓
Assign role to user (admin/member/viewer)
    ↓
Send invitation email with signup link (template: team_invitation)
    ↓
Return 201 Created to admin
    ↓
[Invited user clicks link]
    ↓
Validate token & show signup form (pre-filled email)
    ↓
User sets password
    ↓
Validate password strength
    ↓
Activate user:
    - password_hash = bcrypt hash of password
    - email_verified = true
    - status = 'active'
    - Clear invitation token
    ↓
Create session (JWT + refresh token)
    ↓
Redirect to dashboard
```

**API Endpoints**:
- `POST /v1/tenants/{tenantId}/users/invite` (admin only)
  - `tenantId` from URL path (validated against session tenant_id)
  - Request body: `{ email: string, role: string }`
  - Response: `201 Created`
- `GET /v1/auth/accept-invitation?token={token}` - Show signup form
  - Response: `200 OK` with pre-filled email
- `POST /v1/auth/accept-invitation` - Complete signup with password
  - Request body: `{ token: string, password: string }`
  - Response: `200 OK` with session tokens

**Database Changes**:
- Insert into `users`:
  - `tenant_id` (from session, FK to tenants.id)
  - `email` (unique within tenant)
  - `email_verified` = false
  - `status` = 'invited'
  - `invitation_token_hash` (bcrypt hash)
  - `invitation_expires_at` (timestamp)
- Insert into `user_roles` (if roles table exists):
  - `user_id` (FK to users.id)
  - `role` (admin/member/viewer)
- Update `users` (on acceptance):
  - `password_hash` (bcrypt hash)
  - `email_verified` = true
  - `status` = 'active'
  - `invitation_token_hash` = null
  - `invitation_expires_at` = null

**Tenant Isolation**: `tenant_id` extracted from authenticated session (admin's JWT). Invited user's `tenant_id` set from invitation context, not from request.

**Notifications**:
- **Email**: Invitation email to new user (template: `team_invitation`)
- **Email**: Admin notification when invitation accepted (template: `invitation_accepted`)

**Exceptions**:
- **Email already in tenant**: Return `409 Conflict`, suggest different email
- **Invitation token expired**: Return `401 Unauthorized`, admin must resend invitation
- **Invalid role**: Return `400 Bad Request`, role must be valid (admin/member/viewer)
- **User not admin**: Return `403 Forbidden` (only admins can invite)

**Manual Intervention**: None (admin-initiated, automated)

---

### Flow 3: User Login

**Trigger**: User submits login form

**Flow Diagram**:
```
User submits email + password
    ↓
Extract tenant_id from request: NONE (login identifies tenant)
    ↓
Find user by email (global search, not tenant-scoped)
    ↓
Verify password hash (bcrypt compare)
    ↓
Check user status (active, not suspended)
    ↓
Check email_verified = true
    ↓
Extract tenant_id from user.tenant_id
    ↓
Generate JWT access token:
    - Claims: { user_id, tenant_id, roles, exp: 15min }
    - Signed with JWT secret
    ↓
Generate refresh token (UUID, 7 day expiry)
    ↓
Create/update session record:
    - user_id (from user)
    - refresh_token_hash (bcrypt hash)
    - expires_at (7 days from now)
    - last_used_at (now)
    ↓
Return tokens + user info:
    {
        access_token: "...",
        refresh_token: "...", (only shown once)
        user: { id, email, name, tenant_id, roles }
    }
    ↓
[Front-end stores tokens]
    ↓
[Subsequent requests include: Authorization: Bearer <access_token>]
    ↓
Backend extracts tenant_id from JWT claims (never from request)
```

**API Endpoints**:
- `POST /v1/auth/login` - Authenticate and get tokens
  - Request body: `{ email: string, password: string }`
  - Response: `200 OK` with tokens and user info
- `POST /v1/auth/refresh` - Refresh access token using refresh token
  - Request body: `{ refresh_token: string }`
  - Response: `200 OK` with new access token

**Database Changes**:
- Upsert `sessions`:
  - `user_id` (FK to users.id)
  - `refresh_token_hash` (bcrypt hash of refresh token)
  - `expires_at` (7 days from now)
  - `last_used_at` (timestamp, updated on each refresh)

**Tenant Isolation**: After login, `tenant_id` is embedded in JWT claims. All subsequent API calls extract `tenant_id` from JWT, never from request body or query parameters.

**Notifications**:
- **Email**: Login from new device/IP (template: `login_new_device`) - optional security feature

**Exceptions**:
- **Invalid email/password**: Return `401 Unauthorized` (generic message, don't reveal if email exists)
- **User not verified**: Return `403 Forbidden`, resend verification email
- **User suspended**: Return `403 Forbidden`, contact admin
- **Too many failed attempts**: Rate limit, temporary lockout (15 min), return `429 Too Many Requests`

**Manual Intervention**: None

---

### Flow 4: Password Reset

**Trigger**: User clicks "Forgot Password"

**Flow Diagram**:
```
User submits email
    ↓
Extract tenant_id from request: NONE (email identifies user/tenant)
    ↓
Find user by email (global search)
    ↓
Generate reset token (UUID, expires in 1 hour)
    ↓
Store token hash in user record:
    - password_reset_token_hash (bcrypt hash)
    - password_reset_expires_at (1 hour from now)
    ↓
Send password reset email (template: password_reset)
    ↓
Return 200 OK (don't reveal if email exists)
    ↓
[User clicks reset link]
    ↓
Validate token & show reset form
    ↓
User submits new password
    ↓
Validate password strength
    ↓
Hash new password (bcrypt)
    ↓
Update user.password_hash
    ↓
Clear password_reset_token_hash
    ↓
Invalidate all existing sessions (delete all sessions for user)
    ↓
Send confirmation email (template: password_reset_success)
    ↓
Redirect to login
```

**API Endpoints**:
- `POST /v1/auth/forgot-password` - Request reset
  - Request body: `{ email: string }`
  - Response: `200 OK` (always, don't reveal if email exists)
- `GET /v1/auth/reset-password?token={token}` - Validate token
  - Response: `200 OK` with email (if valid) or `401 Unauthorized` (if expired)
- `POST /v1/auth/reset-password` - Set new password
  - Request body: `{ token: string, password: string }`
  - Response: `200 OK` or `400 Bad Request` (if token invalid/expired)

**Database Changes**:
- Update `users`:
  - `password_reset_token_hash` (bcrypt hash of token)
  - `password_reset_expires_at` (1 hour from now)
- Update `users` (on reset):
  - `password_hash` (new bcrypt hash)
  - `password_reset_token_hash` = null
  - `password_reset_expires_at` = null
- Delete all `sessions` for user (force re-login)

**Tenant Isolation**: N/A (password reset flow). After reset, user must login (Flow 3) which establishes tenant context.

**Notifications**:
- **Email**: Password reset link (template: `password_reset`)
- **Email**: Password reset confirmation (template: `password_reset_success`)

**Exceptions**:
- **Token expired**: Return `401 Unauthorized`, request new reset
- **Token already used**: Return `400 Bad Request`
- **Weak password**: Return `400 Bad Request`, enforce password policy

**Manual Intervention**: None

---

### Flow 5: API Key Creation

**Trigger**: User creates API key for programmatic access

**Flow Diagram**:
```
User submits API key form (name, permissions, expires_at)
    ↓
Extract tenant_id from authenticated session (JWT)
    ↓
Extract user_id from authenticated session (JWT)
    ↓
Validate permissions array (must be valid permission strings)
    ↓
Generate API key (random string, 32 chars, base64-encoded)
    ↓
Hash key (bcrypt hash, store hash, not plaintext)
    ↓
Insert into api_keys table:
    - tenant_id (from session)
    - key_hash (bcrypt hash)
    - name (from form)
    - permissions (JSON array)
    - expires_at (from form, nullable)
    - created_by (user_id from session)
    ↓
Return plaintext key ONCE (show in UI, never again):
    {
        id: "...",
        key: "wrk_...", (only shown once)
        name: "...",
        expires_at: "..."
    }
    ↓
User copies key
    ↓
[Subsequent requests use: Authorization: Bearer <api_key>]
    ↓
Backend validates key:
    - Lookup by key_hash (bcrypt compare)
    - Extract tenant_id from api_keys.tenant_id (not from request)
    - Check permissions match requested operation
    - Check expiration
    - Update last_used_at
```

**API Endpoints**:
- `POST /v1/api-keys` - Create API key
  - Request body: `{ name: string, permissions: string[], expires_at?: string }`
  - Response: `201 Created` with plaintext key (only shown once)
- `GET /v1/api-keys` - List user's API keys (masked)
  - Response: `200 OK` with list (keys masked as `wrk_***`)
- `DELETE /v1/api-keys/{keyId}` - Revoke API key
  - Response: `204 No Content`

**Database Changes**:
- Insert into `api_keys`:
  - `id` (UUID, primary key)
  - `tenant_id` (from session, FK to tenants.id)
  - `key_hash` (bcrypt hash, not plaintext)
  - `name` (from form)
  - `permissions` (JSONB array of permission strings)
  - `expires_at` (nullable timestamp)
  - `created_by` (user_id from session, FK to users.id)
  - `created_at`, `updated_at`

**Tenant Isolation**: `tenant_id` extracted from authenticated session (user's JWT). API key is scoped to that tenant. When API key is used, `tenant_id` is extracted from `api_keys.tenant_id`, never from request.

**Notifications**:
- **Email**: API key created notification (template: `api_key_created`) - security alert
- **Email**: API key revoked notification (template: `api_key_revoked`)

**Exceptions**:
- **Invalid permissions**: Return `400 Bad Request`
- **Key expired**: Return `401 Unauthorized` on API requests
- **Key revoked**: Return `401 Unauthorized` on API requests
- **Insufficient permissions**: Return `403 Forbidden` on API requests

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
    Set active_tenant_id in JWT claims
    Redirect to that workspace
    ↓
If multiple tenants:
    Show workspace picker UI
    ↓
User selects tenant
    ↓
Validate user is member of selected tenant
    ↓
Generate new JWT with selected tenant_id:
    - Claims: { user_id, tenant_id: <selected>, roles: <for selected tenant> }
    ↓
Update session (or stateless if JWT-only)
    ↓
All subsequent API calls:
    - Extract tenant_id from JWT claims (never from request body/query)
    - Filter all queries by tenant_id from JWT
    - Enforce tenant isolation at service layer
    ↓
Redirect to selected workspace
```

**API Endpoints**:
- `GET /v1/auth/tenants` - List user's tenant memberships
  - Response: `200 OK` with `{ tenants: [{ id, name, subdomain }] }`
- `POST /v1/auth/switch-tenant` - Switch active tenant (updates JWT)
  - Request body: `{ tenant_id: string }`
  - Response: `200 OK` with new JWT access token

**Database Changes**:
- Update `sessions` (if using session table):
  - `active_tenant_id` (or store in JWT claims, stateless)
- No database changes if using stateless JWT (tenant_id in claims)

**Tenant Isolation**: **Critical**: `tenant_id` always comes from JWT claims after switch, never from request body or query parameters. All service layer methods receive `tenantId` from session context.

**Notifications**: None

**Exceptions**:
- **User not member of requested tenant**: Return `403 Forbidden`
- **Invalid tenant_id in request**: Return `400 Bad Request` (should never happen if using session)
- **Tenant not found**: Return `404 Not Found`

**Manual Intervention**: None

**Security Note**: This flow is essential for correct multi-tenant isolation. The backend architecture rule must be strictly enforced: `tenant_id` always comes from the authenticated session (JWT or API key), never from request bodies or query parameters. All service layer methods must take `tenantId` from the session context.

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
    Validates key hash (bcrypt compare)
    Resolves tenant_id + permissions from api_keys table
    Applies rate limiting (per tenant, per API key)
    ↓
Backend receives request:
    Extract tenant_id from API key context (api_keys.tenant_id)
    NOT from request body/query parameters
    ↓
Filter all queries by tenant_id from API key
    ↓
Check permissions match requested operation
    ↓
Execute operation (read-only for public endpoints)
    ↓
Return response (tenant-scoped data only)
```

**API Endpoints**:
- `GET /v1/public/automations` - List automations (read-only, filtered by API key's tenant)
- `GET /v1/public/automation-versions/{id}` - Get automation version details
- `GET /v1/public/automation-versions/{id}/runs` - Get run history
- All `/v1/public/*` endpoints require API key authentication

**Database Changes**: None (read-only operations)

**Tenant Isolation**: `tenant_id` extracted from `api_keys.tenant_id` after key validation, never from request body or query parameters. All queries filtered by this `tenant_id`.

**Notifications**: None

**Exceptions**:
- **Invalid API key**: Return `401 Unauthorized`
- **Key expired**: Return `401 Unauthorized`
- **Key revoked**: Return `401 Unauthorized`
- **Insufficient permissions**: Return `403 Forbidden`
- **Rate limit exceeded**: Return `429 Too Many Requests`

**Manual Intervention**: None

**Security Note**: "Public" means "for programmatic/partner use", not anonymous access. All `/v1/public/*` endpoints require valid API key authentication. Rate limiting is enforced per tenant and per API key.

---

## Automation Lifecycle Flows

### Automation Status State Machine

**Valid Statuses** for `automation_versions.status`:
- `'Intake in Progress'` - Requirements being captured
- `'Needs Pricing'` - Blueprint complete, pricing needed
- `'Awaiting Client Approval'` - Quote sent, waiting for client sign-off
- `'Build in Progress'` - WRK team building automation
- `'QA & Testing'` - Automation tested in staging
- `'Ready to Launch'` - Approved for production deployment
- `'Live'` - Running in production
- `'Archived'` - Superseded by newer version or cancelled
- `'Blocked'` - Paused due to issues (always requires `blocked_reason`)

**Allowed Status Transitions** (state machine):
- `'Intake in Progress'` → `'Needs Pricing'`
- `'Needs Pricing'` → `'Awaiting Client Approval'`
- `'Awaiting Client Approval'` → `'Build in Progress'`
- `'Build in Progress'` → `'QA & Testing'`
- `'QA & Testing'` → `'Ready to Launch'`
- `'Ready to Launch'` → `'Live'`
- Any status → `'Blocked'` (with `blocked_reason` required)
- `'Live'` → `'Archived'`
- `'Blocked'` → Previous status (when unblocked, if valid transition)

**Invalid Transitions**: Any transition not listed above must be rejected with HTTP `400 Bad Request` and error code `INVALID_STATUS_TRANSITION`.

**Prerequisites for Specific Transitions**:
- `'Needs Pricing'` → `'Awaiting Client Approval'`: Requires at least one quote with `status='sent'`
- `'Awaiting Client Approval'` → `'Build in Progress'`: Requires a quote with `status='signed'` (and optionally payment confirmed)
- `'Ready to Launch'` → `'Live'`: Requires `workflow_binding.status='active'` or successful WRK Platform activation

---

### Flow 8: Create New Automation

**Trigger**: User clicks "New Automation" button

**Flow Diagram**:
```
User submits automation form (name, description, department)
    ↓
Extract tenant_id from authenticated session (JWT)
    ↓
Extract user_id from authenticated session (JWT)
    ↓
Validate name uniqueness in tenant
    ↓
Create automation record:
    - tenant_id (from session)
    - name (from form)
    - description (from form, nullable)
    - department (from form, nullable)
    - owner_id (user_id from session)
    ↓
Create initial automation_version:
    - tenant_id (from session)
    - automation_id (FK to automations.id)
    - version = 'v1.0'
    - status = 'Intake in Progress'
    - blueprint_json = {} (empty JSON object)
    - intake_progress = 0
    ↓
Send notifications
    ↓
Return 201 Created with automation + version
    ↓
Redirect to automation detail page
```

**API Endpoints**:
- `POST /v1/automations` - Create automation + initial version
  - Request body: `{ name: string, description?: string, department?: string }`
  - Response: `201 Created` with `{ automation: {...}, version: {...} }`
- `GET /v1/automations/{id}` - Get automation details
  - Response: `200 OK` with automation and versions

**Database Changes**:
- Insert into `automations`:
  - `id` (UUID, primary key)
  - `tenant_id` (from session, FK to tenants.id)
  - `name` (from form, unique within tenant)
  - `description` (from form, nullable)
  - `department` (from form, nullable)
  - `owner_id` (user_id from session, FK to users.id)
  - `created_at`, `updated_at`
- Insert into `automation_versions`:
  - `id` (UUID, primary key)
  - `tenant_id` (from session, FK to tenants.id)
  - `automation_id` (FK to automations.id)
  - `version` = 'v1.0' (semver string)
  - `status` = 'Intake in Progress'
  - `blueprint_json` = {} (empty JSONB object)
  - `intake_progress` = 0 (integer, 0-100)
  - `created_at`, `updated_at`

**Tenant Isolation**: `tenant_id` extracted from authenticated session (JWT). All database inserts include `tenant_id` from session.

**Note**: The ops-facing `projects` record will be created later when moving from "Intake in Progress" to "Needs Pricing" (see Flow 11). Build checklist tasks are also created at that time, not during automation creation.

**Notifications**:
- **Email**: Automation created (to owner, template: `automation_created`)
- **In-app**: Notification to owner

**Exceptions**:
- **Duplicate name in tenant**: Return `409 Conflict`, suggest different name
- **Invalid department**: Return `400 Bad Request`
- **Missing required fields**: Return `400 Bad Request`

**Manual Intervention**: None (automated)

---

[Continuing with remaining flows... Due to length, I'll provide the improved document structure and key improvements summary]


# WRK Copilot User Flows

This directory contains detailed documentation for all user flows in WRK Copilot. Each flow is documented in its own file for better readability and maintainability.

## Overview

WRK Copilot flows are organized into the following categories:

1. **Identity & Access Flows** - Authentication, workspace creation, invitations, and access management
2. **Automation Lifecycle Flows** - Creating, managing, and updating automations
3. **Pricing & Billing Flows** - Quote generation, approval, and billing management
4. **Build & Deployment Flows** - Building, testing, and deploying automations
5. **Execution & Monitoring Flows** - Runtime execution, monitoring, and alerts
6. **Collaboration Flows** - Messaging, tasks, and team collaboration
7. **Admin & Ops Flows** - Administrative and operational management

## Workspace & Tenant Model

**Terminology Standardization**:
- **Workspace** = Product UX term (user-facing)
- **Tenant** = Backend/DB term (database entity)
- **They are the same logical thing**: workspace ⇔ tenant

**Workspace vs Tenant**:
- In the product UI we use the term **Workspace**. Internally and in the database, this is a **Tenant**.
- One workspace = one tenant (1:1).
- `tenants` table stores workspaces.
- `tenant_id` is the canonical backend identifier.
- UI copy should say "Workspace", backend code/specs may say "tenant" where appropriate.
- **Important**: No extra abstraction layer beyond that. Don't introduce separate workspace tables, IDs, or complex many-to-many models.

**Mapping**:
- `workspace` ⇔ `tenant`
- `workspace_id` ⇔ `tenant_id`
- `workspace_slug` ⇔ `tenants.subdomain`
- `workspace_name` ⇔ `tenants.name`

**Rules**:
- **Backend/DB**: Always use `tenant_id`, `tenants` table, `tenant` in code
- **User-facing/UX**: Always use "Workspace", "workspace", "workspace URL" in UI, docs, and product copy
- **Architecture docs**: Can say "Workspace (tenant) – we use 'workspace' in the UI, 'tenant' in code/DB"

## Authentication Modes

WRK Copilot supports **two authentication modes**:

| Mode | Who Uses It | Friction Level | Email Verification | Password |
|------|-------------|----------------|-------------------|----------|
| **SSO/IdP** | Enterprise customers (primary) | Minimal | No (trusted from IdP) | No (handled by IdP) |
| **Local** | Fallback only | Medium | Configurable (default: ON) | Yes (WRK-managed) |

**Mode A: SSO / IdP (Preferred Default)**
- Authentication handled by external IdP: Auth0, Okta, Google Workspace, Microsoft Azure AD, etc.
- Signup, login, password reset occur at the IdP
- WRK trusts email and email verification from IdP
- Backend auto-provisions workspace/tenant + first user on first successful SSO login
- **No WRK-side email verification** for SSO users
- **No WRK-side password reset** for SSO users
- Users immediately active after first SSO login
- Session: JWT tokens with `tenant_id`, `user_id`, `roles`

**Mode B: Local Email/Password (Fallback)**
- Used when SSO not configured or explicitly selected
- Email/password auth in WRK backend
- Email verification: **configurable** (ON by default, can be disabled per environment/workspace)
- Password reset handled by WRK backend
- Session: JWT tokens with `tenant_id`, `user_id`, `roles`

**Security Contract**: `tenant_id` and `user_id` always come from authenticated session (JWT or API key), never from request bodies or query parameters.

**Audit Logging**:
- Any user-initiated change to system state (creating/updating/deleting automations, versions, quotes, projects, credentials, status changes, etc.) must create a corresponding row in the `audit_logs` table, even if not explicitly called out in each flow.
- System-initiated changes (workers, webhooks) should also log critical events.

---

## Flows by Category

### Identity & Access Flows

User authentication, workspace creation, invitations, and access management.

- [Flow 1A: SSO Signup (New Workspace)](flow-1-a-sso-signup-new-workspace.md)
- [Flow 1B: Local Email/Password Signup (New Workspace)](flow-1-b-local-emailpassword-signup-new-workspace.md)
- [Flow 2: User Invitation (Workspace-Scoped)](flow-2-user-invitation-workspace-scoped.md)
- [Flow 3: User Login](flow-3-user-login.md)
- [Flow 4: Password Reset](flow-4-password-reset.md)
- [Flow 5: API Key Creation](flow-5-api-key-creation.md)
- [Flow 6: Workspace Switching (Multi-Workspace User)](flow-6-workspace-switching-multi-workspace-user.md)
- [Flow 7 (Optional / Future): Partner API Access (Public Endpoints)](flow-7-partner-api-access-public-endpoints.md)

### Automation Lifecycle Flows

Creating automations, capturing requirements, updating blueprints, managing versions, and status transitions.

- [Flow 8: Create New Automation](flow-8-create-new-automation.md)
- [Flow 9: Requirements Capture & AI Ingestion](flow-9-requirements-capture-ai-ingestion.md)
- [Flow 10: Update Blueprint](flow-10-update-blueprint.md)
- [Flow 11: Move Automation to "Needs Pricing" (+ Project Creation + Auto Quote)](flow-11-move-automation-to-needs-pricing-project-creation-auto-quote.md)
- [Flow 12: Create New Version](flow-12-create-new-version.md)
- [Flow 13: Update Automation Status](flow-13-update-automation-status.md)

### Pricing & Billing Flows

Quote generation, approval, payment, volume adjustments, and billing management.

**Global Note**: The system only generates and sends quotes in response to a client-initiated automation (new automation or new version). Ops cannot send unsolicited quotes without a corresponding project / automation version. Quotes are created automatically when a new automation / new version becomes a project. Ops can tweak them, but they don't start by "sending" a quote out of nowhere.

- [Flow 14: Ops Adjust Quote (Override Pricing)](flow-14-ops-adjust-quote-override-pricing.md)
- [Flow 15: Client Views and Accepts Quote](flow-15-client-views-and-accepts-quote.md)
- [Flow 16: Client Signs Quote](flow-16-client-signs-quote.md)
- [Flow 17: Adjust Committed Volume / Plan Upgrade](flow-17-adjust-committed-volume-plan-upgrade.md)
- [Flow 18: Client Rejects Quote](flow-18-client-rejects-quote.md)
- [Flow 19: Pricing Override (Admin)](flow-19-pricing-override-admin.md)
- [Flow 20: Billing Period Finalization](flow-20-billing-period-finalization.md)

### Build & Deployment Flows

Building automations, QA testing, deployment, and workflow management.

- [Flow 21: Request Build](flow-21-request-build.md)
- [Flow 22: Build Orchestration (Worker)](flow-22-build-orchestration-worker.md) - *Note: Future capability, not in v1*
- [Flow 23: QA Testing & Approval](flow-23-qa-testing-approval.md)
- [Flow 24: Deploy to Production](flow-24-deploy-to-production.md)
- [Flow 24A: Pause Workflow](flow-24-a-pause-workflow.md)
- [Flow 24B: Resume Workflow](flow-24-b-resume-workflow.md)

### Execution & Monitoring Flows

Runtime execution, credential management, webhooks, usage tracking, and alerts.

- [Flow 25: Provide / Update Integration Credentials](flow-25-provide-update-integration-credentials.md)
- [Flow 26: Credential Failure → Blocked Automation](flow-26-credential-failure-blocked-automation.md)
- [Flow 27: Run Event Webhook (WRK Platform → WRK Copilot)](flow-27-run-event-webhook-wrk-platform-wrk-copilot.md)
- [Flow 28: Usage Aggregation](flow-28-usage-aggregation.md)
- [Flow 29: Threshold Alert](flow-29-threshold-alert.md)

### Collaboration Flows

Team messaging, task management, and collaboration features.

- [Flow 30: Send Message](flow-30-send-message.md)
- [Flow 31: Create Task (System Auto-Generated)](flow-31-create-task-system-auto-generated.md)
- [Flow 32: Update Task Status](flow-32-update-task-status.md)

### Admin & Ops Flows

Administrative and operational management flows.

- [Flow 33: Create Client (Ops)](flow-33-create-client-ops.md)
- [Flow 34: Update Client Health Status](flow-34-update-client-health-status.md)
- [Flow 35: Archive Automation](flow-35-archive-automation.md)

---

## Summary

This documentation covers all major user flows in WRK Copilot, including:

- **Identity & Access**: SSO-first signup with workspace creation, invitation, login, password reset (local only), API keys, workspace switching, partner API access (optional/future)
- **Automation Lifecycle**: Create, requirements capture & AI ingestion, update blueprint, move to pricing (with auto-quote), create version, update status (with state machine including Paused state), pause/resume workflows
- **Pricing & Billing**: Auto-generate and send quote (Flow 11), ops adjust quote, client view/accept/reject, sign (with payment), volume adjustments (with credit/payment checks), overrides, billing finalization
- **Build & Deployment**: Request build, orchestration (future/v1 manual), QA (manual status changes in v1), deploy to production (manual status changes in v1), credentials management, credential failure handling
- **Execution & Monitoring**: Run event webhooks, usage aggregation, threshold alerts
- **Collaboration**: Messages (chat-like, real-time), tasks (auto-generated by system), task status updates
- **Admin & Ops**: Associate client with existing workspace (users create own accounts), update health status, archive automation

**Key Architectural Alignments**:
- **Workspace-Centric UX**: Users authenticate first, then create workspace (name + subdomain) if they don't belong to any workspace. Workspace = Tenant (1:1 mapping, no extra abstraction). Access via `https://{workspace_slug}.wrk.com/app`. Terminology: "Workspace" in UX, "tenant" in backend/DB. The first user who creates a workspace is that workspace's admin/owner. Invited users join that same workspace/tenant, they don't create new workspaces/clients.
- **SSO-First Authentication**: SSO/IdP is primary mode with minimal friction (no email verification, no password setup). If user already mapped to workspace, skip workspace creation. Local email/password is fallback with configurable verification.
- **Workspace-Scoped Invitations**: Admins invite colleagues into their current workspace. Invited users land directly in the inviting workspace.
- **Multi-Workspace Support**: Users can belong to multiple workspaces via memberships table. Workspace switcher in UX, multi-tenant logic in backend.
- **State Machine**: Automation status transitions follow strict state machine rules. Includes 'Paused' status (client-driven) vs 'Blocked' (system/ops-driven). Supports backward transitions from QA & Testing.
- **Auto-Pricing**: In v1, pricing is auto-generated and immediately sent to the client when a project is created (Flow 11). Ops can adjust existing quotes but don't originate them.
- **Project Creation Timing**: Projects created when moving from "Intake in Progress" to "Needs Pricing", not during automation creation
- **Task Creation Timing**: Build checklist tasks created when build starts or when project created for pricing, not during automation creation. Tasks are auto-generated by the system based on missing items/validation rules.
- **Manual Status Changes (v1)**: In v1, status changes for QA & Testing → Ready to Launch and Ready to Launch → Live are performed manually by ops team in admin panel, not automatic.
- **User Account Creation**: Users create their own accounts/workspaces via signup flow. Ops does not create client accounts/workspaces; ops can only associate existing workspaces with client records.
- **Audit Logging**: All user-initiated changes to system state must create audit log entries, even if not explicitly called out in each flow.
- **Tenant Isolation**: All flows enforce `tenant_id` from authenticated session (JWT or API key), never from request parameters
- **Payment Integration**: Quote signing includes payment method collection and setup fee charging. Volume adjustments check credit/payment before applying changes.
- **Credentials Security**: Credentials stored in secrets manager, only references in database

**Flow Structure**: Each flow includes Trigger, Flow Diagram, API Endpoints, Database Changes, Tenant Isolation (where relevant), Notifications, Exceptions, and Manual Intervention points.

These flows serve as the foundation for backend API design and implementation, aligned with the WRK Copilot Backend Architecture (modular monolith, Neon, workers, webhooks, HMAC, idempotency).

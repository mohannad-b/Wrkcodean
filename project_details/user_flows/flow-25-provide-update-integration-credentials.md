### Flow 25: Provide / Update Integration Credentials

**Trigger**: Client needs to connect systems (e.g., HubSpot, Salesforce, Gmail, Xero) for an automation

---

### Access & Auth

- **Auth**: JWT session only (Copilot UI / admin console). Customer API keys (`wrk_api_…`) MAY read masked credential summaries but MUST NOT create, update, or delete credentials.
- **Authorization**:
  - Only users with appropriate roles `{project_owner, project_admin, tenant_admin, ops_build, ops_qa, ops_billing, admin}` may manage credentials.
  - Automation-scoped operations require membership on that project.
- **Tenant isolation**:
  - `tenant_id` is derived from auth context or the admin panel tenant selection—never from request payload/query.
  - All reads/writes to `credentials`, linking tables, automation_versions, projects, tasks MUST be scoped by `(tenant_id, …)`.
  - AuthN/AuthZ MUST complete before revealing whether a credential exists or whether an OAuth connection is valid.

---

### Flow Diagram (textual)
```
User opens “Connections/Credentials” UI for an automation or tenant
    ↓
User selects system to connect and chooses auth method
    ↓
Option A – OAuth (PKCE + state):
    - Backend generates state + code_verifier (expires in 10 min, single-use)
    - Persist {state, code_verifier, tenant_id, user_id, provider, scope, redirect_context}
    - Redirect user to provider auth endpoint with response_type=code, PKCE challenge, minimal scope
    - Provider redirects back to /v1/credentials/oauth/{provider}/callback
        * Backend validates state, tenant/user context, expiry → invalidates state
        * Backend exchanges authorization_code for tokens (server-to-server, using code_verifier + client_secret)
        * Validate ID token (if provided): signature, iss, aud, exp, nonce
        * Store refresh_token / long-lived secret in secrets manager only; never expose to UI
        * Rotate previously stored refresh tokens for same (tenant_id, provider, external_account_id)
    ↓
Option B – API key / service account entry:
    - User enters key/secret or uploads service account JSON
    - Backend validates format (client + server), stores secret in secrets manager, and retains only a reference
    ↓
Create or update tenant-scoped credential record (no secrets in DB)
    ↓
Insert/update linking table entry for the automation_version (or mark as tenant-level credential)
    ↓
Optionally perform live validation call to provider (/me, list accounts, etc.)
    - Mark credential status = 'active' if successful, 'invalid' otherwise (surface domain error)
    ↓
Update related checklist tasks (structured filter on system_key/kind) and recompute project.checklist_progress
    ↓
If automation was Blocked due to credential issues:
    - Update credentials_state/integration_state flags
    - Invoke `request_unblock_for_credentials(tenant_id, automation_version_id, actor_context)` (Flow 13 lifecycle helper) which owns Blocked → healthy transitions with the standard concurrency/idempotency rules
    ↓
Create audit log entry (no secrets)
    ↓
Send notifications
    ↓
Return success
```

**API Endpoints**:
- `POST /v1/automation-versions/{id}/credentials` – Create/update credential references for a specific automation.
  - Body: `{ credential_id? , provider, credential_type, automation_scope?, connection_params }`.
  - Behavior: validates role/tenant, writes secrets to secrets manager, upserts credential + linking row, optional live validation call, updates checklist tasks, emits audit log.
- `GET /v1/automation-versions/{id}/credentials` – List credentials (masked) linked to the automation.
  - Response includes only: `credential_id`, `system_name`, `credential_type`, `status`, `last_used_at`, `last_validated_at`, `external_account_label`.
  - No secret material is returned; indicates configured/not configured.
  - Results filtered by `(tenant_id, automation_version_id)` via linking table.
- `POST /v1/credentials/oauth/{provider}` – Initiate OAuth (PKCE) flow; returns redirect info (state, auth URL).
- `GET /v1/credentials/oauth/{provider}/callback` – OAuth callback; processes code, exchanges tokens server-side, rotates refresh tokens, persists references.

**Database Changes**:
- **Secrets**: Always stored in the secrets manager (Vault, AWS SM, etc.) under `secret_store_ref`. Copilot DB only stores references and metadata.
- **`credentials` table (tenant-scoped)**:
  - Columns: `credential_id`, `tenant_id`, `provider`, `system_name`, `credential_type`, `secret_store_ref`, `external_account_id`, `status`, `stored_at`, `last_validated_at`, `last_used_at`.
  - No `automation_version_id` column for shared credentials.
- **Linking table (`automation_version_credentials`)**:
  - `(tenant_id, automation_version_id, credential_id, role/use_case, created_at, updated_at)`.
  - Supports many-to-many relationships and enforces tenant isolation.
- **`tasks`**:
  - Update tasks with `{tenant_id, project_id, automation_version_id, kind='build_checklist', system_key=provider}` to `status='complete'` and recompute checklist_progress.
- **Lifecycle**:
  - Flow 25 NEVER updates `automation_versions.status` directly. To unblock, it calls a shared lifecycle helper (Flow 13) which performs Blocked → healthy transitions with standard concurrency/idempotency checks.
- **`audit_logs`**:
  - Insert `{ action_type='manage_credentials', resource_type='credential', resource_id=credential_id, tenant_id, user_id, metadata_json={ system_name, credential_type, automation_version_id?, invoked_via, credential_status } }`.
  - Never store secret values or token fragments in metadata.

**Notifications**:
- **Email**: Credentials added notification (template: `credentials_added`, to ops when all required credentials provided)
- **In-app**: Notification to owner

**Exceptions**:
- **OAuth denied/cancelled**: Return 400 domain error `oauth_denied`; user can restart flow.
- **OAuth provider/system error**: Return 502/503 (`oauth_provider_error`), log details (without tokens), retry allowed.
- **Invalid OAuth callback (state/code mismatch/expired)**: Return 401 `oauth_state_invalid`.
- **Invalid API key format**: Return 400 after server-side validation.
- **Credential storage failure / secrets manager error**: Return 500, log, alert ops (no secret content in logs).
- **Credential not found / unauthorized**: 404 `credential_not_found` or 403 `forbidden`.
- **Missing required credentials**: 400 domain error listing missing systems (used for automation readiness checks).
- **Live validation failed**: Return 422 `credential_invalid` with masked reason; status remains `'invalid'`.

**Manual Intervention**: 
- Ops team may manually verify credentials
- Ops team approves unblocking from Blocked state (if configured)

**Security & Storage**:
- Secrets are stored only in the secrets manager, encrypted via KMS/HSM. Copilot DB stores `secret_store_ref` and metadata only.
- Backend services with appropriate IAM roles are the only components that can read the secrets manager; UI/public APIs never receive raw secrets after creation.
- Logs (app, error, audit) MUST NOT contain tokens, keys, or service-account JSON. Mask IDs when necessary.
- Audit metadata includes only non-sensitive info (system, credential_id, provider label).

**Run Preconditions**:
- Trigger systems MUST check that all required credentials linked to an automation_version have `status='active'` before enqueueing runs. If missing/invalid, lifecycle helper may set/retain Blocked status until Flow 25 + Flow 13 unblock routine succeeds.

---

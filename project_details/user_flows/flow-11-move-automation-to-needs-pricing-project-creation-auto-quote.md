### Flow 11: Move Automation to "Needs Pricing" (+ Project Creation + Auto Quote)

**Trigger**

System detects that the blueprint is sufficiently complete (e.g., `intake_progress >= threshold`) **OR** a user explicitly clicks **"Ready for Pricing"**.  
Both paths MUST invoke the same backend transition logic; there is only one canonical pricing flow.

---

#### Pre-Pricing Allowed Status Set (canonical)

PRE_PRICING_ALLOWED_STATUSES = ['Intake in Progress']

- This set defines which `automation_versions.status` values are allowed to move into pricing via this flow.
- To extend: add new statuses to this list (e.g., `'Needs Revision'` once product defines it).
- All references to “pre-pricing allowed statuses” or “allowed pre-pricing status” in this flow refer to this set.

---

#### Error Codes (canonical, stable)

All 4xx/5xx responses from this flow MUST use one of these error codes in their payload (no ad-hoc strings):

- `missing_trigger` – Blueprint validation: no trigger node found.
- `blueprint_empty_or_invalid` – Blueprint validation: empty or invalid JSON structure.
- `intake_progress_below_threshold` – Blueprint validation: `intake_progress` below configured threshold.
- `pricing_engine_failed` – Pricing engine failure (internal error or invalid configuration).

Note: `already_priced` is a boolean field in successful 200 OK responses, not an error code.

---

### Flow Diagram

1. System detects intake_progress ≥ threshold OR user/ops clicks "Ready for Pricing"

2. Backend: Resolve tenant_id and authorization  
   - Shared global auth middleware:
     - Validates session/JWT authenticity.
     - Validates active membership in tenant.
     - Validates tenant is active (not deleted/suspended).
     - Applies 401 vs 403 semantics per Global Auth Middleware Rule.
   - API keys are NEVER allowed for this flow:
     - If `Authorization` header starts with `wrk_api_` → return 401 Unauthorized.
   - Additional Flow 11 business rules:
     - Caller MUST be at least one of:
       - Automation owner, OR
       - User with tenant role ≥ `workflows_write`, OR
       - User with explicit `ops_pricing` / `admin` permission (per shared permission matrix).
     - If none apply → 403 Forbidden.

3. Load `automation_versions` + parent `automations` with tenant isolation  
   - Select automation_version:

     - `SELECT automation_versions WHERE id = :automation_version_id AND tenant_id = :tenant_id_from_context`

   - Join to parent automation:

     - `JOIN automations ON automation_versions.automation_id = automations.id`

   - Enforce tenant invariants:

     - `automations.tenant_id = automation_versions.tenant_id = tenant_id_from_context`

   - If no row found → 404 Not Found.

4. Validate current status + version constraints (canonical rules)  
   All of the following MUST be true, otherwise → 409 Conflict:

   - `automation_versions.status` ∈ PRE_PRICING_ALLOWED_STATUSES (currently only `'Intake in Progress'`).
   - `automations.status = 'active'`.
   - This automation_version is the **latest** version for `(automation_id, tenant_id)`:
     - "Latest" is defined as the row with the greatest `version` value for that `(automation_id, tenant_id)`.
     - If `version` column is not present, fallback to the row with the greatest `created_at`.
     - This "latest" definition MUST match the one used in Flow 10.

   If any constraint fails, return 409 Conflict with a clear indication in the error payload of which constraint failed.

5. Validate minimum blueprint requirements (via shared Flow 10 validator)  
   - Implementation MUST call the **same shared blueprint validation + intake_progress scoring utility** used by Flow 10:
     - Same max serialized size: 5 MB.
     - Same `max_nodes`, `max_edges` limits (from central config).
     - Same required trigger/start-node rules.
     - Same graph validity rules (no dangling edges, valid start node, etc.).
   - Requirements:
     - `blueprint_json` MUST be valid, non-empty JSON (no `null`, empty object/array, or invalid JSON).
     - Blueprint MUST include at least one trigger node.
     - Graph MUST be structurally valid (valid start node, no dangling edges, etc.).
     - `intake_progress` (as computed by the shared scoring utility) MUST be ≥ the configurable threshold (e.g., 60%) from central config.
   - If validation fails → 400 Bad Request with canonical error codes:
     - No trigger node → `missing_trigger`.
     - Empty or invalid JSON → `blueprint_empty_or_invalid`.
     - Intake progress below threshold → `intake_progress_below_threshold`.

6. Resolve or create client record (before main transaction)  
   - There is a 1:1 mapping between tenant and client:
     - `clients.tenant_id` MUST be UNIQUE.
   - Attempt to find client:

     - `SELECT clients WHERE tenant_id = :tenant_id LIMIT 1`

   - If no client row exists:
     - Insert new client: `INSERT INTO clients (tenant_id, name, created_at, …)` using tenant metadata (e.g., tenant display name).
   - Set `client_id = existing_or_new_client.id`.

7. Check for idempotent reuse (already priced)  
   - Check if a non-archived project already exists for this automation_version:

     - `SELECT projects
        WHERE tenant_id = :tenant_id
          AND automation_version_id = :automation_version_id
          AND status IN ('Needs Pricing','Awaiting Client Approval','In Delivery','Live')
        LIMIT 1`

   - If such a project exists AND:
     - `automation_versions.status = 'Awaiting Client Approval'`, AND
     - There exists at least one quote with `status = 'sent'` for this `(tenant_id, automation_version_id)`:

       - `SELECT quotes
          WHERE tenant_id = :tenant_id
            AND automation_version_id = :automation_version_id
            AND status = 'sent'
          ORDER BY created_at DESC
          LIMIT 1`

     - Then:
       - Return 200 OK with:
         - `automation_version` object (current row).
         - The existing project.
         - The latest `sent` quote.
         - `already_priced = true`.
       - Do NOT:
         - Re-run the pricing engine.
         - Create a new project.
         - Create a new quote.
         - Update any statuses.
       - This is the canonical idempotent behavior for already-priced versions.

   - If no such "already-priced" project+quote combo exists, proceed with project/quote creation in a transaction.

8. Begin main pricing transaction  
   The following operations MUST occur in a single DB transaction:
   - Insert project (if new).
   - Run pricing engine.
   - Insert quote.
   - Update `projects.pricing_status`.
   - Update `automation_versions.status`.
   - Insert `audit_logs` for `move_to_pricing`, `project_created`, `auto_quote_created`.

   If any step inside this transaction fails (including pricing engine failure), the entire transaction MUST roll back so no partial pricing artifacts remain.

9. Create project (if new) within the transaction  
   - Determine project type:
     - Check whether ANY existing project exists for the same `(automation_id, tenant_id)` with status in `('Needs Pricing','Awaiting Client Approval','In Delivery','Live')`.
     - If none exists → `type = 'new_automation'`.
     - If one or more exist → `type = 'revision'`.
   - If no project was found in the idempotency check:
     - Insert into `projects`:
       - `tenant_id = tenant_id_from_context`
       - `client_id = client_id` (from step 6)
       - `automation_id = automation_versions.automation_id`
       - `automation_version_id = automation_versions.id`
       - `type = 'new_automation'` or `'revision'`
       - `status = 'Needs Pricing'`
       - `pricing_status = 'Not Generated'`
       - `checklist_progress = 0`
       - `created_at = now()`
       - `updated_at = now()`
     - Capture `project_id`.

10. Auto-calculate pricing (quote generation engine)  
    - Invoke shared pricing engine with:
      - `blueprint_json`
      - Estimated volume inputs (from automation metadata or defaults).
      - Tenant/segment pricing config.
    - Engine returns:
      - `setup_fee`
      - `unit_price` (base)
      - `estimated_volume`
      - `effective_unit_price` (after volume discounts)
      - Any discount metadata
      - Optional additional metadata for logging.
    - If pricing engine fails (no valid configuration or internal error):
      - Entire transaction MUST roll back (no project, no quote, no status update persists).
      - Outside the rolled-back transaction, insert an `audit_logs` row with:
        - `action_type = 'pricing_failed'`
        - `resource_type = 'automation_version'`
        - `resource_id = automation_version_id`
        - `tenant_id = tenant_id_from_context`
        - `user_id = current_user_id`
        - `metadata_json` describing the failure (safe details only).
      - Return 500 Internal Server Error (or 503 if this is due to an external dependency) with error code `pricing_engine_failed`.

11. Create quote record (within same transaction)  
    - Insert into `quotes`:
      - `automation_version_id`
      - `tenant_id`
      - `project_id`
      - `status`:
        - `'sent'` if ops-approval flag is **disabled** (default v1 behavior).
        - `'draft'` if ops-approval flag is **enabled**.
      - `setup_fee`
      - `unit_price`
      - `estimated_volume`
      - `effective_unit_price`
      - `currency` (from tenant or central config)
      - `sent_at`:
        - `now()` if `status = 'sent'`
        - `NULL` if `status = 'draft'`
      - `created_at = now()`
      - `created_by_user_id = current_user_id` (or system user id if triggered automatically)
      - `metadata_json = { pricing_inputs, discounts_applied, engine_version, ... }`
    - Capture `quote_id`.

12. Update `projects.pricing_status` (within same transaction)  
    - Update `projects`:

      - `UPDATE projects
         SET pricing_status = 'Sent',
             updated_at = now()
         WHERE id = :project_id
           AND tenant_id = :tenant_id_from_context`

    - If ops-approval flag is enabled:
      - It is acceptable to still mark `pricing_status = 'Sent'` while the quote itself is `status='draft'`, as long as client notifications are gated by the approval flow.
      - If product prefers, a separate `pricing_status` such as `'Pending Approval'` can be added in the future, but that is out of scope for v1.

13. Update `automation_versions.status` (within same transaction)  
    - Update `automation_versions`:

      - `UPDATE automation_versions
         SET status = 'Awaiting Client Approval',
             updated_at = now()
         WHERE id = :automation_version_id
           AND tenant_id = :tenant_id_from_context`

    - This flow does NOT change `automations.status`; the automation lifecycle (e.g., Live/Archived) is managed separately.

14. Optionally create initial pricing-related tasks (within same transaction or immediately after)  
    - Config-driven behavior.
    - Insert into `tasks` (if enabled):
      - `context_type = 'project'`
      - `context_id = project_id`
      - `kind` = `'build_checklist'` or `'general_todo'`
      - `status = 'pending'`
      - `title` examples:
        - `"Review auto-generated pricing"`
        - `"Confirm setup fee for client"`
        - `"Verify assumptions on estimated volume"`

15. Create audit log entries (within same transaction, except `quote_sent`)  
    These `action_type` values are canonical for this flow and MUST NOT be renamed or duplicated:

    - `move_to_pricing` (automation_version as resource):
      - `resource_type = 'automation_version'`
      - `resource_id = automation_version_id`
      - `user_id = current_user_id`
      - `tenant_id = tenant_id_from_context`
      - `metadata_json = { project_id, quote_id }`

    - `project_created` (if a new project was created):
      - `resource_type = 'project'`
      - `resource_id = project_id`
      - `user_id = current_user_id`
      - `tenant_id = tenant_id_from_context`

    - `auto_quote_created`:
      - `resource_type = 'quote'`
      - `resource_id = quote_id`
      - `user_id = current_user_id`
      - `tenant_id = tenant_id_from_context`

    - `quote_sent`:
      - Logged outside the main transaction (after commit), best-effort only.
      - `resource_type = 'quote'`
      - `resource_id = quote_id`
      - `user_id = current_user_id` (or system user if async job)
      - `tenant_id = tenant_id_from_context`

16. Send quote to client (gated by ops-approval flag)  
    - If ops-approval flag is **disabled** (default v1 behavior):
      - Email:
        - Template: `quote_sent`
        - To: primary client contacts (from tenant/client config)
        - Includes: quote summary, link to quote page in app, link to PDF.
      - In-app:
        - Notify client users: `"New quote available for [Automation Name]."`.
    - If ops-approval flag is **enabled**:
      - Do NOT send `quote_sent` email or client in-app notifications from this flow.
      - These notifications MUST be sent only by the separate approval flow (not part of Flow 11).

17. Return success  
    - Always return 200 OK on success. Response structure:

      - `automation_version`: `{ id, status, intake_progress }`
      - `project`: `{ id, status, pricing_status }`
      - `quote`: `{ id, status, setup_fee, unit_price, estimated_volume, effective_unit_price, currency, sent_at }`
      - `already_priced`: boolean
        - `true` ONLY when no new project, quote, or status changes were created/updated by this call (pure reuse of existing project + sent quote).
        - `false` in all other success cases (new quote created and/or project created/updated).

---

### API Endpoints

#### POST /v1/automation-versions/{id}/move-to-pricing

Primary endpoint to move an automation_version into pricing, create (or reuse) a project, auto-generate a quote, and update statuses.

- Auth required:
  - Global auth middleware handles:
    - Session validity, active membership, active tenant checks.
    - 401 vs 403 semantics.
  - MUST be authenticated via user session/JWT (not via API key).
  - If `Authorization` header starts with `wrk_api_` → 401 Unauthorized (API keys are never allowed).

- Authorization required:
  - Caller MUST be:
    - Automation owner, OR
    - User with tenant role ≥ `workflows_write`, OR
    - User with explicit `ops_pricing` / `admin` permission.
  - If not → 403 Forbidden.

- Tenant isolation:
  - Resolve `tenant_id` from authenticated context only.
  - Ignore any `tenant_id` present in request body/query.
  - Look up `automation_versions` by `(id, tenant_id)` and join to `automations`, enforcing matching `tenant_id`.

- Behavior:
  - Client CANNOT influence any of:
    - `tenant_id`, `project_id`, `quote_id`, `status`, `pricing_status`,
    - `setup_fee`, `unit_price`, `estimated_volume`, `effective_unit_price`.
  - These values are derived exclusively on the server.
  - Perform all validations described in the flow diagram:
    - Status constraints.
    - Version constraints.
    - Blueprint validation via shared Flow 10 validator.
  - Enforce idempotency:
    - If project + sent quote already exist and automation_version is already in `'Awaiting Client Approval'`, reuse and return `already_priced = true`.
  - Execute main write operations (project, quote, status, audit_logs) in a single DB transaction.
  - On pricing engine failure, roll back the transaction and return 500/503 with `pricing_engine_failed`.

- Response:
  - 200 OK with:

    {
      automation_version: { id, status, intake_progress },
      project: { id, status, pricing_status },
      quote: { id, status, setup_fee, unit_price, estimated_volume, effective_unit_price, currency, sent_at },
      already_priced: true | false
    }

#### PATCH /v1/automation-versions/{id}/status

Generic status update endpoint.

- This endpoint MUST NOT allow arbitrary status transitions.
- A PATCH is considered a pricing transition if the target status in the payload is `'Needs Pricing'` or `'Awaiting Client Approval'`.
- For such pricing transitions:
  - API keys MUST NOT be accepted:
    - If `Authorization` header starts with `wrk_api_` → 401 Unauthorized.
  - Implementation MUST internally call the same domain-layer function as `POST /v1/automation-versions/{id}/move-to-pricing`.
  - It MUST enforce the same:
    - Permissions.
    - Tenant isolation.
    - Status/version/blueprint validations.
    - Side-effects (project creation, quote creation, audit logging, notifications).
  - It MUST NOT bypass any pricing side-effects or validations.
- If implementation cannot guarantee this equivalence, PATCH-based transitions to `'Needs Pricing'` or `'Awaiting Client Approval'` MUST be disabled (return 400 or 403).

---

### Database Changes

#### Transaction boundaries

- Client resolution (find-or-create client) MUST succeed before entering the main transaction.
- Within the main transaction:
  - Insert into `projects` (if new).
  - Insert into `quotes`.
  - Update `automation_versions.status`.
  - Insert audit logs for `move_to_pricing`, `project_created` (if applicable), and `auto_quote_created`.
- On pricing failure or any internal error:
  - Entire transaction MUST roll back (no project, no quote, no status updates, no in-transaction audit logs).
  - `pricing_failed` audit log is written in a separate transaction after rollback.
- `quote_sent` logging/email is done after commit (best-effort, outside the main transaction).

#### projects

- Insert (for new project, in main transaction):

  - `tenant_id`
  - `client_id`
  - `automation_id`
  - `automation_version_id`
  - `type` ∈ {`'new_automation'`, `'revision'`}
  - `status = 'Needs Pricing'`
  - `pricing_status = 'Not Generated'` initially, then `'Sent'` after quote creation.
  - `checklist_progress = 0`
  - `created_at`, `updated_at`.

- Constraints:
  - Foreign keys:
    - `tenant_id → tenants`
    - `client_id → clients`
    - `automation_id → automations`
    - `automation_version_id → automation_versions`
  - Index:
    - `(tenant_id, automation_version_id, status)`
  - Soft-deletes / archival MUST NOT erase pricing history; historical pricing projects MUST remain queryable.

#### clients

- `clients.tenant_id` MUST be UNIQUE (1:1 mapping with `tenants`).
- If no row exists for the current tenant:
  - Create as part of this flow, before the main transaction.

#### quotes

- Insert (within main transaction):

  - `automation_version_id`
  - `tenant_id`
  - `project_id`
  - `status` ∈ {`'sent'`, `'draft'`}
  - `setup_fee`
  - `unit_price`
  - `estimated_volume`
  - `effective_unit_price`
  - `currency`
  - `sent_at` (nullable)
  - `created_at`
  - `created_by_user_id`
  - `metadata_json` (pricing details, engine version, inputs, discounts, etc.)

- Constraints:
  - Foreign keys:
    - `tenant_id → tenants`
    - `automation_version_id → automation_versions`
    - `project_id → projects`
  - Index:
    - `(tenant_id, automation_version_id, status)`

#### automation_versions

- Update (within main transaction):

  - `status = 'Awaiting Client Approval'`
  - `updated_at = now()`

- WHERE clause MUST include:
  - `id = automation_version_id`
  - `tenant_id = tenant_id_from_context`

#### audit_logs

- Insert entries (canonical `action_type` values):

  - `move_to_pricing` (in main transaction):
    - `resource_type = 'automation_version'`
    - `resource_id = automation_version_id`
    - `user_id = current_user_id`
    - `tenant_id = tenant_id_from_context`
    - `metadata_json = { project_id, quote_id }`

  - `project_created` (if new project, in main transaction):
    - `resource_type = 'project'`
    - `resource_id = project_id`
    - `user_id = current_user_id`
    - `tenant_id = tenant_id_from_context`

  - `auto_quote_created` (in main transaction):
    - `resource_type = 'quote'`
    - `resource_id = quote_id`
    - `user_id = current_user_id`
    - `tenant_id = tenant_id_from_context`

  - `quote_sent` (after commit, best-effort):
    - `resource_type = 'quote'`
    - `resource_id = quote_id`
    - `user_id = current_user_id` (or system user id)
    - `tenant_id = tenant_id_from_context`

  - `pricing_failed` (after rollback, separate transaction):
    - `resource_type = 'automation_version'`
    - `resource_id = automation_version_id`
    - `user_id = current_user_id`
    - `tenant_id = tenant_id_from_context`
    - `action_type = 'pricing_failed'`
    - `metadata_json` contains failure reason (safe subset).

---

### Notifications

- Email:
  - `quote_sent`:
    - To: client contacts (from tenant/client config).
    - Includes: quote summary, link to quote page in app, link to quote PDF.
  - `automation_moved_to_pricing`:
    - To: automation owner and relevant ops team (configurable).
    - Includes: automation name, version, project ID, quote summary.

- In-app:
  - Notify client users: `"New quote available for [Automation Name]."` (only when ops-approval flag is disabled or after approval).
  - Notify owner/ops: `"Automation moved to pricing; quote auto-generated."`

When ops-approval flag is enabled, client-facing notifications MUST be gated by the separate approval flow, not Flow 11.

---

### Exceptions

- 401 Unauthorized:
  - No valid session / invalid JWT (handled by global auth middleware).
  - Request uses an API key (`Authorization` starts with `wrk_api_`) for:
    - `POST /v1/automation-versions/{id}/move-to-pricing`
    - `PATCH /v1/automation-versions/{id}/status` when it implies a pricing transition.

- 403 Forbidden:
  - Valid session and active tenant, but caller is:
    - Not automation owner, AND
    - Tenant role < `workflows_write`, AND
    - Does not have `ops_pricing` or `admin` permission.

- 404 Not Found:
  - No `automation_versions` row found for `(id, tenant_id_from_context)`.

- 409 Conflict:
  - `automation_versions.status` not in PRE_PRICING_ALLOWED_STATUSES.
  - `automations.status != 'active'`.
  - A newer automation_version exists for this `(automation_id, tenant_id)` (not latest).
  - Any other status/version constraint violation per canonical rules.

- 400 Bad Request:
  - Blueprint invalid/empty or no trigger node:
    - `error_code = 'missing_trigger'` or `error_code = 'blueprint_empty_or_invalid'`.
  - Intake_progress below configured threshold:
    - `error_code = 'intake_progress_below_threshold'`.

- 500 / 503 Internal Server Error:
  - Pricing engine failure:
    - `error_code = 'pricing_engine_failed'` in response body.
    - Transaction MUST roll back; no project, quote, or status updates are persisted.

---

### Manual Intervention

- Ops team MAY:
  - Override pricing amounts or regenerate quotes via separate ops tools (outside this flow).
  - Manually “move to pricing” via ops UI; ops UI MUST still call `POST /v1/automation-versions/{id}/move-to-pricing` (or PATCH delegating to the same domain service), not bypass it.

- All manual overrides MUST:
  - Respect tenant isolation.
  - Produce appropriate `audit_logs` entries.

---

### Security Notes

- Tenant isolation:
  - `tenant_id` is always derived from authenticated context (session/JWT), never from client input.
  - All `SELECT`, `UPDATE`, and `INSERT` statements for `clients`, `projects`, `quotes`, and `automation_versions` MUST include `tenant_id = tenant_id_from_context` in their WHERE clauses.
  - Client-provided `tenant_id` MUST be ignored if present.

- Tenant_id invariants:
  - All rows touched in this flow (`clients`, `projects`, `quotes`, `automation_versions`) MUST share the same `tenant_id` from context.

- Permissions:
  - Only automation owners and sufficiently-privileged roles (`workflows_write` / `ops_pricing` / `admin`) are allowed to move automations to pricing.
  - API keys are explicitly forbidden from pricing transitions.

- Transaction safety:
  - Project creation, quote creation, `automation_versions.status` update, and in-transaction `audit_logs` entries MUST be atomic.
  - On failure, no partial pricing artifacts (project without quote, quote without status change, etc.) may persist.

- Idempotency:
  - The move-to-pricing flow MUST be idempotent for the same `automation_version_id`.
  - If `automation_versions.status = 'Awaiting Client Approval'` and a `sent` quote already exists for that version, subsequent calls MUST:
    - Reuse existing project and quote.
    - Return 200 OK with `already_priced = true`.
    - Avoid any new projects, quotes, or status changes.

- Data integrity:
  - Constraints and foreign keys on `clients`, `projects`, `quotes`, and `automation_versions` MUST enforce consistent `tenant_id` relationships and prevent cross-tenant leakage.
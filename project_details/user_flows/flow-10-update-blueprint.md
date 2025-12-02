### Flow 10: Update Blueprint

**Trigger**: User edits blueprint canvas and saves

**Editable Status Set** (canonical definition):
- `EDITABLE_AUTOMATION_VERSION_STATUSES = ['Intake in Progress']`
- This set defines which automation_version.status values allow blueprint editing.
- To extend: add new statuses to this list (e.g., 'Needs Revision' once product defines it).
- All references to "editable status" or "allowed editable statuses" in this flow refer to this canonical set.

**Flow Diagram**:
```
User edits blueprint (updates sections and steps)
    ↓
Backend: Resolve tenant_id and authorization
    - Global auth middleware performs session validity, active membership, and active tenant checks (401 vs 403 semantics per Global Auth Middleware Rule).
    - If the caller uses an API key (Authorization starts with wrk_api_), abort with 401 Unauthorized; only JWT user sessions may update blueprints.
    - This flow adds only blueprint-specific authorization checks:
        * Verify user has permission to edit automations (tenant role ≥ 'workflows_write' or 'admin', or is the automation owner, per shared permission matrix)
        * If insufficient permission → 403 Forbidden
    ↓
Load automation_version (and parent automation) with tenant isolation
    - SELECT automation_versions WHERE id = :id AND tenant_id = :tenant_id_from_context
    - JOIN automations ON automation_versions.automation_id = automations.id
    - Enforce automations.tenant_id = automation_versions.tenant_id = tenant_id_from_context
    - If not found → 404 Not Found
    - Validate editing constraints (all must pass, otherwise 409 Conflict):
        * parent automation.status = 'active'
        * this is the latest automation_version for that automation_id (latest version is defined as the row with the greatest `version` for that (automation_id, tenant_id); if `version` is not available, use max(created_at). This definition MUST be kept identical to the 'latest version' definition in Flow 11.)
        * automation_version.status is in EDITABLE_AUTOMATION_VERSION_STATUSES (see canonical definition above)
    - Editing NOT allowed if:
        * automation_version.status IN ('Live', 'Archived') OR any non-editable status → 409 Conflict
        * a newer version exists → 409 Conflict
        * parent automation.status != 'active' → 409 Conflict
    ↓
Validate blueprint JSON structure
    - Blueprint validation MUST call the same centralized validator + limits used in Flow 9 (max 5 MB serialized payload, max_steps, max_systems_per_step, etc.).
    - Parse blueprint_json from request body; MUST be valid JSON.
    - Enforce expected schema (sections[], steps[], timestamps, status) via the centralized validator.
    - Enforce constraints:
        * Sections must include every canonical key exactly once (`business_requirements` → `flow_complete`) with string content limits.
        * Must contain at least one `Trigger` step.
        * Every `nextStepId` / `exceptionId` must reference an existing step (no dangling references).
        * Step counts, systems per step, and notifications per step must not exceed centrally configured limits (e.g., `max_steps`, `max_systems_per_step`, `max_notifications_per_step`).
        * Serialized JSON size must not exceed canonical max blueprint size (5 MB, consistent with Flow 9).
    - If any validation fails → 400 Bad Request with structured validation errors using canonical error codes (same as Flow 11):
        * Missing Trigger step → error code: `missing_trigger`
        * Empty or structurally invalid blueprint JSON → error code: `blueprint_empty_or_invalid`
    - No partial updates on validation failure; blueprint_json and intake_progress are updated together or not at all
    ↓
Optimistic concurrency check (OPTIONAL in v1, but recommended)
    - v1 behavior: Implement the concurrency token path but allow it to be omitted by clients (clients may optionally provide If-Match header or last_known_updated_at field in payload).
    - Implementations MUST accept requests with no concurrency token in v1; a future version MAY make the token mandatory, but that would be a breaking change.
    - If provided: Require If-Match header or last_known_updated_at field in payload (ISO8601 timestamp format)
    - Compare against automation_versions.updated_at
    - If mismatch → 409 Conflict (concurrent modification)
    - If not provided: proceed without concurrency check (implementation may choose to require this in future versions)
    ↓
Recalculate intake_progress
    - Derive intake_progress based on blueprint completeness (e.g., required sections populated, count/diversity of steps, presence of responsibilities/SLA metadata).
    - Map completeness to 0–100% via shared scoring function (capped at 100%).
    - Do NOT auto-change status here (status remains whatever it currently is, typically 'Intake in Progress')
    - PUT must NOT move to 'Needs Pricing' or any other status; status transitions are exclusively handled by Flow 11
    ↓
Update automation_versions row in a single transaction (with audit log)
    - Load current row state to capture "before" values for audit log (num_steps_before, intake_progress_before)
    - UPDATE automation_versions
      SET blueprint_json = :validated_blueprint_json,
          intake_progress = :new_intake_progress,
          updated_at = now()
      WHERE id = :id AND tenant_id = :tenant_id
      AND (optional optimistic concurrency condition on updated_at if provided)
    - If UPDATE affects 0 rows due to concurrency or tenant mismatch → 409 Conflict
    - Compute "after" values (num_steps_after, intake_progress_after) from validated_blueprint_json
    ↓
Create audit log entry (within same transaction)
    - action_type = 'update_blueprint'
    - resource_type = 'automation_version'
    - resource_id = automation_version_id
    - user_id = current_user_id
    - tenant_id = tenant_id
    - created_at = now()
    - metadata_json includes:
        * num_steps_before, num_steps_after
        * intake_progress_before, intake_progress_after
    ↓
Send notifications (best-effort, async)
    - In-app: notify collaborators/owner that blueprint was updated
    - Email notifications are optional and configuration-driven
    ↓
Return updated blueprint
    - Return 200 OK with latest blueprint_json and intake_progress
```

**API Endpoints**:
- `PUT /v1/automation-versions/{id}/blueprint` - Update blueprint
  - **Auth required**:
    - User must be authenticated via user session/JWT (NOT via API key).
    - If Authorization header contains a token starting with `wrk_api_`, this endpoint MUST return 401 Unauthorized.
  - **Authorization required**:
    - Tenant role ≥ 'workflows_write' (or 'admin') OR caller is the automation owner, per shared permission matrix.
    - If insufficient permission → 403 Forbidden.
  - **Tenant isolation**:
    - Resolve tenant_id from authenticated context (session/JWT) only.
    - This endpoint MUST NOT accept tenant_id from client body or query—ignore if present.
    - Global auth middleware performs 401 vs 403 semantics; this flow adds only blueprint-specific checks.
    - Look up automation_version WHERE id = :id AND tenant_id = :tenant_id_from_context.
    - Join to parent automation to confirm same tenant and that automation.status = 'active'; otherwise 409 Conflict.
    - Editing constraints (all must pass, otherwise 409 Conflict):
        * parent automation.status = 'active'
        * this is the latest automation_version for that automation_id (latest version is defined as the row with the greatest `version` for that (automation_id, tenant_id); if `version` is not available, use max(created_at). This definition MUST be kept identical to the 'latest version' definition in Flow 11.)
        * automation_version.status is in EDITABLE_AUTOMATION_VERSION_STATUSES (see canonical definition above)
    - Editing NOT allowed if:
        * automation_version.status NOT in EDITABLE_AUTOMATION_VERSION_STATUSES (e.g., 'Live', 'Archived', or any future non-editable status) → 409 Conflict
        * a newer version exists → 409 Conflict
        * parent automation.status != 'active' → 409 Conflict
  - **Request body**:
    - `blueprint_json` (required): JSON object describing sections[], steps[], and metadata defined in the canonical Blueprint schema.
    - Optional concurrency token: e.g., `last_known_updated_at` (ISO8601 timestamp) if not using HTTP If-Match.
    - The endpoint MUST ignore any server-owned fields if they appear in the request body: `tenant_id`, `status`, `automation_id`, `owner_id`, `intake_progress`, `created_at`, `updated_at`, or any other server-controlled fields.
    - Only `blueprint_json` (and optional concurrency token) are allowed from the client.
  - **Behavior**:
    - If the client sends server-owned fields (e.g., status, tenant_id, automation_id, owner_id, intake_progress, created_at, updated_at), the endpoint MUST ignore them; they MUST NOT cause errors or status changes.
    - Validate payload (presence and type of blueprint_json).
    - Run the centralized blueprint validator (shared with Flow 9).
    - Enforce at least one `Trigger` step and a valid step graph (no dangling `nextStepIds`).
    - If validation fails → 400 Bad Request with structured errors (no partial writes).
    - Optionally perform optimistic concurrency check (if If-Match or last_known_updated_at provided).
    - Compute updated intake_progress using shared scoring utility (capped at 100%).
    - Update `automation_versions` (blueprint_json, intake_progress, updated_at) and insert audit log entry in a single DB transaction.
    - If any validation or concurrency check fails, nothing is written (no partially updated blueprint_json).
  - **Response**:
    - 200 OK
      - Body: { id, automation_id, tenant_id, status, blueprint_json, intake_progress, updated_at }
    - PUT callers always get full blueprint_json (since only editors with workflows_write/owner/admin permission can call PUT, they are authorized to see the full blueprint).
    - This endpoint MUST NOT change the status to 'Needs Pricing'; status transitions are handled exclusively by the dedicated status-transition flow.

- `GET /v1/automation-versions/{id}/blueprint` - Get blueprint
  - **Auth required**:
    - Uses shared global auth middleware (can be JWT user or API key).
  - **Tenant isolation**:
    - Resolve tenant_id from authenticated context (session/JWT for user, api_keys.tenant_id for API key).
    - Look up automation_version WHERE id = :id AND tenant_id = :tenant_id_from_context.
    - If not found → 404 Not Found.
  - **Authorization**:
    - JWT users:
      - Must have active membership in tenant.
      - Must have at least 'workflows_read' role to view blueprint.
    - API-key-authenticated callers:
      - api_keys.permissions MUST include 'workflows_read' or higher, else 403 Forbidden.
  - **Blueprint access rules**:
    - Apply the shared Blueprint Access Rules (see Flow 8) to decide full vs summarized blueprint_json; do not diverge here.
    - Summary: workflows_write/owner/admin → full blueprint_json; workflows_read → summarized blueprint_json (structure-only, no sensitive metadata).
  - **Response**:
    - 200 OK
      - Body includes: { id, automation_id, tenant_id, status, intake_progress, blueprint_json: <full_or_summarized> }

**Database Changes**:
- The `UPDATE automation_versions` and the audit_log insert MUST happen in a single DB transaction.
- If any validation or concurrency check fails, nothing is written (no partially updated blueprint_json).
- Update `automation_versions`:
  - SET blueprint_json = :validated_blueprint_json,
        intake_progress = :new_intake_progress,
        updated_at = now()
  - WHERE id = :id AND tenant_id = :tenant_id_from_context
  - Optionally include optimistic concurrency condition on updated_at if concurrency token provided.
- Insert into `audit_logs` (within same transaction):
  - action_type = 'update_blueprint' (canonical action_type, MUST NOT be renamed or duplicated; keeps analytics consistent with other flows)
  - resource_type = 'automation_version'
  - resource_id = automation_version_id
  - user_id = current_user_id
  - tenant_id = tenant_id (from authenticated context, not from client payload)
  - created_at = now()
  - metadata_json includes:
      * num_steps_before, num_steps_after (computed from row as loaded under same transaction to avoid race conditions)
      * intake_progress_before, intake_progress_after

**Notifications**:
- **In-app**:
  - Notify automation owner and relevant collaborators that the blueprint was updated.
  - Notification payload can include automation_id, automation_version_id, user_id of editor, and timestamp.
- **Email**:
  - Optional and config-driven; by default, this flow can be in-app-only.

**Exceptions**:
- **401 Unauthorized**:
  - No valid session / invalid JWT (handled by global auth middleware).
  - Request uses an API key for PUT (Authorization token starts with `wrk_api_`) → always 401 Unauthorized for `PUT /v1/automation-versions/{id}/blueprint`.
- **403 Forbidden**:
  - Valid session, active tenant, but caller lacks required role (tenant role < 'workflows_write' and not 'admin' and not automation owner) → 403 Forbidden.
- **409 Conflict**:
  - Version not latest (a newer version exists for the same automation_id; latest version is defined as the row with the greatest `version` for that (automation_id, tenant_id); if `version` is not available, use max(created_at). This definition MUST be kept identical to the 'latest version' definition in Flow 11.).
  - Version not in editable status (automation_version.status not in EDITABLE_AUTOMATION_VERSION_STATUSES; see canonical definition above).
  - Parent automation not active (automation.status != 'active').
  - Optimistic concurrency mismatch (if concurrency token provided and `updated_at` no longer matches).
- **400 Bad Request**:
  - Invalid JSON structure or failed schema validation (with canonical error code: `blueprint_empty_or_invalid`, same as Flow 11).
  - Missing required steps (no Trigger step or invalid `nextStepIds`) → canonical error code: `missing_trigger` (same as Flow 11).
  - Blueprint too large (step counts or serialized size exceed configured limits: max 5 MB, max_steps, max_systems_per_step, etc.).
  - Flow 10 reuses the same canonical error codes defined in Flow 11 for overlapping validation cases and DOES NOT invent new strings for the same conditions.

**Security Notes**:
- **Tenant isolation**: `tenant_id` always comes from authenticated context (sessions.tenant_id/JWT or api_keys.tenant_id), never from client input. All queries on automation_versions MUST include tenant_id filters. See Global Auth Middleware Rule for tenant_id derivation semantics.
- **Global auth middleware**: Session validity, active membership, and active tenant checks are performed by the shared global auth middleware (same as Flows 5/6/8/9/11). This flow adds only blueprint-specific authorization checks (role/owner verification, version constraints, status constraints).
- **Permissions**: Edit operations allowed only for users with tenant role ≥ 'workflows_write' (or 'admin') OR the automation owner. View operations must honor the shared Blueprint Access Rules (see Flow 8) to avoid leaking internal metadata to read-only roles or low-permission API keys.
- **Server-side validation**: All validation is enforced server-side; frontend validation is convenience only.
- **Transaction safety**: Blueprint updates (blueprint_json, intake_progress) and audit log insertion MUST occur in a single DB transaction; either all succeed or none do (no partial updates).
- **Concurrency**: Optimistic concurrency check is optional in v1 but recommended; if provided and mismatch detected, return 409 Conflict to avoid silently overwriting another user's changes.

---

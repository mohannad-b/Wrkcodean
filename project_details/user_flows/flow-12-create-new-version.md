### Flow 12: Create New Version

**Trigger**: User clicks **"Create New Version"** from an existing automation/version.

---

### Versioning Rules (canonical)

- New versions are always created **from an existing base automation_version**.
- Canonical base-status set for versioning:
  - `VERSIONABLE_AUTOMATION_VERSION_STATUSES = ['Live', 'Archived']`
- You can only create a new version from a base version whose `status` is in this set.
- The new version:
  - Belongs to the **same** `automation_id` and `tenant_id` as the base.
  - Starts with:
    - `status = 'Intake in Progress'`
    - `intake_progress = 0`
  - Copies `blueprint_json` and other selected metadata from the base (see below).

**Version number semantics**

- Each automation_version has a `version` field (string), e.g. `"1.0.0"`, `"2.0.0"`.
- The server is the **single source of truth** for version numbering.
- Clients may optionally hint the bump type via request payload:
  - `version_bump = 'minor' | 'major'` (default: `'minor'`).
- Canonical semver behavior:
  - Parse `base_version.version` as `MAJOR.MINOR.PATCH` (PATCH may be omitted → treated as `0`).
  - For `version_bump = 'minor'`:
    - `MINOR = MINOR + 1`, `PATCH = 0`.
  - For `version_bump = 'major'`:
    - `MAJOR = MAJOR + 1`, `MINOR = 0`, `PATCH = 0`.
- If parsing fails (non-semver string), implementation MAY:
  - Fallback to numeric increment (e.g., append `.1`, or increment trailing integer), or
  - Return `400 Bad Request` (`versioning_not_supported_for_base`).
- `(automation_id, tenant_id, version)` MUST be unique. If a conflict occurs during insert:
  - Recalculate once (e.g., bump `PATCH` or `MINOR`).
  - If still conflicting → `409 Conflict` (`version_conflict`).

---

### Flow Diagram

    User selects "Create New Version" from a base version
        ↓
    Backend: Resolve tenant_id and authorization
        - Global auth middleware:
            * Valid session / JWT
            * Active membership
            * Active tenant
          (401 vs 403 semantics per Global Auth Middleware Rule)
        - API keys are NOT allowed:
            * If Authorization starts with "wrk_api_":
                → 401 Unauthorized
        - Version-creation-specific authorization:
            * Caller must be:
                - automation owner OR
                - tenant role ≥ "workflows_write" OR
                - "admin"
            * Otherwise → 403 Forbidden

        ↓
    Resolve automation and base version with tenant isolation
        - Input:
            * Path param: automation_id
            * Body: base_version_id (required)
        - Steps:
            1) SELECT automations
               WHERE id = :automation_id
                 AND tenant_id = :tenant_id_from_context
               If not found → 404 Not Found
            2) SELECT automation_versions
               WHERE id = :base_version_id
                 AND automation_id = :automation_id
                 AND tenant_id = :tenant_id_from_context
               If not found → 404 Not Found
            3) Enforce tenant invariants:
               automations.tenant_id = automation_versions.tenant_id = tenant_id_from_context
            4) Validate:
               - automations.status = "active"
                 (cannot version into an inactive/archived automation)
               - base_version.status in VERSIONABLE_AUTOMATION_VERSION_STATUSES
                 (['Live','Archived'])
               If any fail:
                 → 400 Bad Request (base_version_not_versionable)

        ↓
    Determine latest version and next version number
        - Canonical "latest version" definition:
            * Same as Flows 10 & 11:
              latest = row with greatest "version"
              for (automation_id, tenant_id),
              or max(created_at) if "version" is not available.
        - This definition MUST remain identical across Flows 10, 11, 12.
        - Load all versions (or at least latest row) for this (automation_id, tenant_id).
        - Validate:
            * base_version MAY or MAY NOT be the latest version.
              (We allow versioning from any Live/Archived version.)
        - Compute next_version:
            * Use base_version.version + requested bump_type (minor/major).
            * Ensure new version is logically > base_version.version.
            * Ensure (automation_id, tenant_id, version) unique.

        ↓
    Prepare new version payload
        - Clone server-owned fields from base where appropriate:
            * automation_id (same as base)
            * tenant_id (from context; must match base/automation)
            * name / display_name (optional clone)
            * description (optional clone)
            * tags/labels (optional clone)
        - blueprint_json:
            * Copy from base_version.blueprint_json (as-is).
        - Set new version fields:
            * version = next_version (computed)
            * status = "Intake in Progress"
            * intake_progress = 0
            * created_at = now()
            * updated_at = now()
        - IMPORTANT:
            * Do NOT auto-create projects or quotes here.
            * Do NOT auto-move automation_version to pricing.
            * Do NOT change parent automation.status.
            * Project/quote creation is handled by Flow 11.

        ↓
    Insert new automation_version (single transaction)
        - Start transaction.
        - INSERT INTO automation_versions:
            * tenant_id = tenant_id_from_context
            * automation_id = automation_id
            * version = next_version
            * blueprint_json = base_version.blueprint_json
            * status = "Intake in Progress"
            * intake_progress = 0
            * plus any other cloned metadata fields
        - If uniqueness constraint fails on (automation_id, tenant_id, version):
            * Optionally recompute next_version once
            * If it still fails → 409 Conflict (version_conflict)
        - Capture new_automation_version_id.

        ↓
    Insert audit log (same transaction)
        - INSERT INTO audit_logs:
            * action_type = "create_version" (canonical; MUST NOT be renamed)
            * resource_type = "automation_version"
            * resource_id = new_automation_version_id
            * user_id = current_user_id
            * tenant_id = tenant_id_from_context
            * created_at = now()
            * metadata_json = {
                "base_version_id": base_version_id,
                "base_version": base_version.version,
                "new_version_id": new_automation_version_id,
                "new_version": next_version
              }

        ↓
    Commit transaction
        - If any DB step fails → rollback.
        - No partial versions are left behind.

        ↓
    Send notifications (best-effort, async)
        - In-app:
            * Notify automation owner and collaborators:
              "New version {next_version} created for {automation_name}"
        - Email (config-driven):
            * Template: "version_created"
            * To: automation owner (and/or ops team)
            * Include:
                - automation name
                - base version
                - new version
                - link to new version detail page

        ↓
    Return response
        - 201 Created
        - Body:
            {
              automation_version: {
                id,
                automation_id,
                tenant_id,
                version,
                status,
                intake_progress,
                created_at,
                updated_at
              }
            }
        - Frontend redirects to new version detail page and canvas editor.

---

### API Endpoints

#### `POST /v1/automations/{automation_id}/versions` — Create new version

**Auth required**

- Uses global auth middleware:
  - Valid JWT session.
  - Active membership.
  - Active tenant.
- API keys are NOT allowed:
  - If `Authorization` starts with `wrk_api_` → **401 Unauthorized**.

**Authorization required**

- Caller must be:
  - Automation owner, OR
  - Tenant role ≥ `'workflows_write'`, OR
  - `'admin'`.
- If not → **403 Forbidden**.

**Tenant isolation**

- `tenant_id` is resolved from authenticated context only.
- Client-provided `tenant_id` MUST be ignored if present in body/query.
- All queries and inserts are scoped by `tenant_id = tenant_id_from_context`.
- Invariants:
  - `automations.tenant_id = automation_versions.tenant_id = tenant_id_from_context`.

**Request body**

- Required:
  - `base_version_id` (ID of the automation_version to clone from).
- Optional:
  - `version_bump`:
    - `'minor'` (default) or `'major'`.
- The client MUST NOT send or control:
  - `version`, `status`, `automation_id`, `tenant_id`, `intake_progress`,
    `projects`, `quotes`, or any pricing-related fields.
- Any server-owned fields in the payload MUST be ignored.

**Behavior**

1. Resolve automation and base version under tenant isolation.
2. Validate:
   - `automation.status = 'active'`.
   - `base_version.status` in `VERSIONABLE_AUTOMATION_VERSION_STATUSES` (`['Live','Archived']`).
3. Compute `next_version` from `base_version.version` and `version_bump`.
4. Start transaction:
   - Insert new `automation_versions` row.
   - Insert `audit_logs` row with `action_type = 'create_version'`.
5. Commit transaction.
6. Queue notifications (email + in-app) best-effort.

**Response**

- **201 Created**
  - Example:
    ```json
    {
      "automation_version": {
        "id": "av_123",
        "automation_id": "a_456",
        "tenant_id": "t_789",
        "version": "2.0.0",
        "status": "Intake in Progress",
        "intake_progress": 0,
        "created_at": "2025-01-01T00:00:00Z",
        "updated_at": "2025-01-01T00:00:00Z"
      }
    }
    ```

---

#### `GET /v1/automations/{automation_id}/versions` — List versions for an automation

**Auth required**

- Shared global auth middleware (JWT session or API key).
- For API keys:
  - `api_keys.permissions` MUST include `'workflows_read'` or higher.

**Tenant isolation**

- Resolve `tenant_id` from:
  - Session/JWT for user, or
  - `api_keys.tenant_id` for API key.
- Select:
  - `SELECT automation_versions WHERE automation_id = :automation_id AND tenant_id = :tenant_id_from_context ORDER BY created_at DESC`
- If `automation` not found under this tenant → **404 Not Found**.

**Authorization**

- JWT users:
  - Must have at least `'workflows_read'` role in tenant.
- API keys:
  - Must have `'workflows_read'` or higher in `api_keys.permissions`.

**Response**

- **200 OK**
  - Example:
    ```json
    {
      "automation_id": "a_456",
      "versions": [
        {
          "id": "av_123",
          "version": "2.0.0",
          "status": "Intake in Progress",
          "intake_progress": 0,
          "created_at": "2025-01-01T00:00:00Z",
          "updated_at": "2025-01-01T00:00:00Z"
        },
        {
          "id": "av_100",
          "version": "1.0.0",
          "status": "Live",
          "intake_progress": 100,
          "created_at": "2024-10-01T00:00:00Z",
          "updated_at": "2024-12-01T00:00:00Z"
        }
      ]
    }
    ```

---

### Database Changes

**`automation_versions`**

- Insert (within transaction):

  - `tenant_id = :tenant_id_from_context`
  - `automation_id = :automation_id`
  - `version = :next_version`
  - `status = 'Intake in Progress'`
  - `blueprint_json = base_version.blueprint_json`
  - `intake_progress = 0`
  - `created_at = now()`
  - `updated_at = now()`
  - (plus any other metadata cloned from base_version as desired)

- Constraints:

  - Foreign keys:
    - `tenant_id → tenants`
    - `automation_id → automations`
  - Unique index on:
    - `(tenant_id, automation_id, version)`
  - This ensures no duplicate version labels for the same automation within a tenant.

**`audit_logs`**

- Insert (same transaction):

  - `action_type = 'create_version'` (canonical; MUST NOT be renamed)
  - `resource_type = 'automation_version'`
  - `resource_id = new_automation_version_id`
  - `user_id = current_user_id`
  - `tenant_id = tenant_id_from_context`
  - `created_at = now()`
  - `metadata_json = {
      "base_version_id": base_version_id,
      "base_version": base_version.version,
      "new_version_id": new_automation_version_id,
      "new_version": next_version
    }`

---

### Notifications

- **In-app**:
  - Notify automation owner and relevant collaborators:
    - "New version {next_version} created for {automation_name}"
- **Email** (config-driven):
  - Template: `version_created`
  - To: automation owner (and optionally ops/pricing team)
  - Include:
    - Automation name
    - Base version and new version
    - Link to new version detail page

---

### Exceptions

- **401 Unauthorized**
  - No valid session / invalid JWT (global middleware).
  - Request uses an API key for `POST /v1/automations/{id}/versions`
    (Authorization starts with `wrk_api_`).

- **403 Forbidden**
  - Valid session, active tenant, but:
    - Caller is not owner,
    - AND tenant role < `'workflows_write'`,
    - AND not `'admin'`.

- **404 Not Found**
  - Automation not found for `(automation_id, tenant_id)`.
  - Base version not found for `(base_version_id, automation_id, tenant_id)`.

- **400 Bad Request**
  - Base version not in `VERSIONABLE_AUTOMATION_VERSION_STATUSES` → `base_version_not_versionable`.
  - Version string of base cannot be parsed and implementation chooses not to fallback → `versioning_not_supported_for_base`.

- **409 Conflict**
  - Version number conflict for `(tenant_id, automation_id, version)` after computation → `version_conflict`.

---

### Security Notes

- **Tenant isolation**
  - `tenant_id` ALWAYS comes from authenticated context (sessions/JWT or api_keys), never from client input.
  - All SELECT/INSERT/UPDATE statements MUST include `tenant_id` in WHERE/VALUES.
  - `automations`, `automation_versions`, and `audit_logs` touched in this flow MUST all share the same `tenant_id`.

- **Permissions**
  - Only automation owners, `workflows_write`, or `admin` can create new versions.
  - API keys are **explicitly forbidden** from creating new versions.

- **Transaction safety**
  - `automation_versions` insert and `audit_logs` insert MUST be in a single DB transaction.
  - On failure, rollback ensures no partial version is persisted.

- **Interaction with other flows**
  - New versions start at:
    - `status = 'Intake in Progress'`
    - `intake_progress = 0`
  - Blueprint editing for the new version is governed by **Flow 10**.
  - Moving the new version to pricing/quote generation is governed exclusively by **Flow 11**.
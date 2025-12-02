### Flow 9: Requirements Capture & AI Ingestion

**Trigger**: User adds process description and/or uploads supporting material (docs, screenshots, recordings) while in "Intake in Progress"

**Flow Diagram**:
```
User submits description and/or uploads files
    ↓
Backend: Resolve tenant_id from authenticated context (session/JWT)
    - tenant_id MUST come from server-side session/JWT, never from client input
    - User must be authenticated (valid session/JWT)
    - Verify user has active membership in tenant_id
    - Verify tenant is active (not deleted/suspended)
    - Verify user has permission to edit automations (tenant role ≥ 'workflows_write' or 'admin' per shared permission matrix)
    - If session invalid → 401 Unauthorized
    - If no active membership / inactive tenant / insufficient role → 403 Forbidden
    ↓
System stores uploaded assets:
    - Upload to storage (S3 or similar)
    - Use tenant-scoped storage paths (e.g., /tenants/{tenant_id}/automations/{automation_id}/versions/{automation_version_id}/...)
    - Create records in uploaded_assets table (or similar)
    - Store tenant_id and uploaded_by_user_id on each uploaded_assets row
    - Link to automation_version_id
    - Validate file type, size, and count against centrally defined limits
    ↓
Enqueue job to 'ai-ingestion' queue:
    {
        tenant_id,
        automation_version_id,
        asset_references,
        description_text,
        triggered_by_user_id
    }
    ↓
Server must write a row in `ai_ingestion_jobs` (automation_version_id, tenant_id, job_id, created_at) to track ingestion attempts.
    ↓
[AI Ingestion Worker picks up job]
    ↓
AI Ingestion Worker:
    - Validates that automation_version_id exists and belongs to tenant_id from the job payload
    - Validates that automation_version.status is still 'Intake in Progress'
    - Worker MUST check whether a newer automation_version exists; if yes → skip ingestion and mark job obsolete.
    - Worker MUST ensure only one ingestion job writes blueprint_json (use SELECT … FOR UPDATE on automation_versions row).
    - Worker MUST NOT emit blueprint_json fields containing personally identifiable information extracted from uploaded assets unless explicitly allowed by central filtering rules.
    - Worker MUST run all extracted text through a PII-sanitizer pass before updating blueprint_json.
    - If validation fails (missing version / tenant mismatch / status not 'Intake in Progress'):
        * Do NOT update blueprint_json or intake_progress
        * Log and mark job as failed for ops review
    - Downloads assets
    - Runs extraction (LLM) to identify:
        * Steps in the process
        * Systems involved
        * Triggers and actions
        * Decision points
    - Generates or updates blueprint_json:
        * Populates sections (business requirements, objectives, etc.) from the intake.
        * Creates steps (Trigger / Action / Logic / Human) with metadata (summary, responsibility, systems, notifications).
        * Links steps via `nextStepIds` / `exceptionIds` to describe flow order and branches.
    - Updates intake_progress (e.g., 0 → 50-80% depending on completeness)
    ↓
Update automation_version:
    - Reject blueprint_json > 5 MB OR > N steps (central config).
    - If worker generates output exceeding safe limits, truncate steps with a safe summarization routine.
    - blueprint_json = generated draft
    - intake_progress = updated percentage
    - status remains 'Intake in Progress' (no auto-status change)
    - If ingestion fails, worker MUST NOT partially update blueprint_json.
    - All changes must occur in a single DB transaction with rollback on any LLM or parsing errors.
    ↓
Create audit log entry
    ↓
Send notifications
    ↓
Return success
```

**API Endpoints**:
- `POST /v1/automation-versions/{id}/intake` - Upload description & files
  - **Auth required**: User must be authenticated via user session/JWT (NOT via API key). If the Authorization header contains a token starting with `wrk_api_`, this endpoint MUST return 401 Unauthorized.
  - **Authorization required**: Tenant role ≥ 'workflows_write' (or 'admin'), enforced via shared permission matrix.
  - **Tenant isolation**: 
      - Resolve tenant_id from authenticated context (session/JWT) only.
      - Look up automation_version WHERE id = :id AND tenant_id = :tenant_id_from_context.
      - If not found: Return 404 Not Found.
      - Reject requests if the automation has been archived or deleted (automations.status != 'active') → 409 Conflict.
      - Reject requests if this automation_version is NOT the latest version for the automation → 409 Conflict.
      - Intake uploads are ONLY allowed on the latest active version in 'Intake in Progress'.
      - If automation_version.status != 'Intake in Progress': Return 409 Conflict.
  - **Payload validation**:
      - Reject requests where both description_text and files are empty → 400 Bad Request.
      - Enforce max total upload size and per-file size.
      - Enforce allowed MIME types (e.g., PDFs, images, common document formats per central config).
- `GET /v1/automation-versions/{id}/intake-assets` - List uploaded assets
  - **Auth required**: Can be JWT user or API key.
  - **Authorization required**:
      - JWT users: must have active membership in tenant and at least 'workflows_read'.
      - API-key-authenticated callers: api_keys.permissions MUST include 'workflows_read' or higher.
      - If permissions insufficient: Return 403 Forbidden.
  - **Tenant isolation**:
      - Resolve tenant_id from authenticated context (session/JWT or api_keys.tenant_id).
      - Select assets WHERE automation_version_id = :id AND tenant_id = :tenant_id_from_context.
  - **Response behavior**:
      - Return only metadata (id, original_filename, file_type, file_size_bytes, uploaded_at, uploaded_by_user_id, storage_key/safe reference).
      - `uploaded_by_user_id` MUST be redacted for API-key calls unless the key has 'admin' permission.
      - Never return storage_key if permissions < 'workflows_write'; return only opaque asset IDs.
      - Actual file access must use separate, time-limited signed URLs; this endpoint MUST NOT return raw public URLs.
      - File access MUST use a dedicated endpoint: `POST /v1/automation-versions/{id}/intake-assets/{assetId}/signed-url`.
      - This endpoint must re-check permissions and tenant isolation before generating each signed URL.

**Database Changes**:
- Insert into `uploaded_assets` (tenant_id, automation_version_id, file_url, storage_key, file_type, file_size_bytes, original_filename, uploaded_by_user_id, created_at=now())
  - `uploaded_assets.tenant_id` MUST have a foreign key referencing `tenants(id)` AND must equal the tenant_id of the parent automation_version.
  - A cascading delete MUST *not* be used; assets must remain orphan-protected until version is archived via controlled ops flow.
  - Add index on `(automation_version_id, created_at DESC)` to quickly list recent assets per version.
  - `file_url` SHOULD be an internal/bucket URL or key, not a public URL; public access MUST always go through signed URLs.
- Update `automation_versions` (blueprint_json, intake_progress)
- Status remains 'Intake in Progress' (not changed automatically)
- Insert into `audit_logs` (action_type='upload_intake_assets', resource_type='automation_version', resource_id=automation_version_id, user_id, tenant_id, created_at=now(), metadata_json={'files_uploaded': N, 'has_description_text': true/false}) - when user uploads assets
- Insert into `audit_logs` (action_type='ai_ingestion_complete', resource_type='automation_version', resource_id=automation_version_id, user_id=null, tenant_id, created_at=now(), metadata_json={'progress_before': old_progress, 'progress_after': new_progress, 'num_steps': count(steps)}) - when AI ingestion worker completes

**Notifications**:
- **Email**: AI-generated draft blueprint ready (template: `draft_blueprint_ready`, to owner)
- **In-app**: Notification to owner when draft is ready
- These notifications are sent ONLY after the AI Ingestion Worker successfully updates `automation_versions.blueprint_json` and `intake_progress`. Failed jobs MUST NOT trigger "draft blueprint ready" notifications.

**Exceptions**:
- **Unauthenticated user**: Return 401 Unauthorized (handled by global auth middleware).
- **API-key-authenticated callers MUST NOT call POST /intake**: always return 401 (not 403).
- **No active membership / inactive tenant / insufficient permission**: Return 403 Forbidden.
- **Automation version not in 'Intake in Progress'**: Return 409 Conflict (instead of generic 400).
- **If the automation_version belongs to an archived automation**: return 409 Conflict.
- **Malformed files / disallowed file type**: Return 400 Bad Request.
- **File size too large or total upload size exceeded**: Return 400 Bad Request.
- **AI extraction failure**: Mark as partial, notify ops team (template: `ai_extraction_failed`)

**Manual Intervention**: 
- Ops team reviews AI extraction failures and may manually process
- User can refine AI-generated blueprint manually

**Security Notes**:
- **Tenant isolation**: `tenant_id` always comes from authenticated context (sessions.tenant_id/JWT or api_keys.tenant_id), never from client input. Automation versions and uploaded_assets must be looked up with both id AND tenant_id.
- **Storage safety**: All uploaded assets MUST be stored under tenant-scoped prefixes. Clients MUST NOT control raw storage paths.
- **Access control**: Listing assets is permission-gated; actual file retrieval MUST use time-limited signed URLs, never long-lived public URLs.
- **Worker trust model**: The AI Ingestion Worker MUST validate that the automation version and tenant relationship are still valid before mutating `automation_versions`. It MUST NOT trust the queue payload blindly.

**Note**: This flow uses the AI Ingestion Worker from the backend architecture. It only updates `automation_versions.blueprint_json` and `intake_progress`. Status remains 'Intake in Progress' until explicitly moved to 'Needs Pricing' via Flow 10.

---

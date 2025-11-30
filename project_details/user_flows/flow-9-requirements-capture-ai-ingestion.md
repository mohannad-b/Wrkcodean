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

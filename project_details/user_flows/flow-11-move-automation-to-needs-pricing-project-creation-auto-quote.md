### Flow 11: Move Automation to "Needs Pricing" (+ Project Creation + Auto Quote)

**Trigger**: System detects that the blueprint is sufficiently complete (e.g., `intake_progress >= threshold`) OR user explicitly clicks "Ready for Pricing". In either case, the flow is the same.

**Flow Diagram**:
```
System detects intake_progress >= threshold OR user/ops clicks "Ready for Pricing"
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
System automatically calculates pricing:
    - Setup fee (from complexity/blueprint)
    - Per-unit price (from estimated volume)
    - Volume discounts applied
    ↓
Create quote record automatically:
    - automation_version_id
    - tenant_id
    - status = 'sent' (auto-sent)
    - setup_fee, unit_price, estimated_volume, effective_unit_price
    - sent_at = now()
    ↓
Update project.pricing_status = 'Sent'
    ↓
Update automation_versions.status = 'Awaiting Client Approval' (since quote is already sent)
    ↓
Optionally create initial pricing-related tasks:
    - context_type = 'project'
    - context_id = project.id
    - kind = 'build_checklist' or 'general_todo'
    - status = 'pending'
    - Examples: "Review pricing model", "Calculate setup fee"
    ↓
Send quote to client:
    - Email notification (template: `quote_sent`, includes quote PDF link)
    - In-app notification to client users
    ↓
Create audit log entry
    ↓
Return success
```

**Note**: In v1, pricing is auto-generated and immediately shown/sent to the client once a project is created and the blueprint meets minimum requirements. In future phases, a configuration flag can require ops approval before the quote is visible to the client.

**API Endpoints**:
- `POST /v1/automation-versions/{id}/move-to-pricing` - Move to Needs Pricing
- `PATCH /v1/automation-versions/{id}/status` (status='Needs Pricing') - Alternative endpoint

**Database Changes**:
- Insert into `projects` (tenant_id, client_id, automation_id, automation_version_id, type, status='Needs Pricing', pricing_status='Sent')
- Insert into `quotes` (automation_version_id, tenant_id, status='sent', setup_fee, unit_price, estimated_volume, effective_unit_price, sent_at=now())
- Insert into `tasks` (context_type='project', context_id, kind='build_checklist' or 'general_todo', status='pending') - optional initial tasks
- Update `automation_versions` (status='Awaiting Client Approval')
- Insert into `audit_logs` (action_type='move_to_pricing', action_type='auto_quote_created', action_type='quote_sent')

**Notifications**:
- **Email**: Quote sent to client (template: `quote_sent`, includes quote PDF link)
- **In-app**: Notification to client users (quote available)
- **Email**: Automation moved to pricing (template: `automation_moved_to_pricing`, to owner)

**Exceptions**:
- **Blueprint empty or invalid**: Return 400, must have at least one trigger node
- **Version not in 'Intake in Progress'**: Return 400, invalid status transition
- **intake_progress below threshold**: Return 400, must be >= 60% (configurable)
- **No permission**: Return 403 (only owner or ops can move to pricing)

**Manual Intervention**: 
- Ops team may manually move to pricing if user requests
- Ops team reviews blueprint before moving to pricing (optional approval step)

**Note**: This is the bridge between Studio (client-facing) and Ops. The `projects` record is created here, not during automation creation. This flow now automatically creates and sends the quote, moving the automation to 'Awaiting Client Approval'. Flow 11 should clearly be the bridge: Intake → Project created → Quote auto-generated → Quote auto-sent → Status 'Awaiting Client Approval'.

---

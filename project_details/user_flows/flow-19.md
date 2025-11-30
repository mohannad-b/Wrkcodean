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

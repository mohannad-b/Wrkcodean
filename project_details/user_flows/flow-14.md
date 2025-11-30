### Flow 14: Ops Adjust Quote (Override Pricing)

**Trigger**: Ops user opens the project's pricing panel after the system has already created and sent the initial quote.

**Flow Diagram**:
```
Ops user opens pricing panel (for existing project with auto-generated quote)
    ↓
Load existing quote (created automatically in Flow 11)
    ↓
Ops user reviews/adjusts pricing:
    - Adjust setup_fee
    - Adjust unit_price
    - Adjust discounts
    - Modify estimated_volume
    - Update effective_unit_price
    ↓
Save changes to quote record
    ↓
Update project.pricing_status = 'Sent' (if was 'Draft', or keep as 'Sent')
    ↓
The client's visible quote is updated accordingly (no new "send" step required)
    ↓
Optionally log that the quote was updated after initial auto-pricing
    ↓
Create audit log entry
    ↓
Return updated quote
```

**Note**: This is editing an existing quote tied to an existing project, not creating a random quote. The quote was already auto-created and sent in Flow 11.

**API Endpoints**:
- `PATCH /v1/quotes/{id}` - Update existing quote (adjust pricing)
- `GET /v1/quotes/{id}` - Get quote details
- `GET /v1/projects/{id}/quote` - Get project's quote

**Database Changes**:
- Update `quotes` (setup_fee, unit_price, estimated_volume, effective_unit_price, updated_at)
- Update `projects` (pricing_status='Sent' if needed)
- Insert into `audit_logs` (action_type='quote_updated', changes_json with before/after pricing)

**Notifications**: 
- **In-app**: Notification to client (quote updated, if significant changes)

**Exceptions**:
- **Quote not found**: Return 404
- **Quote not tied to project**: Return 400
- **Invalid pricing values**: Return 400
- **No permission**: Return 403 (ops only)

**Manual Intervention**: Ops user manually reviews and adjusts pricing for existing quotes

---

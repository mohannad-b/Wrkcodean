### Flow 18: Client Rejects Quote

**Trigger**: Client clicks "Reject Quote" or provides feedback

**Flow Diagram**:
```
Client clicks "Reject Quote" (optional: with feedback)
    ↓
Validate quote exists and is 'sent'
    ↓
Update quote.status = 'rejected'
    ↓
Update project.pricing_status = 'Not Generated' (or keep as 'Sent' for history)
    ↓
If automation_version.status = 'Awaiting Client Approval':
    Update to 'Needs Pricing'
    ↓
Store rejection reason (optional field)
    ↓
Create audit log entry
    ↓
Send notifications
    ↓
Return success
```

**API Endpoints**:
- `PATCH /v1/quotes/{id}/status` (status='rejected', rejection_reason optional)

**Database Changes**:
- Update `quotes` (status='rejected', rejection_reason)
- Update `automation_versions` (status='Needs Pricing')
- Insert into `audit_logs` (action_type='reject_quote')

**Notifications**:
- **Email**: Quote rejected notification to ops team (template: `quote_rejected`, includes client feedback)
- **Email**: Rejection confirmation to client (template: `quote_rejected_client`)
- **In-app**: Notification to ops team (needs new quote)

**Exceptions**:
- **Quote not in 'sent' status**: Return 400
- **Quote already signed/rejected**: Return 409

**Manual Intervention**: 
- Ops team reviews rejection reason and creates new quote with adjusted pricing
- Ops team may contact client to discuss pricing

---

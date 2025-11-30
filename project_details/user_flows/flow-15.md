### Flow 15: Client Views and Accepts Quote

**Trigger**: Client lands on their quote (via email link or in-app), which has already been auto-created and sent.

**Flow Diagram**:
```
Client opens quote (via email link or in-app navigation)
    ↓
Validate quote exists and is 'sent'
    ↓
Check client has permission (tenant matches)
    ↓
Display quote details:
    - Setup fee
    - Per-unit price
    - Estimated volume
    - Total pricing
    - Terms and conditions
    ↓
Client can:
    Option A: Click "Approve Quote"
        → Proceed to Flow 16 (Client Signs Quote)
    Option B: Click "Decline" or "Request Changes"
        → Update quote.status = 'rejected'
        → Update automation_version.status = 'Needs Pricing'
        → Store rejection reason
        → Create audit log entry
        → Send notifications to ops
    ↓
Return quote view
```

**API Endpoints**:
- `GET /v1/quotes/{id}` - Get quote (client view)
- `GET /v1/quotes/{id}/pdf` - Download quote PDF
- `PATCH /v1/quotes/{id}/status` (status='signed' or 'rejected') - Approve or reject

**Database Changes**:
- Read-only for viewing (no changes unless client approves/rejects)
- If rejected: Update `quotes` (status='rejected', rejection_reason), Update `automation_versions` (status='Needs Pricing'), Insert into `audit_logs` (action_type='reject_quote')

**Notifications**:
- **Email**: Quote rejected notification to ops team (template: `quote_rejected`, includes client feedback) - if rejected
- **Email**: Rejection confirmation to client (template: `quote_rejected_client`) - if rejected

**Exceptions**:
- **Quote not found**: Return 404
- **Unauthorized tenant**: Return 403
- **Quote already signed/rejected**: Return 409

**Manual Intervention**: None (client-driven)

**Note**: Remove or minimize language that implies ops manually "sends" the quote. Sending is automatic (in Flow 11), operations just modify existing quotes. This flow is about client viewing and accepting/rejecting quotes that have already been auto-sent.

---

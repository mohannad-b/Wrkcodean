### Flow 16: Client Signs Quote

**Trigger**: Client clicks "Approve Quote" in email or UI

**Flow Diagram**:
```
Client clicks "Approve Quote"
    ↓
Validate quote exists and is 'sent'
    ↓
Check client has permission (tenant matches)
    ↓
Check payment method on file:
    Query tenant billing config for:
        - customer_id (Stripe/Payment provider ID)
        - default_payment_method
    ↓
If no payment method on file:
    Redirect to payment provider (Stripe Checkout or Billing Portal)
    Client enters payment method
    On success: Store customer_id and default_payment_method
    ↓
Charge setup fee:
    Call payment provider API to charge setup_fee
    Create invoice record (or payable invoice)
    ↓
If payment fails:
    Return error, show payment failure message
    Send email to client (template: `payment_failed`)
    Quote remains 'sent' (not signed)
    ↓
If payment succeeds:
    Optionally apply credits:
        - Check for "free trial" or "first $X free" credits
        - Apply to credit_balance (if credit system exists)
        - Deduct from setup fee charge if applicable
    ↓
Update quote.status = 'signed'
    ↓
Update quote.signed_at = now()
    ↓
Update project.pricing_status = 'Signed'
    ↓
If automation_version.status = 'Awaiting Client Approval':
    If auto-build enabled:
        Update to 'Build in Progress'
        Trigger build workflow
    Else:
        Keep as 'Awaiting Client Approval' (manual build trigger)
    ↓
Create audit log entry
    ↓
Send notifications
    ↓
Return success
```

**API Endpoints**:
- `PATCH /v1/quotes/{id}/status` (status='signed')
- `POST /v1/quotes/{id}/payment-method` - Add/update payment method
- `POST /v1/quotes/{id}/charge-setup-fee` - Charge setup fee
- `GET /v1/quotes/{id}` - Get quote (client view)

**Database Changes**:
- Update tenant billing config (customer_id, default_payment_method) - if new payment method
- Create invoice record (setup_fee, status='paid') - if invoice table exists
- Update `quotes` (status='signed', signed_at=now())
- Update `projects` (pricing_status='Signed')
- Update `automation_versions` (status='Build in Progress' if auto-build)
- Insert into `audit_logs` (action_type='sign_quote', changes_json with payment info)

**Notifications**:
- **Email**: Quote signed confirmation to client (template: `quote_signed_client`, includes payment receipt)
- **Email**: Quote signed notification to ops team (template: `quote_signed_ops`)
- **Email**: Payment failed notification (template: `payment_failed`, if payment fails)
- **In-app**: Notification to ops team (build can start)
- **Slack** (optional): Quote signed alert to ops channel

**Exceptions**:
- **Quote not in 'sent' status**: Return 400
- **Quote already signed**: Return 409
- **Unauthorized tenant**: Return 403
- **Payment failed / card declined**: Return 402 Payment Required, quote remains 'sent', send email to client
- **Billing provider error**: Return 500, log error, alert ops, do NOT mark quote as signed
- **Quote expired** (optional): Return 400, request new quote

**Manual Intervention**: 
- Ops team may manually trigger build after quote signed (if auto-build disabled)
- Ops team reviews signed quote before starting build
- Ops team handles payment provider errors and may manually mark quote as signed if payment confirmed externally

---

### Flow 20: Billing Period Finalization

**Trigger**: Monthly billing cycle (scheduled job)

**Flow Diagram**:
```
Scheduled job runs (monthly, e.g., 1st of month)
    ↓
For each tenant:
    Calculate previous month totals:
        - Sum usage_aggregates (run_count * effective_unit_price)
        - Sum setup fees from signed quotes
        - Calculate total spend
    ↓
Create billing_period record (status='draft')
    ↓
Generate invoice PDF (optional)
    ↓
Send invoice email to client
    ↓
Update billing_period.status = 'finalized'
    ↓
Create audit log entry
    ↓
Send notifications
```

**API Endpoints**:
- `GET /v1/tenants/{tenantId}/billing-summary` - Get billing summary
- `POST /v1/admin/billing-periods/finalize` (admin only, manual trigger)
- `GET /v1/billing-periods/{id}/invoice` - Download invoice PDF

**Database Changes**:
- Insert into `billing_periods` (tenant_id, period_start, period_end, total_spend, setup_fees_collected, unit_costs, status='draft')
- Update `billing_periods` (status='finalized', finalized_at=now())
- Insert into `audit_logs` (action_type='finalize_billing')

**Notifications**:
- **Email**: Invoice sent to client (template: `invoice_sent`, includes PDF)
- **Email**: Billing summary to ops team (template: `billing_summary_ops`)

**Exceptions**:
- **No usage data**: Create billing period with $0 spend
- **Billing period already finalized**: Skip, log warning
- **Missing tenant data**: Skip, log error, alert ops

**Manual Intervention**: 
- Ops team reviews billing periods before finalization (optional approval step)
- Ops team can manually trigger finalization if needed

---

## Build & Deployment Flows

- **Concurrency note**: When the scheduled job and `POST /v1/admin/billing-periods/finalize` race for the same `{tenant_id, period_start, period_end}`, rely on the uniqueness constraint + single-transaction upsert. On uniqueness conflict, re-select the existing billing_period and apply the state machine above (finalize if `draft`, return `already_finalized=true` if `finalized`).
### Flow 20: Billing Period Finalization

**Trigger**: Monthly billing cycle (scheduled job) or manual admin trigger.

---

### Access & Auth

| Endpoint | Auth Requirements | Notes |
| --- | --- | --- |
| `GET /v1/tenants/{tenantId}/billing-summary` | JWT session | `tenantId` MUST match the authenticated tenant for normal client roles (replace or validate equality). Ops/admin roles (e.g., `ops_billing`, `admin`) may specify another tenant, but access remains tenant-scoped (no “all tenants” via this endpoint). |
| `POST /v1/admin/billing-periods/finalize` | JWT role ∈ {`ops_billing`,`admin`} | Payload must include `{ tenant_id, period_start, period_end }` (or canonical period identifier). Validate boundaries against the tenant’s billing anchor/frequency. Apply per-IP/per-user rate limiting. |
| `GET /v1/billing-periods/{id}/invoice` | JWT session | Client users may only fetch invoices where `billing_periods.tenant_id` equals their own tenant. Ops/admin may fetch any tenant’s invoice; all such access is audited. |

- `tenant_id` is always derived from the auth context by default; path/payload tenant parameters are only trusted when validated (e.g., for ops/admin overrides).  
- All queries filter by `(tenant_id, period_key/billing_period_id)` and join through tenant-owned tables to enforce isolation. This applies to every role, including ops/admin (cross-tenant reporting requires separate tooling, not these endpoints).  
- Customer API keys (`wrk_api_…`) are invalid for all billing-period endpoints (return 401/403).  
- Manual finalization POST is subject to rate limiting and auditing.

**Flow Diagram**:
```
Scheduled job runs (monthly, e.g., 1st of month)
    ↓
For each tenant:
    Aggregate rated charges for prior period:
        - Sum usage charges from pre-rated artifacts (usage_charges / invoice_line_items) that were already computed using the shared pricing engine / resolve_pricing_at in earlier flows; Flow 20 MUST NOT call the pricing engine or resolve_pricing_at itself
        - Sum setup-fee invoices (type='setup_fee', status='paid') dated within the period
        - Calculate total spend (aggregation only, no pricing-engine rerun)
    ↓
Within a DB transaction:
    - Create or update billing_period with computed totals
    - Ensure billing_period.status='finalized' by the end of the transaction (idempotent if already finalized)
    - Insert `finalize_billing` audit_log
    ↓
After commit:
    - Generate invoice PDF (if configured); log delivery status if it fails
    - Send invoice email to client + billing summary to ops
    - Any notification failure is non-fatal (billing_period remains finalized)
```

**API Endpoints**:
- `GET /v1/tenants/{tenantId}/billing-summary`
  - Returns summaries derived from `billing_periods` (and associated invoice line items).
  - For the current in-progress period, aggregates rated usage charges that have already been computed (no raw usage × price recompute).
- `POST /v1/admin/billing-periods/finalize` (admin trigger)
  - Payload: `{ tenant_id, period_start, period_end, force_recalculate? }`.
  - In v1, `force_recalculate` only triggers re-aggregation of existing rated artifacts (usage_charges / invoice_line_items) for the specified period; it does **not** rerun the pricing engine or resolve_pricing_at on raw usage.
  - Validates period boundaries against tenant billing anchors.
  - Idempotent with the scheduled job (see behavior below).
- `GET /v1/billing-periods/{id}/invoice`
  - Downloads the invoice PDF for that billing period (tenant-scoped access per Access & Auth).

**Database Changes**:
- `billing_periods`:
  - Columns include `{ tenant_id, period_start, period_end, total_spend, setup_fees_collected, usage_charges_total, status, finalized_at, created_at, updated_at }`.
  - Uniqueness constraint on `(tenant_id, period_start, period_end)` ensures idempotency.
  - State machine:
    - If no row exists → create a new billing_period with computed totals and `status='finalized'` in a single transaction.
    - If a row exists with `status='draft'` (created by other tooling) → update totals if necessary and transition it to `status='finalized'`.
    - If a row exists with `status='finalized'` → treat as idempotent (return 200 with `already_finalized=true`); do not create or modify additional rows.
- `audit_logs`:
  - Insert `finalize_billing` entry with metadata `{ tenant_id, period_start, period_end, total_spend, setup_fees_collected, usage_charges_total, finalized_by (user_id or system job id), triggered_by ('scheduled_job' | 'admin_manual') }`.

**Notifications**:
- **Email**: Invoice sent to client (template: `invoice_sent`, includes PDF)
- **Email**: Billing summary to ops team (template: `billing_summary_ops`)

**Exceptions**:
- **No rated usage data**: Create billing period with $0 spend (still finalize).
- **Billing period already finalized**: Treat as idempotent; return 200 with `already_finalized=true` and do not insert/update another row.
- **Missing tenant data / invalid period boundaries**: Return 400 `invalid_billing_period` or log error + alert ops, depending on context.

**Manual Intervention**: 
- Ops team reviews billing periods before finalization (optional approval step).
- Ops team can manually trigger finalization via `POST /v1/admin/billing-periods/finalize` (follows same idempotent workflow as the scheduled job).

---

## Build & Deployment Flows

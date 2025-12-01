### Flow 19: Pricing Override (Admin)

**Trigger**: Ops/admin user applies a pricing override for an automation_version outside the normal client-driven volume adjustment flow.

---

### Flow Overview

```
Ops/admin opens pricing override panel
    ↓
POST /v1/admin/automation-versions/{id}/pricing-overrides
    ↓
Validate auth, tenant isolation, rate limits
    ↓
Validate override payload (values, effective_date, period conflicts)
    ↓
Create pricing_override artifact (no direct billing mutations)
    ↓
Make override visible to resolve_pricing_at / billing engine
    ↓
Create audit log + notify stakeholders
    ↓
Return override record (or already_applied=true for duplicates)
```

GET requests allow ops/admin (and scoped tenant users) to view existing overrides without mutating state.

---

### Access & Auth

| Endpoint | Auth | Access Rules |
| --- | --- | --- |
| `POST /v1/admin/automation-versions/{id}/pricing-overrides` | JWT with role ∈ {`ops_pricing`, `admin`} | Tenant-scoped; payload-derived tenant IDs are ignored. Apply per-IP/per-user rate limiting. |
| `GET /v1/automation-versions/{id}/pricing-overrides` | JWT session | Tenant members see their own overrides (read-only, minimal fields). Ops/admin can view full override history for the same tenant and automation_version (still tenant-scoped). |

- `tenant_id` MUST be derived from the auth context.  
- All queries must filter by `(tenant_id, automation_version_id)` and join to `projects` to guarantee tenant isolation. This tenant scoping applies to **all** callers, including ops/admin roles; any cross-tenant reporting requires separate internal tooling, not this endpoint.  
- Customer API keys (`wrk_api_…`) are invalid for both endpoints (401/403).  
- For ops/admin POST requests, consider an additional `replace_existing=true` flag if future product requirements allow overriding an existing period (not implemented in v1).

---

### API Endpoints

- `POST /v1/admin/automation-versions/{id}/pricing-overrides`
  - Body example:
    ```json
    {
      "effective_date": "2025-04-01",
      "new_committed_volume": 45000,
      "new_effective_unit_price": "0.0120",
      "setup_fee_override": "500.00",
      "reason": "Enterprise uplift after contract renegotiation",
      "client_idempotency_key": "ops-override-2025-04"
    }
    ```
  - Behavior: validates payload, checks period conflicts, and records a pricing_override artifact that the billing engine will evaluate using the same “winning artifact” rule as Flow 17 (latest override with `effective_date <= period_start`, ordered by (`effective_date`, `created_at`)).

- `GET /v1/automation-versions/{id}/pricing-overrides`
  - Query params (optional): `effective_from`, `effective_to`, `limit`, `include_inactive`.
  - Returns overrides for the authenticated tenant/automation, respecting role (clients see limited fields, ops/admin see full metadata including created_by role).

Flow 19 never calls the billing provider directly; it appends artifacts that `resolve_pricing_at` and the billing engine already consume.

---

### Validation Rules

1. **Auth & tenant isolation**: see Access & Auth section.  
2. **Effective date**: required; defaults to next billing-period start if omitted. Must be ≥ current date and aligned with tenant billing anchors if policy requires.  
3. **Period dedupe**:
   - Compute `period_key = { billing_year, billing_month, billing_anchor_day }` using the tenant’s billing anchor and `effective_date`.
   - Allow at most one pending/active override per `(automation_version_id, period_key)` unless the incoming payload is an exact duplicate (idempotent). Otherwise return 409 `pending_volume_adjustment`. (Future work could add `replace_existing=true`.)
4. **Idempotency**: `(tenant_id, automation_version_id, client_idempotency_key)` scope. Exact duplicates return `200` with `already_applied=true`.
5. **Override values**:
   - `setup_fee_override`, `new_effective_unit_price`, `new_committed_volume` (when provided) must be ≥ 0 and use the tenant’s billing currency (no currency switching).
   - `new_committed_volume` must respect the same min/max, contractual minimum, and downgrade rules enforced by Flow 17 (reuse the same validation helpers if available).
   - Violations return `400 invalid_override_values` with field-level details.

---

### Database Changes

- `pricing_overrides` (new row per override):
  ```
  {
    automation_version_id,
    new_committed_volume?,          // optional
    new_effective_unit_price?,      // optional
    setup_fee_override?,            // optional
    effective_date (DATE),
    reason,
    created_by_user_id,
    created_by_role,
    created_via: 'admin_override',
    requires_ops_approval: false,
    client_idempotency_key?,
    period_key,                     // derived from billing anchor
    created_at
  }
  ```
  Billing resolves overrides using the same rule as Flow 17: for a given billing period, select the latest override where `effective_date <= period_start`, ordered by (`effective_date`, `created_at`). This record is consumed by `resolve_pricing_at` and downstream billing jobs; Flow 19 does not push updates directly to Stripe.

- `audit_logs`:
  - Insert `pricing_override` entry with metadata:
    ```
    {
      automation_version_id,
      tenant_id,
      old_pricing_snapshot,   // resolved via resolve_pricing_at before override
      new_pricing_snapshot,   // resolved immediately after override
      override_fields,        // what changed (volume, unit price, setup fee)
      effective_date,
      period_key,
      reason,
      created_by_user_id,
      created_by_role
    }
    ```
  - Capturing pre/post snapshots ensures ops can audit exactly how the override changed pricing.

---

### Notifications

- **Email / In-app** (optional, product-controlled):
  - Notify account managers / ops when a manual override is applied (`pricing_override_applied` template).
  - Client-facing notifications are limited to read-only surfaces (e.g., show upcoming override in billing UI).

---

### Exceptions

| Condition | Response |
| --- | --- |
| Auth role not in {`ops_pricing`,`admin`} for POST | 403 `forbidden` |
| Invalid override values (negative, wrong currency, fails policy) | 400 `invalid_override_values` |
| Conflicting override for same period (non-idempotent) | 409 `pending_volume_adjustment` |
| Exact duplicate (same payload + idempotency key) | 200 `already_applied=true` |
| Tenant/automation version not found | 404 `automation_version_not_found` |

Any other failures (e.g., pricing engine unavailable) should bubble as 500 `pricing_engine_error` with logs for ops follow-up.

---

### Manual Intervention

- Ops/admin users review overrides periodically to ensure they align with contracts.
- Replacing an existing override in the same period may require deleting/expiring the prior row (future enhancement).
- Overrides are high-trust operations; always audit and notify relevant stakeholders.

### Flow 17: Adjust Committed Volume / Plan Upgrade

**Trigger**: A client (or ops on behalf of a client) requests a change to the committed monthly volume or plan for an automation that is already commercially active.

---

### Scope & Relationship to Other Flows

Flow 17 provides **preview** and **change-order creation** for committed-volume adjustments. It owns:

- Read-only previews of “what if I change my commitment?” pricing.
- Creating the commercial artifact that represents the requested change:
  - **Default**: draft change-order quote that MUST be signed via Flow 16 before billing flips.
  - **Internal-only**: optional scheduled `pricing_overrides` for safe, low-touch contexts (ops tools, small self-serve upgrades under a feature flag).
- Tracking pending adjustments / preventing conflicting requests.
- Audit logging and notification fan-out.

Flow 17 explicitly **does not**:

- Modify historical invoices or previously signed quotes.
- Change pricing for active billing until the change-order quote is signed (or a whitelisted override reaches its effective date).
- Touch rejection/signing flows (Flows 15/16).

Flows 11/15/16 remain the source of truth for quote creation, rejection, and signing. Flow 13 continues to own automation lifecycle transitions that affect build states. All change-order quotes produced here set `quote_type='change_order'`, so Flow 16 enforces BAT (not AAA) when signing them and treats them as commercial-only events (no lifecycle updates).

---

### Pricing Engine & Billing Artifact Rules

- **Single pricing engine**: Flow 17 MUST call the same tiering/discount engine used in Flow 11 (pure library/service). Preview, change-order quote creation, and pricing overrides all invoke `price_plan = compute_pricing({ automation_version_id, new_committed_volume, effective_date })`, returning `unit_price`, `effective_unit_price`, and `estimated_monthly_spend`. Flow 17 MUST NOT reimplement pricing math inline.
- **resolve_pricing_at** helper: Both preview and POST MUST obtain “current” commitments via a shared helper `resolve_pricing_at(automation_version_id, target_effective_date)` that walks signed quotes + overrides (see below). This ensures the comparison baseline matches what billing will actually use when the change takes effect.
- **Winning artifact rule**: For any billing period, the active rate plan is the latest artifact meeting:
  1. `effective_date <= period_start`, ordered by (`effective_date`, `created_at`).
  2. Signed quotes supersede earlier ones via `change_order_of_quote_id`.
  3. If a `pricing_override` exists with an effective_date in the same period, it takes precedence over the base quote for that period only.
- **Billing engine contract**: The billing system, preview endpoints, and Flow 16 MUST all call the same `resolve_pricing_at` helper so invoices, usage rating, and previews agree. Pricing transitions are driven by `effective_date`, not `signed_at`; a change-order signed mid-period only applies once its effective_date is reached.
- Flow 17 never mutates existing signed quotes or overrides; it only appends new contenders that billing will naturally pick up using the rule above.

---

### Billing Active Triad (BAT) – Preconditions

Volume adjustments are only valid when the automation is already under an active commercial commitment. Flow 17 MUST enforce the **Billing Active Triad** on both preview and adjustment:

1. **Signed quote exists**: `resolve_pricing_at(automation_version_id, target_effective_date)` returns an active signed quote (not superseded/voided/expired).  
2. **Project is priced**: `projects.pricing_status='Signed'`. (Flow 17 ignores `project.status`; paused/live distinctions are captured via automation status.)  
3. **Automation version active for billing**: `automation_versions.status ∈ {'Ready for Build','Build in Progress','Live','Paused'}`. Flow 17 is explicitly disallowed when the status is in `{ 'Needs Pricing','Awaiting Client Approval','Retired','Archived' }`. New lifecycle states MUST opt-in to BAT before Flow 17 may run against them.

Failures return:

- No signed quote → `400 pricing_not_configured`.
- Project not priced → `409 project_not_priced`.
- Automation not in an active billing state → `409 automation_not_active_for_billing`.

No BAT, no preview or adjustment.

---

### Access, Auth, and Tenant Isolation

- Same auth surface as Flows 15/16: client JWT session or dedicated signed link tied to the project; ops/admin JWTs allowed for manual adjustments.
- `tenant_id` always derives from auth; payload-supplied tenant IDs are ignored.
- All queries filter by `(tenant_id, automation_version_id)` and join projects/quotes to ensure tenant isolation.
- Customer API keys (`wrk_api_…`) are not accepted here.
- Feature flags MAY restrict “immediate override” mode to ops/admin roles.

---

### Endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/v1/automation-versions/{id}/pricing-preview` | Pure read-only preview of a proposed committed volume / plan change. |
| `POST` | `/v1/automation-versions/{id}/volume-adjustment` | Create a change-order quote (default) or a scheduled pricing override (internal use). |

---

### GET `/v1/automation-versions/{id}/pricing-preview`

**Query parameters (all server-side validated):**
- `new_committed_volume` (integer, required).  
- `currency` (optional) – ONLY for display conversion; MUST equal the current billing currency or return `400 invalid_currency_override`. Flow 17 never changes the billing currency.  
- `effective_date` (optional; defaults to next billing-period start).  

**Validation order:**
1. Auth + tenant isolation; ensure caller has access to the project.
2. Enforce BAT.
3. Validate `new_committed_volume`:
   - Must be ≥ minimum-allowed and ≤ maximum-allowed volume.
   - Zero is only allowed when product explicitly supports “pause commitment” (feature flag).
4. Resolve “current” pricing using `resolve_pricing_at(automation_version_id, effective_date)` (i.e., whichever signed quote/override will be active when the proposed change takes effect) and derive new pricing via the shared Flow 11 engine.
5. Detect decrease scenarios and current usage:
   - If `new_committed_volume < current_committed_volume`, include warnings for downgrade penalties, notice periods, early-termination fees, or current usage exceeding the new cap.

**Response (JSON, client-safe):**
```
{
  "current": {
    "committed_volume": 10000,
    "effective_unit_price": "0.0200",
    "estimated_monthly_spend": "200.00"
  },
  "proposed": {
    "new_committed_volume": 30000,
    "new_effective_unit_price": "0.0150",
    "estimated_monthly_spend": "450.00",
    "effective_date": "2025-03-01"
  },
  "delta": {
    "monthly_spend_change": "250.00",
    "percentage_change": 125
  },
  "proration_info": {
    "supported": false
  },
  "warnings": [
    "volume_below_current_usage",
    "downgrade_requires_ops_approval"
  ]
}
```

Preview is strictly read-only: no DB writes, no billing calls.

---

### Execution Order for POST `/v1/automation-versions/{id}/volume-adjustment`

Implementations MUST follow this sequence:

1. **Auth + tenant isolation** – validate JWT/token, derive tenant_id, enforce project access (401/403 on failure).  
2. **Load context** – fetch automation_version, project, and the pricing baseline via `resolve_pricing_at`.  
3. **BAT enforcement** – ensure the Billing Active Triad holds; failures return the appropriate 4xx/409 and abort.  
4. **Request validation + concurrency hint** – check `new_committed_volume`, `effective_date`, `mode`, policy flags, and (if provided) `last_known_pricing_updated_at` against the latest signed quote/override snapshot. Mismatches return 409 `concurrency_conflict`.  
5. **Idempotency / pending dedupe** – evaluate `client_idempotency_key` and any existing change-order quotes/overrides for the same billing period; return `already_applied=true` or `409 pending_volume_adjustment` as appropriate.  
6. **Determine direction** – classify increase vs decrease, compute proposed pricing via the shared engine, and apply policy (ops approval, warnings, etc.).  
7. **Transactional artifact creation** – within a single DB transaction, create the draft change-order quote or pricing_override, insert audit logs, bump tracking tables, and enqueue notifications. Failures MUST roll back. Flow 17 does **not** call the billing provider; any incremental commitment charges are handled downstream once the change-order quote is signed and its effective_date is reached.

**Precedence rule**: BAT violations, policy failures, concurrency/idempotency conflicts, or expired quotes MUST short-circuit before artifacts are created. Flow 17 never returns payment-related errors because it does not interact with Stripe/billing providers directly.

---

### POST `/v1/automation-versions/{id}/volume-adjustment`

**Request body (conceptual):**
```
{
  "new_committed_volume": 30000,
  "effective_date": "2025-03-01T00:00:00Z",   // optional; defaults next billing cycle
  "mode": "change_order_quote",               // optional; defaults to change_order_quote for public API
  "client_idempotency_key": "voladj-2025-03",
  "notes": "Client wants to scale to new region"
}
```

- Optional headers/body fields:
  - `last_known_pricing_updated_at` (ISO timestamp) – caller’s view of the latest signed quote/override snapshot. Used for optimistic concurrency; mismatches return 409 `concurrency_conflict`.

**Idempotency & pending conflicts**

- Scope: `(tenant_id, automation_version_id, client_idempotency_key)`.  
- Duplicate handling:
  - If `{ new_committed_volume, normalized_effective_date, mode }` exactly matches the previously created artifact for that key, return `200` with `already_applied=true` plus the existing artifact payload.
  - If parameters differ, return `409 idempotency_conflict`.  
- Period dedupe:
  - Define `period_key = { billing_year, billing_month, billing_anchor_day }` computed from tenant billing settings + requested `effective_date`.
  - Allow at most one pending (unsent) change-order quote or scheduled override per `(automation_version_id, period_key)`.
  - If another adjustment exists for that period under a different key/params, return `409 pending_volume_adjustment` (unless it qualifies for the idempotent shortcut above).
- `last_known_pricing_updated_at` (when supplied) MUST match the `updated_at` of the latest signed quote/override returned by `resolve_pricing_at`; mismatches return `409 concurrency_conflict`.

**Validation / processing order:** Follow the Execution Order steps above; this section adds detail for steps 5‑9.

---

### Behavior – Increases vs. Decreases

#### Increases (`new_committed_volume > current`)
- Always recompute pricing via the shared engine and estimate incremental commitment for the next billing period (informational only; actual invoicing happens downstream once the change-order is signed and becomes effective).
- **Default (client-facing) path**:
  - Create a draft change-order quote (`quote_type='change_order'`) with `change_order_of_quote_id` pointing to the currently active signed quote, `setup_fee=0`, new commitment fields, and `effective_date`.
  - Response returns this draft; Flow 16 MUST sign it before billing config changes. Billing adopts the new commitment automatically on/after `effective_date`.
- **Immediate override (ops-only break-glass)**:
  - Allowed only when ALL are true: `mode='immediate_override'`, caller role ∈ {`ops_pricing`,`admin`}, feature flag `volume_immediate_override` enabled, and both `|delta_volume|` and `delta_amount` ≤ configured caps.
  - Creates a scheduled `pricing_overrides` row effective on `effective_date`; billing applies it automatically when the period arrives.
  - No direct provider charge occurs in Flow 17; any incremental revenue is captured by the billing engine once the override takes effect.

#### Decreases (`new_committed_volume < current`)
- **Effective date**: never earlier than the next billing-period start (enforced automatically).
- **Usage guard**:
  - If current-period usage > proposed commitment, accept the downgrade for the next period but include `warnings=['volume_below_current_usage']`; current period still bills at old terms.
  - If policy forbids lowering below current usage altogether, respond `400 volume_below_current_usage`.
- **Ops-approval default**:
  - Require ops approval (insert `requested_volume_adjustments`, return `202 Accepted`) when:
    - `new_committed_volume < contractual_min_volume`, or
    - `new_committed_volume < downgrade_usage_threshold * avg_usage_3_months` (default 0.5×).
- **Fulfillment**:
  - Default: draft change-order quote requiring Flow 16 signature.
  - Ops override: scheduled `pricing_overrides` (`reason='volume_downgrade'`, `requires_ops_approval=true`) only when feature-flagged for small self-serve downgrades.

---

### Change-Order Quote Contract with Flow 16

Every draft quote generated by Flow 17 MUST:

- Set `quote_type='change_order'` (or equivalent metadata) so Flow 16 can distinguish it from initial contracts.
- Populate `change_order_of_quote_id` with the currently active signed quote.
- Copy forward immutable pricing fields from the prior quote (currency, billing anchors, tenant metadata).
- Include `effective_date` indicating when the new commitment should begin.
- Encode `committed_volume`, `unit_price`, `effective_unit_price`, and any tier/discount metadata using the exact schema Flow 11 uses.

Flow 16, when signing a change-order quote:

- Enforces the Billing Active Triad (BAT) plus its own concurrency checks (quote/project/automation_version must still satisfy BAT).
- DOES NOT touch `projects.status` or `automation_versions.status` (those were already in `'Ready for Build'` or beyond); it only persists the new signed quote and billing metadata.
- Emits the usual `quote_signed` event with `quote_type='change_order'` so billing knows to evaluate the new artifact at the specified `effective_date`.

---

### Database Changes

| Table | Change |
| --- | --- |
| `quotes` | Insert draft change-order quote (`quote_type='change_order'`, `change_order_of_quote_id`, `automation_version_id`, `status='draft'`, `setup_fee=0`, `committed_volume`, `unit_price`, `effective_unit_price`, `effective_date`, `currency`, `created_by_user_id`, `created_via`). |
| `pricing_overrides` | Insert when immediate override path used: `{ automation_version_id, new_committed_volume, new_effective_unit_price, effective_date, reason, created_by_user_id, created_by_role, created_via, requires_ops_approval, client_idempotency_key?, period_key }`. Billing selects the latest override whose `effective_date <= billing_period_start`. |
| `requested_volume_adjustments` (optional helper table) | Store pending requests requiring ops approval with `{ automation_version_id, current_volume, requested_volume, effective_date, period_key, mode, requires_ops_approval, status, client_idempotency_key, created_by_user_id, created_via }`. |
| `audit_logs` | `action_type='volume_adjustment'`, metadata includes `{ old_volume, new_volume, mode, effective_date, is_increase, payment_action, change_order_quote_id?, pricing_override_id?, preview_snapshot }`. |

Flow 17 itself does **not** update existing signed quotes, invoices, or billing configs; it only creates new artifacts that downstream billing evaluates once activated.

---

### Notifications & Manual Intervention

- **Email / In-app**:
  - `volume_adjustment_submitted` (client + ops) with summary and next steps (e.g., “Sign the change-order quote”).
  - `volume_decrease_warning` when downgrade requires ops review or current usage exceeds new commitment.
  - `volume_adjustment_pending_ops` when `requires_ops_approval=true`.
- **Manual approval hooks**:
  - Large increases (e.g., >20% growth or >$X delta) insert `requested_volume_adjustment` rows with `status='pending_ops_approval'` and notify ops. Endpoint returns `202 Accepted` until ops approve.
  - Downgrades below contractual minimum or recent usage also require ops approval; Flow 17 responds with `202` and includes `requires_ops_approval=true` in the payload.

Notifications MUST be enqueued after DB commits and be idempotent.

---

### Exceptions & Error Codes

| Condition | Response |
| --- | --- |
| Missing/invalid auth or tenant mismatch | 401 `unauthorized` / 403 `forbidden` |
| Automation version not found for tenant | 404 `automation_version_not_found` |
| `new_committed_volume` invalid (non-positive, outside thresholds) | 400 `invalid_volume_value` |
| No signed quote / pricing for automation | 400 `pricing_not_configured` |
| New volume < current usage (downgrade policy violation) | 400 `volume_below_current_usage` |
| Project not priced (`pricing_status!='Signed'`) | 409 `project_not_priced` |
| Automation version not active for billing | 409 `automation_not_active_for_billing` |
| Conflicting pending change (quote or override) | 409 `pending_volume_adjustment` |
| Pricing snapshot mismatch (`last_known_pricing_updated_at`) | 409 `concurrency_conflict` |

All responses MUST use the canonical `{ error_code, message, details? }` schema and MUST leave state untouched on non-2xx outcomes.

---

### Summary Flow (Client-Facing Happy Path)

1. Client hits preview endpoint → sees pricing deltas, warnings.  
2. Client submits POST with new volume → server validates BAT, volume, dedupes pending requests.  
3. System creates draft change-order quote and returns it.  
4. Client signs via Flow 16 → Flow 16 emits `quote_signed`, billing picks up new commitment for future periods.  
5. Notifications/audit logs document the change; ops is alerted if thresholds exceeded.

This keeps all commercial commitments consistent with the hardened quote/sign flows while still offering a safe preview + request surface for clients.

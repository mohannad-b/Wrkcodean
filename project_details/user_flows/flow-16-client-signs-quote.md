### Flow 16: Client Signs Quote

**Trigger**: A client approves a quote from the workspace UI or via a dedicated signing link delivered by email.

> **Scope**: Flow 16 owns the signing step, setup-fee charging, and the downstream status transitions that move the quote/project/automation into post-signing states. It MUST enforce the applicable triad (AAA or BAT based on `quote_type`) before any write and MUST leave pricing edits (Flows 11/14) and rejections (Flow 15) untouched. Flow 16 introduces its own signing tokens; Flow 15 view/reject tokens are never valid for signing.

---

### Actionable Preconditions by Quote Type

#### Initial commitment quotes (Flow 11/12 output)
- Must satisfy the classic **AAA triad**:
  1. `quote.status = 'sent'`
  2. `project.status = 'Awaiting Client Approval'`
  3. `automation_versions.status = 'Awaiting Client Approval'`

#### Change-order quotes (Flow 17 output)
- Must satisfy the **Billing Active Triad (BAT)**:
  1. `quote.status = 'sent'`
  2. `projects.pricing_status = 'Signed'` (project lifecycle may already be `Ready for Build` / `Live` / `Paused`)
  3. `automation_versions.status ∈ {'Ready for Build','Build in Progress','Live','Paused'}` (billing-active states)

Flow 16 enforces AAA for `quote_type='initial_commitment'` and BAT for `quote_type='change_order'`. These triads are evaluated only when the quote is actionable (`quote.status='sent'`) and the idempotent shortcut does **not** short-circuit. If the required triad fails, Flow 16 MUST return the relevant 409 error and MUST NOT mutate state or attempt billing.

#### Required pre-billing sequence
Before any payment-method lookup, billing call, or state mutation, the implementation MUST execute the following steps (mirrors Execution Order steps 1‑5):
1. Authenticate the caller and derive `tenant_id` (JWT or signing token); reject invalid/expired auth (401/403).
2. Load `quote`, `project`, and `automation_version` rows for that `(tenant_id, quote_id)`.
3. Apply the **idempotent shortcut** if the quote is already signed and a qualifying setup-fee invoice/charge (see Execution Order) exists; when it triggers, return `200 already_applied=true` and stop. Otherwise continue.
4. Enforce the appropriate triad based on `quote_type` (AAA for `initial_commitment`, BAT for `change_order`) **and** ensure `quote.expires_at >= now()`; failures return the matching 409/400 and short-circuit (no billing attempts).
5. Enforce optimistic concurrency (`last_known_updated_at` / `If-Match`). Conflicts return 409 `concurrency_conflict`.
6. Only if steps 1‑5 succeed MAY the server continue to payment-method discovery, billing provider calls, and transactional updates.

---

### Access & Auth Model

| Path | Auth Mode | Requirements | Notes |
| --- | --- | --- | --- |
| In-app signing | Client JWT | Tenant membership, quote recipient access, optional billing-standing check | CTA appears in workspace UI. |
| Email signing link | Dedicated signing token (HMAC) | Token embeds `quote_id`, `tenant_id`, expiry, environment, optional passcode | Token scope = view + sign; MUST be revocable when quote is replaced/voided/signed; MUST NOT reuse Flow 15 token format. |
| Ops preview | JWT (`ops_pricing`/`admin`) | Feature-flagged “sign on behalf” support; otherwise read-only mirroring | Any on-behalf signing MUST be explicitly audited. |

- `tenant_id` is always derived from auth context; requests MUST ignore tenant_id in payloads.  
- All reads/writes filter by `(tenant_id, quote_id)` and join to project + automation_version to guarantee tenant consistency.  
- Customer API keys (`wrk_api_…`) are invalid here (401/403).  
- Signing tokens MUST be environment-scoped, revocable, and short-lived. Flow 16 logs IP/user-agent/channel for compliance.  
- **Post-sign revocation rules**:
  - All Flow 16 signing tokens for a `(tenant_id, quote_id)` MUST be revoked after a successful sign (they become invalid for both GET and PATCH). These tokens MUST fail at the auth layer (401/403) and MUST NOT reach the shared `/status` router after revocation; issue read-only tokens or require workspace auth for post-sign views.  
  - Flow 15 view/reject tokens MUST degrade to read-only after signing: they may still `GET /v1/quotes/{id}` but any PATCH (reject/sign) MUST route to Flow 15 and return 409 `invalid_quote_status` because the quote is no longer `sent`.

---

### Execution Order for Flow 16 (`PATCH /v1/quotes/{id}/status`, `status='signed'`)

Implementations MUST follow this sequence and MUST NOT invoke the billing provider until steps 1‑5 fully succeed:

1. **Auth + tenant isolation** – validate JWT/token, derive tenant_id, enforce project access; return 401/403 on failure. Apply per-IP / per-token rate limiting on this endpoint to mitigate brute-force attempts against signing tokens.  
2. **Load quote + project + automation_version** for that tenant.  
3. **Idempotent shortcut (pre-billing)** – if the quote is already signed and a successful setup-fee charge/invoice is recorded AND (`last_known_updated_at` absent OR matches `quotes.updated_at`), return `200 already_applied=true` and exit (this is the only case where a non-`sent` quote returns 200 rather than 409).  
4. **Triad + expiry enforcement** – choose the gating model based on `quote_type`:
   - `initial_commitment` → enforce the full AAA triad (`quote.status='sent'`, `projects.status='Awaiting Client Approval'`, `automation_versions.status='Awaiting Client Approval'`).  
   - `change_order` → enforce the full BAT triad (`quote.status='sent'`, `projects.pricing_status='Signed'`, `automation_versions.status ∈ {'Ready for Build','Build in Progress','Live','Paused'}`).  
   All quotes MUST also satisfy `quote.expires_at ≥ now`. Failures return the relevant 409 (or 400 `quote_expired`) and stop processing.  
5. **Optimistic concurrency** – compare `last_known_updated_at` (or `If-Match`) to `quotes.updated_at`; mismatch returns 409 `concurrency_conflict`.  
6. **Payment-method discovery** – ensure usable payment method / credit; lacking method → 402 `payment_method_required`.  
7. **Billing provider call** – charge setup fee (or apply credits) using provider idempotency key `wrk:tenant:{tenant_id}:quote:{quote_id}:setup_fee:v1`.  
8. **Signing transaction** – run the all-or-nothing DB transaction (see details below), including a second idempotent check after re-selecting rows.  

Rule of precedence: **state/AAA/concurrency errors always beat billing errors**. If steps 3‑5 fail, return the corresponding 4xx and suppress billing responses (only log provider outcomes). Clients should never see `payment_failed` for a quote that is no longer signable.

> **Recorded setup-fee charge/invoice**: both idempotent shortcuts (steps 3 and the transactional shortcut) rely on the presence of an `invoices` (or equivalent ledger) row with `type='setup_fee'`, `quote_id`, `status='paid'`, and a `provider_charge_id` derived from the active provider idempotency key. Only when that record exists may the implementation treat the request as already applied. Quotes with `setup_fee=0` still run the full signing transaction (steps 8‑9) even though no invoice row is inserted.

---

### High-Level Flow

```
Client opens quote (JWT or signing token)
    ↓
GET /v1/quotes/{id} renders quote & signing UI
    ↓
Collect/confirm payment method if needed
    ↓
Client triggers signing → PATCH /v1/quotes/{id}/status (status='signed')
    ↓
Backend:
    - Validate auth + applicable triad (AAA or BAT) + concurrency
    - Ensure usable payment method / collect one
    - Charge setup_fee (Stripe/etc) with provider idempotency key
    - Transaction: update quote, project, automation_version, invoices, audit logs
    ↓
Emit quote_signed event + notifications after commit
    ↓
Return updated quote (status='signed') or billing error
```

---

### Detailed Steps

#### 1. Quote Load & Triad Check
- `SELECT quotes WHERE id=:id AND tenant_id=:tenant` joining `projects` + `automation_versions`.  
- If the pre-billing idempotent shortcut already fired, triad enforcement is skipped and Flow 16 has already returned `200 already_applied=true`. Otherwise:
  - For `quote_type='initial_commitment'`, enforce AAA:
    - Quote not `sent` → 409 `invalid_quote_status`.
    - Project not `'Awaiting Client Approval'` → 409 `project_not_editable`.
    - Automation version not `'Awaiting Client Approval'` → 409 `invalid_status_transition`.
  - For `quote_type='change_order'`, enforce BAT:
    - Quote not `sent` → 409 `invalid_quote_status`.
    - `projects.pricing_status!='Signed'` → 409 `project_not_priced`.
    - `automation_versions.status` not in `{Ready for Build, Build in Progress, Live, Paused}` → 409 `automation_not_active_for_billing` (or `invalid_status_transition` if the state is otherwise inconsistent).
- No billing/signing happens if the applicable triad fails.

#### 2. Payment Method Handling
- Read tenant billing config (provider, customer_id, default_payment_method, credit balance).  
- If no usable payment method exists, return 402 `payment_method_required` with remediation instructions (e.g., redirect_url to Checkout/Billing Portal, setup-intent params).  
- `payment_method_id` / `provider_customer_id` hints supplied in the body are treated as advisory only—the server MUST verify they belong to the same billing provider + customer as the tenant’s stored configuration and reject mismatches with 402 `payment_method_required` (or 403 if tampering is suspected).  
- Collecting a payment method MUST NOT mark the quote signed; only PATCH drives signing.

#### 3. Charge Setup Fee
- Compute `payable_amount = max(setup_fee - credit_balance, 0)` and adjust credit balance when recording invoices.  
- Use a provider idempotency key of the exact form `wrk:tenant:{tenant_id}:quote:{quote_id}:setup_fee:v1` so retries cannot double charge.  
- If `payable_amount > 0`, charge via provider using customer_id + default payment method.  
- Record or update internal invoice row (type `setup_fee`, provider_charge_id/invoice_id, status `paid`/`failed`).  
- Errors:
  - Provider decline → 402 `payment_failed`, quote stays `sent`, send notifications.  
  - Provider/system error → 500 `billing_provider_error`, no state change, alert ops.

#### 4. Signing Transaction (All or Nothing)
After a successful (or zero-amount) charge, run a DB transaction:
1. Re-select `quotes`, `projects`, and `automation_versions` **FOR UPDATE**.  
2. **Transactional idempotent shortcut**: If the reloaded quote already has `status='signed'` and the successful setup-fee charge/invoice recorded in step 7 is linked to it, treat the request as applied—return `200 already_applied=true` (no additional writes). This covers concurrent signers where one transaction won the race and is the only post-charge scenario where a non-`sent` quote can yield 200 instead of 409.  
3. Revalidate the applicable triad (AAA for `initial_commitment`, BAT for `change_order`) plus concurrency (guard against races with Flow 15 / other ops). Any mismatch MUST roll back and return the appropriate 409; captured payments are handled via ops follow-up.  
4. `quotes`: set `status='signed'`, `signed_at=now()`, `updated_at=now()`, persist billing metadata (provider/customer IDs, channel).  
5. `projects`:  
   - Always ensure `pricing_status='Signed'`.  
   - For `quote_type='initial_commitment'`: move `projects.status` from `'Awaiting Client Approval'` to `'Ready for Build'` (signed but awaiting build) by default, or to `'In Build'` **only** when auto-build is enabled and the build job is enqueued.  
   - For `quote_type='change_order'`: leave `projects.status` unchanged.  
6. `automation_versions`:  
   - For `quote_type='initial_commitment'`:
     - If auto-build enabled → `status='Build in Progress'`, set `build_started_at` + enqueue job.  
     - If auto-build disabled → set `status='Ready for Build'` (never leave it at `'Awaiting Client Approval'` once signed). Flow 13 later owns `Ready for Build → Build in Progress`.  
   - For `quote_type='change_order'`: do **not** change `automation_versions.status`.  
7. `invoices` (optional) → finalize/setup-fee invoice (status `paid`).  
8. `audit_logs`: insert `sign_quote` entry capturing actor (user_id or token_id), channel (`in_app` / `email_link`), pre/post states for quote/project/automation_version, billing references (`setup_fee_amount`, `currency`, `credit_applied`, `payable_amount`, `provider`, `provider_charge_id`/`invoice_id`), automation_version_id, project_id, `auto_build_enabled`.  
9. Commit; any failure MUST roll back all state changes.

---

### State Ownership After Signing

- **Flow 16** is the only flow allowed to move:
  - `projects.status`: `'Awaiting Client Approval'` → `'Ready for Build'` (or `'In Build'` when auto-build is immediately triggered).
  - `automation_versions.status`: `'Awaiting Client Approval'` → `'Ready for Build'` (or `'Build in Progress'` when auto-build fires).
- **Flow 13** owns every transition *after* `'Ready for Build'` (e.g., `Ready for Build → Build in Progress → QA → Live/Paused`). Flow 16 MUST NOT advance any state beyond the initial post-signing move.

#### Quote Types and Lifecycle Effects

- `quotes.quote_type` distinguishes **initial commitments** (created by Flows 11/12) from **change-order** quotes (created by Flow 17 for volume/plan adjustments).  
- When Flow 16 signs a quote with `quote_type='initial_commitment'`, it performs the lifecycle transitions described above (project/automation move out of `'Awaiting Client Approval'`; see Database Changes).  
- When Flow 16 signs a quote with `quote_type='change_order'`, it MUST treat the action as **commercial-only**: no project/automation status changes occur, only billing metadata + invoices + events are written (see Database Changes).  
- Flow 16 MUST NOT move any project/automation back into `'Needs Pricing'` or `'Awaiting Client Approval'`, nor move forward out of `'Ready for Build'` once the initial commitment is complete; those transitions remain the domain of Flow 13.

---

### Shared Router for `PATCH /v1/quotes/{id}/status`

The shared quote-status endpoint MUST dispatch purely by the requested status:

| `body.status` | Owning flow | Behavior |
| --- | --- | --- |
| `"rejected"` | Flow 15 | Client rejection (view/reject tokens only). |
| `"signed"` | Flow 16 | Client signing + setup-fee charge. |
| anything else | — | Return `409 invalid_quote_status`. |

Router rules:

- NEVER run both flows in one request; once dispatched, the sibling flow MUST NOT execute.
- Each flow re-validates auth/AAA/tenant state; router only decides which flow sees the request.
- Both flows enforce quote expiry (`quote.expires_at < now()` → 400 `quote_expired`) before any state/billing changes, so expired quotes are non-actionable for both rejection and signing.

---

### API Endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/v1/quotes/{id}` | Same client-safe JSON as Flow 15; used for signing UI. |
| `POST` | `/v1/quotes/{id}/payment-method` | (Optional) persist billing provider references prior to signing. |
| `POST` | `/v1/quotes/{id}/charge-setup-fee` | (Optional) manual charge endpoint if product uses multi-step UX. |
| `PATCH` | `/v1/quotes/{id}/status` | With `status='signed'`; canonical signing endpoint (Flow 16). |

#### PATCH `/v1/quotes/{id}/status` (status='signed')
- **Auth**: Client JWT or dedicated signing token; API keys rejected.  
- **Authorization**: Client must be a recognized quote recipient/workspace member. Ops “sign on behalf” requires explicit feature flag + audit logging.  
- **Routing contract**: Flow 15 is the sole owner of `{"status":"rejected"}`; Flow 16 is the sole owner of `{"status":"signed"}`. Any other status value MUST return 409 `invalid_quote_status`. Routing MUST key off the requested status and MUST NOT attempt to execute both flows in one request.  
- **Body** (example):
  ```json
  {
    "status": "signed",
    "last_known_updated_at": "2025-02-18T10:45:00Z",
    "payment_method_id": "pm_123",          // optional override (must belong to the tenant’s billing customer)
    "provider_customer_id": "cus_abc",      // optional override (must match tenant billing config)
    "signature_metadata": {
      "ip": "203.0.113.4",
      "user_agent": "Mozilla/5.0",
      "channel": "in_app"
    }
  }
  ```
- The backend must ignore or reject overrides that do not match the tenant’s canonical billing configuration; client-supplied IDs are never treated as authoritative.
- **Processing order**: MUST follow the Execution Order steps above (1‑8). Implementations MAY reference that section instead of duplicating logic.  
- **Validation**:
  - Reject any status other than `'signed'` → 409 `invalid_quote_status`.  
  - Enforce the appropriate triad: AAA for `quote_type='initial_commitment'`, BAT for `quote_type='change_order'` (definitions above).  
  - Enforce concurrency (compare `last_known_updated_at` to `quotes.updated_at`).  
  - Ensure `setup_fee` is ≥ 0, currency defined, and client has access.  
  - Ensure a usable payment method exists; otherwise 402 `payment_method_required`.  
- **Behavior**:
  - Handle payment-method collection if needed; fail fast (402) if none available.  
  - Charge setup fee / apply credits; on decline, respond 402 (`payment_failed`) and leave quote `sent`.  
  - On successful payment, run signing transaction and return updated quote JSON.  
- **Responses**:
  - 200 OK with signed quote (or `{ "already_applied": true, "quote": ... }` for the idempotent shortcut).  
  - 402 (`payment_failed`, `payment_method_required`) with remediation hints (e.g., redirect_url).  
  - 409 (`invalid_quote_status`, `project_not_editable`, `invalid_status_transition`, `concurrency_conflict`).  
  - 401/403 for auth failures; 500 `billing_provider_error` for provider outages.

---

### Database Changes

| Table | Change |
| --- | --- |
| `quotes` | `status='signed'`, `signed_at`, `updated_at`, billing metadata (`provider`, `provider_charge_id`, `channel`). |
| `projects` | For `quote_type='initial_commitment'`: move `projects.status` from `'Awaiting Client Approval'` to `'Ready for Build'` (or `'In Build'` if auto-build fires) and set `pricing_status='Signed'`. For `quote_type='change_order'`: leave `projects.status` unchanged (remain in current lifecycle stage) and keep `pricing_status='Signed'`. |
| `automation_versions` | For `quote_type='initial_commitment'`: auto-build enabled → `'Build in Progress'` (set `build_started_at`, enqueue job); auto-build disabled → `'Ready for Build'` (never leave `'Awaiting Client Approval'` once signed; Flow 13 advances it later). For `quote_type='change_order'`: do **not** change `automation_versions.status`. |
| `invoices` (optional) | Insert/update setup-fee invoice tied to quote/project/tenant with provider IDs and `status='paid'`. |
| `audit_logs` | Insert `sign_quote` entry capturing actor (user_id/token_id), channel (`in_app`/`email_link`), pre/post states for quote/project/automation_version, setup_fee_amount, currency, credit_applied, payable_amount, provider + charge/invoice IDs, automation_version_id, project_id, auto_build flag. |

Signing MUST NOT modify pricing, create/delete quotes, or alter automation metadata beyond these transitions. For change-order quotes, Flow 16’s writes are limited to `quotes`, optional `invoices`, `audit_logs`, and events—no lifecycle state changes.

---

### Notifications & Events

- Emit `quote_signed` on topic `quotes.lifecycle` with payload { tenant_id, quote_id, project_id, automation_version_id, signed_at, setup_fee_amount, currency, provider, provider_charge_id, auto_build_enabled, channel }.  
- Email:
  - `quote_signed_client` (confirmation + receipt).  
  - `quote_signed_ops` (client/project summary, auto-build flag, deep links).  
  - `payment_failed` (if charge declined).  
- In-app:
  - Ops/build notification (“Quote signed—build can start / auto-build triggered”).  
  - Client confirmation banner with link to track build status.  
- Slack/alerts (optional):
  - Ops or sales channels with signed quote metadata.  

All notifications MUST enqueue after commit and be idempotent.

---

### Exceptions

| Condition | Response |
| --- | --- |
| No valid session / signing token | 401 `unauthorized` |
| Client lacks access | 403 `forbidden` |
| Quote not found for `(id, tenant_id)` | 404 `not_found` |
| Quote status not `sent` (or non-idempotent duplicate\*) | 409 `invalid_quote_status` |
| Project not `Awaiting Client Approval` | 409 `project_not_editable` |
| Automation_version state invalid/misaligned | 409 `invalid_status_transition` |
| Optimistic concurrency mismatch | 409 `concurrency_conflict` |
| Missing payment method | 402 `payment_method_required` |
| Payment declined | 402 `payment_failed` |
| Billing provider error | 500 `billing_provider_error` |
| Quote expired (feature-flag) | 400 `quote_expired` |

*\*If the idempotent shortcut detects that the quote is already signed and a matching paid setup-fee invoice exists (Execution Order step 3 or the transactional shortcut), Flow 16 returns `200 already_applied=true` instead of 409.*

Responses MUST use the canonical `{ error_code, message, details? }` format.

---

### Manual Intervention & Safety Notes

- Ops console should surface signed quotes, invoices, and ability to trigger build manually when auto-build is off.  
- Admin-only tooling may mark a quote as signed when payment succeeded externally but Flow 16 failed; all such actions MUST be audited.  
- Provider idempotency + AAA + concurrency checks prevent double signing or double charges; concurrent signing attempts should yield a clean 409 for all but the first.  
- Signing tokens must be environment-scoped, revocable, and short-lived; log IP/user-agent/channel for compliance (SOC2, PCI).  
- Payment errors should alert ops so they can follow up with the client quickly.

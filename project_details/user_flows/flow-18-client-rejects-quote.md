### Flow 18: Client Rejects Quote

**Scope**: Flow 18 owns the `{"status":"rejected"}` branch of the shared `PATCH /v1/quotes/{id}/status` router. When a rejection request arrives, Flow 18 validates auth + tenant isolation, enforces expiry rules, and updates quote/project/automation rows only when the rejected quote was the initial commitment (change-order rejections never mutate lifecycle state). Flow 18 never edits pricing fields and never touches signing logic (Flow 16 remains the only owner of `{"status":"signed"}`).

**Trigger**: Client clicks "Reject Quote" (CTA in-app) or follows a reject link in the quote email.

---

### Access & Auth

- **Auth modes**:
  - Client JWT session (workspace access).
  - Dedicated view/reject token (HMAC) scoped to `{ tenant_id, quote_id }` (tokens MUST be revocable when the quote signs/voids).
- `tenant_id` MUST come from the auth context; payload-supplied tenant IDs are ignored.
- All reads/writes filter by `(tenant_id, quote_id)` and join to `projects` + `automation_versions` to guarantee tenant isolation.
- Apply per-IP / per-token rate limiting on `PATCH /v1/quotes/{id}/status (status='rejected')` to mitigate brute-force attempts on reject tokens.
- Customer API keys (`wrk_api_…`) are invalid here (return 401/403).

---

**Flow Diagram (textual)**:
```
Client clicks "Reject Quote" (CTA or email link, optional feedback)
    ↓
PATCH /v1/quotes/{id}/status body={status:'rejected', rejection_reason:?}
    ↓
Shared router → Flow 18 (status='rejected'); validate auth + tenant + rate limits
    ↓
Validate quote is actionable:
    - quote.status must be 'sent' (unless idempotent shortcut hits)
    - for `quote_type='initial_commitment'`, ensure the quote/project/automation are still in their expected approval states so lifecycle can safely revert
    - quote.expires_at >= now()
    ↓
If quote_type='initial_commitment':
    - Update quotes.status='rejected', set rejection_reason, updated_at=now()
    - If projects.status='Awaiting Client Approval': set projects.pricing_status='Needs Pricing' (and optionally move projects.status back to the pre-approval state used elsewhere)
    - If automation_versions.status='Awaiting Client Approval': set automation_versions.status='Needs Pricing'
Else (quote_type='change_order'):
    - Update only the quote row (status/reason); leave project & automation lifecycle untouched
    ↓
Create audit log entry (reject_quote) + persist feedback
    ↓
Emit notifications (client + ops), surface task for ops follow-up
    ↓
Return 200 with updated quote (or already_applied=true for idempotent repeats)
```

**API Endpoint**

- `PATCH /v1/quotes/{id}/status` with body:
  ```json
  {
    "status": "rejected",
    "rejection_reason": "Budget mismatch / scope change"
  }
  ```
- The shared router inspects `status`; `status='rejected'` routes exclusively to Flow 18. Any other value returns 409 `invalid_quote_status`.
  - `rejection_reason` SHOULD be provided (trimmed, max 1000 chars). Unknown fields are ignored.

**Database Changes**:

- `quotes`: set `status='rejected'`, `rejection_reason`, `updated_at=now()` (idempotent shortcut returns the existing record without re-writing).
- `projects`:
  - For `quote_type='initial_commitment'`: ensure `pricing_status` reverts to the pre-approval state used elsewhere (e.g., `'Needs Pricing'`). If `projects.status='Awaiting Client Approval'`, optionally move it back to that same pre-approval lifecycle stage; do **not** introduce new ad-hoc statuses.
  - For `quote_type='change_order'`: leave both `pricing_status` and `status` unchanged (automation stays commercially active).
- `automation_versions`:
  - For `quote_type='initial_commitment'`: if `automation_versions.status='Awaiting Client Approval'`, set it to `'Needs Pricing'`.
  - For `quote_type='change_order'`: no change (remain `Ready for Build` / `Live` / etc.).
- `audit_logs`: insert `reject_quote` entry capturing `{ quote_id, project_id, automation_version_id, tenant_id, actor (user_id/token_id), rejection_reason, quote_type }`.

**Notifications**:
- **Email**: Quote rejected notification to ops team (template: `quote_rejected`, includes client feedback)
- **Email**: Rejection confirmation to client (template: `quote_rejected_client`)
- **In-app**: Notification to ops team (needs new quote)

**Exceptions & Idempotency**:

- If `quote.status='rejected'` and `rejection_reason` matches the stored value (same tenant/quote), treat as idempotent → return `200` with `{ already_applied: true, quote: … }`.
- If `quote.status != 'sent'` for any other reason (`'signed'`, `'expired'`, `'void'`, etc.) → return `409 invalid_quote_status`.
- If `quote.expires_at < now()` → return `400 quote_expired` (no state change).
- Standard errors:
  - Missing/invalid auth → 401/403.
  - Quote not found for `(tenant_id, id)` → 404 `not_found`.
  - Optimistic concurrency mismatch (if using `If-Match`/`last_known_updated_at`) → 409 `concurrency_conflict`.

**Manual Intervention**: 
- Ops team reviews rejection reason and creates new quote with adjusted pricing
- Ops team may contact client to discuss pricing

---

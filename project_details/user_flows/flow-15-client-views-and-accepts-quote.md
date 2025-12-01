### Flow 15: Client Views and Accepts Quote

**Trigger**: A client (workspace member or guest recipient) opens a quote that Flow 11 already created and sent. The client reviews pricing, optionally downloads the PDF, and either proceeds to signing (Flow 16) or rejects / requests changes.

> **Scope**: Flow 15 covers client-side viewing, download, and rejection of existing quotes (`status='sent'`). It MUST NOT create or edit quotes (Flow 11/14), MUST NOT mark quotes `signed`/`void` (Flow 16 does), and MUST NOT change automation/project associations outside of the documented rejection rollback. Flow 15 MAY change `automation_versions.status` **and** `projects.status` only for the transition `'Awaiting Client Approval' → 'Needs Pricing'` when a client rejects a quote; all other automation status transitions remain owned by Flows 11 and 13. Flow 15 MUST NOT move an automation version out of `Needs Pricing` or into build/QA/launch statuses—those transitions remain exclusive to Flows 11 and 13. All access is read-only unless the client submits a rejection with feedback.

---

### Quote Access Model

| Access Path | Auth Mode | Permissions | Notes |
| --- | --- | --- | --- |
| In-app (client workspace) | JWT session | Tenant membership + project access (e.g., workspace role `client_user`) | Follows auth middleware from Flows 1–7. |
| Secure email link | Signed quote access token (HMAC) | Token must embed `quote_id`, `tenant_id`, expiry, optional passcode requirement | Tokens are scoped to view + reject only (no signing), must be environment-specific, and MUST auto-revoke if the quote becomes `signed`, `void`, or is replaced. |
| Ops preview | JWT session with `ops_pricing`/`admin` | Same as Flow 14 read path | Used by support/ops when mirroring the client view. |

Quote tokens MUST be single-use or time-bound per product config and MUST revoke cleanly if a quote is replaced, voided, or signed. Flow 16 defines and validates its own signing authentication (session and/or signature token); Flow 15 quote-view tokens MUST NOT be accepted for signing.

---

### Flow Diagram (High-Level)

```
Client opens quote (JWT session or signed link)
    ↓
GET /v1/quotes/{id} (or /pdf) → auth, tenant/token validation
    ↓
Load quote + project (status must allow viewing)
    ↓
Render pricing + CTA buttons:
    - Proceed to Sign (calls Flow 16)
    - Reject / Request Changes (Flow 15 PATCH)
    ↓
If Reject:
    - Client submits PATCH /v1/quotes/{id}/status (status='rejected', reason)
    - Backend validates AAA triad + concurrency (idempotent shortcut first)
    - Transaction: update quote, roll back automation_version & project, insert audit log
    - Post-commit: notify ops/client, emit events
    ↓
Return updated quote payload / confirmation
```

---

### Detailed Steps

#### 1. Entry Points
- `GET /v1/quotes/{id}` — JSON endpoint powering UI and guest views.  
- `GET /v1/quotes/{id}/pdf` — PDF download (same auth gates).  
- `PATCH /v1/quotes/{id}/status` — client rejection endpoint (Flow 15 only accepts `status='rejected'`; `status='signed'` belongs to Flow 16).

#### 2. Auth & Tenant Isolation
- JWT sessions: global middleware enforces valid session, active membership, active tenant.  
- Signed links: validate HMAC token, expiry, optional passcode; derive tenant_id + quote_id server-side.  
- All DB access MUST filter by `(tenant_id_from_auth, quote_id)` and join to project to prevent cross-tenant leakage.  
- Customer API keys (`wrk_api_…`) are never allowed here; respond 401/403.

#### 3. Quote Retrieval
- `SELECT quotes WHERE id=:id AND tenant_id=:tenant`.  
- JOIN `projects` and `automation_versions` to confirm associations and tenant alignment.  
- View rules:
  - **Client JWT / token**:
    - `sent`, `rejected`, `signed` — viewable; CTAs controlled by status (only `sent` enables reject/sign).  
    - `draft`, `void` — return 409 `invalid_quote_status`.  
  - **Ops preview (`ops_pricing`/`admin` JWT)**:
    - All statuses viewable (including `draft`, `void`) for debugging/support, but PATCH behavior MUST follow the same client rules (no elevated write privileges).
- Action rules (client PATCH):
  - Only `status='sent'` is actionable.  
  - `draft`, `signed`, `void`, `rejected` MUST return 409 `invalid_quote_status`, except for the explicit idempotent shortcut described below.  
  - Idempotency: if the quote is already `rejected` **and** the incoming payload matches the stored state (same `rejection_reason` and, when provided, the same `last_known_updated_at`/`updated_at` comparison defined in the validation shortcut), return 200 with `already_applied=true`. Otherwise return 409 `invalid_quote_status`.
- Response MUST omit internal-only fields (ops notes, internal discount metadata) unless the viewer has ops roles.

#### Actionable Quote Invariant (AAA triad)
- `quote.status = 'sent'`
- `project.status = 'Awaiting Client Approval'`
- `automation_versions.status = 'Awaiting Client Approval'`

Client PATCH (Flow 15) and signing flows (Flow 16) MUST verify this triad before mutating state. If any element fails, return 409 and leave the database untouched. Read-only GETs may still render historical data when the triad is broken.

#### 4. Rendering & CTA Rules
- Display canonical pricing fields (setup_fee, unit_price, estimated_volume, effective_unit_price, discounts summary, total).  
- Terms, attachments, and signature steps come from Flow 11 configuration.  
- CTA behavior:
  - **Accept & Sign** → launches Flow 16 (no state mutation here).  
  - **Reject / Request Changes** → posts rejection with a reason.  
  - Both CTAs SHOULD require confirmation to avoid accidental clicks.

#### 5. Rejection Endpoint (`PATCH /v1/quotes/{id}/status`)
- Payload example:
  ```json
  {
    "status": "rejected",
    "rejection_reason": "Need revised volume assumptions",
    "last_known_updated_at": "2025-02-10T18:42:00Z"
  }
  ```
- Validation / idempotency (order matters; enforces the AAA triad before any write):
  1. **Idempotent shortcut**: If `quote.status='rejected'` AND `quote.rejection_reason == payload.rejection_reason` AND (`last_known_updated_at` absent OR `quote.updated_at == last_known_updated_at`), return 200 with `already_applied=true` (skip further validation/concurrency and do not write).  
  2. Otherwise, enforce the AAA triad:
     - Quote `status='sent'`; any other status → 409 `invalid_quote_status`.  
     - Project `status='Awaiting Client Approval'`; otherwise → 409 `project_not_editable`.  
     - Automation version `status='Awaiting Client Approval'` and aligned with project; otherwise → 409 `invalid_status_transition`.  
     - Only `status='rejected'` is allowed; other targets → 409 `invalid_quote_status`.  
  - `rejection_reason` is required, trimmed, length ≤ 1000 chars.  
  - Optional optimistic concurrency via `If-Match` / `last_known_updated_at`; mismatch → 409 `concurrency_conflict` with no writes (the idempotency shortcut runs before this check).  
  - Flow 15 MUST ignore any pricing-related fields (setup_fee, unit_price, discounts, etc.) in the request body.

#### 6. Transactional Updates (Rejection)
Within one transaction:
1. Update `quotes`:
   - `status='rejected'`
   - `rejection_reason=:reason`
   - `rejected_at=now()`
   - `updated_at=now()`
2. Roll back `automation_versions.status` to `'Needs Pricing'` **only when** both `automation_versions.status='Awaiting Client Approval'` and `projects.status='Awaiting Client Approval'`, reusing Flow 11’s latest-version + tenant guards. If these conditions are not met, the request MUST fail with 409 `invalid_status_transition` rather than attempting a partial rollback.
3. Update `projects.status` from `'Awaiting Client Approval'` to `'Needs Pricing'` (keeping the triad consistent), and optionally update analytics fields (e.g., `rejection_count`) if product requires.
4. Insert `audit_logs` entry:  
   - `action_type='reject_quote'`, `resource_type='quote'`, metadata includes reason, actor, project_id, automation_version_id, token vs JWT flag.
5. Commit; rollback on failure. On `concurrency_conflict`, Flow 15 MUST NOT persist any changes (pure read-only error).

#### 7. Post-Commit
- Publish `quote_rejected` (topic `quotes.lifecycle`) with payload `{ tenant_id, quote_id, project_id, automation_version_id, rejected_at, rejection_reason, channel }` for analytics, Slack bots, etc.  
- Notify ops/pricing teams (email `quote_rejected`, in-app feed) with client feedback.  
- Optionally send confirmation email to the client.  
- Optionally create/remind a task (“Follow up on quote rejection”) for ops with linked project context.

#### 8. Responses
- `GET` endpoints return sanitized quote data or PDF.  
- Successful rejection returns 200 with updated quote JSON (`status='rejected'`). Duplicate submissions with identical payloads MAY return 200 with `already_applied=true`; if the payload differs, return 409 `invalid_quote_status`.  
- Errors follow the Exceptions table below.

---

### API Endpoints

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/v1/quotes/{id}` | Client quote JSON view (JWT or token). |
| `GET` | `/v1/quotes/{id}/pdf` | PDF download. |
| `PATCH` | `/v1/quotes/{id}/status` | Client rejection (`status='rejected'` only). |

**PATCH `/v1/quotes/{id}/status` Requirements** (JSON body with `status='rejected'`)
- **Auth**: Client JWT session or signed quote token; API keys rejected.  
- **Authorization**:
  - JWT: client must belong to tenant and be listed on project/quote recipients.  
  - Token: token MUST match `(tenant_id, quote_id)` and not be expired/revoked; optional passcode must be validated.  
- **Tenant isolation**: always enforce `(tenant_id_from_auth, quote_id)` constraints regardless of input payload.  
- **Body fields**: `status` (must be `'rejected'`), `rejection_reason`, optional `last_known_updated_at`. Server-owned or unknown fields MUST be ignored.  
- **Behavior**: run validation + transactional updates; emit audit log + notifications.  
- **Response**: 200 with updated quote; see Exceptions for error codes.

---

### Database Changes

| Table | Change |
| --- | --- |
| `quotes` | Set `status='rejected'`, persist `rejection_reason`, `rejected_at`, `updated_at`. |
| `automation_versions` | ONLY when both the linked automation_version **and** project are `'Awaiting Client Approval'`, set `status='Needs Pricing'`; otherwise the rejection MUST fail with 409 `invalid_status_transition`. Latest-version rules from Flow 11 still apply. |
| `projects` | Set `status='Needs Pricing'` (keeping the triad consistent) and optionally increment rejection counters or log client feedback per product config. |
| `audit_logs` | Insert `{ action_type:'reject_quote', resource_type:'quote', resource_id, user_id/token_id, tenant_id, metadata_json:{ reason, automation_version_id, project_id, channel } }`. |

Flow 15 MUST NOT modify pricing fields, create/delete quotes, or touch automation_version metadata outside the documented status rollback.

---

### Notifications

| Trigger | Audience | Channel / Template | Notes |
| --- | --- | --- | --- |
| Quote viewed (optional analytics) | Ops | In-app feed / dashboard | Feature-flagged. |
| Quote rejected | Ops/pricing | Email `quote_rejected`, Slack optional | Include rejection_reason + client contact. |
| Quote rejected | Client | Email `quote_rejected_client` (confirmation) | Optional, acknowledging receipt. |

Notifications MUST fire only after the rejection transaction commits and MUST be idempotent (safe to retry). Flow 11 continues to own the original “quote sent” emails.

---

### Exceptions

| Condition | Response |
| --- | --- |
| No valid session / invalid token | 401 Unauthorized |
| Client lacks quote/project access | 403 Forbidden |
| Quote not found for `(id, tenant_id)` | 404 Not Found |
| Quote status not client-actionable (`draft`, `signed`, `void`, or a non-idempotent `rejected` PATCH) | 409 Conflict (`invalid_quote_status`) |
| Project not in `Awaiting Client Approval` | 409 Conflict (`project_not_editable`) |
| Automation_version status invalid or misaligned with project | 409 Conflict (`invalid_status_transition`) |
| Missing or empty `rejection_reason` | 400 Bad Request (`rejection_reason_required`) |
| Optimistic concurrency mismatch | 409 Conflict (`concurrency_conflict`) |

Flow 15 reuses canonical error codes from Flow 11 wherever overlaps exist (e.g., `invalid_quote_status`, `project_not_editable`) to prevent error-code sprawl.

---

### Manual Intervention & Security Notes

- Ops tools MUST expose rejection reasons and audit trail so teams can quickly respond.  
- Quote access tokens must be revocable (e.g., when a quote is replaced/voided) and should expire per security policy.  
- All quote views/rejections SHOULD be logged for analytics/compliance (view logs can feed dashboards, rejection logs land in `audit_logs`).  
- Flow 15 is stateless beyond its DB transaction; downstream actions (e.g., Flow 11 rerun) subscribe to `quote_rejected` events.  
- Clients cannot change pricing via Flow 15; they can only view quotes, initiate signing (Flow 16), or reject with feedback.

---

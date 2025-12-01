### Flow 15: Client Views and Accepts Quote

**Trigger**: A client (workspace member or guest recipient) opens a quote that Flow 11 already created and sent. The client reviews pricing, optionally downloads the PDF, and then chooses a CTA: **Proceed to Sign** (handled by Flow 16) or **Reject / Request Changes** (handled by Flow 18).

> **Scope**: Flow 15 owns the read-only viewing experience. It renders quote data, ensures auth/tenant isolation, and forwards client intent to the correct downstream flows. Flow 15 MUST NOT mutate quotes/projects/automation_versions, MUST NOT edit pricing (Flow 14), and MUST NOT implement rejection or signing logic—that work now lives entirely in Flow 18 (rejection) and Flow 16 (signing). All lifecycle updates referenced below are informational and performed by those flows, not by Flow 15.

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
    - Proceed to Sign (launches Flow 16)
    - Reject / Request Changes (launches Flow 18)
    ↓
CTAs redirect/submit to owning flows (no writes here)
```

---

### Detailed Steps

#### 1. Entry Points
- `GET /v1/quotes/{id}` — JSON endpoint powering UI and guest views.  
- `GET /v1/quotes/{id}/pdf` — PDF download (same auth gates).  
- `PATCH /v1/quotes/{id}/status` — routed by the shared controller to Flow 16 (`status='signed'`) or Flow 18 (`status='rejected'`). Flow 15 does not implement this endpoint but must call it with the correct payloads/tokens.

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
- Action rules (client PATCH) are enforced by Flow 16/Flow 18. Flow 15 MUST only expose CTAs when the quote is actionable for those flows and surface their error states verbatim (e.g., disable CTAs if the quote is no longer `sent`).
- Response MUST omit internal-only fields (ops notes, internal discount metadata) unless the viewer has ops roles.

#### Actionable Quote Invariant (AAA triad)
- `quote.status = 'sent'`
- `project.status = 'Awaiting Client Approval'`
- `automation_versions.status = 'Awaiting Client Approval'`

Flow 16 (signing) and Flow 18 (rejection) verify this triad before mutating state. Flow 15 must surface the triad state to the user (e.g., disable CTAs, show “Quote no longer actionable”) but does not enforce it server-side.

#### 4. Rendering & CTA Rules
- Display canonical pricing fields (setup_fee, unit_price, estimated_volume, effective_unit_price, discounts summary, total).  
- Terms, attachments, and signature steps come from Flow 11 configuration.  
- CTA behavior:
  - **Accept & Sign** → launches Flow 16 (no state mutation here).  
  - **Reject / Request Changes** → calls Flow 18 (collect reason + attachments, then forward).  
  - Both CTAs SHOULD require confirmation to avoid accidental clicks. If Flow 16/18 respond with errors, the UI must surface them and leave local state unchanged.

---

### Rejection Handling (Delegation Notes)

- Flow 18 is the sole owner of `{"status":"rejected"}` behavior: validation, concurrency, rollback, audit logs, notifications, and idempotency.  
- Flow 15 simply gathers the `rejection_reason` (and optional attachments/feedback) and posts to Flow 18’s API using the client’s JWT/token.  
- All database tables listed under Flow 18 are mutated there, not here.  
- If Flow 18 returns an error (e.g., quote expired, invalid status), Flow 15 must render the state (disable CTA, show message) without attempting retries outside Flow 18’s contract.

---

---

### Notifications

| Trigger | Audience | Channel / Template | Notes |
| --- | --- | --- | --- |
| Quote viewed (optional analytics) | Ops | In-app feed / dashboard | Feature-flagged. |
| Quote rejected | Ops/pricing | Email `quote_rejected`, Slack optional | Include rejection_reason + client contact. |
| Quote rejected | Client | Email `quote_rejected_client` (confirmation) | Optional, acknowledging receipt. |

Notifications originate from the owning flows (Flow 16 for signing, Flow 18 for rejection). Flow 15 merely reflects their status back to the UI. Flow 11 continues to own the original “quote sent” emails.

---

### Exceptions

| Condition | Response |
| --- | --- |
| No valid session / invalid token | 401 Unauthorized |
| Client lacks quote/project access | 403 Forbidden |
| Quote not found for `(id, tenant_id)` | 404 Not Found |
| Quote status not client-actionable (`draft`, `signed`, `void`) | 409 Conflict (`invalid_quote_status`) |
| Flow 16/18 specific validation failures | Whatever error they return (Flow 16/18 own their contracts) |

Flow 15 reuses canonical error codes from Flow 11 for GET failures and simply surfaces Flow 16/18 error payloads for CTA submissions.

---

### Manual Intervention & Security Notes

- Ops tools MUST expose rejection reasons and audit trail so teams can quickly respond.  
- Quote access tokens must be revocable (e.g., when a quote is replaced/voided) and should expire per security policy.  
- All quote views/rejections SHOULD be logged for analytics/compliance (view logs can feed dashboards, rejection logs land in `audit_logs`).  
- Flow 15 is purely a read surface; downstream actions subscribe to `quote_rejected` (Flow 18) and `quote_signed` (Flow 16) events.  
- Clients cannot change pricing via Flow 15; they can only view quotes, initiate signing (Flow 16), or submit rejection feedback (Flow 18).

---

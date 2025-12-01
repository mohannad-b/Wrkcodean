### Flow 14: Ops Adjust Quote (Override Pricing)

**Trigger**: An ops/pricing/admin user opens an existing project (created via Flow 11), reviews the auto-generated quote, and overrides pricing fields (setup fee, unit price, discounts, volume assumptions) before the client signs (Flows 15–16).

> **Scope**: Flow 14 covers updates to an **existing** quote that Flow 11 already created. It MUST NOT create a new quote, delete a quote, change automation/project associations, or alter automation_version status. Flow 14 also MUST NOT re-send emails directly; client-facing updates are handled by Flow 11 and Flow 15.
>
> Flow 14 MUST NOT change `projects.status`; it MAY only adjust `projects.pricing_status` as described below.

---

### Canonical Quote Model (subset relevant to Flow 14)

| Field | Description | Editable in Flow 14 |
| --- | --- | --- |
| `setup_fee` | One-time charge | ✅ |
| `unit_price` | Base unit price before discounts | ✅ |
| `estimated_volume` | Expected monthly volume | ✅ |
| `effective_unit_price` | Final price after discounts | ✅ |
| `discounts` (API) | Structured discount metadata persisted as `quotes.discounts_json` (JSONB) | ✅ |
| `currency` | ISO currency (from tenant config) | ❌ |
| `status` | `draft`, `sent`, `signed`, `void` | ❌ (only Flow 11/16 change this) |
| `project_id` / `automation_version_id` | Associations | ❌ |
| `tenant_id` | Tenant scope | ❌ |
| `sent_at` / `signed_at` | Timestamps managed by Flow 11/16 | ❌ |

Quotes are always linked to a `project` and `automation_version`. Flow 14 assumes those relationships were set in Flow 11 and only edits pricing fields.

---

### Flow Diagram (High-Level)

```
Ops/pricing user opens project pricing panel
    ↓
Request to PATCH /v1/quotes/{id}
    ↓
Global auth + tenant resolution (JWT only; API keys rejected)
    ↓
Load quote + related project/automation_version within tenant scope
    ↓
Validate permissions, quote status, and allowed fields
    ↓
Apply pricing overrides + optional concurrency check
    ↓
Begin transaction:
    - Update quotes table (pricing fields, updated_at)
    - Update projects.pricing_status if needed
    - Insert audit_logs entry (quote_updated)
    ↓
Commit transaction
    ↓
Emit quote_updated event + notifications (post-commit, async)
    ↓
Return updated quote payload
```

---

### Detailed Steps

1. **Entry Point**  
   - `PATCH /v1/quotes/{id}` is the primary write endpoint.  
   - `GET /v1/quotes/{id}` and `GET /v1/projects/{id}/quote` serve read-only needs (tenant-scoped, role-gated as in Flow 11).

2. **Auth & Tenant Isolation**  
   - Only JWT sessions or WRK service tokens may call this endpoint; customer API keys (`wrk_api_…`) MUST receive 401.  
   - Global middleware enforces valid session, active membership, active tenant.  
   - `tenant_id` is derived from session context. All queries/updates MUST filter by `(tenant_id, quote_id)` (and downstream `(tenant_id, project_id)`).

3. **Authorization**  
   - Caller MUST have `ops_pricing`, `ops_release`, or `admin` permission (per shared permission matrix).  
   - `workflows_write` alone is insufficient; Flow 14 is restricted to pricing roles.  
   - If permission check fails → 403 Forbidden.

4. **Load Quote Context**  
   - `SELECT quotes WHERE id=:id AND tenant_id=:tenant`.  
   - JOIN `projects` (same tenant) and `automation_versions` for auditing.  
   - If quote not found → 404.  
   - If quote is not linked to a project/automation_version → 400 `quote_missing_association`.

5. **Eligibility Checks**  
   - Quote `status` MUST be `draft` or `sent`. If status ∈ `{'signed','void'}`, Flow 16/other flows own downstream changes; return 409 `invalid_quote_status`. Flow 14 MUST NOT change `quotes.status`; only Flows 11 and 16 manage transitions between `draft`, `sent`, `signed`, or `void`.  
   - Associated project MUST have `status ∈ {'Needs Pricing','Awaiting Client Approval'}` (Flow 11 canonical states); otherwise return 409 `project_not_editable`.  
   - If tenant enforces approval flags, verify the caller is allowed to override (e.g., exec approval). Failure → 403.

6. **Input Validation**  
   - Allowed fields: `setup_fee`, `unit_price`, `effective_unit_price`, `estimated_volume`, `discounts`, optional `notes`.  
   - Server-owned fields (`tenant_id`, `project_id`, `status`, `currency`, `automation_version_id`, timestamps) MUST be ignored if provided. Unknown fields MUST be ignored (no 400) in v1.  
   - Each pricing field MUST pass numeric validation: non-negative, within configured max values, correct precision (2 decimals for currency).  
   - `discounts` MUST respect the shared schema (type, percentage, reason) and will be persisted into `quotes.discounts_json`.  
   - `notes` SHOULD remain internal ops annotations and MUST NOT change client-facing quote templates unless a product flag explicitly maps them.  
   - If invalid → 400 `invalid_pricing_value` with details.  
   - Optional optimistic concurrency: accept `If-Match` or `last_known_updated_at`; mismatch → 409 `concurrency_conflict`.

7. **Transactional Update**  
   - Begin DB transaction.  
   - Update `quotes` set updated pricing fields (persisting API `discounts` into `quotes.discounts_json`) + `updated_at = now()`.  
   - Projects use the canonical `pricing_status` enum established in Flow 11 (`'Not Generated'`, `'Draft'`, `'Sent'`). Flow 14 MAY only transition `'Draft' → 'Sent'` when the ops-approval feature flag is enabled and MUST NOT set other values.  
   - Insert `audit_logs` row with `action_type='quote_updated'`, capturing before/after amounts, actor, and `system_initiated` flag.  
   - Commit; rollback on any failure.

8. **Post-Commit Side Effects**  
   - Publish `quote_updated` (or reuse `automation_status_changed` metadata pipeline) so client apps refresh.  
   - Trigger in-app notification to relevant client contacts if product settings require it (email optional, see Notifications).  
   - No emails are auto-sent unless configured; Flow 14 does not automatically re-send “quote sent” emails.

9. **Response**  
   - 200 OK with the updated quote payload, e.g.:
     ```json
     {
       "quote": {
         "id": "q_123",
         "tenant_id": "t_001",
         "project_id": "proj_789",
         "automation_version_id": "av_456",
         "status": "sent",
         "setup_fee": 12500,
         "unit_price": 0.18,
         "effective_unit_price": 0.15,
         "estimated_volume": 120000,
         "discounts": [{ "type": "volume", "percent": 15 }],
         "currency": "USD",
         "updated_at": "2025-02-12T10:45:00Z"
       }
     }
     ```
   - If the request makes no changes, respond 200 with `already_applied=true`.

---

### API Endpoints

| Method | Endpoint | Description |
| --- | --- | --- |
| `PATCH` | `/v1/quotes/{id}` | Update pricing fields on an existing quote (Flow 14 core). |
| `GET` | `/v1/quotes/{id}` | Retrieve quote details (role-gated read, see Flow 11). |
| `GET` | `/v1/projects/{id}/quote` | Convenience read for project dashboard; read-only. |

**PATCH `/v1/quotes/{id}` Requirements**
- **Auth**: JWT session or WRK service token; customer API keys → 401.  
- **Authorization**: `ops_pricing`, `ops_release`, or `admin`.  
- **Tenant isolation**: `tenant_id` from auth context; payload `tenant_id` ignored.  
- **Body** (example):
  ```json
  {
    "setup_fee": 15000,
    "unit_price": 0.2,
    "effective_unit_price": 0.17,
    "estimated_volume": 130000,
    "discounts": [{ "type": "override", "percent": 15, "reason": "Enterprise pilot" }],
    "notes": "Adjusted for revised volume forecast",
    "last_known_updated_at": "2025-02-10T18:42:00Z"
  }
  ```
  - Server-owned fields (e.g., `tenant_id`, `status`) MUST be ignored if present; unknown fields MUST be ignored (no 400) for v1 clients.
- **Responses**: 200 with updated quote; errors in Exceptions table below.

---

### Database Changes (single transaction)

| Table | Change |
| --- | --- |
| `quotes` | Update editable pricing fields, `updated_at`. |
| `projects` | Flow 11 is the canonical creator of `pricing_status`. Flow 14 MAY only set `'Draft' → 'Sent'` when the ops-approval feature flag is enabled; otherwise leave unchanged. |
| `audit_logs` | Insert `{ action_type:'quote_updated', resource_type:'quote', resource_id: quote_id, user_id, tenant_id, metadata_json: { before, after } }`. |

Flow 14 MUST NOT update `automation_versions` (status, intake_progress, metadata) and MUST NOT insert new quotes; only the fields above are touched.

---

### Notifications

| Event | Audience | Channel | Notes |
| --- | --- | --- | --- |
| Quote updated (major change) | Client stakeholders | In-app + optional email `quote_updated` | SHOULD be configuration-driven (e.g., changes above % threshold or flagged as client-visible); otherwise treat as non-major in v1. |
| Quote updated | Ops team | In-app activity feed | Always log so ops peers see overrides. |

Notifications MUST be enqueued after the DB transaction commits and MUST be idempotent. Re-sending the original “quote sent” email is out of scope; Flow 11’s notification pipeline handles the initial send.

---

### Exceptions

| Condition | Response |
| --- | --- |
| No valid session / API key used | 401 Unauthorized |
| Caller lacks ops-pricing/admin role | 403 Forbidden |
| Quote not found for `(id, tenant_id)` | 404 Not Found |
| Quote missing project/automation association | 400 Bad Request (`quote_missing_association`) |
| Quote status not editable (e.g., `signed`, `void`) | 409 Conflict (`invalid_quote_status`) |
| Project not in editable pricing state | 409 Conflict (`project_not_editable`) |
| Invalid numeric inputs or discount schema | 400 Bad Request (`invalid_pricing_value`) |
| Optimistic concurrency mismatch | 409 Conflict (`concurrency_conflict`) |

All error responses MUST be JSON `{ error_code, message, details? }`. Where overlapping (e.g., `concurrency_conflict`, `invalid_pricing_value`), Flow 14 reuses the canonical error codes from Flow 11 and MUST NOT invent new strings for the same conditions.

---

### Manual Intervention & Security Notes

- Ops console MUST display the existing auto-generated quote (Flow 11) and highlight which fields are overrideable.  
- Permission model MUST ensure only ops-pricing/admin roles reach the PATCH endpoint.  
- Tenant isolation is mandatory; cross-tenant quote IDs MUST return 404.  
- Every edit MUST generate an audit log entry and appear in the project’s activity feed.  
- Flow 14 MUST remain stateless beyond DB operations; downstream systems listen to `quote_updated` events to refresh UIs.  
- Large overrides (beyond configured thresholds) MAY require secondary approval—feature flag support should piggyback on this flow by enforcing additional checks before commit.

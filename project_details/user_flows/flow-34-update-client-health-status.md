### Flow 34: Update Client Health Status

**Trigger**: Ops/admin adjusts the health_status of an existing client record

---

### Access & Auth

- **Auth**: `PATCH /v1/admin/clients/{id}` and `GET /v1/admin/clients` require a JWT session. Customer API keys are never valid.
- **Authorization**:
  - Only global/admin roles `{ops_admin, cs_admin, admin}` may call these endpoints.
  - If future region/team scoping is added, caller must be permitted to manage that client’s tenant.
- **Tenant isolation**:
  - Client is looked up by primary key; its `tenant_id` comes from the `clients` row, not from caller input.
  - AuthN/AuthZ must succeed before revealing whether a client exists or disclosing health_status.
  - Any downstream writes (tasks, alerts, notifications) MUST be scoped to `clients.tenant_id`.

---

### Flow Diagram
```
Ops admin requests health_status change ('Good' ↔ 'At Risk' ↔ 'Churn Risk')
    ↓
Backend enforces enum + allowed transitions (e.g., Good→At Risk, At Risk→Churn Risk, At Risk→Good, Churn Risk→At Risk)
    ↓
Update client.health_status
    ↓
If status = 'At Risk' or 'Churn Risk':
    Create alert record
    Assign to account manager
    ↓
If status = 'Churn Risk':
    Escalate to ops manager
    Create retention task
    ↓
Create audit log entry
    ↓
Send notifications
    ↓
Return updated client
```

**API Endpoints**:
- `PATCH /v1/admin/clients/{id}` – update health_status (only allowed field in this flow). Attempts to mutate other client fields are ignored or rejected.
- `GET /v1/admin/clients` – list clients/filter by health_status (same auth rules).

**Database Changes**:
- Update `clients`:
  - `health_status` enum `{Good, At Risk, Churn Risk}`, `updated_at`
  - Optional `health_reason` fields, if supported, but still only via this flow.
- Alerts/tasks:
  - For `At Risk` or `Churn Risk`, create an alert row scoped by `(tenant_id, client_id, alert_type)` (de-dup per period) in the alerts table.
  - For `Churn Risk`, create a retention task using `create_auto_task` helper (Flow 31):
    - `tenant_id = clients.tenant_id`
    - `context_type='client'` (or mapped project)
    - `context_id=client_id`, `kind='client_retention'` (or similar), `assignee_id=account_manager`
- Insert into `audit_logs`:
  - `action_type='update_client_health'`, `resource_type='client'`, `resource_id=client_id`, `tenant_id=clients.tenant_id`, `actor_user_id`
  - `metadata_json={ old_health_status, new_health_status, alert_created, retention_task_created }` (no secrets/PII beyond client data).

**Notifications**:
- **Email**: `client_health_changed` (account manager for that client’s tenant)
- **Email**: `client_churn_risk` (ops manager(s) allowed to see that client/tenant)
- **In-app**: Notifications only to users associated with the client’s tenant and in scopes that allow visibility.

**Exceptions**:
- **Invalid transition / invalid status (400)**: health_status not in enum or transition not allowed by state machine.
- **Client not found (404)**: no client row for this ID visible under admin scope (do not leak extra info).
- **No permission (403)**: caller lacks required admin role or scope for this tenant.
- Optional: `409 concurrency_conflict` if using `last_known_health_status/updated_at` hints when a mutation would occur (not required but recommended for future).

**Manual Intervention**: Ops admin manually updates health status based on metrics/observations

---

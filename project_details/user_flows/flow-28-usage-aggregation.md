### Flow 28: Usage Sync & Threshold Alerts

> **Scope**: Flow 28 now covers both usage aggregation and threshold alerting. Instead of reading every run event from WRK Copilot, we ingest periodic summaries produced by the WRK Platform engine (e.g., hourly/daily snapshots with run counts, successes/failures, cost). After persisting those aggregates, the same worker evaluates alert thresholds and sends notifications. This consolidation replaces the old Flow 28/29 split.

**Trigger**: Scheduler pulls or receives summarized usage payloads from WRK Platform (e.g., hourly REST pull or daily push)

---

### Access & Auth

- **Auth**:
  - Usage Sync Worker calls WRK Platform using a service identity (service account/API token) over TLS.
  - Optional push endpoint (future) MUST require HMAC signatures (e.g., `X-WRK-Signature` over raw body) validated in constant time.
- **Tenant isolation**:
  - Pull: `tenant_id`/`automation_version_id` values from WRK Platform’s response MUST be validated against Copilot DB (automation_version must exist and belong to tenant_id).
  - Push: treat any tenant hints as untrusted; resolve automation_version_id and tenant_id via Copilot’s workflow_binding/automation tables after verifying the signature.
  - All writes to `usage_aggregates`, `alerts`, and `audit_logs` include the validated tenant_id/automation_version_id.
- **Permissions**:
  - Worker is internal-only; no public endpoints in v1.
  - Customer API keys/JWTs cannot trigger or tune this flow; thresholds/config live in server-side config/DB.

---

### Flow Diagram:
```
Scheduled job requests usage snapshot from WRK Platform (hourly/daily)
    ↓
WRK Platform responds with summarized metrics:
    { automation_version_id, tenant_id, period_start, period_end, run_count, success_count, failure_count, total_cost }
    ↓
Usage Sync Worker validates payload:
    - Pull: ensure automation_version_id exists in Copilot DB and belongs to tenant_id
    - Push: verify HMAC signature, then resolve automation_version_id + tenant_id from Copilot DB (ignore mismatched tenant hints)
    - If automation_version or tenant cannot be resolved, log and skip (no inserts)
    ↓
Upsert usage_aggregate for (automation_version_id, period)
    - run_count, success_count, failure_count, total_cost
    - recalc derived fields (failure_rate, average_cost_per_run, etc.)
    ↓
Check configured thresholds for that automation/version/tenant:
    - Volume > committed_volume * X
    - Failure rate > Y%
    - Cost > spend target
    ↓
If a threshold breaches and an alert for that period hasn’t been sent:
    - Insert/update alerts table (de-dup per period)
    - Send notifications (email, in-app, Slack) to owners + ops/AM as needed (same tenant only)
    - NOTE: threshold breaches only trigger alerts/billing signals; they DO NOT block automations (Flow 26 + Flow 13 own credential blocking)
    ↓
Optional: publish summary audit log entry for significant usage milestones
    ↓
If period close condition met (e.g., end of month), enqueue billing/finalization job
```

**API / Integration Points**:
- **Internal pull**: Worker calls WRK Platform usage endpoint (e.g., `GET /wrk-platform/usage-summary?period=2024-07-15T00:00Z`), authenticated with service credentials.
- **Optional push**: WRK Platform can POST summarized data to a Copilot ingestion endpoint (future enhancement; not required for v1). In v1 we may rely solely on internal pull.
- No public API is exposed to customers for this flow in v1.

- **Database Changes**:
  - Upsert `usage_aggregates` with `{ tenant_id, automation_version_id, period_start, period_end, run_count, success_count, failure_count, total_cost, failure_rate }`. Unique constraint on `(automation_version_id, period_start, period_end)`.
  - Insert/update `alerts` scoped by tenant/automation `{ tenant_id, automation_version_id, alert_type, threshold_value, current_value, period_start, sent_at }` with de-dupe on `(tenant_id, automation_version_id, alert_type, period_start)`.
  - Insert `audit_logs` (optional) for major milestones `{ action_type='usage_sync', resource_type='automation_version', metadata_json:{period_start, run_count, alert_triggered?} }`.
  - Flow 28 NEVER updates `automation_versions.status`, pricing, or other lifecycle fields. Blocked/Paused/Live transitions remain the responsibility of Flows 13/24/26.

- **Notifications**:
  - Email/In-app/Slack templates for:
  - Usage overage (`usage_threshold_exceeded`)
  - Failure-rate alert (`failure_rate_threshold_exceeded`)
  - Cost overrun (`cost_threshold_alert`)
  - Alerts are sent only to contacts associated with the owning tenant (owners, ops/AM mapped to that tenant). No cross-tenant recipients. Summary metrics only; no raw run-level data.

**Exceptions & Retry Logic**:
- Missing automation/tenant resolution: log + skip (no inserts).
- Validation error (bad period range, negative counts): log, quarantine payload, alert ops.
- Aggregate update conflict: retry with exponential backoff.
- Alert already sent for same `(tenant_id, automation_version_id, alert_type, period_start)`: skip to avoid spam.
- WRK Platform API unavailable: retry per standard backoff; raise ops alert if repeated failures.

**Manual Intervention**:
- Not typical. Ops/AMs review alerts generated by this worker and may adjust thresholds via configuration.
- Billing/finance teams consume monthly aggregates downstream (Flow 20).
- Lifecycle changes (Blocked/Paused/etc.) remain owned by Flows 13/24/26; Flow 28 never triggers those transitions directly.

---

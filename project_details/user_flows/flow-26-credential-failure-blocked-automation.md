### Flow 26: Credential Failure → Blocked Automation

**Trigger**: WRK Platform run_events or monitoring detect auth errors (e.g., 401, 403)

---

### Access & Auth

- Internal monitoring/worker service uses a service identity to consume telemetry (`run_events`, `workflow_bindings`, `automation_versions`).
- Tenant derivation is always from trusted internal IDs (e.g., each run_event references `automation_version_id` + `tenant_id`). The worker MUST ignore any tenant hints from untrusted payloads.
- All write operations (creating tasks, calling lifecycle helpers, inserting audit logs) MUST be scoped by `(tenant_id, automation_version_id)` per the core tenant isolation rules.
- The worker MUST enforce AuthN/AuthZ before exposing credential status in alerts/notifications (e.g., only send client notifications to the owning tenant contacts).

---

### Flow Diagram
```
Monitoring detects credential/auth failures:
    - Run events show status='failure' with error_message like AUTH_ERROR / 401 / 403
    - or integration monitor detects repeated auth failures
    ↓
Evaluate threshold policy (X consecutive failures, Y% failure window)
    - Thresholding handled entirely in the monitoring service (not Flow 13) to prevent flapping
    ↓
If threshold exceeded and current_status in allowed set (e.g., {'Live','Ready to Launch','Build in Progress'}):
    - Call lifecycle helper `request_block_for_credentials(tenant_id, automation_version_id, actor_context, failed_systems)` (owned by Flow 13)
    - Helper validates allowed source state, applies concurrency/idempotency rules, sets status='Blocked', updates blocked_reason, writes audit log
    ↓
Create high-priority task (one per failed system) with structured fields:
    - context_type/context_id include tenant_id/project_id/automation_version_id
    - kind='build_checklist' or 'credentials_issue'
    - system_key/provider stored explicitly; titles never include secrets
    ↓
Notify client + ops (masked reason, remediation steps)
    ↓
Once credentials fixed via Flow 25 + lifecycle helper verifies all required credentials active:
    - Ops/system invokes `request_unblock_for_credentials(tenant_id, automation_version_id, actor_context)`
    - Flow 13 helper owns Blocked → healthy transition, honoring state machine rules
    ↓
Clear blocked_reason via lifecycle helper response, send unblocked notifications
```

**API Endpoints**: Internal monitoring/worker, no external API

**Database Changes**:
- Flow 26 NEVER updates `automation_versions.status` directly. The Flow 13 lifecycle helper performs:
  - Re-select automation_version (and related rows) `FOR UPDATE` filtered by `(tenant_id, automation_version_id)`.
  - Validate current_status is in the allowed set (e.g., `'Live','Ready to Launch','Build in Progress'`) before moving to `'Blocked'`.
  - Update `status='Blocked'`, `blocked_reason`, `blocked_at`, plus audit logs inside the same transaction.
- `tasks`:
  - Insert structured tasks `{ tenant_id, project_id, automation_version_id, kind='credentials_issue', system_key, priority='high' }`.
  - Titles/descriptions must never include secrets or raw error payloads (only system names / high-level causes).
- `audit_logs`:
  - `action_type='block_automation'`, metadata with `{ failed_systems, blocked_reason_summary, threshold_policy_id }` (no tokens or raw logs).

**Notifications**:
- **Email**: Automation blocked notification (template: `automation_blocked`, to client, includes blocked_reason and instructions)
- **Email**: Critical: Credentials failed (template: `credentials_failed_critical`, to ops team, high priority)
- **In-app**: High-priority notification to ops team
- **Slack** (optional): Critical alert to ops channel

**Exceptions**:
- **Misconfigured alert thresholds**: Monitoring service logs warning/metric; Flow 13 helper SHOULD NOT be called unless thresholds are satisfied.
- **False positive detection**: Ops team may call `request_unblock_for_credentials` via Flow 13 helper to revert.
- **Multiple systems failing**: `failed_systems` array is passed to lifecycle helper/task creation; reason lists all affected systems.
- **Threshold evaluation**: Performed entirely by the monitoring service BEFORE invoking `request_block_for_credentials`; lifecycle helper enforces transitions only.

**Manual Intervention**: 
- Ops team reviews blocked automations and contacts client
- Ops team verifies credential fixes before unblocking
- Ops team may adjust failure thresholds if needed

**Note**: Once credentials are fixed (Flow 24), the automation can be unblocked via Flow 13 (Update Automation Status), respecting allowed transitions from the state machine.

---

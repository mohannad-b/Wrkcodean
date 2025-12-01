### Flow 27: Run Event Webhook (WRK Platform → WRK Copilot) _(Future / not part of v1)_

> **Status**: Future enhancement. This flow documents the intended webhook handshake between WRK Platform and WRK Copilot once we add near-real-time run telemetry. Nothing in this flow ships in v1; it exists so we have a vetted design for when we prioritize it later.

**Trigger**: WRK Platform sends webhook on workflow execution (conceptual future feature)

**Flow Diagram**:
```
WRK Platform executes workflow
    ↓
WRK Platform sends webhook:
    POST /v1/webhooks/wrk-run-event
    Headers: X-WRK-Signature (HMAC)
    Body: { workflow_id, run_id, status, started_at, completed_at, error_message }
    ↓
Validate HMAC signature
    ↓
If invalid signature: Return 401, log security event
    ↓
Find workflow_binding by wrk_workflow_id
    ↓
Check for existing run_event (idempotency):
    SELECT * FROM run_events 
    WHERE workflow_binding_id = ? AND run_id = ?
    ↓
If exists: Return 200 (already processed, idempotent)
    ↓
If not exists:
    Create run_event record
    Create audit log entry
    Enqueue usage aggregation job
    ↓
If status = 'failure' and error is critical:
    Check failure threshold
    If threshold exceeded: Send alert
    ↓
Return 200 OK
```

**API Endpoints** (future):
- `POST /v1/webhooks/wrk-run-event` (internal webhook receiver – NOT implemented in v1)

**Database Changes**:
- Insert into `run_events` (workflow_binding_id, run_id, status, started_at, completed_at, error_message, metadata_json)
- Insert into `audit_logs` (action_type='workflow_run', resource_type='automation_version', resource_id=automation_version_id, user_id=null, tenant_id, created_at=now(), metadata_json={'run_id': run_id, 'status': status, 'workflow_binding_id': workflow_binding_id}) - system-initiated by webhook
- Idempotency: Unique constraint prevents duplicates

**Notifications** (conditional):
- **Email**: Critical failure alert (if failure rate > threshold, template: `automation_critical_failure`)
- **In-app**: Failure notification to automation owner (if failure)

**Exceptions**:
- **Invalid HMAC signature**: Return 401, log security event, alert ops
- **Workflow binding not found**: Return 404, log error
- **Duplicate run_id**: Return 200 (idempotent, already processed)
- **Malformed webhook payload**: Return 400, log error

**Manual Intervention** (future): 
- Ops team reviews critical failures surfaced by the future webhook pipeline
- Ops team investigates if failure rate exceeds threshold, coordinating with Flow 26 / lifecycle helpers

---

> **Note**: Flow 27 is intentionally scoped as a future enhancement. Until this webhook exists, WRK Copilot relies on periodic usage aggregation jobs. When we decide to implement Flow 27, revisit Flows 24–26 to ensure state-machine hooks (blocking, notifications) align with the real-time telemetry pipeline.

---

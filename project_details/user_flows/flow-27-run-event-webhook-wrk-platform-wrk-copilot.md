### Flow 27: Run Event Webhook (WRK Platform → WRK Copilot)

**Trigger**: WRK Platform sends webhook on workflow execution

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
    Enqueue usage aggregation job
    ↓
If status = 'failure' and error is critical:
    Check failure threshold
    If threshold exceeded: Send alert
    ↓
Return 200 OK
```

**API Endpoints**:
- `POST /v1/webhooks/wrk-run-event` (internal, webhook receiver)

**Database Changes**:
- Insert into `run_events` (workflow_binding_id, run_id, status, started_at, completed_at, error_message, metadata_json)
- Idempotency: Unique constraint prevents duplicates

**Notifications** (conditional):
- **Email**: Critical failure alert (if failure rate > threshold, template: `automation_critical_failure`)
- **In-app**: Failure notification to automation owner (if failure)

**Exceptions**:
- **Invalid HMAC signature**: Return 401, log security event, alert ops
- **Workflow binding not found**: Return 404, log error
- **Duplicate run_id**: Return 200 (idempotent, already processed)
- **Malformed webhook payload**: Return 400, log error

**Manual Intervention**: 
- Ops team reviews critical failures
- Ops team investigates if failure rate exceeds threshold

---

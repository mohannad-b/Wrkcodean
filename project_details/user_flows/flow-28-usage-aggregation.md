### Flow 28: Usage Aggregation

**Trigger**: Usage Aggregation Worker processes run events

**Flow Diagram**:
```
Worker receives run event message
    ↓
Find workflow_binding and automation_version
    ↓
Calculate time period (hourly or daily):
    period_start = truncate_to_hour/day(started_at)
    period_end = period_start + 1 hour/day
    ↓
Find or create usage_aggregate for period
    ↓
Increment counters:
    - run_count += 1
    - success_count += 1 (if status='success')
    - failure_count += 1 (if status='failure')
    - total_cost += (effective_unit_price)
    ↓
Update usage_aggregate record
    ↓
Create audit log entry (for significant usage milestones)
    ↓
Check usage thresholds:
    - If run_count > volume_threshold: Alert ops
    - If failure_rate > threshold: Alert ops
    ↓
If monthly period complete:
    Trigger billing calculation
```

**API Endpoints**: Internal worker, no external API

**Database Changes**:
- Upsert `usage_aggregates` (automation_version_id, period_start, period_end, run_count, success_count, failure_count, total_cost)
- Unique constraint on (automation_version_id, period_start, period_end) ensures one aggregate per period
- Insert into `audit_logs` (action_type='usage_aggregated', resource_type='automation_version', resource_id=automation_version_id, user_id=null, tenant_id, created_at=now(), metadata_json={'period_start': period_start, 'period_end': period_end, 'run_count': run_count}) - system-initiated by worker (optional, for significant milestones only)

**Notifications** (conditional):
- **Email**: Usage threshold exceeded (template: `usage_threshold_exceeded`)
- **Email**: Failure rate threshold exceeded (template: `failure_rate_threshold_exceeded`)

**Exceptions**:
- **Missing workflow_binding**: Skip, log error
- **Invalid period calculation**: Log error, use fallback period
- **Aggregate update conflict**: Retry with current values

**Manual Intervention**: None (fully automated)

---

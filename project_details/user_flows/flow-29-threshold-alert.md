### Flow 29: Threshold Alert

**Trigger**: Usage or failure rate exceeds threshold

**Flow Diagram**:
```
Usage aggregation detects threshold breach
    ↓
Check alert rules:
    - Usage > committed_volume * 1.2 (20% over)
    - Failure rate > 5%
    - Cost > estimated_monthly_spend * 1.5
    ↓
Create alert record (if not already sent for this period)
    ↓
Determine alert recipients:
    - Automation owner
    - Ops team (for critical alerts)
    - Account manager (for cost alerts)
    ↓
Send notifications
    ↓
Update alert sent timestamp (prevent spam)
```

**API Endpoints**: Internal, no external API

**Database Changes**:
- Insert into `alerts` (automation_version_id, alert_type, threshold_value, current_value, sent_at) - if alerts table exists
- Or: Store in audit_logs

**Notifications**:
- **Email**: Threshold alert (template: `usage_threshold_alert` or `failure_rate_alert`)
- **In-app**: Alert notification
- **Slack** (optional): Critical alert to ops channel

**Exceptions**:
- **Alert already sent**: Skip, prevent spam
- **Threshold not configured**: Use defaults
- **Missing recipient email**: Log warning, skip

**Manual Intervention**: 
- Ops team reviews alerts and takes action (e.g., contact client about overage)
- Ops team adjusts thresholds if needed

---

## Collaboration Flows

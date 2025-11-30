### Flow 26: Credential Failure → Blocked Automation

**Trigger**: WRK Platform run_events or monitoring detect auth errors (e.g., 401, 403)

**Flow Diagram**:
```
Usage aggregation or monitoring detects auth errors:
    - Run events show status='failure' with error_message containing 'AUTH_ERROR' or '401' or '403'
    - OR monitoring detects repeated auth failures for integration step
    ↓
Check failure threshold:
    - X consecutive auth failures (e.g., 3)
    - OR Y% of runs failing for reason AUTH_ERROR (e.g., >50% in last hour)
    ↓
If threshold exceeded:
    Set automation_versions.status = 'Blocked'
    Set automation_versions.blocked_reason = 'Credentials invalid or expired for [system_name]'
    ↓
Create high-priority task for ops:
    - context_type = 'project' or 'automation_version'
    - kind = 'general_todo'
    - title = 'Fix credentials for [system_name]'
    - priority = 'high' or 'critical'
    - assignee = project owner or ops team
    ↓
Notify client to update credentials
    ↓
Notify ops team (high priority)
    ↓
[Once credentials fixed via Flow 24]
    ↓
Ops or system can move status from Blocked:
    - Check if transition from 'Blocked' → previous_status is allowed
    - If allowed: Update status via Flow 13
    - If not allowed: Move to nearest valid status (e.g., 'Blocked' → 'Build in Progress' if was in build)
    ↓
Clear blocked_reason
    ↓
Send unblocked notifications
```

**API Endpoints**: Internal monitoring/worker, no external API

**Database Changes**:
- Update `automation_versions` (status='Blocked', blocked_reason)
- Insert into `tasks` (context_type, context_id, kind='general_todo', title, priority='high', status='pending')
- Insert into `audit_logs` (action_type='block_automation', resource_type='automation_version', changes_json with blocked_reason)

**Notifications**:
- **Email**: Automation blocked notification (template: `automation_blocked`, to client, includes blocked_reason and instructions)
- **Email**: Critical: Credentials failed (template: `credentials_failed_critical`, to ops team, high priority)
- **In-app**: High-priority notification to ops team
- **Slack** (optional): Critical alert to ops channel

**Exceptions**:
- **Misconfigured alert thresholds**: Log warning, adjust thresholds, but don't flail statuses
- **False positive detection**: Ops team can manually unblock if false positive
- **Multiple systems failing**: Block with reason listing all failed systems

**Manual Intervention**: 
- Ops team reviews blocked automations and contacts client
- Ops team verifies credential fixes before unblocking
- Ops team may adjust failure thresholds if needed

**Note**: Once credentials are fixed (Flow 24), the automation can be unblocked via Flow 13 (Update Automation Status), respecting allowed transitions from the state machine.

---

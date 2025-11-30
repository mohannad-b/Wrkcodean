### Flow 34: Update Client Health Status

**Trigger**: Ops admin updates client health status

**Flow Diagram**:
```
Ops admin updates health_status ('Good' → 'At Risk' → 'Churn Risk')
    ↓
Validate status transition
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
- `PATCH /v1/admin/clients/{id}` (admin only, update health_status)
- `GET /v1/admin/clients` - List clients (filter by health_status)

**Database Changes**:
- Update `clients` (health_status)
- Insert into `tasks` (if churn risk, kind='general_todo', assignee=account_manager)
- Insert into `audit_logs` (action_type='update_client_health')

**Notifications**:
- **Email**: Client health status changed (template: `client_health_changed`, to account manager)
- **Email**: Churn risk alert (template: `client_churn_risk`, to ops manager)
- **In-app**: Notification to account manager

**Exceptions**:
- **Invalid status**: Return 400
- **Client not found**: Return 404
- **No permission**: Return 403

**Manual Intervention**: Ops admin manually updates health status based on metrics/observations

---

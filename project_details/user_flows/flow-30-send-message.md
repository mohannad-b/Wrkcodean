### Flow 30: Send Message

**UX Requirement**: This flow should feel chat-like and real-time, similar to a messaging experience. Updates and responses should appear as a conversational stream, not as static forms.

**Trigger**: User sends message in project/automation thread

**Flow Diagram**:
```
User composes message (text, optional attachments, tags)
    ↓
User selects message type:
    - 'client' (visible to client)
    - 'ops' (visible to ops only)
    - 'internal_note' (ops-only notes)
    ↓
Validate message type permissions
    ↓
Create message record
    ↓
Link to project or automation_version
    ↓
Push real-time update to UI (via websockets or long polling):
    - Message appears as chat bubble in UI
    - Status updates appear as system messages
    - System suggestions appear as chat messages
    ↓
If type = 'client':
    Send email notification to client users
    ↓
If type = 'ops' or 'internal_note':
    Send in-app notification to ops team
    ↓
Create audit log entry (if sensitive)
    ↓
Return message (with real-time push to connected clients)
```

**API Endpoints**:
- `POST /v1/messages` - Create message
- `GET /v1/projects/{id}/messages` - List project messages
- `GET /v1/automations/{id}/messages` - List automation messages

**Database Changes**:
- Insert into `messages` (tenant_id, project_id or automation_version_id, type, sender_id, text, attachments_json, tags)

**Notifications**:
- **Email**: New message notification (template: `new_message`, only for 'client' type to client users)
- **In-app**: Notification to recipients (based on message type visibility)

**Exceptions**:
- **Invalid message type for user role**: Return 403 (e.g., client can't send 'internal_note')
- **Missing project/automation**: Return 404
- **Message too long**: Return 400, enforce character limit
- **Invalid attachments**: Return 400, validate file types/sizes

**Manual Intervention**: None

---

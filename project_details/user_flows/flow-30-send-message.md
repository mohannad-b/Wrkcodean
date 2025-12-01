### Flow 30: Send Message

**UX Requirement**: This flow should feel chat-like and real-time, similar to a messaging experience. Updates and responses should appear as a conversational stream, not as static forms. The real-time UX MUST still respect tenant and visibility constraints—updates are only pushed to users allowed to see that message type.

---

### Access & Auth

- **Auth**: JWT session required for all message operations. Customer API keys MAY read specific system messages if we ever expose them, but they MUST NOT create, update, or delete messages.
- **Authorization**:
  - User must belong to the tenant and have membership on the project/automation to send or read messages.
  - Roles `{project_owner, project_admin, tenant_admin, ops_build, ops_qa, ops_billing, admin}` may send `ops` or `internal_note` messages.
  - Clients/external users can only send/read `client` (and any explicitly client-visible system) messages.
- **Tenant isolation**:
  - `tenant_id` derived from auth context or via owning project/automation_version—never from request body/query.
  - All DB reads/writes scoped by `(tenant_id, project_id)` or `(tenant_id, automation_version_id)`.
  - AuthN/AuthZ MUST succeed before returning message content or subscribing to real-time channels.

**Trigger**: User sends message in project/automation thread

**Flow Diagram**:
```
User composes message (text, optional attachments, tags)
    ↓
User selects message type (determines visibility):
    - 'client' → visible to client + ops
    - 'ops' → visible to internal roles only (no clients)
    - 'internal_note' → restricted to elevated ops roles
    - 'system' → generated only by backend helpers (NOT available via public POST)
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
If type='client':
    Send email notification to client users
    ↓
If type='ops' or 'internal_note':
    Send in-app notification to ops team
    ↓
Create audit log entry (if sensitive)
    ↓
Return message (with real-time push to connected clients)
```

**API Endpoints**:
- `POST /v1/messages` – Create message (must include exactly one context: `project_id` or `automation_version_id`)
  - Backend resolves context from DB, verifies tenant + membership, derives `sender_id` from auth.
  - `type='system'` is forbidden on this endpoint; system messages come from internal helpers/service identities only.
  - Attachments uploaded to object storage; `messages` table stores metadata/URLs only.
- `GET /v1/projects/{id}/messages` – List project messages (server-side visibility filtering by role/type).
- `GET /v1/automations/{id}/messages` – List automation messages (same filtering).

**Database Changes**:
- Insert into `messages` with:
  - `tenant_id`
  - `project_id` (nullable) XOR `automation_version_id` (nullable) – exactly one context set
  - `type` enum: `'client','ops','internal_note','system'`
  - Optional visibility flags (e.g., `is_client_visible`)
  - `sender_id` (derived from auth, system for type='system')
  - `text`, `attachments_json`, `tags`
  - `created_at`, `updated_at`
- Indexes on `(tenant_id, project_id, created_at)` and `(tenant_id, automation_version_id, created_at)` to support chat scrolling.
- No secrets/tokens/credential values should ever be stored in `messages.text` or attachments; attachments metadata references object storage only.

**Notifications**:
- **Email**: `new_message` (only for `'client'` type to client contacts)
- **In-app**: Notification to recipients allowed to see that message type

**Exceptions**:
- **Forbidden (403)**: user not a member of project/automation OR role cannot send requested type.
- **Credential scope mismatch**: 404 if project/automation not found for tenant.
- **Message too long**: 400 (enforce character limit).
- **Invalid attachments**: 400 (type/size validation).
- **Rate limiting**: 429 (per-user/per-project rate limits to prevent spam/abuse, especially for client users).

**Manual Intervention**: None

---

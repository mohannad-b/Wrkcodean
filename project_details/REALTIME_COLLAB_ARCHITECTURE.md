# WRK Copilot Realtime & Collaboration Architecture

## 1. Goals

- Deliver chat-like responsiveness for messaging, blueprint edits, tasks, and lifecycle status changes.
- Preserve tenant isolation and RBAC; only authorized users should receive events.
- Keep concurrency semantics understandable (last-write-wins + optimistic concurrency hints).

---

## 2. Realtime Surface Area

1. **Messages (Flow 30):** stream new messages into project/automation threads.
2. **Tasks (Flows 31–32):** show creation/status updates immediately on dashboards.
3. **Automation Status (Flows 13/24/24A/24B/26/35):** update status chips as lifecycle helpers run.
4. **Blueprint Canvas:** broadcast node/edge diffs so collaborators stay in sync (near-real-time push; full CRDTs can wait).

---

## 3. Transport & Channels

### 3.1 Transport

- WebSockets (preferred) or SSE behind the API gateway.
- Clients authenticate the socket using their JWT; one connection per session.

### 3.2 Channel Model

- `tenant:{tenantId}` – tenant-level notifications.
- `tenant:{tenantId}:project:{projectId}` – project-scoped messages/tasks/status.
- `tenant:{tenantId}:automation_version:{versionId}` – blueprint + automation status.

Server-side subscription logic MUST derive the tenant from the JWT, perform RBAC (`can(user,"read", resource)`), and refuse arbitrary client-supplied channel names.

---

## 4. Message Types

Representative events pushed over channels:

- `message.created` – includes message metadata, project_id, tenant_id.
- `task.updated` – includes task id/status plus context.
- `automation_version.status_changed` – old/new status for dashboards.
- `blueprint.updated` – incremental diff (added/updated/deleted nodes) + version.

All events include tenant scoping metadata so downstream fanout remains safe.

---

## 5. Blueprint Collaboration

### 5.1 Consistency Model

- Source of truth: `automation_versions.blueprint_json`.
- Clients fetch on load, apply local edits, send mutations (diffs) to the backend, and consume server-confirmed diffs via realtime events.

### 5.2 Concurrency Strategy

- Serialize writes per automation_version (DB locks or per-version mutex).
- Last-write-wins at node/edge granularity:
  - Different nodes edited concurrently → both succeed.
  - Same node edited concurrently → latest write overwrites.
- Clients send `last_known_version`; backend may return `409 concurrency_conflict` if the request is too stale so the UI can refetch.

### 5.3 Presence (Future)

- Optional enhancements: "X is viewing this automation", shared cursors, selection highlights. Not required for v1.

---

## 6. Client Patterns

### 6.1 Connection Management

- Provide a `realtimeClient` abstraction that opens/closes sockets, includes JWT auth, and resubscribes after reconnect.

### 6.2 State Updates

- **Messages:** append to in-memory arrays, manage scroll position.
- **Tasks:** merge updates by ID.
- **Status chips:** update local caches when `status_changed` events arrive.
- **Blueprint:** apply diffs to the local graph; refetch the full blueprint if conflicts are detected.

---

## 7. Security & Isolation

- Channel subscription is server-authoritative.
- Payload filtering enforces RBAC (e.g., `message.type='ops'` never sent to client roles; `internal_note` only goes to ops roles).
- Rate-limit per connection and per tenant to prevent spam/flooding.

---

## 8. Scalability

- Use a managed pub/sub (Redis Streams, NATS, Kafka) behind the WebSocket tier for fanout.
- Publish once per event; subscribers receive based on channel membership.
- Handle backpressure: drop non-critical events (typing indicators) before critical ones (status changes) if clients lag.

---

## 9. Failure Modes & Fallback

- On connection loss, show UI feedback and fall back to polling (e.g., every N seconds).
- Apply exponential backoff for reconnect attempts.
- After reconnect or when a tab regains focus, refetch full state to cover missed events.

---

## 10. Implementation Checklist

- [ ] WebSocket gateway with JWT auth and server-derived channel lists.
- [ ] Per-domain publishers wired into the relevant flows (30–35, 13, 24-family, 26).
- [ ] Client `realtimeClient` + hooks (e.g., `useProjectRealtime`).
- [ ] Tests for RBAC enforcement, tenant isolation, and blueprint concurrency scenarios.

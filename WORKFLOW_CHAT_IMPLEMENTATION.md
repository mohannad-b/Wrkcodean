# Workflow Chat Implementation Summary

This document summarizes the real-time chat system implementation for WrkCoPilot.

## Overview

A complete real-time chat system has been implemented that allows the Wrk team and clients to communicate about specific workflows. The system includes:

- Real-time message delivery via Server-Sent Events (SSE)
- Optimistic UI with client-generated IDs
- Typing indicators and presence
- Read receipts
- System messages for workflow events
- RBAC-based permissions
- Email notifications for offline users
- Wrk team shared inbox

## Database Schema

### New Tables

1. **workflow_conversations**
   - One conversation per workflow (workspaceId + workflowId)
   - Tracks assignment to Wrk team members
   - Indexed by (tenantId, automationVersionId)

2. **workflow_messages**
   - Messages in conversations
   - Supports client/wrk/system sender types
   - Includes attachments (JSON metadata)
   - Supports clientGeneratedId for optimistic UI deduplication
   - Soft deletes (deletedAt)
   - Indexed for efficient pagination

3. **workflow_read_receipts**
   - Tracks last read message per user per conversation
   - Used for unread counts

4. **wrk_staff_memberships**
   - Tracks Wrk internal staff roles (wrk_admin, wrk_operator, wrk_viewer)
   - Separate from workspace memberships

### New Enums

- `workflow_message_sender_type`: client, wrk, system
- `wrk_staff_role`: wrk_admin, wrk_operator, wrk_viewer

## RBAC Extensions

### New Permissions

- `workflow:chat:read` - Read chat messages
- `workflow:chat:write` - Send messages
- `workflow:chat:edit` - Edit own messages
- `workflow:chat:delete` - Delete own messages
- `wrk:chat:read` - Wrk staff can read all chats
- `wrk:chat:write` - Wrk staff can write to all chats
- `wrk:chat:edit` - Wrk staff can edit any message
- `wrk:chat:delete` - Wrk staff can delete any message
- `wrk:inbox:view` - Access Wrk shared inbox

### Permission Rules

- **Workspace roles**: owner/admin/editor can read+write chat; viewer/billing cannot access
- **Wrk staff**: Can access all chats across all workspaces
  - wrk_admin, wrk_operator: read+write+edit+delete
  - wrk_viewer: read-only
- **Message editing**: Users can only edit their own messages; Wrk staff can edit any message
- **Message deletion**: Same rules as editing

## API Routes

### Workflow Chat

- `GET /api/workflows/[workflowId]/chat/messages` - List messages (paginated)
- `POST /api/workflows/[workflowId]/chat/messages` - Send message
- `PATCH /api/workflows/[workflowId]/chat/messages/[messageId]` - Edit message
- `DELETE /api/workflows/[workflowId]/chat/messages/[messageId]` - Delete message
- `POST /api/workflows/[workflowId]/chat/read` - Mark conversation as read
- `GET /api/workflows/[workflowId]/chat/events` - SSE stream for realtime updates
- `POST /api/workflows/[workflowId]/chat/typing` - Emit typing indicator

### Wrk Team

- `GET /api/wrk/inbox` - List workflows with recent chat activity (Wrk staff only)

## Realtime Layer

### Server-Sent Events (SSE)

- Endpoint: `/api/workflows/[workflowId]/chat/events`
- Event types:
  - `message.created` - New message
  - `message.updated` - Message edited
  - `message.deleted` - Message deleted
  - `typing.started` - User started typing
  - `typing.stopped` - User stopped typing
  - `readreceipt.updated` - Read receipt updated
  - `heartbeat` - Keep-alive every 30 seconds

### Event Emitter

- In-memory event emitter (singleton)
- In production, should use Redis pub/sub for multi-instance support
- Events are scoped by conversationId

## Client Components

### WorkflowChat Component

Location: `components/workflow-chat/WorkflowChat.tsx`

Features:
- Message list with scroll behavior
- Auto-scroll to bottom when at bottom
- "New messages" pill when scrolled up
- Message composer with optimistic UI
- Typing indicators
- Read receipts
- System messages (visually distinct)
- Retry failed messages
- Message status (sending/sent/failed)

### Optimistic UI

- Client generates unique IDs for messages
- Messages appear immediately with "sending..." status
- Server returns real message ID, client deduplicates
- Failed messages show retry button

## Services

### workflow-chat.ts

Core chat operations:
- `getOrCreateConversation` - Get or create conversation for workflow
- `listMessages` - Paginated message list
- `createMessage` - Create new message
- `updateMessage` - Edit message (with permission check)
- `deleteMessage` - Soft delete message (with permission check)
- `markConversationRead` - Update read receipt
- `getUnreadCount` - Get unread message count
- `listWrkInboxConversations` - List conversations for Wrk inbox

### workflow-chat-system.ts

System message helpers:
- `createSystemMessage` - Create system message
- `notifyWorkflowStatusChange` - System message for status changes
- `notifyTaskAssigned` - System message for task assignment
- `notifyWorkflowAssigned` - System message for workflow assignment

### workflow-chat-notifications.ts

Email notifications:
- `notifyNewMessage` - Queue email notifications for offline users
- Respects user notification preferences
- Batches notifications (one email per recipient)
- Only notifies users who haven't read the thread

## Integration Points

### System Messages

System messages are automatically created when:
- Workflow status changes (via `notifyWorkflowStatusChange`)
- Tasks are assigned (via `notifyTaskAssigned`)
- Workflow is assigned to Wrk team member (via `notifyWorkflowAssigned`)

### Audit Logging

All message operations are logged:
- `workflow.chat.message.sent`
- `workflow.chat.message.edited`
- `workflow.chat.message.deleted`

## Testing Checklist

### Manual QA

- [ ] Multi-user in same workflow sees realtime messages
- [ ] Viewer/billing roles cannot access chat UI or API
- [ ] Wrk staff can access all chats across workspaces
- [ ] Offline notification triggers email
- [ ] Message edits/deletes are audited
- [ ] Optimistic UI works (instant send, deduplication)
- [ ] Typing indicators appear/disappear
- [ ] Read receipts update correctly
- [ ] System messages display correctly
- [ ] Unread counts accurate
- [ ] Wrk inbox shows workflows with activity

### Unit Tests Needed

- RBAC gating (viewer/billing denied)
- Message creation and scoping (workspace isolation)
- Optimistic dedupe via clientGeneratedId
- Read receipt updates
- Realtime event emission (mocked)
- No duplicate messages on reconnect

## Production Considerations

1. **Realtime Scaling**: Replace in-memory event emitter with Redis pub/sub
2. **Email Templates**: Create `workflow-chat-message` email template
3. **File Attachments**: Implement S3 pre-signed URL flow for file uploads
4. **Rate Limiting**: Add rate limits to message sending
5. **Message Retention**: Consider retention policies for old messages
6. **Presence**: Implement proper presence tracking (online/offline/last-seen)
7. **Typing Indicators**: Currently basic; could be enhanced with debouncing

## Migration

Run database migrations to create new tables:

```bash
npm run db:generate
npm run db:migrate
```

## Usage Example

```tsx
import { WorkflowChat } from "@/components/workflow-chat/WorkflowChat";

<WorkflowChat workflowId={automationVersionId} disabled={false} />
```

## Notes

- All queries are scoped by workspaceId for tenant isolation
- Wrk staff bypass tenant checks for read operations but still respect tenant boundaries for writes
- System messages are created server-side only, never via API
- Email notifications respect user preferences (all/mentions/none)
- Chat UI is hidden for viewer/billing roles (no UI, no API access)


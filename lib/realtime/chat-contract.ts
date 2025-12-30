/**
 * Chat event contract v1
 *
 * - One conversation per workflow (see workflowConversations uniqueness)
 * - Clients must ignore unknown event types.
 * - Ordering is best-effort; clients must be idempotent and dedupe via eventId.
 */
export const CHAT_EVENT_TYPES = [
  "connected",
  "ping",
  "message.created",
  "message.updated",
  "message.deleted",
  "typing.started",
  "typing.stopped",
  "read.updated",
] as const;

export type ChatEventType = (typeof CHAT_EVENT_TYPES)[number];

export type ChatActor = { kind: "staff" | "tenant"; userId: string };

/**
 * Canonical chat event envelope.
 * `payload` is the canonical field; `data` is kept as an alias for older clients.
 */
export type ChatEvent<TPayload = unknown> = {
  eventId: string;
  type: ChatEventType | string;
  workspaceId?: string;
  workflowId: string;
  conversationId: string;
  tenantId: string;
  messageId?: string;
  createdAt: string;
  actor?: ChatActor;
  payload: TPayload;
  data: TPayload;
};

export type ConnectedEventPayload = {
  type: "connected";
  conversationId: string;
  lastMessageId?: string | null;
  lastReadMessageId?: string | null;
  unreadCount?: number;
  resyncRecommended?: boolean;
};


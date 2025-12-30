import { and, desc, eq, isNull, lt, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  workflowConversations,
  workflowMessages,
  workflowReadReceipts,
  users,
  type WorkflowMessage,
  type WorkflowConversation,
  type WorkflowReadReceipt,
} from "@/db/schema";
import type { TenantOrStaffSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { emitChatEvent, type ChatActor } from "@/lib/realtime/events";
import { notifyNewMessage } from "./workflow-chat-notifications";

export type WorkflowMessageWithSender = WorkflowMessage & {
  sender?: {
    id: string;
    name: string | null;
    email: string;
    avatarUrl: string | null;
  };
};

export type WorkflowConversationWithMetadata = WorkflowConversation & {
  lastMessage?: WorkflowMessageWithSender | null;
  unreadCount?: number;
};

/**
 * Get or create a conversation for a workflow
 *
 * Invariant: one conversation per workflow (workflowId = automationVersionId) and tenant.
 */
export async function getOrCreateConversation(params: {
  tenantId: string;
  automationVersionId: string;
}): Promise<WorkflowConversation> {
  const existing = await db.query.workflowConversations.findFirst({
    where: and(
      eq(workflowConversations.tenantId, params.tenantId),
      eq(workflowConversations.automationVersionId, params.automationVersionId)
    ),
  });

  if (existing) {
    return existing;
  }

  const [conversation] = await db
    .insert(workflowConversations)
    .values({
      tenantId: params.tenantId,
      automationVersionId: params.automationVersionId,
    })
    .returning();

  if (!conversation) {
    throw new Error("Failed to create conversation");
  }

  return conversation;
}

/**
 * List messages for a conversation with pagination
 */
export async function listMessages(params: {
  conversationId: string;
  tenantId: string;
  limit?: number;
  before?: string; // message ID to paginate before
  includeDeleted?: boolean;
}): Promise<WorkflowMessageWithSender[]> {
  const limit = params.limit ?? 50;

  const whereConditions = [
    eq(workflowMessages.conversationId, params.conversationId),
    eq(workflowMessages.tenantId, params.tenantId),
  ];

  if (params.before) {
    whereConditions.push(lt(workflowMessages.id, params.before));
  }

  const messages = await db
    .select()
    .from(workflowMessages)
    .where(params.includeDeleted ? and(...whereConditions) : and(...whereConditions, isNull(workflowMessages.deletedAt)))
    .orderBy(desc(workflowMessages.createdAt))
    .limit(limit);

  console.log(`[listMessages] Found ${messages.length} messages for conversation ${params.conversationId}, tenant ${params.tenantId}`);

  // Fetch sender information for messages with senderUserId
  const senderUserIds = messages
    .map((m) => m.senderUserId)
    .filter((id): id is string => id !== null);
  
  const senderUsers = senderUserIds.length > 0
    ? await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          avatarUrl: users.avatarUrl,
        })
        .from(users)
        .where(inArray(users.id, senderUserIds))
    : [];

  console.log(`[listMessages] Found ${senderUsers.length} sender users for ${senderUserIds.length} message senders`);

  const senderMap = new Map(senderUsers.map((u) => [u.id, u]));

  return messages.map((message) => ({
    ...message,
    // Mask deleted bodies to avoid leaking content while keeping position.
    body: message.deletedAt ? "" : message.body,
    sender: message.senderUserId ? senderMap.get(message.senderUserId) : undefined,
  }));
}

/**
 * Create a new message
 */
export async function createMessage(params: {
  conversationId: string;
  tenantId: string;
  automationVersionId: string;
  senderType: "client" | "wrk" | "system";
  senderUserId: string | null;
  body: string;
  attachments?: Array<{ fileId: string; filename: string; mimeType: string; sizeBytes: number; url?: string }>;
  clientGeneratedId?: string;
}): Promise<WorkflowMessage> {
  // Check for duplicate by clientGeneratedId if provided
  if (params.clientGeneratedId) {
    const existing = await db.query.workflowMessages.findFirst({
      where: and(
        eq(workflowMessages.conversationId, params.conversationId),
        eq(workflowMessages.clientGeneratedId, params.clientGeneratedId)
      ),
    });

    if (existing) {
      return existing;
    }
  }

  const [message] = await db
    .insert(workflowMessages)
    .values({
      conversationId: params.conversationId,
      tenantId: params.tenantId,
      automationVersionId: params.automationVersionId,
      senderType: params.senderType,
      senderUserId: params.senderUserId,
      body: params.body,
      attachments: params.attachments ?? [],
      clientGeneratedId: params.clientGeneratedId ?? null,
    })
    .returning();

  if (!message) {
    throw new Error("Failed to create message");
  }

  // Update conversation updatedAt
  await db
    .update(workflowConversations)
    .set({ updatedAt: new Date() })
    .where(eq(workflowConversations.id, params.conversationId));

  // Fetch sender information if senderUserId exists
  let senderInfo: { id: string; name: string | null; email: string; avatarUrl: string | null } | undefined;
  if (message.senderUserId) {
    const sender = await db.query.users.findFirst({
      where: eq(users.id, message.senderUserId),
    });
    if (sender) {
      senderInfo = {
        id: sender.id,
        name: sender.name,
        email: sender.email,
        avatarUrl: sender.avatarUrl,
      };
    }
  }

  // Emit realtime event with sender information
  const actor: ChatActor | undefined = params.senderUserId
    ? { kind: params.senderType === "wrk" ? "staff" : "tenant", userId: params.senderUserId }
    : undefined;

  await emitChatEvent({
    type: "message.created",
    conversationId: params.conversationId,
    workflowId: params.automationVersionId,
    tenantId: params.tenantId,
    workspaceId: params.tenantId,
    messageId: message.id,
    actor,
    data: {
      ...message,
      sender: senderInfo,
    },
  });

  // Queue email notifications for offline users (async, don't await)
  notifyNewMessage({
    conversationId: params.conversationId,
    workflowId: params.automationVersionId,
    tenantId: params.tenantId,
    messageId: message.id,
    senderUserId: params.senderUserId,
  }).catch((error) => {
    console.error("Failed to queue notifications:", error);
  });

  return message;
}

/**
 * Update a message (edit)
 */
export async function updateMessage(params: {
  messageId: string;
  tenantId: string;
  body: string;
  session: TenantOrStaffSession;
}): Promise<WorkflowMessage> {
  const message = await db.query.workflowMessages.findFirst({
    where: and(
      eq(workflowMessages.id, params.messageId),
      eq(workflowMessages.tenantId, params.tenantId),
      isNull(workflowMessages.deletedAt)
    ),
  });

  if (!message) {
    throw new Error("Message not found");
  }

  // Check permissions: user can only edit their own messages, or Wrk staff can edit any
  const canEdit =
    message.senderUserId === params.session.userId ||
    (params.session.kind === "staff" &&
      message.senderType === "wrk" &&
      can(params.session, "workflow:chat:edit", { type: "workflow", tenantId: params.tenantId, workflowId: message.automationVersionId }));

  if (!canEdit) {
    throw new Error("Forbidden: Cannot edit this message");
  }

  const [updated] = await db
    .update(workflowMessages)
    .set({
      body: params.body,
      editedAt: new Date(),
    })
    .where(eq(workflowMessages.id, params.messageId))
    .returning();

  if (!updated) {
    throw new Error("Failed to update message");
  }

  // Fetch sender information if senderUserId exists
  let senderInfo: { id: string; name: string | null; email: string; avatarUrl: string | null } | undefined;
  if (updated.senderUserId) {
    const sender = await db.query.users.findFirst({
      where: eq(users.id, updated.senderUserId),
    });
    if (sender) {
      senderInfo = {
        id: sender.id,
        name: sender.name,
        email: sender.email,
        avatarUrl: sender.avatarUrl,
      };
    }
  }

  // Emit realtime event
  const conversation = await db.query.workflowConversations.findFirst({
    where: eq(workflowConversations.id, message.conversationId),
  });

  if (conversation) {
    await emitChatEvent({
      type: "message.updated",
      conversationId: message.conversationId,
      workflowId: message.automationVersionId,
      tenantId: message.tenantId,
      workspaceId: message.tenantId,
      messageId: updated.id,
      actor: { kind: params.session.kind, userId: params.session.userId },
      data: {
        ...updated,
        sender: senderInfo,
      },
    });
  }

  return updated;
}

/**
 * Delete a message (soft delete)
 */
export async function deleteMessage(params: {
  messageId: string;
  tenantId: string;
  session: TenantOrStaffSession;
}): Promise<void> {
  const message = await db.query.workflowMessages.findFirst({
    where: and(
      eq(workflowMessages.id, params.messageId),
      eq(workflowMessages.tenantId, params.tenantId),
      isNull(workflowMessages.deletedAt)
    ),
  });

  if (!message) {
    throw new Error("Message not found");
  }

  // Check permissions: user can only delete their own messages, or Wrk staff can delete any
  const canDelete =
    message.senderUserId === params.session.userId ||
    (params.session.kind === "staff" &&
      message.senderType === "wrk" &&
      can(params.session, "workflow:chat:delete", {
        type: "workflow",
        tenantId: params.tenantId,
        workflowId: message.automationVersionId,
      }));

  if (!canDelete) {
    throw new Error("Forbidden: Cannot delete this message");
  }

  const deletedAt = new Date();

  await db
    .update(workflowMessages)
    .set({ deletedAt })
    .where(eq(workflowMessages.id, params.messageId));

  // Emit realtime event
  const conversation = await db.query.workflowConversations.findFirst({
    where: eq(workflowConversations.id, message.conversationId),
  });

  if (conversation) {
    await emitChatEvent({
      type: "message.deleted",
      conversationId: message.conversationId,
      workflowId: message.automationVersionId,
      tenantId: message.tenantId,
      workspaceId: message.tenantId,
      messageId: params.messageId,
      actor: { kind: params.session.kind, userId: params.session.userId },
      data: { messageId: params.messageId, deletedAt: deletedAt.toISOString() },
    });
  }
}

/**
 * Mark conversation as read
 */
export async function markConversationRead(params: {
  conversationId: string;
  userId: string;
  lastReadMessageId: string;
  actorKind: "tenant" | "staff";
}): Promise<WorkflowReadReceipt> {
  const [receipt] = await db
    .insert(workflowReadReceipts)
    .values({
      conversationId: params.conversationId,
      userId: params.userId,
      lastReadMessageId: params.lastReadMessageId,
    })
    .onConflictDoUpdate({
      target: [workflowReadReceipts.conversationId, workflowReadReceipts.userId],
      set: {
        lastReadMessageId: params.lastReadMessageId,
        updatedAt: new Date(),
      },
    })
    .returning();

  if (!receipt) {
    throw new Error("Failed to update read receipt");
  }

  // Emit realtime event
  const conversation = await db.query.workflowConversations.findFirst({
    where: eq(workflowConversations.id, params.conversationId),
  });

  if (conversation) {
    const message = await db.query.workflowMessages.findFirst({
      where: eq(workflowMessages.id, params.lastReadMessageId),
    });

    if (message) {
      await emitChatEvent({
        type: "read.updated",
        conversationId: params.conversationId,
        workflowId: message.automationVersionId,
        tenantId: message.tenantId,
        workspaceId: message.tenantId,
        messageId: message.id,
        actor: { kind: params.actorKind, userId: params.userId },
        data: receipt,
      });
    }
  }

  return receipt;
}

/**
 * Get unread count for a conversation
 */
export async function getUnreadCount(params: {
  conversationId: string;
  userId: string;
}): Promise<number> {
  const receipt = await db.query.workflowReadReceipts.findFirst({
    where: and(
      eq(workflowReadReceipts.conversationId, params.conversationId),
      eq(workflowReadReceipts.userId, params.userId)
    ),
  });

  if (!receipt || !receipt.lastReadMessageId) {
    // Count all messages if no read receipt
    const allMessages = await db
      .select({ count: sql<number>`count(*)` })
      .from(workflowMessages)
      .where(
        and(
          eq(workflowMessages.conversationId, params.conversationId),
          isNull(workflowMessages.deletedAt)
        )
      );
    return Number(allMessages[0]?.count ?? 0);
  }

  // Count messages after last read
  const unreadMessages = await db
    .select({ count: sql<number>`count(*)` })
    .from(workflowMessages)
    .where(
      and(
        eq(workflowMessages.conversationId, params.conversationId),
        isNull(workflowMessages.deletedAt),
        sql`${workflowMessages.id} > ${receipt.lastReadMessageId}`
      )
    );

  return Number(unreadMessages[0]?.count ?? 0);
}

/**
 * List conversations for Wrk inbox (all workflows with recent activity)
 */
export async function listWrkInboxConversations(params: {
  limit?: number;
  status?: string;
}): Promise<WorkflowConversationWithMetadata[]> {
  const limit = params.limit ?? 50;

  // This is a simplified version - in production, you'd want to join with automationVersions
  // to filter by status and get workflow metadata
  const conversations = await db.query.workflowConversations.findMany({
    orderBy: desc(workflowConversations.updatedAt),
    limit,
  });

  // Get last message for each conversation
  const conversationsWithMetadata = await Promise.all(
    conversations.map(async (conv) => {
      const lastMessage = await db.query.workflowMessages.findFirst({
        where: and(
          eq(workflowMessages.conversationId, conv.id),
          isNull(workflowMessages.deletedAt)
        ),
        orderBy: desc(workflowMessages.createdAt),
      });

      return {
        ...conv,
        lastMessage: lastMessage ? (lastMessage as WorkflowMessageWithSender) : null,
      };
    })
  );

  return conversationsWithMetadata;
}


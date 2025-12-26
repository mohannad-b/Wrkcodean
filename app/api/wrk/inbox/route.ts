import { NextResponse } from "next/server";
import { ApiError, handleApiError, requireWrkStaffSession } from "@/lib/api/context";
import { authorize } from "@/lib/auth/rbac";
import { listWrkInboxConversations, getUnreadCount } from "@/lib/services/workflow-chat";
import { db } from "@/db";
import { workflowConversations, automationVersions, automations, workflowMessages } from "@/db/schema";
import { eq, and, desc, sql, isNull } from "drizzle-orm";

export async function GET(request: Request) {
  try {
    const session = await requireWrkStaffSession();

    authorize("platform:chat:read", { type: "platform" }, session);

    // Parse query params
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get("limit") ?? "50", 10);
    const status = url.searchParams.get("status") ?? undefined;

    // Get conversations with workflow metadata
    const conversations = await db
      .select({
        conversation: workflowConversations,
        automationVersion: automationVersions,
        automation: automations,
      })
      .from(workflowConversations)
      .innerJoin(
        automationVersions,
        eq(workflowConversations.automationVersionId, automationVersions.id)
      )
      .innerJoin(automations, eq(automationVersions.automationId, automations.id))
      .where(status ? eq(automationVersions.status, status as any) : undefined)
      .orderBy(desc(workflowConversations.updatedAt))
      .limit(limit);

    // Get unread counts and last messages
    const conversationsWithMetadata = await Promise.all(
      conversations.map(async (row) => {
        const unreadCount = await getUnreadCount({
          conversationId: row.conversation.id,
          userId: session.userId,
        });

        const lastMessageRow = await db
          .select()
          .from(workflowMessages)
          .where(
            and(
              eq(workflowMessages.conversationId, row.conversation.id),
              isNull(workflowMessages.deletedAt)
            )
          )
          .orderBy(desc(workflowMessages.createdAt))
          .limit(1);

        const lastMessage = lastMessageRow[0] || null;

        return {
          conversationId: row.conversation.id,
          workflowId: row.automationVersion.id,
          workflowName: row.automation.name,
          workflowStatus: row.automationVersion.status,
          tenantId: row.conversation.tenantId,
          lastMessage: lastMessage
            ? {
                id: lastMessage.id,
                body: lastMessage.body.slice(0, 100),
                senderType: lastMessage.senderType,
                createdAt: lastMessage.createdAt,
              }
            : null,
          unreadCount,
          updatedAt: row.conversation.updatedAt,
        };
      })
    );

    return NextResponse.json({ conversations: conversationsWithMetadata });
  } catch (error) {
    return handleApiError(error);
  }
}


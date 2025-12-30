import { NextResponse } from "next/server";
import { z } from "zod";
import { authorize } from "@/lib/auth/rbac";
import { ApiError, handleApiError, requireEitherTenantOrStaffSession } from "@/lib/api/context";
import {
  getOrCreateConversation,
  listMessages,
  createMessage,
  getUnreadCount,
} from "@/lib/services/workflow-chat";
import { logAudit } from "@/lib/audit/log";
import { db } from "@/db";
import { automationVersions, users, workflowReadReceipts } from "@/db/schema";
import { eq, and } from "drizzle-orm";

const CreateMessageSchema = z.object({
  body: z.string().min(1).max(10000),
  attachments: z
    .array(
      z.object({
        fileId: z.string(),
        filename: z.string(),
        mimeType: z.string(),
        sizeBytes: z.number(),
        url: z.string().optional(),
      })
    )
    .optional()
    .default([]),
  clientGeneratedId: z.string().optional(),
});

export async function GET(
  request: Request,
  { params }: { params: { workflowId: string } }
) {
  try {
    const session = await requireEitherTenantOrStaffSession();

    // Verify workflow exists - for Wrk staff, don't filter by tenantId
    let workflow = await db.query.automationVersions.findFirst({
      where:
        session.kind === "staff"
          ? eq(automationVersions.id, params.workflowId)
          : and(
              eq(automationVersions.id, params.workflowId),
              eq(automationVersions.tenantId, session.tenantId)
            ),
    });

    if (!workflow) {
      console.log(`[GET /api/workflows/${params.workflowId}/chat/messages] Workflow not found`);
      throw new ApiError(404, "Workflow not found");
    }

    const authContext = { type: "workflow" as const, tenantId: workflow.tenantId, workflowId: workflow.id };
    authorize("workflow:chat:read", authContext, session);

    // Get or create conversation - always use workflow's tenantId
    const conversation = await getOrCreateConversation({
      tenantId: workflow.tenantId,
      automationVersionId: params.workflowId,
    });

    // Parse query params
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get("limit") ?? "50", 10);
    const before = url.searchParams.get("before") ?? undefined;

    // Use workflow's tenantId for message queries
    const [messages, receipt, unreadCount] = await Promise.all([
      listMessages({
        conversationId: conversation.id,
        tenantId: workflow.tenantId,
        limit,
        before,
        includeDeleted: true,
      }),
      db.query.workflowReadReceipts.findFirst({
        where: and(
          eq(workflowReadReceipts.conversationId, conversation.id),
          eq(workflowReadReceipts.userId, session.userId)
        ),
      }),
      getUnreadCount({ conversationId: conversation.id, userId: session.userId }),
    ]);

    return NextResponse.json({
      messages,
      conversationId: conversation.id,
      unreadCount,
      lastReadMessageId: receipt?.lastReadMessageId ?? null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: { workflowId: string } }
) {
  try {
    const session = await requireEitherTenantOrStaffSession();

    // Verify workflow exists - for Wrk staff, don't filter by tenantId
    let workflow = await db.query.automationVersions.findFirst({
      where:
        session.kind === "staff"
          ? eq(automationVersions.id, params.workflowId)
          : and(
              eq(automationVersions.id, params.workflowId),
              eq(automationVersions.tenantId, session.tenantId)
            ),
    });

    if (!workflow) {
      throw new ApiError(404, "Workflow not found");
    }

    const authContext = { type: "workflow" as const, tenantId: workflow.tenantId, workflowId: workflow.id };
    authorize("workflow:chat:write", authContext, session);

    // Parse request body
    let payload: z.infer<typeof CreateMessageSchema>;
    try {
      payload = CreateMessageSchema.parse(await request.json());
    } catch {
      throw new ApiError(400, "Invalid request body");
    }

    // Get or create conversation - always use workflow's tenantId
    const conversation = await getOrCreateConversation({
      tenantId: workflow.tenantId,
      automationVersionId: params.workflowId,
    });

    // Determine sender type
    const senderType = session.kind === "staff" ? "wrk" : "client";

    const message = await createMessage({
      conversationId: conversation.id,
      tenantId: workflow.tenantId,
      automationVersionId: params.workflowId,
      senderType,
      senderUserId: session.userId,
      body: payload.body.trim(),
      attachments: payload.attachments,
      clientGeneratedId: payload.clientGeneratedId,
    });

    // Fetch sender information
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

    await logAudit({
      tenantId: workflow.tenantId,
      userId: session.userId,
      action: "workflow.chat.message.sent",
      resourceType: "automation_version",
      resourceId: params.workflowId,
      metadata: {
        messageId: message.id,
        senderType,
        preview: payload.body.trim().slice(0, 240),
      },
    });

    return NextResponse.json(
      {
        message: {
          ...message,
          sender: senderInfo,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}


import { NextResponse } from "next/server";
import { z } from "zod";
import { can } from "@/lib/auth/rbac";
import { ApiError, handleApiError, requireEitherTenantOrStaffSession } from "@/lib/api/context";
import {
  getOrCreateConversation,
  listMessages,
  createMessage,
} from "@/lib/services/workflow-chat";
import { logAudit } from "@/lib/audit/log";
import { isWrkStaff } from "@/lib/auth/rbac";
import { db } from "@/db";
import { automationVersions, users } from "@/db/schema";
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

    console.log(`[GET /api/workflows/${params.workflowId}/chat/messages] Session:`, {
      userId: session.userId,
      tenantId: session.tenantId,
      roles: session.roles,
      wrkStaffRole: session.wrkStaffRole,
      kind: session.kind,
      isWrkStaff: isWrkStaff(session),
    });

    // Verify workflow exists - for Wrk staff, don't filter by tenantId
    let workflow = await db.query.automationVersions.findFirst({
      where:
        session.kind === "staff" && isWrkStaff(session)
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

    console.log(`[GET /api/workflows/${params.workflowId}/chat/messages] Workflow found:`, {
      workflowId: workflow.id,
      workflowTenantId: workflow.tenantId,
      sessionTenantId: session.tenantId,
    });

    // Check permissions
    const canReadWorkflow = can(session, "workflow:chat:read", {
      type: "automation_version",
      tenantId: workflow.tenantId,
    });
    const canReadWrk = can(session, "wrk:chat:read", undefined);
    const canRead = canReadWorkflow || canReadWrk;

    console.log(`[GET /api/workflows/${params.workflowId}/chat/messages] Permissions:`, {
      canReadWorkflow,
      canReadWrk,
      canRead,
    });

    if (!canRead) {
      throw new ApiError(403, "Forbidden: Cannot read chat");
    }

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
    const messages = await listMessages({
      conversationId: conversation.id,
      tenantId: workflow.tenantId,
      limit,
      before,
    });

    console.log(`[GET /api/workflows/${params.workflowId}/chat/messages]`, {
      workflowId: params.workflowId,
      workflowTenantId: workflow.tenantId,
      sessionTenantId: session.tenantId,
      isWrkStaff: isWrkStaff(session),
      conversationId: conversation.id,
      messageCount: messages.length,
      messages: messages.map(m => ({ id: m.id, senderType: m.senderType, body: m.body.slice(0, 50) })),
    });

    return NextResponse.json({ messages, conversationId: conversation.id });
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
        session.kind === "staff" && isWrkStaff(session)
          ? eq(automationVersions.id, params.workflowId)
          : and(
              eq(automationVersions.id, params.workflowId),
              eq(automationVersions.tenantId, session.tenantId)
            ),
    });

    if (!workflow) {
      throw new ApiError(404, "Workflow not found");
    }

    // Check permissions
    const canWrite =
      can(session, "workflow:chat:write", {
        type: "automation_version",
        tenantId: workflow.tenantId,
      }) || can(session, "wrk:chat:write", undefined);

    if (!canWrite) {
      throw new ApiError(403, "Forbidden: Cannot send messages");
    }

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
    const senderType = isWrkStaff(session) ? "wrk" : "client";

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


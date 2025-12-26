import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, handleApiError, requireEitherTenantOrStaffSession } from "@/lib/api/context";
import { updateMessage, deleteMessage } from "@/lib/services/workflow-chat";
import { logAudit } from "@/lib/audit/log";
import { isWrkStaff } from "@/lib/auth/rbac";
import { db } from "@/db";
import { workflowMessages, automationVersions } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";

const UpdateMessageSchema = z.object({
  body: z.string().min(1).max(10000),
});

export async function PATCH(
  request: Request,
  { params }: { params: { workflowId: string; messageId: string } }
) {
  try {
    const session = await requireEitherTenantOrStaffSession();

    // First, get the workflow to determine tenantId
    const workflow = await db.query.automationVersions.findFirst({
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

    // Verify message exists and belongs to workflow - use workflow's tenantId
    const message = await db.query.workflowMessages.findFirst({
      where: and(
        eq(workflowMessages.id, params.messageId),
        eq(workflowMessages.automationVersionId, params.workflowId),
        eq(workflowMessages.tenantId, workflow.tenantId),
        isNull(workflowMessages.deletedAt)
      ),
    });

    if (!message) {
      throw new ApiError(404, "Message not found");
    }

    // Parse request body
    let payload: z.infer<typeof UpdateMessageSchema>;
    try {
      payload = UpdateMessageSchema.parse(await request.json());
    } catch {
      throw new ApiError(400, "Invalid request body");
    }

    const updated = await updateMessage({
      messageId: params.messageId,
      tenantId: workflow.tenantId,
      body: payload.body.trim(),
      session,
    });

    await logAudit({
      tenantId: workflow.tenantId,
      userId: session.userId,
      action: "workflow.chat.message.edited",
      resourceType: "automation_version",
      resourceId: params.workflowId,
      metadata: {
        messageId: params.messageId,
        preview: payload.body.trim().slice(0, 240),
      },
    });

    return NextResponse.json({ message: updated });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { workflowId: string; messageId: string } }
) {
  try {
    const session = await requireEitherTenantOrStaffSession();

    // First, get the workflow to determine tenantId
    const workflow = await db.query.automationVersions.findFirst({
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

    // Verify message exists and belongs to workflow - use workflow's tenantId
    const message = await db.query.workflowMessages.findFirst({
      where: and(
        eq(workflowMessages.id, params.messageId),
        eq(workflowMessages.automationVersionId, params.workflowId),
        eq(workflowMessages.tenantId, workflow.tenantId),
        isNull(workflowMessages.deletedAt)
      ),
    });

    if (!message) {
      throw new ApiError(404, "Message not found");
    }

    await deleteMessage({
      messageId: params.messageId,
      tenantId: workflow.tenantId,
      session,
    });

    await logAudit({
      tenantId: workflow.tenantId,
      userId: session.userId,
      action: "workflow.chat.message.deleted",
      resourceType: "automation_version",
      resourceId: params.workflowId,
      metadata: {
        messageId: params.messageId,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}


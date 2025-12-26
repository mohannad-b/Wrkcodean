import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, handleApiError, requireEitherTenantOrStaffSession } from "@/lib/api/context";
import { authorize } from "@/lib/auth/rbac";
import { getOrCreateConversation } from "@/lib/services/workflow-chat";
import { emitChatEvent } from "@/lib/realtime/events";
import { db } from "@/db";
import { automationVersions, users } from "@/db/schema";
import { eq, and } from "drizzle-orm";

const TypingSchema = z.object({
  isTyping: z.boolean(),
});

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
    let payload: z.infer<typeof TypingSchema>;
    try {
      payload = TypingSchema.parse(await request.json());
    } catch {
      throw new ApiError(400, "Invalid request body");
    }

    // Get user info
    const user = await db.query.users.findFirst({
      where: eq(users.id, session.userId),
    });

    if (!user) {
      throw new ApiError(404, "User not found");
    }

    // Get or create conversation - always use workflow's tenantId
    const conversation = await getOrCreateConversation({
      tenantId: workflow.tenantId,
      automationVersionId: params.workflowId,
    });

    // Emit typing event
    emitChatEvent({
      type: payload.isTyping ? "typing.started" : "typing.stopped",
      conversationId: conversation.id,
      workflowId: params.workflowId,
      tenantId: workflow.tenantId,
      data: {
        userId: session.userId,
        userName: user.name || user.email,
        timestamp: Date.now(),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}


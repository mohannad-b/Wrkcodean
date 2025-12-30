import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, handleApiError, requireEitherTenantOrStaffSession } from "@/lib/api/context";
import { markConversationRead, getOrCreateConversation } from "@/lib/services/workflow-chat";
import { authorize } from "@/lib/auth/rbac";
import { db } from "@/db";
import { automationVersions } from "@/db/schema";
import { eq, and } from "drizzle-orm";

const MarkReadSchema = z.object({
  lastReadMessageId: z.string().uuid(),
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
    authorize("workflow:chat:read", authContext, session);

    // Parse request body
    let payload: z.infer<typeof MarkReadSchema>;
    try {
      payload = MarkReadSchema.parse(await request.json());
    } catch {
      throw new ApiError(400, "Invalid request body");
    }

    // Get or create conversation - always use workflow's tenantId
    const conversation = await getOrCreateConversation({
      tenantId: workflow.tenantId,
      automationVersionId: params.workflowId,
    });

    const receipt = await markConversationRead({
      conversationId: conversation.id,
      userId: session.userId,
      lastReadMessageId: payload.lastReadMessageId,
      actorKind: session.kind === "staff" ? "staff" : "tenant",
    });

    return NextResponse.json({ receipt });
  } catch (error) {
    return handleApiError(error);
  }
}


import { ApiError, handleApiError, requireEitherTenantOrStaffSession } from "@/lib/api/context";
import { authorize } from "@/lib/auth/rbac";
import { getOrCreateConversation, getUnreadCount } from "@/lib/services/workflow-chat";
import { subscribeToChatEvents, type ChatEvent } from "@/lib/realtime/events";
import { db } from "@/db";
import { automationVersions, workflowMessages, workflowReadReceipts } from "@/db/schema";
import { eq, and, desc, isNull } from "drizzle-orm";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEARTBEAT_INTERVAL_MS = 20000;

export async function GET(request: Request, { params }: { params: { workflowId: string } }) {
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

    // Check permissions
    const authContext = { type: "workflow" as const, tenantId: workflow.tenantId, workflowId: workflow.id };
    authorize("workflow:chat:read", authContext, session);

    // Get or create conversation - always use workflow's tenantId
    const conversation = await getOrCreateConversation({
      tenantId: workflow.tenantId,
      automationVersionId: params.workflowId,
    });

    const lastEventId = request.headers.get("last-event-id");

    const lastMessage = await db.query.workflowMessages.findFirst({
      where: and(
        eq(workflowMessages.conversationId, conversation.id),
        eq(workflowMessages.tenantId, workflow.tenantId),
        isNull(workflowMessages.deletedAt)
      ),
      orderBy: desc(workflowMessages.createdAt),
    });

    const lastReadReceipt = await db.query.workflowReadReceipts.findFirst({
      where: and(
        eq(workflowReadReceipts.conversationId, conversation.id),
        eq(workflowReadReceipts.userId, session.userId)
      ),
    });

    const unreadCount = await getUnreadCount({ conversationId: conversation.id, userId: session.userId });

    // Create SSE stream
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const send = (event: string, data: unknown, id?: string) => {
          const idLine = id ? `id: ${id}\n` : "";
          controller.enqueue(encoder.encode(`${idLine}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };

        send("message", {
          type: "connected",
          conversationId: conversation.id,
          lastMessageId: lastMessage?.id ?? null,
          lastReadMessageId: lastReadReceipt?.lastReadMessageId ?? null,
          unreadCount,
          resyncRecommended: Boolean(lastEventId),
        });

        // Subscribe to events
        const unsubscribe = await subscribeToChatEvents(params.workflowId, (event: ChatEvent) => {
          send("message", event, event.eventId);
        });

        // Keep connection alive with heartbeat
        const heartbeatInterval = setInterval(() => {
          try {
            send("ping", {});
          } catch (error) {
            logger.error("Failed to send SSE heartbeat", error);
          }
        }, HEARTBEAT_INTERVAL_MS);

        // Cleanup on close
        request.signal.addEventListener("abort", () => {
          clearInterval(heartbeatInterval);
          unsubscribe()
            .catch((error) => logger.error("SSE cleanup error", error))
            .finally(() => controller.close());
        });
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no", // Disable nginx buffering
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}


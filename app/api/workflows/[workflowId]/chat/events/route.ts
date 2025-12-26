import { NextResponse } from "next/server";
import { requireEitherTenantOrStaffSession } from "@/lib/api/context";
import { can } from "@/lib/auth/rbac";
import { isWrkStaff } from "@/lib/auth/rbac";
import { getOrCreateConversation } from "@/lib/services/workflow-chat";
import { chatEventEmitter, type ChatEvent } from "@/lib/realtime/events";
import { db } from "@/db";
import { automationVersions } from "@/db/schema";
import { eq, and } from "drizzle-orm";

/**
 * Server-Sent Events endpoint for realtime chat updates
 */
export async function GET(
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
      return new NextResponse("Workflow not found", { status: 404 });
    }

    // Check permissions
    const canRead =
      can(session, "workflow:chat:read", {
        type: "automation_version",
        tenantId: workflow.tenantId,
      }) || can(session, "wrk:chat:read", undefined);

    if (!canRead) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    // Get or create conversation - always use workflow's tenantId
    const conversation = await getOrCreateConversation({
      tenantId: workflow.tenantId,
      automationVersionId: params.workflowId,
    });

    // Create SSE stream
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        // Send initial connection message
        const send = (data: string) => {
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        };

        send(JSON.stringify({ type: "connected", conversationId: conversation.id }));

        // Subscribe to events
        const unsubscribe = chatEventEmitter.subscribe(conversation.id, (event: ChatEvent) => {
          send(JSON.stringify(event));
        });

        // Handle client disconnect
        request.signal.addEventListener("abort", () => {
          unsubscribe();
          controller.close();
        });

        // Keep connection alive with heartbeat
        const heartbeatInterval = setInterval(() => {
          try {
            send(JSON.stringify({ type: "heartbeat", timestamp: new Date().toISOString() }));
          } catch {
            // Client disconnected
            clearInterval(heartbeatInterval);
            unsubscribe();
            controller.close();
          }
        }, 30000); // Every 30 seconds

        // Cleanup on close
        request.signal.addEventListener("abort", () => {
          clearInterval(heartbeatInterval);
          unsubscribe();
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
    console.error("SSE error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}


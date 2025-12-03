import { NextResponse } from "next/server";
import { z } from "zod";
import { can } from "@/lib/auth/rbac";
import { ApiError, handleApiError, requireTenantSession } from "@/lib/api/context";
import { createCopilotMessage, listCopilotMessages } from "@/lib/services/copilot-messages";
import { parseCopilotReply } from "@/lib/ai/parse-copilot-reply";

const MessageInputSchema = z.object({
  role: z.enum(["user", "assistant", "system"]).default("user"),
  content: z.string().min(1).max(4000),
});

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireTenantSession();

    if (!can(session, "automation:read", { type: "automation_version", tenantId: session.tenantId })) {
      throw new ApiError(403, "Forbidden");
    }

    const messages = await listCopilotMessages({
      tenantId: session.tenantId,
      automationVersionId: params.id,
    });

    const sanitizedMessages = messages.map((message) => {
      if (message.role !== "assistant") {
        return message;
      }
      const parsed = parseCopilotReply(message.content);
      return {
        ...message,
        content: parsed.displayText,
      };
    });

    return NextResponse.json({ messages: sanitizedMessages });
  } catch (error) {
    if (error instanceof Error && error.message === "Automation version not found") {
      return handleApiError(new ApiError(404, error.message));
    }
    return handleApiError(error);
  }
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireTenantSession();

    if (!can(session, "automation:metadata:update", { type: "automation_version", tenantId: session.tenantId })) {
      throw new ApiError(403, "Forbidden");
    }

    let payload: z.infer<typeof MessageInputSchema>;
    try {
      payload = MessageInputSchema.parse(await request.json());
    } catch {
      throw new ApiError(400, "Invalid request body.");
    }

    const message = await createCopilotMessage({
      tenantId: session.tenantId,
      automationVersionId: params.id,
      role: payload.role,
      content: payload.content.trim(),
      createdBy: session.userId,
    });

    return NextResponse.json({ message });
  } catch (error) {
    if (error instanceof Error && error.message === "Automation version not found") {
      return handleApiError(new ApiError(404, error.message));
    }
    return handleApiError(error);
  }
}


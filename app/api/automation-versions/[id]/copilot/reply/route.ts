import { NextResponse } from "next/server";
import { can } from "@/lib/auth/rbac";
import { ApiError, handleApiError, requireTenantSession } from "@/lib/api/context";
import { listCopilotMessages, createCopilotMessage } from "@/lib/services/copilot-messages";
import { generateCopilotReply, OpenAIError } from "@/lib/ai/openai-client";
import { COPILOT_SYSTEM_PROMPT } from "@/lib/ai/prompts";

const MAX_CONTEXT_MESSAGES = 20;

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireTenantSession();

    if (!can(session, "automation:read", { type: "automation_version", tenantId: session.tenantId })) {
      throw new ApiError(403, "Forbidden");
    }

    const history = await listCopilotMessages({
      tenantId: session.tenantId,
      automationVersionId: params.id,
    });

    const orderedHistory =
      history.length > MAX_CONTEXT_MESSAGES ? history.slice(-MAX_CONTEXT_MESSAGES) : history;

    const messages = [
      { role: "system" as const, content: COPILOT_SYSTEM_PROMPT },
      ...orderedHistory.map((message) => ({
        role: message.role as "user" | "assistant" | "system",
        content: message.content,
      })),
    ];

    let replyContent: string;
    try {
      replyContent = await generateCopilotReply({ messages });
    } catch (error) {
      console.error("Copilot reply failed:", error);
      if (error instanceof OpenAIError) {
        throw new ApiError(502, "Copilot is unavailable. Try again in a moment.");
      }
      throw error;
    }

    const assistantMessage = await createCopilotMessage({
      tenantId: session.tenantId,
      automationVersionId: params.id,
      role: "assistant",
      content: replyContent,
      createdBy: null,
    });

    return NextResponse.json({ message: assistantMessage });
  } catch (error) {
    return handleApiError(error);
  }
}


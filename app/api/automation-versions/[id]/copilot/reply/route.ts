import { NextResponse } from "next/server";
import { can } from "@/lib/auth/rbac";
import { ApiError, handleApiError, requireTenantSession } from "@/lib/api/context";
import { listCopilotMessages, createCopilotMessage } from "@/lib/services/copilot-messages";
import { generateCopilotReply, OpenAIError } from "@/lib/ai/openai-client";
import { getAutomationVersionDetail } from "@/lib/services/automations";
import { fromDbAutomationStatus, type AutomationLifecycleStatus } from "@/lib/automations/status";
import { parseCopilotReply } from "@/lib/ai/parse-copilot-reply";
import { copilotDebug } from "@/lib/ai/copilot-debug";

const MAX_USER_MESSAGE_LENGTH = 4000;
const LONG_INPUT_RESPONSE =
  "This is a bit too long to handle in one go. Can you summarize the key steps of the workflow you want to automate?";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireTenantSession();

    if (!can(session, "automation:read", { type: "automation_version", tenantId: session.tenantId })) {
      throw new ApiError(403, "Forbidden");
    }

    const versionDetail = await getAutomationVersionDetail(session.tenantId, params.id);
    if (!versionDetail) {
      throw new ApiError(404, "Automation version not found");
    }

    const history = await listCopilotMessages({
      tenantId: session.tenantId,
      automationVersionId: params.id,
    });

    const latestUserMessage = findLatestUserMessage(history);
    if (latestUserMessage && latestUserMessage.content.length > MAX_USER_MESSAGE_LENGTH) {
      const { displayText } = parseCopilotReply(LONG_INPUT_RESPONSE);
      const assistantMessage = await createCopilotMessage({
        tenantId: session.tenantId,
        automationVersionId: params.id,
        role: "assistant",
        content: displayText,
        createdBy: null,
      });
      copilotDebug("reply.long_input", { messageId: assistantMessage.id, content: assistantMessage.content });
      return NextResponse.json({ message: assistantMessage, blueprintUpdates: null });
    }

    let replyContent: string;
    try {
      replyContent = await generateCopilotReply({
        dbMessages: history,
        automationName: versionDetail.automation?.name ?? undefined,
        automationStatus: formatAutomationStatusForPrompt(versionDetail.version.status),
      });
    } catch (error) {
      console.error("Copilot reply failed:", error);
      if (error instanceof OpenAIError) {
        throw new ApiError(502, "Copilot is unavailable. Try again in a moment.");
      }
      throw error;
    }

    copilotDebug("reply.raw_model_content", replyContent);

    const { displayText, blueprintUpdates } = parseCopilotReply(replyContent);
    copilotDebug("reply.parsed", { displayText, blueprintUpdates });

    const assistantMessage = await createCopilotMessage({
      tenantId: session.tenantId,
      automationVersionId: params.id,
      role: "assistant",
      content: displayText,
      createdBy: null,
    });
    copilotDebug("reply.persisted_message", { messageId: assistantMessage.id, content: assistantMessage.content });

    return NextResponse.json({ message: assistantMessage, blueprintUpdates });
  } catch (error) {
    return handleApiError(error);
  }
}

const COPILOT_STATUS_LABELS: Record<AutomationLifecycleStatus, string> = {
  IntakeInProgress: "Intake in Progress",
  NeedsPricing: "Needs Pricing",
  AwaitingClientApproval: "Awaiting Client Approval",
  BuildInProgress: "Build in Progress",
  QATesting: "QA & Testing",
  Live: "Live",
  Archived: "Archived",
};

function formatAutomationStatusForPrompt(status?: string | null): string | undefined {
  if (!status) {
    return undefined;
  }

  const normalized = fromDbAutomationStatus(status);
  return COPILOT_STATUS_LABELS[normalized] ?? normalized;
}

function findLatestUserMessage(
  messages: Array<{ role: string; content: string }>
): { role: string; content: string } | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === "user") {
      return message;
    }
  }
  return undefined;
}


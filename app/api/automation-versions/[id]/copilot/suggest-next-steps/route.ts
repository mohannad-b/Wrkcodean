import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { can } from "@/lib/auth/rbac";
import { ApiError, requireTenantSession } from "@/lib/api/context";
import { getAutomationVersionDetail } from "@/lib/services/automations";
import { listCopilotMessages, createCopilotMessage } from "@/lib/services/copilot-messages";
import { createEmptyBlueprint } from "@/lib/blueprint/factory";
import { buildBlueprintFromChat } from "@/lib/blueprint/ai-builder-simple";
import { applyStepNumbers } from "@/lib/blueprint/step-numbering";
import { syncAutomationTasks } from "@/lib/blueprint/task-sync";
import { BlueprintSchema } from "@/lib/blueprint/schema";
import { automationVersions } from "@/db/schema";
import { db } from "@/db";
import { copilotDebug } from "@/lib/ai/copilot-debug";
import { determineConversationPhase, generateThinkingSteps } from "@/lib/ai/copilot-orchestrator";
import { logAudit } from "@/lib/audit/log";
import { parseCopilotReply } from "@/lib/ai/parse-copilot-reply";
import { buildWorkflowViewModel } from "@/lib/workflows/view-model";

type ConversationMessage = {
  role: "assistant" | "user";
  content: string;
};

type SuggestPayload = {
  messages?: unknown;
};

const MAX_HISTORY_MESSAGES = 12;

type StreamEvent =
  | { status: "thinking" }
  | { status: "message"; content: string }
  | {
      status: "complete";
      payload: {
        thinkingSteps: ReturnType<typeof generateThinkingSteps>;
        conversationPhase: ReturnType<typeof determineConversationPhase>;
        telemetry: {
          sanitizationSummary: Awaited<ReturnType<typeof buildBlueprintFromChat>>["sanitizationSummary"];
        };
      };
    }
  | { status: "error"; message: string };

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const encoder = new TextEncoder();

  const send = (event: StreamEvent) => {
    writer.write(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
  };

  try {
    const session = await requireTenantSession();

    if (!can(session, "automation:metadata:update", { type: "automation_version", tenantId: session.tenantId })) {
      throw new ApiError(403, "Forbidden");
    }

    const detail = await getAutomationVersionDetail(session.tenantId, params.id);
    if (!detail) {
      throw new ApiError(404, "Automation version not found.");
    }
    const workflow = detail.workflowView ?? buildWorkflowViewModel(detail.version.workflowJson);

    const currentBlueprint = workflow.workflowSpec ?? createEmptyBlueprint();
    const body = (await request.json().catch(() => ({}))) as SuggestPayload;
    let conversationHistory: ConversationMessage[];
    if (Array.isArray(body.messages)) {
      const validated = body.messages
        .map((msg) => (isMessage(msg) ? { role: msg.role, content: msg.content } : null))
        .filter((msg): msg is ConversationMessage => Boolean(msg));
      if (validated.length === 0) {
        throw new ApiError(400, "messages must be non-empty and contain role/content strings");
      }
      conversationHistory = validated;
    } else {
      const history = await listCopilotMessages({
        tenantId: session.tenantId,
        automationVersionId: params.id,
      });
      conversationHistory = toConversationHistory(history);
    }

    send({ status: "thinking" });

    const result = await buildBlueprintFromChat({
      userMessage:
        "Review the current blueprint and add the most obvious next steps, exceptions, or clarifications needed to make it production ready. If everything is already complete, tighten any descriptions and confirm readiness.",
      currentBlueprint,
      conversationHistory,
    });

    const numberedBlueprint = applyStepNumbers(result.blueprint);
    const taskAssignments = await syncAutomationTasks({
      tenantId: session.tenantId,
      automationVersionId: params.id,
      aiTasks: result.tasks,
      blueprint: numberedBlueprint,
    });

    const blueprintWithTasks = {
      ...numberedBlueprint,
      steps: numberedBlueprint.steps.map((step) => ({
        ...step,
        taskIds: Array.from(new Set(taskAssignments[step.id] ?? step.taskIds ?? [])),
      })),
    };

    const validatedBlueprint = BlueprintSchema.parse({
      ...blueprintWithTasks,
      status: "Draft",
      updatedAt: new Date().toISOString(),
    });

    const [savedVersion] = await db
      .update(automationVersions)
      .set({
        workflowJson: validatedBlueprint,
        updatedAt: new Date(),
      })
      .where(eq(automationVersions.id, params.id))
      .returning({ automationId: automationVersions.automationId });

    if (!savedVersion) {
      throw new ApiError(500, "Failed to save blueprint.");
    }

    revalidatePath(`/automations/${detail.automation?.id ?? savedVersion.automationId}`);

    const trimmedFollowUp = result.followUpQuestion?.trim();
    const responseMessage = trimmedFollowUp
      ? `${result.chatResponse} ${trimmedFollowUp}`.trim()
      : result.chatResponse;

    await createCopilotMessage({
      tenantId: session.tenantId,
      automationVersionId: params.id,
      role: "assistant",
      content: responseMessage,
      createdBy: null,
    });

    const augmentedHistory: ConversationMessage[] = [
      ...conversationHistory,
      { role: "assistant", content: responseMessage },
    ];
    const conversationPhase = determineConversationPhase(validatedBlueprint, augmentedHistory);
    const thinkingSteps = generateThinkingSteps(
      conversationPhase,
      conversationHistory.find((message) => message.role === "user")?.content,
      validatedBlueprint
    );

    await logAudit({
      tenantId: session.tenantId,
      userId: session.userId,
      action: "automation.blueprint.suggested",
      resourceType: "automation_version",
      resourceId: params.id,
      metadata: {
        source: "suggest_next_steps",
        versionLabel: detail.version.versionLabel,
        sanitizationSummary: result.sanitizationSummary,
        stepCount: result.blueprint.steps.length,
      },
    });

    copilotDebug("draft_blueprint.suggestions", {
      automationVersionId: params.id,
      chatResponse: responseMessage,
      stepCount: validatedBlueprint.steps.length,
      sanitizationSummary: result.sanitizationSummary,
    });
    console.log("[copilot:suggest-next-steps] raw assistant reply:", responseMessage);

    send({ status: "message", content: responseMessage });
    send({
      status: "complete",
      payload: {
        thinkingSteps,
        conversationPhase,
        telemetry: {
          sanitizationSummary: result.sanitizationSummary,
        },
      },
    });
  } catch (error) {
    const message = error instanceof ApiError ? error.message : "Unable to suggest next steps.";
    send({ status: "error", message });
  } finally {
    writer.close();
  }

  return new Response(stream.readable, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

function toConversationHistory(
  messages: Awaited<ReturnType<typeof listCopilotMessages>>
): ConversationMessage[] {
  return messages
    .map((message) => {
      if (message.role === "assistant") {
        const parsed = parseCopilotReply(message.content);
        return { role: "assistant" as const, content: parsed.displayText };
      }
      return { role: "user" as const, content: message.content };
    })
    .filter((message) => message.content.trim().length > 0)
    .slice(-MAX_HISTORY_MESSAGES);
}

function isMessage(value: unknown): value is ConversationMessage {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { role?: unknown; content?: unknown };
  if (candidate.role !== "assistant" && candidate.role !== "user") return false;
  return typeof candidate.content === "string" && candidate.content.trim().length > 0;
}


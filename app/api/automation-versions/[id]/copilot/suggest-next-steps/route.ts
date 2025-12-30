import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { can } from "@/lib/auth/rbac";
import { ApiError, requireTenantSession } from "@/lib/api/context";
import { getAutomationVersionDetail } from "@/lib/services/automations";
import { listCopilotMessages, createCopilotMessage } from "@/lib/services/copilot-messages";
import { createEmptyWorkflowSpec } from "@/lib/workflows/factory";
import { buildWorkflowFromChat } from "@/lib/workflows/ai-builder-simple";
import { applyStepNumbers } from "@/lib/workflows/step-numbering";
import { syncAutomationTasks } from "@/lib/workflows/task-sync";
import { WorkflowSchema } from "@/lib/workflows/schema";
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
          sanitizationSummary: Awaited<ReturnType<typeof buildWorkflowFromChat>>["sanitizationSummary"];
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

    const currentWorkflow = workflow.workflowSpec ?? createEmptyWorkflowSpec();
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

    const result = await buildWorkflowFromChat({
      userMessage:
        "Review the current workflow and add the most obvious next steps, exceptions, or clarifications needed to make it production ready. If everything is already complete, tighten any descriptions and confirm readiness.",
      currentWorkflow,
      currentBlueprint: currentWorkflow,
      conversationHistory,
    });

    const numberedWorkflow = applyStepNumbers(result.workflow);
    const taskAssignments = await syncAutomationTasks({
      tenantId: session.tenantId,
      automationVersionId: params.id,
      aiTasks: result.tasks,
      blueprint: numberedWorkflow,
      workflow: numberedWorkflow,
    });

    const workflowWithTasks = {
      ...numberedWorkflow,
      steps: numberedWorkflow.steps.map((step) => ({
        ...step,
        taskIds: Array.from(new Set(taskAssignments[step.id] ?? step.taskIds ?? [])),
      })),
    };

    const validatedWorkflow = WorkflowSchema.parse({
      ...workflowWithTasks,
      status: "Draft",
      updatedAt: new Date().toISOString(),
    });

    const [savedVersion] = await db
      .update(automationVersions)
      .set({
        workflowJson: validatedWorkflow,
        updatedAt: new Date(),
      })
      .where(eq(automationVersions.id, params.id))
      .returning({ automationId: automationVersions.automationId });

    if (!savedVersion) {
      throw new ApiError(500, "Failed to save workflow.");
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
    const conversationPhase = determineConversationPhase(validatedWorkflow, augmentedHistory);
    const thinkingSteps = generateThinkingSteps(
      conversationPhase,
      conversationHistory.find((message) => message.role === "user")?.content,
      validatedWorkflow
    );

    await logAudit({
      tenantId: session.tenantId,
      userId: session.userId,
      action: "automation.workflow.suggested",
      resourceType: "automation_version",
      resourceId: params.id,
      metadata: {
        source: "suggest_next_steps",
        versionLabel: detail.version.versionLabel,
        sanitizationSummary: result.sanitizationSummary,
        stepCount: result.workflow.steps.length,
      },
    });

    copilotDebug("draft_workflow.suggestions", {
      automationVersionId: params.id,
      chatResponse: responseMessage,
      stepCount: validatedWorkflow.steps.length,
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


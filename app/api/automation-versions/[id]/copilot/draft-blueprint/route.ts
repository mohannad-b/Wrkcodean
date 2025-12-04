import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { ApiError, handleApiError, requireTenantSession } from "@/lib/api/context";
import { can } from "@/lib/auth/rbac";
import { buildRateLimitKey, ensureRateLimit } from "@/lib/rate-limit";
import { getAutomationVersionDetail } from "@/lib/services/automations";
import { logAudit } from "@/lib/audit/log";
import { createEmptyBlueprint } from "@/lib/blueprint/factory";
import type { Blueprint } from "@/lib/blueprint/types";
import { BlueprintSchema, parseBlueprint } from "@/lib/blueprint/schema";
import { getBlueprintCompletionState } from "@/lib/blueprint/completion";
import { buildBlueprintFromChat, type AITask } from "@/lib/blueprint/ai-builder";
import { applyStepNumbers } from "@/lib/blueprint/step-numbering";
import { parseCommand, isDirectCommand } from "@/lib/blueprint/command-parser";
import { executeCommand } from "@/lib/blueprint/command-executor";
import { db } from "@/db";
import { automationVersions, tasks, type Task, type TaskMetadata } from "@/db/schema";
import { createCopilotMessage } from "@/lib/services/copilot-messages";
import { determineConversationPhase, generateThinkingSteps } from "@/lib/ai/copilot-orchestrator";
import { copilotDebug } from "@/lib/ai/copilot-debug";
import { diffBlueprint } from "@/lib/blueprint/diff";

const DraftRequestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(8000),
      })
    )
    .min(1),
  intakeNotes: z.string().max(20000).optional().nullable(),
  snippets: z.array(z.string().max(4000)).optional(),
});

type DraftRequest = z.infer<typeof DraftRequestSchema>;

type CopilotMessage = DraftRequest["messages"][number];

const MAX_MESSAGES = 10;
const MAX_MESSAGE_CHARS = 4000;
const MAX_TOTAL_CHARS = 16000;
const MIN_AUTOMATION_KEYWORDS = ["automation", "workflow", "process", "step", "system", "trigger", "action"];
const OFF_TOPIC_KEYWORDS = ["weather", "stock", "joke", "recipe", "story", "novel", "poem"];

const SYSTEM_PROMPT =
  "You are Wrk Copilot. You ONLY help users describe and design business processes to automate. If the user asks unrelated questions (general knowledge, advice, or chit chat) you politely redirect them to describing the workflow they want to automate. You return a JSON object that matches the provided Blueprint schema exactly.";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireTenantSession();

    if (!can(session, "automation:metadata:update", { type: "automation_version", tenantId: session.tenantId })) {
      throw new ApiError(403, "Forbidden");
    }

    let payload: DraftRequest;
    try {
      payload = DraftRequestSchema.parse(await request.json());
    } catch {
      throw new ApiError(400, "Invalid request body.");
    }

    const detail = await getAutomationVersionDetail(session.tenantId, params.id);
    if (!detail) {
      throw new ApiError(404, "Automation version not found.");
    }

    try {
      ensureRateLimit({
        key: buildRateLimitKey("copilot:draft", session.tenantId),
        limit: Number(process.env.COPILOT_DRAFTS_PER_HOUR ?? 5),
        windowMs: 60 * 60 * 1000,
      });
    } catch {
      throw new ApiError(429, "Too many blueprints requested. Please wait before trying again.");
    }

    const normalizedMessages = normalizeMessages(payload.messages);
    const hasUserMessage = normalizedMessages.some((message) => message.role === "user");
    if (!hasUserMessage) {
      throw new ApiError(400, "Add at least one user message before drafting a blueprint.");
    }

    const latestUserMessage = [...normalizedMessages].reverse().find((message) => message.role === "user");
    if (latestUserMessage && isOffTopic(latestUserMessage.content)) {
      throw new ApiError(
        400,
        "Wrk Copilot only helps design automations. Tell me about the workflow you want to automate and I can draft a blueprint."
      );
    }

    const contextSummary = buildConversationSummary(normalizedMessages, payload.intakeNotes ?? detail.version.intakeNotes);
    const currentBlueprint = parseBlueprint(detail.version.blueprintJson) ?? createEmptyBlueprint();
    const userMessageContent =
      latestUserMessage?.content ??
      normalizedMessages.find((message) => message.role === "user")?.content ??
      "Help me describe this workflow.";

    const directCommand = Boolean(latestUserMessage?.content && isDirectCommand(latestUserMessage.content));
    let responseMessage = "";
    let commandExecuted = false;
    let blueprintWithTasks: Blueprint;
    let aiTasks: AITask[] = [];

    if (directCommand && latestUserMessage) {
      commandExecuted = true;
      const command = parseCommand(latestUserMessage.content);
      const commandResult = executeCommand(currentBlueprint, command);
      if (!commandResult.success) {
        throw new ApiError(400, commandResult.error ?? "Command failed");
      }
      blueprintWithTasks = commandResult.blueprint;
      responseMessage = commandResult.message ? `Done. ${commandResult.message}` : "Done.";

      if (commandResult.auditEvents.length) {
        await Promise.all(
          commandResult.auditEvents.map((event) =>
            logAudit({
              tenantId: session.tenantId,
              userId: session.userId,
              action: event.action,
              resourceType: "automation_version",
              resourceId: params.id,
              metadata: event.metadata,
            })
          )
        );
      }

      copilotDebug("draft_blueprint.command_executed", {
        automationVersionId: params.id,
        command: command.type,
        message: responseMessage,
      });
    } else {
      const {
        blueprint: aiGeneratedBlueprint,
        tasks: generatedTasks,
        chatResponse,
        followUpQuestion,
      } = await buildBlueprintFromChat({
        userMessage: userMessageContent,
        currentBlueprint,
        conversationHistory: normalizedMessages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      });

      const numberedBlueprint = applyStepNumbers(aiGeneratedBlueprint);
      aiTasks = generatedTasks;
      const taskAssignments = await syncAutomationTasks({
        tenantId: session.tenantId,
        automationVersionId: params.id,
        aiTasks,
        blueprint: numberedBlueprint,
      });

      blueprintWithTasks = {
        ...numberedBlueprint,
        steps: numberedBlueprint.steps.map((step) => ({
          ...step,
          taskIds: Array.from(new Set(taskAssignments[step.id] ?? step.taskIds ?? [])),
        })),
      };
      const trimmedFollowUp = followUpQuestion?.trim();
      responseMessage = trimmedFollowUp ? `${chatResponse} ${trimmedFollowUp}`.trim() : chatResponse;

      copilotDebug("draft_blueprint.llm_response", {
        automationVersionId: params.id,
        chatResponse,
        followUpQuestion: trimmedFollowUp,
        stepCount: blueprintWithTasks.steps.length,
        taskCount: aiTasks.length,
      });
    }

    const validatedBlueprint = BlueprintSchema.parse({
      ...blueprintWithTasks,
      status: "Draft",
      updatedAt: new Date().toISOString(),
    });

    const [savedVersion] = await db
      .update(automationVersions)
      .set({
        blueprintJson: validatedBlueprint,
        updatedAt: new Date(),
      })
      .where(eq(automationVersions.id, params.id))
      .returning();

    if (!savedVersion) {
      throw new ApiError(500, "Failed to save blueprint.");
    }

    revalidatePath(`/automations/${detail.automation?.id ?? savedVersion.automationId}`);

    const assistantMessage = await createCopilotMessage({
      tenantId: session.tenantId,
      automationVersionId: params.id,
      role: "assistant",
      content: responseMessage,
      createdBy: null,
    });

    copilotDebug("draft_blueprint.persisted_message", {
      automationVersionId: params.id,
      messageId: assistantMessage.id,
      commandExecuted,
    });

    const augmentedMessages = [...normalizedMessages, { role: "assistant" as const, content: responseMessage }];
    const conversationPhase = determineConversationPhase(validatedBlueprint, augmentedMessages);
    const thinkingSteps = generateThinkingSteps(conversationPhase, latestUserMessage?.content, validatedBlueprint);

    if (!commandExecuted) {
      const diff = diffBlueprint(currentBlueprint, validatedBlueprint);
      await logAudit({
        tenantId: session.tenantId,
        userId: session.userId,
        action: "automation.blueprint.drafted",
        resourceType: "automation_version",
        resourceId: params.id,
        metadata: {
          source: "copilot",
          summary: diff.summary,
          diff,
        },
      });
    }

    return NextResponse.json({
      blueprint: validatedBlueprint,
      completion: getBlueprintCompletionState(validatedBlueprint),
      prompt: commandExecuted
        ? null
        : {
            system: SYSTEM_PROMPT,
            contextSummary,
            messageCount: normalizedMessages.length,
          },
      commandExecuted,
      message: assistantMessage,
      thinkingSteps,
      conversationPhase,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

function normalizeMessages(messages: CopilotMessage[]): CopilotMessage[] {
  const trimmed = messages.slice(-MAX_MESSAGES).map((message) => {
    let content = message.content.trim();
    if (content.length > MAX_MESSAGE_CHARS) {
      content = `${content.slice(0, MAX_MESSAGE_CHARS)}…`;
    }
    return { ...message, content };
  });

  const totalChars = trimmed.reduce((sum, message) => sum + message.content.length, 0);
  if (totalChars <= MAX_TOTAL_CHARS) {
    return trimmed;
  }

  const result: CopilotMessage[] = [];
  let running = 0;
  for (let index = trimmed.length - 1; index >= 0; index -= 1) {
    const candidate = trimmed[index];
    if (running + candidate.content.length > MAX_TOTAL_CHARS) {
      break;
    }
    running += candidate.content.length;
    result.unshift(candidate);
  }

  return result.length > 0 ? result : trimmed.slice(-3);
}

function isOffTopic(content: string) {
  const lower = content.toLowerCase();
  const mentionsAutomation = MIN_AUTOMATION_KEYWORDS.some((keyword) => lower.includes(keyword));
  const clearlyOffTopic = OFF_TOPIC_KEYWORDS.some((keyword) => lower.includes(keyword));
  return !mentionsAutomation && clearlyOffTopic;
}

function buildConversationSummary(messages: CopilotMessage[], intakeNotes?: string | null) {
  const summaryParts: string[] = [];
  const userMessages = messages.filter((message) => message.role === "user");
  const clipped = userMessages.slice(-3);

  summaryParts.push("Latest user instructions:");
  clipped.forEach((message, index) => {
    summaryParts.push(`${index + 1}. ${message.content}`);
  });

  if (intakeNotes) {
    summaryParts.push("\nIntake notes:\n");
    summaryParts.push(intakeNotes.slice(0, 2000));
  }

  return summaryParts.join("\n");
}

type TaskAssignmentMap = Record<string, string[]>;

async function syncAutomationTasks({
  tenantId,
  automationVersionId,
  aiTasks,
  blueprint,
}: {
  tenantId: string;
  automationVersionId: string;
  aiTasks: AITask[];
  blueprint: Blueprint;
}): Promise<TaskAssignmentMap> {
  const assignments: TaskAssignmentMap = {};
  blueprint.steps.forEach((step) => {
    if (step.taskIds?.length) {
      assignments[step.id] = [...step.taskIds];
    }
  });

  if (aiTasks.length === 0) {
    return assignments;
  }

  const existingTasks: Task[] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.tenantId, tenantId), eq(tasks.automationVersionId, automationVersionId)));

  const stepIdByNumber = new Map<string, string>();
  blueprint.steps.forEach((step) => {
    if (step.stepNumber) {
      stepIdByNumber.set(step.stepNumber, step.id);
    }
  });

  for (const aiTask of aiTasks) {
    const title = aiTask.title?.trim();
    if (!title) {
      continue;
    }
    const normalizedTitle = title.toLowerCase();
    const normalizedSystemType = aiTask.systemType?.trim().toLowerCase();
    const relatedStepNumbers = Array.isArray(aiTask.relatedSteps)
      ? aiTask.relatedSteps
          .map((step) => step?.trim())
          .filter((value): value is string => Boolean(value))
      : [];
    const relatedStepIds = relatedStepNumbers
      .map((stepNumber) => stepIdByNumber.get(stepNumber))
      .filter((value): value is string => Boolean(value));

    const metadata: TaskMetadata = {
      systemType: normalizedSystemType,
      relatedSteps: relatedStepNumbers,
      isBlocker: mapTaskPriority(aiTask.priority) === "blocker",
    };

    const match = existingTasks.find((task) => {
      const taskSystem = task.metadata?.systemType?.toLowerCase();
      return task.title.toLowerCase() === normalizedTitle && taskSystem === normalizedSystemType;
    });

    let taskId: string;
    if (match) {
      const mergedRelatedSteps = Array.from(
        new Set([...(match.metadata?.relatedSteps ?? []), ...relatedStepNumbers])
      );
      const shouldUpdate =
        match.description !== (aiTask.description ?? match.description) ||
        match.priority !== mapTaskPriority(aiTask.priority) ||
        (match.metadata?.systemType ?? undefined) !== normalizedSystemType ||
        (match.metadata?.isBlocker ?? false) !== metadata.isBlocker ||
        mergedRelatedSteps.length !== (match.metadata?.relatedSteps ?? []).length;

      if (shouldUpdate) {
        await db
          .update(tasks)
          .set({
            description: aiTask.description ?? match.description,
            priority: mapTaskPriority(aiTask.priority),
            metadata: {
              ...match.metadata,
              systemType: normalizedSystemType,
              relatedSteps: mergedRelatedSteps,
              isBlocker: metadata.isBlocker,
            },
            updatedAt: new Date(),
          })
          .where(eq(tasks.id, match.id));

        match.description = aiTask.description ?? match.description;
        match.priority = mapTaskPriority(aiTask.priority);
        match.metadata = {
          ...match.metadata,
          systemType: normalizedSystemType,
          relatedSteps: mergedRelatedSteps,
          isBlocker: metadata.isBlocker,
        };
      }
      taskId = match.id;
    } else {
      const [inserted] = await db
        .insert(tasks)
        .values({
          tenantId,
          automationVersionId,
          title,
          description: aiTask.description ?? "",
          status: "pending",
          priority: mapTaskPriority(aiTask.priority),
          metadata,
        })
        .returning();

      if (!inserted) {
        continue;
      }

      taskId = inserted.id;
      existingTasks.push(inserted);
    }

    relatedStepIds.forEach((stepId) => {
      if (!assignments[stepId]) {
        assignments[stepId] = [];
      }
      if (!assignments[stepId].includes(taskId)) {
        assignments[stepId].push(taskId);
      }
    });
  }

  return assignments;
}

function mapTaskPriority(priority?: string): "blocker" | "important" | "optional" {
  const normalized = priority?.toLowerCase();
  if (normalized === "blocker" || normalized === "blocking" || normalized === "critical") {
    return "blocker";
  }
  if (normalized === "optional" || normalized === "nice_to_have") {
    return "optional";
  }
  return "important";
}


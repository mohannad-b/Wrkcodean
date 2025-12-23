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
import { buildBlueprintFromChat, type AITask } from "@/lib/blueprint/ai-builder-simple";
import { applyStepNumbers } from "@/lib/blueprint/step-numbering";
import { parseCommand, isDirectCommand } from "@/lib/blueprint/command-parser";
import { executeCommand } from "@/lib/blueprint/command-executor";
import { db } from "@/db";
import { automationVersions } from "@/db/schema";
import { createCopilotMessage } from "@/lib/services/copilot-messages";
import { determineConversationPhase, generateThinkingSteps } from "@/lib/ai/copilot-orchestrator";
import { copilotDebug } from "@/lib/ai/copilot-debug";
import { diffBlueprint } from "@/lib/blueprint/diff";
import { syncAutomationTasks } from "@/lib/blueprint/task-sync";
import { evaluateBlueprintProgress } from "@/lib/ai/blueprint-progress";
import {
  createEmptyCopilotAnalysisState,
  createEmptyMemory,
  type CopilotAnalysisState,
  type CopilotMemory,
} from "@/lib/blueprint/copilot-analysis";
import { getCopilotAnalysis, upsertCopilotAnalysis } from "@/lib/services/copilot-analysis";

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
    console.log("[copilot:draft-blueprint] Request received for version:", params.id);
    
    const session = await requireTenantSession();
    console.log("[copilot:draft-blueprint] Session validated, tenantId:", session.tenantId);

    if (!can(session, "automation:metadata:update", { type: "automation_version", tenantId: session.tenantId })) {
      console.error("[copilot:draft-blueprint] Permission denied");
      throw new ApiError(403, "Forbidden");
    }

    let payload: DraftRequest;
    let rawBody: any;
    try {
      rawBody = await request.json();
      console.log("[copilot:draft-blueprint] Request body parsed, keys:", Object.keys(rawBody || {}));
      payload = DraftRequestSchema.parse(rawBody);
      console.log("[copilot:draft-blueprint] Validation passed, messages count:", payload.messages?.length);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const issues = error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(", ");
        console.error("[copilot:draft-blueprint] Validation error:", issues);
        console.error("[copilot:draft-blueprint] Raw body:", JSON.stringify(rawBody, null, 2));
        throw new ApiError(400, `Invalid request body: ${issues}`);
      }
      if (error instanceof SyntaxError) {
        console.error("[copilot:draft-blueprint] JSON parse error:", error.message);
        throw new ApiError(400, `Invalid JSON: ${error.message}`);
      }
      console.error("[copilot:draft-blueprint] Request parsing error:", error);
      throw new ApiError(400, `Invalid request body: ${error instanceof Error ? error.message : String(error)}`);
    }

    const detail = await getAutomationVersionDetail(session.tenantId, params.id);
    if (!detail) {
      throw new ApiError(404, "Automation version not found.");
    }

    const existingAnalysis =
      (await getCopilotAnalysis({ tenantId: session.tenantId, automationVersionId: params.id })) ??
      createEmptyCopilotAnalysisState();
    let analysisState: CopilotAnalysisState = {
      ...existingAnalysis,
      memory: existingAnalysis.memory ?? createEmptyMemory(),
    };

    try {
      ensureRateLimit({
        key: buildRateLimitKey("copilot:draft", session.tenantId),
        limit: Number(process.env.COPILOT_DRAFTS_PER_HOUR ?? 20),
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
    const currentBlueprint =
      parseBlueprint(detail.version.workflowJson ?? (detail as any).version.blueprintJson) ?? createEmptyBlueprint();
    const userMessageContent =
      latestUserMessage?.content ??
      normalizedMessages.find((message) => message.role === "user")?.content ??
      "Help me describe this workflow.";

    const directCommand = Boolean(latestUserMessage?.content && isDirectCommand(latestUserMessage.content));
    let responseMessage = "";
    let commandExecuted = false;
    let blueprintWithTasks: Blueprint;
    let aiTasks: AITask[] = [];
    let updatedRequirementsText: string | null | undefined = undefined;

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
        sanitizationSummary,
        requirementsText: updatedRequirementsText,
      } = await buildBlueprintFromChat({
        userMessage: userMessageContent,
        currentBlueprint,
        conversationHistory: normalizedMessages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
        requirementsText: detail.version.requirementsText,
        memorySummary: analysisState.memory?.summary_compact ?? null,
        memoryFacts: analysisState.memory?.facts ?? {},
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
      const nextFollowUp = chooseFollowUpQuestion({
        candidate: trimmedFollowUp,
        memory: analysisState.memory ?? createEmptyMemory(),
        blueprint: blueprintWithTasks,
        userMessage: userMessageContent,
      });

      analysisState = {
        ...analysisState,
        memory: refreshMemoryState({
          previous: analysisState.memory ?? createEmptyMemory(),
          blueprint: blueprintWithTasks,
          lastUserMessage: userMessageContent,
          appliedFollowUp: nextFollowUp,
        }),
      };

      responseMessage = nextFollowUp ? `${chatResponse} ${nextFollowUp}`.trim() : chatResponse;

      copilotDebug("draft_blueprint.llm_response", {
        automationVersionId: params.id,
        chatResponse,
        followUpQuestion: trimmedFollowUp,
        stepCount: blueprintWithTasks.steps.length,
        taskCount: aiTasks.length,
        sanitizationSummary,
      });
      console.log("[copilot:draft-blueprint] raw assistant reply:", chatResponse);
    }

    const validatedBlueprint = directCommand
      ? ({
          ...blueprintWithTasks,
          status: blueprintWithTasks.status ?? "Draft",
          updatedAt: new Date().toISOString(),
        } as Blueprint)
      : BlueprintSchema.parse({
          ...blueprintWithTasks,
          status: "Draft",
          updatedAt: new Date().toISOString(),
        });

    const updatePayload: { workflowJson: Blueprint; requirementsText?: string | null; updatedAt: Date } = {
      workflowJson: validatedBlueprint,
      updatedAt: new Date(),
    };
    
    // Update requirements text if AI provided an update (non-empty string)
    if (commandExecuted === false && updatedRequirementsText !== undefined && typeof updatedRequirementsText === 'string' && updatedRequirementsText.trim().length > 0) {
      updatePayload.requirementsText = updatedRequirementsText.trim();
    }

    const [savedVersion] = await db
      .update(automationVersions)
      .set(updatePayload)
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
          versionLabel: detail.version.versionLabel,
          summary: diff.summary,
          diff,
          changes: {
            stepsAdded: diff.stepsAdded?.length ?? 0,
            stepsRemoved: diff.stepsRemoved?.length ?? 0,
            stepsRenamed: diff.stepsRenamed?.length ?? 0,
            branchesAdded: diff.branchesAdded?.length ?? 0,
            branchesRemoved: diff.branchesRemoved?.length ?? 0,
          },
        },
      });
    }

    const completionState = getBlueprintCompletionState(validatedBlueprint);
    let progressSnapshot = null;
    try {
      progressSnapshot = await evaluateBlueprintProgress({
        blueprint: validatedBlueprint,
        completionState,
        latestUserMessage: latestUserMessage?.content ?? null,
      });
    } catch (error) {
      copilotDebug("draft_blueprint.progress_eval_failed", error instanceof Error ? error.message : error);
    }

    if (progressSnapshot) {
      analysisState = {
        ...analysisState,
        progress: progressSnapshot,
      };
    }

    try {
      await upsertCopilotAnalysis({
        tenantId: session.tenantId,
        automationVersionId: params.id,
        analysis: {
          ...analysisState,
          lastUpdatedAt: new Date().toISOString(),
        },
      });
    } catch (analysisError) {
      copilotDebug(
        "draft_blueprint.progress_persist_failed",
        analysisError instanceof Error ? analysisError.message : analysisError
      );
    }

    return NextResponse.json({
      blueprint: validatedBlueprint,
      completion: completionState,
      progress: progressSnapshot,
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

type FollowUpChoiceArgs = {
  candidate?: string | null;
  memory: CopilotMemory;
  blueprint: Blueprint;
  userMessage: string;
};

function chooseFollowUpQuestion({ candidate, memory, blueprint, userMessage }: FollowUpChoiceArgs): string | null {
  const trimmed = candidate?.trim();
  const normalizedCandidate = trimmed ? normalizeQuestionText(trimmed) : null;
  const reachedCap = memory.question_count >= 10;

  if (reachedCap) {
    return "This looks complete — want me to finalize or tweak anything?";
  }

  const mergedFacts = mergeFacts(memory.facts ?? {}, blueprint, userMessage);
  const stage = computeStage(mergedFacts, memory.question_count);

  if (trimmed && normalizedCandidate && !memory.asked_questions_normalized.includes(normalizedCandidate)) {
    const assumptionCandidate = pickStageQuestion(stage, mergedFacts);
    if (assumptionCandidate) {
      const normalizedAssumption = normalizeQuestionText(assumptionCandidate);
      if (!memory.asked_questions_normalized.includes(normalizedAssumption)) {
        return assumptionCandidate;
      }
    }
    return trimmed;
  }

  const fallback = pickStageQuestion(stage, mergedFacts);
  if (!fallback) {
    return null;
  }
  const normalizedFallback = normalizeQuestionText(fallback);
  if (memory.asked_questions_normalized.includes(normalizedFallback)) {
    return null;
  }
  return fallback;
}

type RefreshMemoryArgs = {
  previous: CopilotMemory;
  blueprint: Blueprint;
  lastUserMessage: string;
  appliedFollowUp?: string | null;
};

function refreshMemoryState({ previous, blueprint, lastUserMessage, appliedFollowUp }: RefreshMemoryArgs): CopilotMemory {
  const mergedFacts = mergeFacts(previous.facts ?? {}, blueprint, lastUserMessage);
  const normalizedFollowUp = appliedFollowUp ? normalizeQuestionText(appliedFollowUp) : null;
  const newCount =
    appliedFollowUp && previous.question_count < 10 ? previous.question_count + 1 : previous.question_count;
  const nextStage = computeStage(mergedFacts, newCount);
  const asked = new Set(previous.asked_questions_normalized ?? []);
  if (normalizedFollowUp) {
    asked.add(normalizedFollowUp);
  }

  return {
    summary_compact: buildMemorySummary(blueprint, mergedFacts, lastUserMessage, previous.summary_compact),
    facts: mergedFacts,
    question_count: newCount,
    asked_questions_normalized: Array.from(asked).slice(-30),
    stage: nextStage,
  };
}

function mergeFacts(
  existing: CopilotMemory["facts"],
  blueprint: Blueprint,
  lastUserMessage: string
): CopilotMemory["facts"] {
  const facts: CopilotMemory["facts"] = { ...(existing ?? {}) };

  const lower = lastUserMessage.toLowerCase();
  if (/daily|every day/.test(lower)) {
    facts.trigger_cadence = facts.trigger_cadence ?? "daily";
  }
  if (/weekly/.test(lower)) {
    facts.trigger_cadence = facts.trigger_cadence ?? "weekly";
  }
  const timeMatch = lastUserMessage.match(/\b(\d{1,2})(:?(\d{2}))?\s?(am|pm)\b/i);
  if (timeMatch && !facts.trigger_time) {
    facts.trigger_time = timeMatch[0];
  }

  blueprint.sections?.forEach((section) => {
    const content = section.content?.trim();
    if (!content) return;
    switch (section.key) {
      case "business_requirements":
        facts.primary_outcome = facts.primary_outcome ?? truncateText(content, 160);
        break;
      case "business_objectives":
        facts.primary_outcome = facts.primary_outcome ?? truncateText(content, 160);
        break;
      case "success_criteria":
        facts.success_criteria = facts.success_criteria ?? truncateText(content, 160);
        break;
      case "systems":
        facts.systems = facts.systems ?? content.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 5);
        break;
      default:
        break;
    }
  });

  if (!facts.systems && blueprint.steps?.length) {
    const systems = new Set<string>();
    blueprint.steps.forEach((step) => {
      step.systemsInvolved?.forEach((system) => systems.add(system));
    });
    if (systems.size > 0) {
      facts.systems = Array.from(systems).slice(0, 5);
    }
  }

  if (!facts.storage_destination && blueprint.summary) {
    const summaryLower = blueprint.summary.toLowerCase();
    if (summaryLower.includes("sheet") || summaryLower.includes("excel")) {
      facts.storage_destination = "Google Sheets";
    }
  }

  if (!facts.samples) {
    const mentionsSamples = /invoice|receipt|ocr|pdf|document|template/i.test(lastUserMessage);
    facts.samples = mentionsSamples ? "required" : "skip";
  }

  return facts;
}

function computeStage(facts: CopilotMemory["facts"], questionCount: number): CopilotMemory["stage"] {
  if (questionCount >= 10) {
    return "done";
  }

  const hasRequirements = Boolean(facts.primary_outcome || facts.trigger_cadence || facts.trigger_time);
  const hasObjectives = Boolean(facts.primary_outcome);
  const hasSuccess = Boolean(facts.success_criteria);
  const hasSystems = Boolean(
    (facts.systems && facts.systems.length > 0) || facts.exception_policy || facts.human_review || facts.storage_destination
  );

  if (!hasRequirements) return "requirements";
  if (!hasObjectives) return "objectives";
  if (!hasSuccess) return "success";
  if (!hasSystems) return "systems";

  return facts.samples === "required" ? "samples" : "done";
}

function pickStageQuestion(stage: CopilotMemory["stage"], facts: CopilotMemory["facts"]): string | null {
  switch (stage) {
    case "requirements":
      return `I'm assuming this runs daily around 8am to ${facts.primary_outcome ?? "deliver the main result"} — okay?`;
    case "objectives":
      return `I'm assuming the business goal is ${facts.primary_outcome ?? "saving time"} — right?`;
    case "success":
      return "I'll target under 5% errors and finish within 10 minutes — sound right?";
    case "systems":
      return `I'll drop results into ${facts.storage_destination ?? "Google Sheets"} and notify ops on retries — good?`;
    case "samples":
      return "Do you want to share one sample file to calibrate?";
    default:
      return null;
  }
}

function buildMemorySummary(
  blueprint: Blueprint,
  facts: CopilotMemory["facts"],
  lastUserMessage: string,
  previous?: string | null
): string {
  const parts: string[] = [];
  const summary = blueprint.summary?.trim() || previous || "";
  if (summary) {
    parts.push(truncateText(summary, 200));
  }
  if (facts.primary_outcome) {
    parts.push(`Outcome: ${truncateText(facts.primary_outcome, 160)}`);
  }
  if (facts.success_criteria) {
    parts.push(`Success: ${truncateText(facts.success_criteria, 160)}`);
  }
  if (facts.systems?.length) {
    parts.push(`Systems: ${facts.systems.slice(0, 5).join(", ")}`);
  }
  if (facts.storage_destination) {
    parts.push(`Destination: ${facts.storage_destination}`);
  }
  if (facts.trigger_cadence || facts.trigger_time) {
    parts.push(`Trigger: ${[facts.trigger_cadence, facts.trigger_time].filter(Boolean).join(" ")}`);
  }
  if (parts.length === 0) {
    parts.push(truncateText(lastUserMessage, 200));
  }
  return truncateText(parts.join(" | "), 1200);
}

function normalizeQuestionText(question: string): string {
  return question
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateText(value: string, limit: number): string {
  if (!value) return "";
  return value.length > limit ? `${value.slice(0, limit)}…` : value;
}



/**
 * Simplified AI Builder - Recreates workflow from scratch instead of merging
 * 
 * This approach:
 * 1. AI generates complete workflow based on full context
 * 2. We preserve essential IDs and metadata from existing workflow
 * 3. Much simpler than complex merge logic
 */

import { randomUUID } from "crypto";
import type { Blueprint, BlueprintStep, BlueprintBranch, BlueprintStepType, BlueprintResponsibility } from "./types";
import { applyStepNumbers } from "./step-numbering";
import { WORKFLOW_SYSTEM_PROMPT_COMPACT } from "@/lib/ai/prompts";
import getOpenAIClient from "@/lib/ai/openai-client";
import { copilotDebug } from "@/lib/ai/copilot-debug";
import { sanitizeBlueprintTopology, type SanitizationSummary } from "./sanitizer";
import { logger } from "@/lib/logger";

type ConversationMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type BuildStatusUpdate = {
  phase: string;
  text: string;
};

interface BuildBlueprintParams {
  userMessage: string;
  currentBlueprint: Blueprint;
  currentWorkflow?: Blueprint;
  conversationHistory?: ConversationMessage[];
  requirementsText?: string | null;
  memorySummary?: string | null;
  memoryFacts?: Record<string, unknown>;
  requirementsStatusHint?: string | null;
  followUpMode?: "technical_opt_in" | null;
  knownFactsHint?: string | null;
  intentSummaryHint?: string | null;
  requirementsDiffHint?: string | null;
  onStatus?: (payload: BuildStatusUpdate) => void;
  trace?: import("@/lib/ai/copilot-trace").CopilotTrace;
}

export type AITask = {
  title: string;
  description?: string;
  priority?: "blocker" | "important" | "optional";
  relatedSteps?: string[];
  systemType?: string;
};

export interface BuildBlueprintResult {
  blueprint: Blueprint;
  workflow: Blueprint;
  tasks: AITask[];
  chatResponse: string;
  followUpQuestion?: string;
  sanitizationSummary: SanitizationSummary;
  requirementsText?: string | null;
}

type AIStep = {
  stepNumber: string;
  type?: string;
  name: string;
  /** What happens in this step + ALL relevant context from the conversation (locations, dates, filters, etc.) */
  description?: string;
  /** Desired end state / result of this step (e.g. "Individual rows of scraped prices in a Google Sheet") */
  goalOutcome?: string;
  /** Alternative field name some models use */
  goal?: string;
  /** Additional operator notes: user-specific details, constraints, preferences */
  notes?: string;
  systemsInvolved?: string[];
  nextSteps?: string[];
  branches?: Array<{
    label: string;
    targetStep: string;
    description?: string;
  }>;
  branchCondition?: string;
  branchLabel?: string;
  parentStep?: string;
  parentStepId?: string;
  notifications?: string[];
  responsibility?: BlueprintResponsibility;
};

type AIBranch = {
  parentStep?: string;
  parentStepId?: string;
  sourceStep?: string;
  fromStep?: string;
  label?: string;
  targetStep?: string;
  targetStepId?: string;
  description?: string;
  condition?: string;
  branchCondition?: string;
};

type AIResponse = {
  chatResponse?: string;
  followUpQuestion?: string;
  blueprint?: {
    steps?: AIStep[];
    branches?: AIBranch[];
    tasks?: AITask[];
    sections?: Record<string, string>;
    requirementsText?: string;
  };
  steps?: AIStep[];
  branches?: AIBranch[];
  tasks?: AITask[];
  sections?: Record<string, string>;
  requirementsText?: string;
};

const WORKFLOW_MODEL = process.env.WORKFLOW_MODEL ?? process.env.BLUEPRINT_MODEL ?? "gpt-4o";

/**
 * Build complete workflow from scratch, preserving essential IDs and metadata
 */
export async function buildBlueprintFromChat(params: BuildBlueprintParams): Promise<BuildBlueprintResult> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const {
    userMessage,
    currentBlueprint: blueprintInput,
    currentWorkflow,
    conversationHistory = [],
    requirementsText,
    memorySummary,
    memoryFacts,
    requirementsStatusHint,
    followUpMode,
    knownFactsHint,
    intentSummaryHint,
    requirementsDiffHint,
    onStatus,
    trace,
  } = params;
  const currentBlueprint = currentWorkflow ?? blueprintInput;
  const emitStatus = (phase: string, text: string) => onStatus?.({ phase, text });

  const windowedHistory = conversationHistory.slice(-8);
  const userPrompt = buildCompactPrompt({
    userMessage,
    currentBlueprint,
    requirementsText,
    memorySummary,
    memoryFacts,
    requirementsStatusHint,
    followUpMode,
    knownFactsHint,
    intentSummaryHint,
    requirementsDiffHint,
  });
  emitStatus("analysis", "Extracting requirements from your last message…");

  const messages: ConversationMessage[] = [
    { role: "system", content: WORKFLOW_SYSTEM_PROMPT_COMPACT },
    ...windowedHistory,
    { role: "user", content: userPrompt },
  ];

  // Log the exact prompt being sent to OpenAI for debugging
  const logDebug = (event: string, meta?: Record<string, unknown>) => {
    if (trace) {
      trace.event(event, meta, "debug");
      return;
    }
    copilotDebug(event, meta);
  };

  logDebug("draft_blueprint.prompt_log", {
    model: WORKFLOW_MODEL,
    temperature: 0.3,
    messages: messages.map((msg, index) => ({
      index,
      role: msg.role,
      content: msg.content,
    })),
  });
  logger.debug("[copilot:draft-blueprint] prompt_metadata", {
    model: WORKFLOW_MODEL,
    temperature: 0.3,
    messageCount: messages.length,
  });

  const openai = getOpenAIClient();
  if (!openai) {
    throw new Error("OPENAI_API_KEY missing");
  }

  try {
    emitStatus("generation", "Drafting updated workflow from context…");
    const completion = await openai.chat.completions.create({
      model: WORKFLOW_MODEL,
      temperature: 0.3,
      max_tokens: 4000,
      response_format: { type: "json_object" },
      messages,
    });

    const content = completion.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("OpenAI returned an empty response");
    }

    logDebug("draft_blueprint.raw_response", { content });
    logger.debug("[copilot:draft-blueprint] raw_response_meta", { length: content.length });

    const aiResponse = parseAIResponse(content);
    const workflowBlock =
      (aiResponse as any)?.workflow && typeof (aiResponse as any)?.workflow === "object"
        ? (aiResponse as any)?.workflow
        : aiResponse.blueprint;
    const normalizedSteps = Array.isArray(workflowBlock?.steps)
      ? workflowBlock.steps
      : Array.isArray(aiResponse.steps)
        ? aiResponse.steps
        : [];
    const normalizedTasks = Array.isArray(workflowBlock?.tasks)
      ? workflowBlock.tasks
      : Array.isArray(aiResponse.tasks)
        ? aiResponse.tasks
        : [];

    const tasksWithFallback: AITask[] =
      normalizedTasks.length > 0
        ? normalizedTasks
        : normalizedSteps
            .filter((step: AIStep) => step.name && step.type !== "Trigger")
            .slice(0, 6)
            .map((step: AIStep, idx: number) => ({
              title: step.name,
              description: step.description || step.name,
              priority: idx === 0 ? "blocker" : "important",
              relatedSteps: [step.stepNumber || `step_${idx + 1}`],
              systemType: step.systemsInvolved?.[0] || "unspecified",
            }));
    emitStatus("tasks", "Recomputing required inputs and tasks…");

    const normalizedBranches = Array.isArray(workflowBlock?.branches)
      ? workflowBlock.branches
      : Array.isArray(aiResponse.branches)
        ? aiResponse.branches
        : [];
    const normalizedSections = workflowBlock?.sections ?? aiResponse.sections ?? {};
    const rawRequirements = aiResponse.requirementsText ?? workflowBlock?.requirementsText ?? aiResponse.blueprint?.requirementsText;
    const updatedRequirementsText =
      typeof rawRequirements === "string" ? rawRequirements.trim() : undefined;

    // Build workflow from scratch, preserving IDs and metadata
    const preservedWorkflow = preserveEssentialData(currentBlueprint, normalizedSteps, normalizedBranches, normalizedSections);
    
    const numberedBlueprint = applyStepNumbers(preservedWorkflow.blueprint);
    emitStatus("structuring", "Updating step graph and renumbering…");
    const { blueprint: sanitizedBlueprintRaw, summary: sanitizationSummary } = sanitizeBlueprintTopology(numberedBlueprint);

    // Fallback: if no steps survived parsing/sanitization, seed a minimal draft (multi-step) so UI is never blank
    const sanitizedBlueprint =
      sanitizedBlueprintRaw.steps.length > 0
        ? sanitizedBlueprintRaw
        : buildFallbackBlueprint(sanitizedBlueprintRaw);
    emitStatus("validation", "Validating blueprint schema…");

    const chatResponse = normalizeChatResponse(aiResponse.chatResponse);
    const followUpQuestion =
      typeof aiResponse.followUpQuestion === "string" ? aiResponse.followUpQuestion.trim() : undefined;

    logDebug("draft_blueprint.parsed_response", {
      chatResponse,
      followUpQuestion,
      stepCount: sanitizedBlueprint.steps.length,
      taskCount: normalizedTasks.length,
      hasRequirementsUpdate: updatedRequirementsText !== undefined,
      rawStepCount: normalizedSteps.length,
      sanitizedStepCount: sanitizedBlueprintRaw.steps.length,
      fallbackApplied: sanitizedBlueprintRaw.steps.length === 0,
    });

    logDebug("draft_blueprint.parsed_response_metrics", {
      rawStepCount: normalizedSteps.length,
      sanitizedStepCount: sanitizedBlueprintRaw.steps.length,
      finalStepCount: sanitizedBlueprint.steps.length,
      fallbackApplied: sanitizedBlueprintRaw.steps.length === 0,
      firstStepNames: sanitizedBlueprint.steps.slice(0, 3).map((s) => s.name),
      model: WORKFLOW_MODEL,
    });

    emitStatus("finalizing", "Preparing draft response…");
    return {
      blueprint: sanitizedBlueprint,
      workflow: sanitizedBlueprint,
      tasks: tasksWithFallback,
      chatResponse,
      followUpQuestion,
      sanitizationSummary,
      requirementsText: updatedRequirementsText,
    };
  } catch (error) {
    logger.error("Error building blueprint from chat:", error);
    throw new Error("Failed to generate blueprint");
  }
}

/**
 * Infer goal/outcome from description when AI doesn't provide it.
 * Transforms action-based text into outcome-based (what exists after the step).
 */
function inferGoalFromDescription(description: string, stepName: string): string {
  const d = description.trim();
  if (!d || d.length < 10) return stepName;

  // Store/Save/Load X in(to) Y → "X in Y"
  const storeMatch = d.match(/(?:store|save|load|write)\s+(.+?)\s+in(?:to)?\s+(.+?)(?:\.|,|$)/i);
  if (storeMatch) {
    const what = storeMatch[1].trim();
    const where = storeMatch[2].trim();
    if (/sheet|spreadsheet|google/i.test(where)) {
      return `Individual rows of ${what} in ${where}`;
    }
    return `${what} in ${where}`;
  }

  // Scrape X from Y → "X data ready for next step"
  if (/scrape|extract/i.test(d)) {
    const dataMatch = d.match(/(?:scrape|extract)\s+(.+?)(?:\s+from|\s+for|,|\.|$)/i);
    const dataType = dataMatch?.[1]?.trim() || "data";
    return `${dataType} ready for next step`;
  }

  // Send X to Y → "X delivered to Y"
  const sendMatch = d.match(/send\s+(.+?)\s+to\s+(.+?)(?:\.|,|$)/i);
  if (sendMatch) {
    return `${sendMatch[1].trim()} delivered to ${sendMatch[2].trim()}`;
  }

  // Trigger: "Workflow initiated"
  if (/trigger|start|initiate/i.test(d) && d.length < 80) {
    return "Workflow initiated";
  }

  // Default: use last meaningful phrase (often the result)
  const parts = d.split(/[,.]\s*/).filter((p) => p.trim().length > 15);
  const last = parts[parts.length - 1]?.trim();
  if (last && last !== d) return last;

  return d;
}

/**
 * Preserve essential data from existing workflow:
 * - Step IDs (for task linking and node positions)
 * - Task IDs (linked to steps)
 * - Node positions (user-dragged positions)
 * - Section content (if user has edited)
 */
function preserveEssentialData(
  currentBlueprint: Blueprint,
  aiSteps: AIStep[],
  aiBranches: AIBranch[],
  aiSections: Record<string, string>
): { blueprint: Blueprint } {
  // Build map of existing steps by step number for ID preservation
  const existingStepsByNumber = new Map<string, BlueprintStep>();
  const existingStepsByName = new Map<string, BlueprintStep>();
  currentBlueprint.steps.forEach((step) => {
    if (step.stepNumber) {
      existingStepsByNumber.set(step.stepNumber, step);
    }
    if (typeof step.name === "string" && step.name.trim().length > 0) {
      existingStepsByName.set(step.name.toLowerCase().trim(), step);
    }
  });

  // Build map of existing branches by parent/target for ID preservation
  const existingBranches = new Map<string, BlueprintBranch>();
  currentBlueprint.branches?.forEach((branch) => {
    const key = `${branch.parentStepId}-${branch.targetStepId}`;
    existingBranches.set(key, branch);
  });

  // Convert AI steps to Blueprint steps, preserving IDs where possible
  const stepIdByNumber = new Map<string, string>();
  const newSteps: BlueprintStep[] = aiSteps
    .filter((aiStep): aiStep is AIStep => Boolean(aiStep?.stepNumber))
    .map((aiStep) => {
      const stepName = typeof aiStep.name === "string" ? aiStep.name : "";
      const normalizedName = stepName ? stepName.toLowerCase().trim() : null;
      // Try to match by step number first, then by name
      const existingByNumber = aiStep.stepNumber ? existingStepsByNumber.get(aiStep.stepNumber) : null;
      const existingByName = normalizedName ? existingStepsByName.get(normalizedName) : null;
      const existing = existingByNumber ?? existingByName;

      const stepId = existing?.id ?? randomUUID();
      stepIdByNumber.set(aiStep.stepNumber, stepId);

      // Validate step type
      const validStepTypes: BlueprintStepType[] = ["Trigger", "Action", "Decision", "Exception", "Human"];
      const stepType: BlueprintStepType = aiStep.type && validStepTypes.includes(aiStep.type as BlueprintStepType)
        ? (aiStep.type as BlueprintStepType)
        : "Action";

      // Preserve taskIds from existing step
      const taskIds = existing?.taskIds ?? [];
      const safeName = stepName && stepName.trim().length > 0 ? stepName : `Step ${aiStep.stepNumber ?? stepId}`;
      const richDescription = aiStep.description?.trim() || safeName;
      const notesForOps = aiStep.notes?.trim() || undefined;
      const safeSummary = richDescription;
      const explicitGoal = (aiStep.goalOutcome ?? (aiStep as { goal?: string }).goal)?.trim();
      const goalOutcome =
        explicitGoal ||
        existing?.goalOutcome ||
        inferGoalFromDescription(richDescription, safeName);

      return {
        id: stepId,
        stepNumber: aiStep.stepNumber,
        type: stepType,
        name: safeName,
        summary: safeSummary,
        description: richDescription,
        goalOutcome,
        notesForOps,
        responsibility: aiStep.responsibility ?? mapTypeToResponsibility(stepType),
        systemsInvolved: Array.isArray(aiStep.systemsInvolved) ? aiStep.systemsInvolved : [],
        notifications: Array.isArray(aiStep.notifications) ? aiStep.notifications : [],
        nextStepIds: [], // Will be populated after all steps are created
        taskIds,
        branchType: undefined,
        branchCondition: aiStep.branchCondition,
        branchLabel: aiStep.branchLabel,
        parentStepId: undefined, // Will be populated from branches
      } as BlueprintStep;
    });

  // Resolve nextStepIds using step numbers
  newSteps.forEach((step) => {
    const aiStep = aiSteps.find((s) => s.stepNumber === step.stepNumber);
    if (aiStep?.nextSteps) {
      step.nextStepIds = aiStep.nextSteps
        .map((nextStepNum) => stepIdByNumber.get(nextStepNum))
        .filter((id): id is string => Boolean(id));
    }
  });

  // Convert AI branches to Blueprint branches, preserving IDs where possible
  const newBranches: BlueprintBranch[] = [];
  
  // First, handle branches from AI response
  aiBranches.forEach((aiBranch) => {
    const parentStepNum = aiBranch.parentStep ?? aiBranch.parentStepId ?? aiBranch.sourceStep ?? aiBranch.fromStep;
    const targetStepNum = aiBranch.targetStep ?? aiBranch.targetStepId;
    
    if (!parentStepNum || !targetStepNum) return;
    
    const parentId = stepIdByNumber.get(parentStepNum);
    const targetId = stepIdByNumber.get(targetStepNum);
    
    if (!parentId || !targetId) return;
    
    const branchKey = `${parentId}-${targetId}`;
    const existing = existingBranches.get(branchKey);
    
    newBranches.push({
      id: existing?.id ?? randomUUID(),
      parentStepId: parentId,
      targetStepId: targetId,
      condition: aiBranch.condition ?? aiBranch.branchCondition ?? aiBranch.description ?? "",
      label: aiBranch.label ?? "",
    });
  });
  
  // Also handle branches embedded in steps
  aiSteps.forEach((aiStep) => {
    if (!aiStep.branches || aiStep.branches.length === 0) return;
    
    const parentId = stepIdByNumber.get(aiStep.stepNumber);
    if (!parentId) return;
    
    aiStep.branches.forEach((branch) => {
      const targetId = stepIdByNumber.get(branch.targetStep);
      if (!targetId) return;
      
      const branchKey = `${parentId}-${targetId}`;
      // Skip if already added
      if (newBranches.some((b) => b.parentStepId === parentId && b.targetStepId === targetId)) return;
      
      const existing = existingBranches.get(branchKey);
      
      newBranches.push({
        id: existing?.id ?? randomUUID(),
        parentStepId: parentId,
        targetStepId: targetId,
        condition: branch.description ?? "",
        label: branch.label ?? "",
      });
    });
  });

  // Update sections - preserve existing content, only update if AI provides new content for empty sections
  const updatedSections = currentBlueprint.sections.map((section) => {
    const rawAiContent = aiSections?.[section.key];
    const aiContent =
      typeof rawAiContent === "string"
        ? rawAiContent
        : rawAiContent != null
          ? String(rawAiContent)
          : "";
    const currentContent = typeof section.content === "string" ? section.content : "";

    // Only update if section is currently empty and AI provided usable content
    if (aiContent.trim().length > 0 && currentContent.trim().length === 0) {
      return { ...section, content: aiContent.trim() };
    }
    return section;
  });

  // Preserve metadata (node positions)
  const preservedMetadata = currentBlueprint.metadata;

  return {
    blueprint: {
      version: 1,
      status: currentBlueprint.status,
      summary: currentBlueprint.summary,
      sections: updatedSections,
      steps: newSteps,
      branches: newBranches,
      createdAt: currentBlueprint.createdAt,
      updatedAt: new Date().toISOString(),
      metadata: preservedMetadata,
    },
  };
}

function buildFallbackBlueprint(base: Blueprint): Blueprint {
  const step1Id = randomUUID();
  const step2Id = randomUUID();
  const step3Id = randomUUID();
  const step4Id = randomUUID();
  return {
    ...base,
    steps: [
      {
        id: step1Id,
        stepNumber: "1",
        type: "Trigger",
        name: "Workflow requested",
        summary: "Start drafting the workflow",
        description: "User requested a workflow draft.",
        goalOutcome: "Capture intent",
        responsibility: "Automated",
        systemsInvolved: [],
        notifications: [],
        nextStepIds: [step2Id],
        taskIds: [],
      },
      {
        id: step2Id,
        stepNumber: "2",
        type: "Action",
        name: "Process request",
        summary: "Build draft steps",
        description: "Prepare draft flow steps based on user context.",
        goalOutcome: "Draft flow prepared",
        responsibility: "Automated",
        systemsInvolved: [],
        notifications: [],
        nextStepIds: [step3Id],
        taskIds: [],
      },
      {
        id: step3Id,
        stepNumber: "3",
        type: "Action",
        name: "Send summary email",
        summary: "Notify user with draft summary",
        description: "Email draft summary and next actions.",
        goalOutcome: "User notified",
        responsibility: "Automated",
        systemsInvolved: [],
        notifications: [],
        nextStepIds: [step4Id],
        taskIds: [],
      },
      {
        id: step4Id,
        stepNumber: "4",
        type: "Action",
        name: "Send SMS/Alert",
        summary: "Optional SMS/PagerDuty alert",
        description: "Send SMS or PagerDuty alert as requested.",
        goalOutcome: "User alerted",
        responsibility: "Automated",
        systemsInvolved: [],
        notifications: [],
        nextStepIds: [],
        taskIds: [],
      },
    ],
    branches: [],
  };
}

function mapTypeToResponsibility(type: BlueprintStepType): BlueprintResponsibility {
  switch (type) {
    case "Trigger":
    case "Action":
      return "Automated";
    case "Human":
      return "HumanReview";
    case "Decision":
      return "Automated";
    case "Exception":
      return "Automated";
    default:
      return "Automated";
  }
}

type CompactPromptArgs = {
  userMessage: string;
  currentBlueprint: Blueprint;
  requirementsText?: string | null;
  memorySummary?: string | null;
  memoryFacts?: Record<string, unknown>;
  requirementsStatusHint?: string | null;
  followUpMode?: "technical_opt_in" | null;
  knownFactsHint?: string | null;
  /** Phase A output: intent + requirements diff for focused context (two-phase generation) */
  intentSummaryHint?: string | null;
  requirementsDiffHint?: string | null;
};

function buildCompactPrompt({
  userMessage,
  currentBlueprint,
  requirementsText,
  memorySummary,
  memoryFacts,
  requirementsStatusHint,
  followUpMode,
  knownFactsHint,
  intentSummaryHint,
  requirementsDiffHint,
}: CompactPromptArgs): string {
  const parts: string[] = [];

  if (intentSummaryHint?.trim()) {
    parts.push(`USER INTENT (what they want now):\n${truncate(intentSummaryHint.trim(), 150)}`);
  }
  if (requirementsDiffHint?.trim()) {
    parts.push(`REQUIREMENTS CHANGED:\n${truncate(requirementsDiffHint.trim(), 300)}`);
  }

  if (memorySummary || (memoryFacts && Object.keys(memoryFacts).length > 0)) {
    const factsBlock =
      memoryFacts && Object.keys(memoryFacts).length > 0 ? JSON.stringify(memoryFacts, null, 2) : undefined;
    const summary = memorySummary?.trim();
    if (summary) {
      parts.push(`MEMORY SUMMARY (compact):\n${truncate(summary, 1200)}`);
    }
    if (factsBlock) {
      parts.push(`KNOWN FACTS:\n${factsBlock}`);
    }
  }

  const clippedRequirements = requirementsText?.trim();
  if (clippedRequirements) {
    parts.push(`LATEST REQUIREMENTS (trimmed):\n${truncate(clippedRequirements, 2000)}`);
  }

  if (requirementsStatusHint?.trim()) {
    parts.push(`REQUIREMENTS STATUS (what’s missing):\n${truncate(requirementsStatusHint.trim(), 600)}`);
  }

  if (knownFactsHint?.trim()) {
    parts.push(`KNOWN FACTS (do not re-ask unless unclear):\n${truncate(knownFactsHint.trim(), 600)}`);
  }

  if (followUpMode === "technical_opt_in") {
    parts.push("FOLLOWUP MODE: technical_opt_in (ask consent before technical details)");
  }

  parts.push(`CURRENT WORKFLOW (compact JSON):\n${summarizeBlueprintCompact(currentBlueprint)}`);

  parts.push(`USER INPUT:\n${userMessage}`);
  parts.push(
    [
      "RESPONSE FORMAT (MANDATORY):",
      "- Return a JSON object with keys: workflow, tasks (array), chatResponse, followUpQuestion",
      "- Put steps/branches/sections inside workflow.steps / workflow.branches / workflow.sections",
      "- Put tasks inside tasks[] with: title, description, priority (blocker|important|optional), relatedSteps (ids), systemType",
      "- Keep steps specific to the user's systems and include decisions/exception branches for missing data and retries",
      "- Include at least 2 tasks when possible",
      "",
      "STEP DETAILS (CRITICAL): Each step MUST have BOTH description AND goalOutcome (different values):",
      "- description: What happens + context. Example: 'Store scraped data in a Google Sheet, focusing on SUVs and sedans.'",
      "- goalOutcome: The end state (what exists after), NOT the action. Example: 'Individual rows of scraped prices in a Google Sheet.'",
      "- Never set goalOutcome = description. goalOutcome = outcome; description = action.",
    ].join("\n")
  );

  return parts.join("\n\n");
}

function summarizeBlueprintCompact(blueprint: Blueprint): string {
  if (!blueprint?.steps?.length) {
    return JSON.stringify({ summary: blueprint?.summary ?? null, steps: [], sections: {} }, null, 2);
  }

  const sections: Record<string, string> = {};
  blueprint.sections?.forEach((section) => {
    const content = section.content?.trim();
    if (content) {
      sections[section.key] = truncate(content, 280);
    }
  });

  const steps = blueprint.steps.map((step) => {
    const desc = step.description || step.summary;
    const goal = step.goalOutcome;
    const notes = (step as { notesForOps?: string }).notesForOps;
    return {
      stepNumber: step.stepNumber,
      type: step.type,
      name: step.name,
      ...(desc ? { description: truncate(desc, 120) } : {}),
      ...(goal ? { goalOutcome: truncate(goal, 80) } : {}),
      ...(notes ? { notes: truncate(notes, 80) } : {}),
      systemsInvolved: step.systemsInvolved?.slice(0, 3) ?? [],
      nextSteps: (step.nextStepIds ?? [])
        .map((id) => blueprint.steps.find((candidate) => candidate.id === id)?.stepNumber ?? id)
        .slice(0, 4),
      branchLabel: step.branchLabel,
    };
  });

  const compact = {
    summary: truncate(blueprint.summary ?? "", 240) || null,
    sections,
    stepCount: blueprint.steps.length,
    steps,
  };

  return truncate(JSON.stringify(compact, null, 2), 1800);
}

function truncate(value: string, limit: number): string {
  if (!value) return "";
  return value.length > limit ? `${value.slice(0, limit)}…` : value;
}

function parseAIResponse(content: string): AIResponse {
  try {
    return JSON.parse(content) as AIResponse;
  } catch (error) {
    logger.error("Failed to parse AI response:", error);
    return { steps: [], tasks: [] };
  }
}

function normalizeChatResponse(response?: unknown): string {
  if (typeof response === "string") {
    const trimmed = response.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return "Got it. I've updated the workflow.";
}

// Canonical workflow aliases
export type BuildWorkflowParams = BuildBlueprintParams;
export type BuildWorkflowResult = BuildBlueprintResult;
export const buildWorkflowFromChat = buildBlueprintFromChat;


import OpenAI from "openai";
import { randomUUID } from "crypto";
import type { Blueprint, BlueprintStep, BlueprintBranch } from "./types";
import { applyStepNumbers } from "./step-numbering";
import { WORKFLOW_SYSTEM_PROMPT, formatWorkflowPrompt } from "@/lib/ai/prompts";
import { copilotDebug } from "@/lib/ai/copilot-debug";
import { sanitizeBlueprintTopology, type SanitizationSummary } from "@/lib/workflows/sanitizer";
import { logger } from "@/lib/logger";

const WORKFLOW_MODEL = process.env.WORKFLOW_MODEL ?? process.env.BLUEPRINT_MODEL ?? "gpt-4-turbo-preview";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? "",
});

type ConversationMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

interface BuildBlueprintParams {
  userMessage: string;
  currentBlueprint: Blueprint;
  currentWorkflow?: Blueprint;
  conversationHistory?: ConversationMessage[];
  requirementsText?: string | null;
  requirementsStatusHint?: string | null;
  followUpMode?: "technical_opt_in" | null;
  knownFactsHint?: string | null;
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
  type: BlueprintStep["type"];
  name: string;
  description?: string;
  systemsInvolved?: string[];
  nextSteps?: string[];
  branches?: Array<{
    label?: string;
    targetStep?: string;
    targetStepId?: string;
    description?: string;
    branchCondition?: string;
  }>;
  branchCondition?: string;
  branchLabel?: string;
  parentStep?: string;
  parentStepId?: string;
  notifications?: string[];
  responsibility?: BlueprintStep["responsibility"];
  dependsOnIds?: string[];
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
    sanitizationSummary?: SanitizationSummary;
  };
  steps?: AIStep[];
  branches?: AIBranch[];
  tasks?: AITask[];
  sections?: Record<string, string>;
  requirementsText?: string;
  sanitizationSummary?: SanitizationSummary;
};

/**
 * Build or update a blueprint based on user conversation.
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
    requirementsStatusHint,
    followUpMode,
    knownFactsHint,
  } = params;
  const currentBlueprint = currentWorkflow ?? blueprintInput;

  const messages: ConversationMessage[] = [
    { role: "system", content: WORKFLOW_SYSTEM_PROMPT },
    ...conversationHistory.slice(-10),
    {
      role: "user",
      content: formatWorkflowPrompt(userMessage, currentBlueprint, requirementsText, requirementsStatusHint, {
        followUpMode,
        knownFactsHint,
      }),
    },
  ];

  try {
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

    copilotDebug("draft_blueprint.raw_response", content);

    const aiResponse = parseAIResponse(content);
    const normalizedSteps = Array.isArray(aiResponse.blueprint?.steps)
      ? aiResponse.blueprint?.steps
      : Array.isArray(aiResponse.steps)
        ? aiResponse.steps
        : [];
    const normalizedTasks = Array.isArray(aiResponse.blueprint?.tasks)
      ? aiResponse.blueprint?.tasks
      : Array.isArray(aiResponse.tasks)
        ? aiResponse.tasks
        : [];
    const normalizedBranches = Array.isArray(aiResponse.blueprint?.branches)
      ? aiResponse.blueprint?.branches
      : Array.isArray(aiResponse.branches)
        ? aiResponse.branches
        : [];
  const normalizedSections = aiResponse.blueprint?.sections ?? aiResponse.sections ?? {};
  const normalizedSanitizationSummary = aiResponse.blueprint?.sanitizationSummary ?? aiResponse.sanitizationSummary;
    // Check both top-level and nested in blueprint object
    const updatedRequirementsText = (aiResponse.requirementsText ?? aiResponse.blueprint?.requirementsText)?.trim() || undefined;

    const merged = mergeAIResponse(currentBlueprint, {
      steps: normalizedSteps,
      tasks: normalizedTasks,
      branches: normalizedBranches,
      sections: normalizedSections,
    });
    const numberedBlueprint = applyStepNumbers(merged.blueprint);

    const chatResponse = normalizeChatResponse(aiResponse.chatResponse);
    const followUpQuestion = aiResponse.followUpQuestion?.trim() || undefined;

    copilotDebug("draft_blueprint.parsed_response", {
      chatResponse,
      followUpQuestion,
      stepCount: numberedBlueprint.steps.length,
      taskCount: merged.tasks.length,
      hasRequirementsUpdate: updatedRequirementsText !== null,
    });

    return {
    blueprint: numberedBlueprint,
    workflow: numberedBlueprint,
      tasks: merged.tasks,
      chatResponse,
      followUpQuestion,
      sanitizationSummary:
        merged.sanitizationSummary ??
        normalizedSanitizationSummary ?? {
          removedDuplicateEdges: 0,
          reparentedBranches: 0,
          removedCycles: 0,
          trimmedConnections: 0,
          attachedOrphans: 0,
        },
      requirementsText: updatedRequirementsText,
    };
  } catch (error) {
    logger.error("Error building blueprint from chat:", error);
    throw new Error("Failed to generate blueprint");
  }
}

function parseAIResponse(content: string): AIResponse {
  try {
    return JSON.parse(content) as AIResponse;
  } catch (error) {
    logger.error("Failed to parse AI response:", error);
    return { steps: [], tasks: [] };
  }
}

function normalizeChatResponse(response?: string): string {
  const trimmed = response?.trim();
  if (trimmed && trimmed.length > 0) {
    return trimmed;
  }
  return "Got it. I've updated the blueprint.";
}

function mergeAIResponse(
  currentBlueprint: Blueprint,
  aiResponse: { steps: AIStep[]; tasks: AITask[]; branches?: AIBranch[]; sections?: Record<string, string> }
): { blueprint: Blueprint; workflow: Blueprint; tasks: AITask[]; sanitizationSummary: SanitizationSummary } {
  const aiSteps = Array.isArray(aiResponse.steps) ? aiResponse.steps : [];
  const aiTasks = Array.isArray(aiResponse.tasks) ? aiResponse.tasks : [];
  const aiBranches = Array.isArray(aiResponse.branches) ? aiResponse.branches : [];

  if (aiSteps.length === 0 && aiTasks.length === 0) {
    return {
      blueprint: currentBlueprint,
      workflow: currentBlueprint,
      tasks: [],
      sanitizationSummary: {
        removedDuplicateEdges: 0,
        reparentedBranches: 0,
        removedCycles: 0,
        trimmedConnections: 0,
        attachedOrphans: 0,
      },
    };
  }

  const currentSteps = Array.isArray(currentBlueprint.steps) ? currentBlueprint.steps : [];
  const existingStepsByNumber = new Map<string, BlueprintStep>();
  const existingStepIds = new Set<string>();
  currentSteps.forEach((step) => {
    if (step.stepNumber) {
      existingStepsByNumber.set(step.stepNumber, step);
    }
    existingStepIds.add(step.id);
  });

  const stepIdByNumber = new Map<string, string>();
  currentSteps.forEach((step) => {
    if (step.stepNumber) {
      stepIdByNumber.set(step.stepNumber, step.id);
    }
  });

  aiSteps.forEach((aiStep) => {
    if (!aiStep.stepNumber) {
      return;
    }
    if (!stepIdByNumber.has(aiStep.stepNumber)) {
      const existing = existingStepsByNumber.get(aiStep.stepNumber);
      const generatedId = existing?.id ?? randomUUID();
      stepIdByNumber.set(aiStep.stepNumber, generatedId);
      existingStepIds.add(generatedId);
    }
  });

  const seenStepNumbers = new Set<string>();
  const builtStepMap = new Map<string, BlueprintStep>();
  const mergedSteps: BlueprintStep[] = aiSteps
    .filter((aiStep): aiStep is AIStep => Boolean(aiStep?.stepNumber))
    .map((aiStep) => {
      const stepNumber = aiStep.stepNumber;
      seenStepNumbers.add(stepNumber);
      const existing = existingStepsByNumber.get(stepNumber);
      const stepId = stepIdByNumber.get(stepNumber) ?? existing?.id ?? randomUUID();
      stepIdByNumber.set(stepNumber, stepId);
      existingStepIds.add(stepId);

      const base: BlueprintStep =
        existing ??
        (() => {
          const validStepTypes: BlueprintStep["type"][] = ["Trigger", "Action", "Decision", "Exception", "Human"];
          const defaultType = aiStep.type && validStepTypes.includes(aiStep.type as BlueprintStep["type"])
            ? (aiStep.type as BlueprintStep["type"])
            : "Action";
          return {
            id: stepId,
            stepNumber,
            type: defaultType,
            name: aiStep.name ?? `Step ${stepNumber}`,
            summary: "",
            description: "",
            goalOutcome: "",
            responsibility: mapTypeToResponsibility(defaultType),
            systemsInvolved: [],
            notifications: [],
            nextStepIds: [],
            taskIds: [],
          } as BlueprintStep;
        })();

      const isExistingStep = Boolean(existing);
      const parentStepId = resolveParentStepId(aiStep, base, stepIdByNumber, existingStepIds);
      const description =
        aiStep.description?.trim() ||
        (isExistingStep ? base.description : aiStep.name?.trim()) ||
        base.description ||
        "Description pending";
      const summary = isExistingStep ? base.summary ?? description : description;
      const goalOutcome = isExistingStep
        ? base.goalOutcome ?? description
        : aiStep.description?.trim() || aiStep.name?.trim() || description;
      const systemsInvolved =
        Array.isArray(aiStep.systemsInvolved) && aiStep.systemsInvolved.length > 0
          ? aiStep.systemsInvolved
          : base.systemsInvolved;
      const hasBranches = Array.isArray(aiStep.branches) && aiStep.branches.length > 0;
      const explicitNextSteps = convertNextSteps(aiStep.nextSteps, stepIdByNumber, existingStepIds);
      const nextStepIds =
        explicitNextSteps.length > 0 && !hasBranches ? explicitNextSteps : Array.from(new Set(base.nextStepIds));

      // Normalize step type - filter out invalid types like "Outcome"
      const validStepTypes: BlueprintStep["type"][] = ["Trigger", "Action", "Decision", "Exception", "Human"];
      const normalizedType = aiStep.type && validStepTypes.includes(aiStep.type as BlueprintStep["type"])
        ? (aiStep.type as BlueprintStep["type"])
        : base.type;

      const transformed: BlueprintStep = {
        ...base,
        id: stepId,
        stepNumber,
        type: normalizedType,
        name: isExistingStep ? base.name : aiStep.name ?? base.name,
        description,
        summary,
        goalOutcome,
        responsibility: mapTypeToResponsibility(normalizedType),
        systemsInvolved,
        branchType: normalizedType !== base.type ? deriveBranchType(aiStep, normalizedType) ?? base.branchType : base.branchType,
        branchCondition: aiStep.branchCondition ?? base.branchCondition,
        branchLabel: aiStep.branchLabel ?? base.branchLabel,
        parentStepId,
        nextStepIds,
        taskIds: [...(base.taskIds ?? [])],
      };

      builtStepMap.set(stepNumber, transformed);
      return transformed;
    });

  const preservedSteps = currentSteps.filter((step) => !seenStepNumbers.has(step.stepNumber));
  const allSteps = reconcileStepConnections([...mergedSteps, ...preservedSteps], aiSteps, stepIdByNumber);
  const stepById = new Map(allSteps.map((step) => [step.id, step]));

  allSteps.forEach((step) => {
    if (!step.parentStepId) {
      return;
    }
    const parent = stepById.get(step.parentStepId);
    if (!parent) {
      return;
    }
    if (!parent.nextStepIds.includes(step.id)) {
      parent.nextStepIds = [step.id, ...parent.nextStepIds];
    }
  });

  applyBranchRelationships(aiSteps, builtStepMap, stepIdByNumber, existingStepIds);
  const explicitBranches = convertExplicitBranches(aiBranches, stepIdByNumber, existingStepIds);
  const derivedBranches =
    explicitBranches.length > 0 ? explicitBranches : buildBranchesFromSteps(aiSteps, stepIdByNumber, existingStepIds);
  const blueprintBranches = Array.isArray(currentBlueprint.branches) ? currentBlueprint.branches : [];
  const mergedBranches = derivedBranches.length > 0 ? derivedBranches : blueprintBranches;

  const mergedBlueprint: Blueprint = {
    ...currentBlueprint,
    steps: allSteps,
    branches: mergedBranches,
    updatedAt: new Date().toISOString(),
  };

  // Populate sections from AI response if provided
  let updatedSections = mergedBlueprint.sections;
  if (aiResponse.sections && Object.keys(aiResponse.sections).length > 0) {
    const sectionsChanged = updatedSections.map((section) => {
      const aiContent = aiResponse.sections?.[section.key];
      // Only update if section is currently empty and AI provided content
      if (aiContent && aiContent.trim().length > 0 && (!section.content || section.content.trim().length === 0)) {
        return { ...section, content: aiContent.trim() };
      }
      return section;
    });
    updatedSections = sectionsChanged;
  }

  const mergedBlueprintWithSections = {
    ...mergedBlueprint,
    sections: updatedSections,
  };

  const { blueprint: sanitizedBlueprint, summary: sanitizationSummary } = sanitizeBlueprintTopology(
    mergedBlueprintWithSections
  );

  return {
    blueprint: sanitizedBlueprint,
    workflow: sanitizedBlueprint,
    tasks: aiTasks,
    sanitizationSummary,
  };
}

function buildBranchesFromSteps(
  aiSteps: AIStep[],
  stepIdByNumber: Map<string, string>,
  existingStepIds: Set<string>
): BlueprintBranch[] {
  const branches: BlueprintBranch[] = [];

  aiSteps.forEach((aiStep) => {
    if (!Array.isArray(aiStep.branches) || aiStep.branches.length === 0) {
      return;
    }
    const parentId = lookupStepId(aiStep.stepNumber, stepIdByNumber, existingStepIds);
    if (!parentId) {
      return;
    }

    aiStep.branches.forEach((branch) => {
      const targetRef = branch.targetStep ?? branch.targetStepId;
      const targetId = lookupStepId(targetRef, stepIdByNumber, existingStepIds);
      if (!targetId) {
        return;
      }
      branches.push({
        id: randomUUID(),
        parentStepId: parentId,
        condition: aiStep.branchCondition || branch.description || "",
        label: branch.label ?? "",
        targetStepId: targetId,
      });
    });
  });

  return branches;
}

function convertExplicitBranches(
  aiBranches: AIBranch[],
  stepIdByNumber: Map<string, string>,
  existingStepIds: Set<string>
): BlueprintBranch[] {
  if (!Array.isArray(aiBranches) || aiBranches.length === 0) {
    return [];
  }

  const branches: BlueprintBranch[] = [];
  aiBranches.forEach((branch) => {
    const parentKey = branch.parentStep ?? branch.parentStepId ?? branch.sourceStep ?? branch.fromStep;
    const targetKey = branch.targetStep ?? branch.targetStepId;
    if (!parentKey || !targetKey) {
      return;
    }
    const parentId = lookupStepId(parentKey, stepIdByNumber, existingStepIds);
    const targetId = lookupStepId(targetKey, stepIdByNumber, existingStepIds);
    if (!parentId || !targetId) {
      return;
    }
    branches.push({
      id: randomUUID(),
      parentStepId: parentId,
      label: branch.label ?? "",
      condition: branch.description ?? branch.condition ?? branch.branchCondition ?? "",
      targetStepId: targetId,
    });
  });

  return branches;
}

function reconcileStepConnections(
  steps: BlueprintStep[],
  aiSteps: AIStep[],
  stepIdByNumber: Map<string, string>
): BlueprintStep[] {
  if (steps.length === 0) {
    return steps;
  }

  const validIds = new Set(steps.map((step) => step.id));
  const stepMap = new Map<string, BlueprintStep>();

  steps.forEach((step) => {
    const filteredNext = step.nextStepIds.filter((id) => validIds.has(id));
    if (filteredNext.length === step.nextStepIds.length) {
      stepMap.set(step.id, step);
      return;
    }
    stepMap.set(step.id, {
      ...step,
      nextStepIds: filteredNext,
    });
  });

  const orderedIds = aiSteps
    .map((aiStep) => (aiStep.stepNumber ? stepIdByNumber.get(aiStep.stepNumber) : undefined))
    .filter((id): id is string => Boolean(id));

  const branchParentIds = new Set(
    steps
      .filter((step) => step.branchType === "conditional" || step.branchType === "exception")
      .map((step) => step.id)
  );

  for (let index = 0; index < orderedIds.length - 1; index += 1) {
    const current = stepMap.get(orderedIds[index]);
    const next = stepMap.get(orderedIds[index + 1]);
    if (!current || !next) {
      continue;
    }
    const isBranchParent = branchParentIds.has(current.id);
    if (isBranchParent || current.nextStepIds.length > 0) {
      continue;
    }
    stepMap.set(current.id, {
      ...current,
      nextStepIds: [next.id],
    });
  }

  return steps.map((step) => stepMap.get(step.id) ?? step);
}

function convertNextSteps(
  stepReferences: string[] | undefined,
  lookup: Map<string, string>,
  existingStepIds: Set<string>
): string[] {
  if (!Array.isArray(stepReferences) || stepReferences.length === 0) {
    return [];
  }
  return stepReferences
    .map((reference) => lookup.get(reference) ?? (existingStepIds.has(reference) ? reference : undefined))
    .filter((value): value is string => Boolean(value));
}

function lookupStepId(
  reference: string | undefined,
  lookup: Map<string, string>,
  existingStepIds: Set<string>
): string | undefined {
  if (!reference) {
    return undefined;
  }
  return lookup.get(reference) ?? (existingStepIds.has(reference) ? reference : undefined);
}

function resolveParentStepId(
  aiStep: AIStep,
  fallback: BlueprintStep,
  stepIdByNumber: Map<string, string>,
  existingStepIds: Set<string>
): string | undefined {
  if (aiStep.parentStepId && existingStepIds.has(aiStep.parentStepId)) {
    return aiStep.parentStepId;
  }
  if (aiStep.parentStep) {
    const parentId = lookupStepId(aiStep.parentStep, stepIdByNumber, existingStepIds);
    if (parentId) {
      return parentId;
    }
  }

  if (fallback.parentStepId) {
    return fallback.parentStepId;
  }

  if (!aiStep.stepNumber) {
    return undefined;
  }
  const match = aiStep.stepNumber.match(/^([0-9]+[A-Z]?)/i);
  if (!match) {
    return undefined;
  }
  const prefix = match[1];
  const parentKey =
    fallback.branchType === "exception"
      ? prefix.replace(/E$/i, "")
      : prefix.replace(/[A-Z]$/i, "");

  if (!parentKey || parentKey === prefix) {
    return undefined;
  }
  return stepIdByNumber.get(parentKey);
}

function deriveBranchType(aiStep: AIStep, fallbackType: BlueprintStep["type"]): BlueprintStep["branchType"] {
  if (aiStep.type === "Exception") {
    return "exception";
  }
  if (aiStep.branchCondition || aiStep.branches?.length) {
    return "conditional";
  }
  if (fallbackType === "Decision") {
    return "conditional";
  }
  return undefined;
}

function applyBranchRelationships(
  aiSteps: AIStep[],
  stepMap: Map<string, BlueprintStep>,
  stepIdByNumber: Map<string, string>,
  existingStepIds: Set<string>
): void {
  aiSteps.forEach((aiStep) => {
    if (!aiStep.stepNumber) {
      return;
    }
    const parent = stepMap.get(aiStep.stepNumber);
    if (!parent || !Array.isArray(aiStep.branches) || aiStep.branches.length === 0) {
      return;
    }

    const branchTargetIds: string[] = [];
    aiStep.branches.forEach((branch) => {
      const targetRef = branch?.targetStep ?? branch?.targetStepId;
      if (!targetRef) {
        return;
      }
      const targetId = lookupStepId(targetRef, stepIdByNumber, existingStepIds);
      if (!targetId) {
        return;
      }
      branchTargetIds.push(targetId);
      const child = stepMap.get(targetId);
      if (child) {
        child.parentStepId = parent.id;
        if (branch.label) {
          child.branchLabel = branch.label;
        }
        const conditionText = branch.description ?? branch.branchCondition ?? aiStep.branchCondition;
        if (conditionText) {
          child.branchCondition = conditionText;
        }
        child.nextStepIds = child.nextStepIds.filter((id) => id !== parent.id);
      }
    });

    if (branchTargetIds.length > 0) {
      const uniqueTargets = branchTargetIds.filter((id, index, arr) => arr.indexOf(id) === index);
      parent.nextStepIds = uniqueTargets;
    }
  });
}
function mapTypeToResponsibility(type: string): "Automated" | "HumanReview" | "Approval" {
  switch (type) {
    case "Human":
      return "Approval";
    case "Exception":
      return "HumanReview";
    default:
      return "Automated";
  }
}

// Canonical workflow aliases
export type BuildWorkflowParams = BuildBlueprintParams;
export type BuildWorkflowResult = BuildBlueprintResult;
export const buildWorkflowFromChat = buildBlueprintFromChat;



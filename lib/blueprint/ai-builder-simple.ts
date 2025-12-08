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
import { BLUEPRINT_SYSTEM_PROMPT, formatBlueprintPrompt } from "@/lib/ai/prompts";
import { copilotDebug } from "@/lib/ai/copilot-debug";
import { sanitizeBlueprintTopology, type SanitizationSummary } from "./sanitizer";

type ConversationMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

interface BuildBlueprintParams {
  userMessage: string;
  currentBlueprint: Blueprint;
  conversationHistory?: ConversationMessage[];
  requirementsText?: string | null;
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
  description?: string;
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

const BLUEPRINT_MODEL = process.env.BLUEPRINT_MODEL ?? "gpt-4-turbo-preview";

import OpenAI from "openai";
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? "",
});

/**
 * Build complete workflow from scratch, preserving essential IDs and metadata
 */
export async function buildBlueprintFromChat(params: BuildBlueprintParams): Promise<BuildBlueprintResult> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const { userMessage, currentBlueprint, conversationHistory = [], requirementsText } = params;

  const messages: ConversationMessage[] = [
    { role: "system", content: BLUEPRINT_SYSTEM_PROMPT },
    ...conversationHistory.slice(-10),
    { role: "user", content: formatBlueprintPrompt(userMessage, currentBlueprint, requirementsText) },
  ];

  try {
    const completion = await openai.chat.completions.create({
      model: BLUEPRINT_MODEL,
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
    const updatedRequirementsText = (aiResponse.requirementsText ?? aiResponse.blueprint?.requirementsText)?.trim() || undefined;

    // Build workflow from scratch, preserving IDs and metadata
    const preservedWorkflow = preserveEssentialData(currentBlueprint, normalizedSteps, normalizedBranches, normalizedSections);
    
    const numberedBlueprint = applyStepNumbers(preservedWorkflow.blueprint);
    const { blueprint: sanitizedBlueprint, summary: sanitizationSummary } = sanitizeBlueprintTopology(numberedBlueprint);

    const chatResponse = normalizeChatResponse(aiResponse.chatResponse);
    const followUpQuestion = aiResponse.followUpQuestion?.trim() || undefined;

    copilotDebug("draft_blueprint.parsed_response", {
      chatResponse,
      followUpQuestion,
      stepCount: sanitizedBlueprint.steps.length,
      taskCount: normalizedTasks.length,
      hasRequirementsUpdate: updatedRequirementsText !== undefined,
    });

    return {
      blueprint: sanitizedBlueprint,
      tasks: normalizedTasks,
      chatResponse,
      followUpQuestion,
      sanitizationSummary,
      requirementsText: updatedRequirementsText,
    };
  } catch (error) {
    console.error("Error building blueprint from chat:", error);
    throw new Error("Failed to generate blueprint");
  }
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
    existingStepsByName.set(step.name.toLowerCase().trim(), step);
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
      // Try to match by step number first, then by name
      const existingByNumber = aiStep.stepNumber ? existingStepsByNumber.get(aiStep.stepNumber) : null;
      const existingByName = existingStepsByName.get(aiStep.name.toLowerCase().trim());
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

      return {
        id: stepId,
        stepNumber: aiStep.stepNumber,
        type: stepType,
        name: aiStep.name,
        summary: aiStep.description?.trim() || aiStep.name,
        description: aiStep.description?.trim() || aiStep.name,
        goalOutcome: aiStep.description?.trim() || aiStep.name,
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
    const aiContent = aiSections[section.key];
    // Only update if section is currently empty and AI provided content
    if (aiContent && aiContent.trim().length > 0 && (!section.content || section.content.trim().length === 0)) {
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

function parseAIResponse(content: string): AIResponse {
  try {
    return JSON.parse(content) as AIResponse;
  } catch (error) {
    console.error("Failed to parse AI response:", error);
    return { steps: [], tasks: [] };
  }
}

function normalizeChatResponse(response?: string): string {
  const trimmed = response?.trim();
  if (trimmed && trimmed.length > 0) {
    return trimmed;
  }
  return "Got it. I've updated the workflow.";
}


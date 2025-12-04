import type { Blueprint, BlueprintSectionKey, BlueprintStepType } from "@/lib/blueprint/types";
import type { BlueprintUpdates } from "@/lib/blueprint/ai-updates";
import type { CopilotThinkingStep } from "@/types/copilot-thinking";
import { callCopilotChat } from "./openai-client";
import { buildCopilotSystemPrompt, type ConversationPhase } from "./prompts";
import { parseCopilotReply } from "./parse-copilot-reply";

type ConversationMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type OrchestratorArgs = {
  blueprint: Blueprint;
  messages: ConversationMessage[];
  automationName?: string;
};

type OrchestratorResult = {
  assistantDisplayText: string;
  blueprintUpdates: BlueprintUpdates | null;
  thinkingSteps: CopilotThinkingStep[];
  conversationPhase: ConversationPhase;
};

const MAX_CONTEXT_MESSAGES = 8;
const DEFAULT_MODEL = process.env.COPILOT_MODEL ?? "gpt-4o-mini";
const DEFAULT_TEMPERATURE = 0.3;
const DEFAULT_MAX_TOKENS = 1500;

export async function runCopilotOrchestration({
  blueprint,
  messages,
  automationName,
}: OrchestratorArgs): Promise<OrchestratorResult> {
  const phase = determineConversationPhase(blueprint, messages);
  const systemPrompt = buildCopilotSystemPrompt({
    automationName,
    conversationPhase: phase,
    currentBlueprint: blueprint,
  });

  const recentMessages = limitContext(messages);
  const formattedMessages: ConversationMessage[] = [
    { role: "system", content: systemPrompt },
    ...recentMessages.map((message) => ({
      role: message.role,
      content: message.content.trim(),
    })),
  ];

  const response = await callCopilotChat({
    model: DEFAULT_MODEL,
    messages: formattedMessages,
    temperature: DEFAULT_TEMPERATURE,
    maxTokens: DEFAULT_MAX_TOKENS,
  });

  const parsed = parseCopilotReply(response);
  const latestMessageContent = messages[messages.length - 1]?.content;
  let blueprintUpdates = parsed.blueprintUpdates;

  if (!hasMeaningfulBlueprintUpdate(blueprintUpdates)) {
    const fallback = deriveBlueprintUpdatesFromText(parsed.displayText);
    if (fallback) {
      blueprintUpdates = fallback;
    }
  }

  return {
    assistantDisplayText: parsed.displayText,
    blueprintUpdates,
    thinkingSteps: generateThinkingSteps(phase, latestMessageContent, blueprint),
    conversationPhase: phase,
  };
}

export function determineConversationPhase(
  blueprint: Blueprint | null | undefined,
  messages: Array<{ role: string }>
): ConversationPhase {
  const userMessages = messages.filter((message) => message.role === "user").length;
  const stepCount = blueprint?.steps?.length ?? 0;
  const hasBusinessObjectives = hasSectionContent(blueprint, "business_objectives");
  const hasExceptions = hasSectionContent(blueprint, "exceptions");
  const hasHumanTouchpoints = hasSectionContent(blueprint, "human_touchpoints");

  if (userMessages <= 2 && stepCount === 0) {
    return "discovery";
  }

  if (stepCount < 3) {
    return "flow";
  }

  if (stepCount < 7 && !hasBusinessObjectives) {
    return "flow";
  }

  if (!hasExceptions || !hasHumanTouchpoints) {
    return "details";
  }

  return "validation";
}

export function generateThinkingSteps(
  phase: ConversationPhase,
  latestUserMessage?: string,
  blueprint?: Blueprint | null
): CopilotThinkingStep[] {
  const mentionedSystems = latestUserMessage ? extractSystemsFromMessage(latestUserMessage) : [];
  const blueprintSystems = blueprint ? getSystemsFromBlueprint(blueprint) : [];
  const systems = mentionedSystems.length > 0 ? mentionedSystems : blueprintSystems;
  const systemsText = systems.length > 0 ? systems.join(" and ") : "";

  const normalizedLatestMessage = latestUserMessage?.toLowerCase() ?? "";
  const mentionsApproval = /approv/.test(normalizedLatestMessage) || normalizedLatestMessage.includes("$");

  switch (phase) {
    case "discovery":
      return [
        {
          id: "thinking-1",
          label: systemsText ? `Understanding the ${systems[0]}-based workflow` : "Understanding the workflow goal",
        },
        {
          id: "thinking-2",
          label: "Identifying triggers and desired outcomes",
        },
        {
          id: "thinking-3",
          label: "Framing the first clarifying questions",
        },
      ];

    case "flow":
      return [
        {
          id: "thinking-1",
          label: "Mapping each step in the automation",
        },
        {
          id: "thinking-2",
          label: systemsText ? `Connecting ${systemsText}` : "Connecting systems and data paths",
        },
        {
          id: "thinking-3",
          label: "Drafting the visual blueprint",
        },
      ];

    case "details":
      return [
        {
          id: "thinking-1",
          label: mentionsApproval ? "Analyzing approval threshold logic" : "Reviewing edge cases and data requirements",
        },
        {
          id: "thinking-2",
          label: "Capturing human touchpoints or reviews",
        },
        {
          id: "thinking-3",
          label: "Tightening assumptions and branches",
        },
      ];

    case "validation":
    default:
      return [
        {
          id: "thinking-1",
          label: "Validating the full automation flow",
        },
        {
          id: "thinking-2",
          label: "Preparing the final summary for review",
        },
      ];
  }
}

function extractSystemsFromMessage(message: string): string[] {
  const systems: string[] = [];
  const lower = message.toLowerCase();

  const patterns = [
    { regex: /quickbooks|qbo/i, name: "QuickBooks" },
    { regex: /xero/i, name: "Xero" },
    { regex: /slack/i, name: "Slack" },
    { regex: /\bgmail\b|email/i, name: "email" },
    { regex: /salesforce|sfdc/i, name: "Salesforce" },
    { regex: /hubspot/i, name: "HubSpot" },
    { regex: /google sheets?/i, name: "Google Sheets" },
    { regex: /notion/i, name: "Notion" },
    { regex: /airtable/i, name: "Airtable" },
    { regex: /shopify/i, name: "Shopify" },
    { regex: /stripe/i, name: "Stripe" },
    { regex: /asana/i, name: "Asana" },
    { regex: /jira/i, name: "Jira" },
  ];

  for (const pattern of patterns) {
    if (pattern.regex.test(lower)) {
      systems.push(pattern.name);
    }
  }

  return systems.slice(0, 2);
}

function getSystemsFromBlueprint(blueprint: Blueprint | null | undefined): string[] {
  if (!blueprint?.steps) {
    return [];
  }

  const systems = new Set<string>();
  for (const step of blueprint.steps) {
    if (!step.systemsInvolved) continue;
    for (const system of step.systemsInvolved) {
      if (system && system.trim() && system !== "System TBD") {
        systems.add(system);
      }
    }
  }

  return Array.from(systems).slice(0, 2);
}

function limitContext(messages: ConversationMessage[]): ConversationMessage[] {
  if (messages.length <= MAX_CONTEXT_MESSAGES) {
    return messages;
  }
  return messages.slice(-MAX_CONTEXT_MESSAGES);
}

function hasSectionContent(blueprint: Blueprint | null | undefined, key: BlueprintSectionKey): boolean {
  if (!blueprint?.sections) {
    return false;
  }
  return blueprint.sections.some((section) => section.key === key && Boolean(section.content?.trim()));
}

function hasMeaningfulBlueprintUpdate(updates?: BlueprintUpdates | null): boolean {
  if (!updates) {
    return false;
  }
  if (updates.summary && updates.summary.trim().length > 0) {
    return true;
  }
  if (updates.steps && updates.steps.length > 0) {
    return true;
  }
  if (updates.sections && Object.keys(updates.sections).length > 0) {
    return true;
  }
  if (updates.assumptions && updates.assumptions.length > 0) {
    return true;
  }
  return false;
}

function deriveBlueprintUpdatesFromText(text: string): BlueprintUpdates | null {
  if (!text) {
    return null;
  }

  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const bulletMatches = lines
    .map((line) => {
      const match = line.match(/^(\d+[\.\)]|\-|\*)\s+(.*)$/);
      return match ? match[2].trim() : null;
    })
    .filter((line): line is string => Boolean(line));

  const candidateSteps = bulletMatches.length >= 2 ? bulletMatches : extractSentences(text);

  if (candidateSteps.length === 0) {
    return null;
  }

  const steps = candidateSteps.map((content, index) => {
    const id = generateFallbackStepId(content, index);
    const type: BlueprintStepType =
      index === 0 ? "Trigger" : index === candidateSteps.length - 1 ? "Action" : "Action";
    const title = content.length > 60 ? `${content.slice(0, 57)}...` : content;
    const dependsOnIds = index > 0 ? [generateFallbackStepId(candidateSteps[index - 1], index - 1)] : [];

    return {
      id,
      title,
      summary: content,
      type,
      goal: index === candidateSteps.length - 1 ? "Complete workflow" : undefined,
      systemsInvolved: [],
      inputs: [],
      outputs: [],
      dependsOnIds,
    };
  });

  return { steps };
}

function extractSentences(text: string): string[] {
  const sentences = text
    .split(/[\.\n]/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 6);

  return sentences.slice(0, 5);
}

function generateFallbackStepId(content: string, index: number): string {
  const slug = content
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  return slug ? `auto_${index + 1}_${slug}` : `auto_step_${index + 1}`;
}


import type { Blueprint, BlueprintSectionKey } from "@/lib/blueprint/types";
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

  return {
    assistantDisplayText: parsed.displayText,
    blueprintUpdates: parsed.blueprintUpdates,
    thinkingSteps: generateThinkingSteps(phase),
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

export function generateThinkingSteps(phase: ConversationPhase): CopilotThinkingStep[] {
  switch (phase) {
    case "discovery":
      return [
        { id: "thinking-1", label: "Understanding the workflow goal" },
        { id: "thinking-2", label: "Identifying triggers and desired outcomes" },
        { id: "thinking-3", label: "Framing the first clarifying questions" },
      ];
    case "flow":
      return [
        { id: "thinking-1", label: "Mapping each step in the automation" },
        { id: "thinking-2", label: "Connecting systems and data paths" },
        { id: "thinking-3", label: "Drafting the visual blueprint" },
      ];
    case "details":
      return [
        { id: "thinking-1", label: "Reviewing edge cases and data requirements" },
        { id: "thinking-2", label: "Capturing human touchpoints or reviews" },
        { id: "thinking-3", label: "Tightening assumptions and branches" },
      ];
    case "validation":
    default:
      return [
        { id: "thinking-1", label: "Validating the full automation flow" },
        { id: "thinking-2", label: "Preparing the final summary for review" },
      ];
  }
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


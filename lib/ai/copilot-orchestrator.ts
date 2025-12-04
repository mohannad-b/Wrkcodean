import type { Blueprint, BlueprintSectionKey } from "@/lib/blueprint/types";
import type { CopilotThinkingStep } from "@/types/copilot-thinking";
import type { ConversationPhase } from "./prompts";

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

function hasSectionContent(blueprint: Blueprint | null | undefined, key: BlueprintSectionKey): boolean {
  if (!blueprint?.sections) {
    return false;
  }
  return blueprint.sections.some((section) => section.key === key && Boolean(section.content?.trim()));
}


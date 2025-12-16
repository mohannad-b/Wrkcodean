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
  const mentionsEmail = /email|gmail|mail/i.test(normalizedLatestMessage);
  const mentionsInvoice = /invoice|bill|payment/i.test(normalizedLatestMessage);
  const mentionsLead = /lead|contact|customer/i.test(normalizedLatestMessage);
  const mentionsData = /extract|data|information/i.test(normalizedLatestMessage);
  const mentionsNotify = /notif|alert|send|email|message/i.test(normalizedLatestMessage);

  // Extract workflow keywords to make thinking more contextual
  const workflowContext = mentionsInvoice ? "invoice processing" : mentionsLead ? "lead management" : "workflow";

  switch (phase) {
    case "discovery":
      const step1 = systemsText 
        ? `Analyzing your ${workflowContext} workflow. I see you're working with ${systems[0]}${systems.length > 1 ? ` and ${systems.slice(1).join(", ")}` : ""}.`
        : `Understanding your ${workflowContext} requirements and goals.`;
      
      return [
        {
          id: "thinking-1",
          label: step1,
        },
        {
          id: "thinking-2",
          label: mentionsEmail 
            ? "Identifying the email trigger and what data needs to be extracted from incoming messages."
            : "Identifying the starting trigger point and what kicks off this automation.",
        },
        {
          id: "thinking-3",
          label: mentionsInvoice
            ? "Determining the data extraction requirements - invoice amounts, dates, vendors, line items."
            : mentionsData
            ? "Mapping out what data needs to be captured, transformed, or validated at each step."
            : "Framing key questions about outcomes, exceptions, and human touchpoints needed.",
        },
      ];

    case "flow":
      const flowStep1 = mentionsInvoice && systemsText
        ? `Step 1: Processing invoices from ${systems.includes("Gmail") || mentionsEmail ? "email" : systems[0]}. Extracting invoice data using OCR and parsing vendor, amount, date, and line items.`
        : systemsText
        ? `Step 1: Setting up the trigger from ${systems[0]}. Understanding what event initiates this workflow.`
        : "Step 1: Mapping the workflow trigger - what event starts this automation?";
      
      const flowStep2 = systemsText && systems.length > 1
        ? `Step 2: Connecting data flow between ${systems[0]} and ${systems[1]}. Mapping field mappings and transformation requirements.`
        : mentionsData
        ? `Step 2: Defining data extraction and transformation steps. Ensuring data quality and validation rules.`
        : systemsText
        ? `Step 2: Configuring actions in ${systems[0]}. Determining what operations need to happen and in what sequence.`
        : "Step 2: Connecting systems and mapping data paths between each step.";
      
      const flowStep3 = mentionsNotify
        ? `Step 3: Adding notification steps. Setting up email or Slack alerts to notify stakeholders when actions complete.`
        : "Step 3: Drafting the complete workflow structure with all steps, branches, and decision points.";

      return [
        {
          id: "thinking-1",
          label: flowStep1,
        },
        {
          id: "thinking-2",
          label: flowStep2,
        },
        {
          id: "thinking-3",
          label: flowStep3,
        },
      ];

    case "details":
      const detailStep1 = mentionsApproval
        ? `Analyzing approval thresholds. You mentioned ${normalizedLatestMessage.includes("$") ? "monetary thresholds" : "approval workflows"}. Setting up conditional logic to route items based on criteria.`
        : mentionsInvoice
        ? "Reviewing invoice processing edge cases: duplicate detection, amount validation, vendor matching, and exception handling."
        : "Reviewing edge cases and exception scenarios. Identifying what could go wrong and how to handle it.";
      
      return [
        {
          id: "thinking-1",
          label: detailStep1,
        },
        {
          id: "thinking-2",
          label: "Identifying human touchpoints - approval steps, manual reviews, or places where someone needs to make a decision.",
        },
        {
          id: "thinking-3",
          label: "Tightening the workflow logic. Adding branches for different scenarios and ensuring data flows correctly through each path.",
        },
      ];

    case "validation":
    default:
      return [
        {
          id: "thinking-1",
          label: "Validating the complete automation flow. Checking that all steps connect properly, required data is available, and exceptions are handled.",
        },
        {
          id: "thinking-2",
          label: "Preparing the final workflow blueprint with all details, ready for your review and any adjustments needed.",
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


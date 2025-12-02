import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, handleApiError, requireTenantSession } from "@/lib/api/context";
import { can } from "@/lib/auth/rbac";
import { buildRateLimitKey, ensureRateLimit } from "@/lib/rate-limit";
import { getAutomationVersionDetail, updateAutomationVersionMetadata } from "@/lib/services/automations";
import { logAudit } from "@/lib/audit/log";
import { createEmptyBlueprint } from "@/lib/blueprint/factory";
import type { Blueprint, BlueprintSectionKey } from "@/lib/blueprint/types";
import { BlueprintSchema } from "@/lib/blueprint/schema";
import { getBlueprintCompletionState } from "@/lib/blueprint/completion";

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

    const contextSummary = buildRequirementsSummary(normalizedMessages, payload.intakeNotes ?? detail.version.intakeNotes);
    const draft = await generateDraftBlueprint({
      automationName: detail.automation?.name ?? "Untitled Automation",
      conversation: normalizedMessages,
      summary: contextSummary,
      intakeNotes: payload.intakeNotes ?? detail.version.intakeNotes ?? "",
      snippets: payload.snippets ?? [],
    });

    const validatedBlueprint = BlueprintSchema.parse({
      ...draft,
      status: "Draft",
      updatedAt: new Date().toISOString(),
    });

    await updateAutomationVersionMetadata({
      tenantId: session.tenantId,
      automationVersionId: params.id,
      blueprintJson: validatedBlueprint,
    });

    await logAudit({
      tenantId: session.tenantId,
      userId: session.userId,
      action: "automation.blueprint.drafted",
      resourceType: "automation_version",
      resourceId: params.id,
      metadata: {
        source: "copilot",
      },
    });

    return NextResponse.json({
      blueprint: validatedBlueprint,
      completion: getBlueprintCompletionState(validatedBlueprint),
      prompt: {
        system: SYSTEM_PROMPT,
        contextSummary,
        messageCount: normalizedMessages.length,
      },
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

function buildRequirementsSummary(messages: CopilotMessage[], intakeNotes?: string | null) {
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

type DraftContext = {
  automationName: string;
  conversation: CopilotMessage[];
  summary: string;
  intakeNotes: string;
  snippets: string[];
};

async function generateDraftBlueprint(context: DraftContext): Promise<Blueprint> {
  // TODO: Replace this deterministic stub with an OpenAI call once providers are wired up.
  const base = createEmptyBlueprint();
  const description = derivePrimaryDescription(context);
  const systems = inferSystems(description);
  const now = new Date().toISOString();

  const enrichedSections = base.sections.map((section) => ({
    ...section,
    content: buildSectionCopy(section.key, description, context.intakeNotes, systems, context.summary),
  }));

  const steps = buildDefaultSteps(description, systems);

  return {
    ...base,
    summary: `Automation draft for ${context.automationName}: ${description}`,
    sections: enrichedSections,
    steps,
    updatedAt: now,
  };
}

function derivePrimaryDescription(context: DraftContext) {
  const lastUser = [...context.conversation].reverse().find((message) => message.role === "user");
  if (lastUser) {
    return lastUser.content.slice(0, 600);
  }
  return context.summary.slice(0, 600) || "Automate the described workflow end-to-end.";
}

function inferSystems(description: string) {
  const lower = description.toLowerCase();
  const systems = new Set<string>();

  if (lower.includes("slack")) systems.add("Slack");
  if (lower.includes("gmail") || lower.includes("email")) systems.add("Gmail");
  if (lower.includes("hubspot")) systems.add("HubSpot");
  if (lower.includes("salesforce")) systems.add("Salesforce");
  if (lower.includes("xero")) systems.add("Xero");
  if (lower.includes("zendesk")) systems.add("Zendesk");

  if (systems.size === 0) {
    systems.add("Primary System");
  }

  return Array.from(systems);
}

function buildSectionCopy(
  key: BlueprintSectionKey,
  description: string,
  intakeNotes: string,
  systems: string[],
  summary: string
) {
  const intro = `${description}\n\nSystems involved: ${systems.join(", ")}.`;
  const notes = intakeNotes ? `\n\nAdditional intake context:\n${intakeNotes}` : "";

  switch (key) {
    case "business_requirements":
      return `${intro}\n\nThe business requires this automation to reduce manual effort and improve SLAs.${notes}`;
    case "business_objectives":
      return `Objectives:\n- Increase throughput of the workflow\n- Improve visibility for stakeholders\n- Maintain data consistency${notes}`;
    case "success_criteria":
      return `Success criteria:\n- SLA under 24h\n- Human review only on high-risk items\n- Accurate notifications`;
    case "systems":
      return `Primary systems and connectors: ${systems.join(", ")}. The automation should integrate via secure credentials and provide audit logging.`;
    case "data_needs":
      return `Data inputs include records captured in the workflow description. Ensure fields are validated before execution.${notes}`;
    case "exceptions":
      return `Handle exceptions when data is incomplete or downstream systems are unavailable. Escalate to humans if retry attempts fail.`;
    case "human_touchpoints":
      return `Human steps occur when approvals or reviews are required. Assign accountability to the owning team and notify via Slack.`;
    case "flow_complete":
      return `The flow completes once the downstream system is updated and confirmations are sent to stakeholders.`;
    default:
      return summary;
  }
}

function buildDefaultSteps(description: string, systems: string[]): Blueprint["steps"] {
  const triggerId = randomUUID();
  const actionOneId = randomUUID();
  const actionTwoId = randomUUID();

  return [
    {
      id: triggerId,
      type: "Trigger",
      name: "Capture new request",
      summary: "Monitor the upstream channel (form, inbox, or webhook) for new submissions.",
      goalOutcome: "Kick off the automation when a qualifying record is received.",
      responsibility: "Automated",
      systemsInvolved: [systems[0]],
      notifications: ["Slack"],
      nextStepIds: [actionOneId],
    },
    {
      id: actionOneId,
      type: "Action",
      name: "Enrich context",
      summary: "Extract the required fields, validate data, and enrich with lookup tables.",
      goalOutcome: "Prepare the record so downstream systems receive clean, structured data.",
      responsibility: "Automated",
      systemsInvolved: systems.slice(0, 2),
      notifications: ["Slack"],
      timingSla: "Real-time",
      riskLevel: "Low",
      notesForOps: description.slice(0, 240),
      nextStepIds: [actionTwoId],
    },
    {
      id: actionTwoId,
      type: "Action",
      name: "Update downstream system",
      summary: "Push formatted data into the target system and confirm success.",
      goalOutcome: "Ensure the business system reflects the latest workflow state.",
      responsibility: "Automated",
      systemsInvolved: systems,
      notifications: ["Slack"],
      timingSla: "Real-time",
      riskLevel: "Medium",
      nextStepIds: [],
    },
  ];
}


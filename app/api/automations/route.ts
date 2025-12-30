import { NextResponse } from "next/server";
import OpenAI from "openai";
import { can } from "@/lib/auth/rbac";
import { handleApiError, requireTenantSession, ApiError } from "@/lib/api/context";
import { listAutomationsForTenant, createAutomationWithInitialVersion } from "@/lib/services/automations";
import { fromDbAutomationStatus } from "@/lib/automations/status";
import { fromDbQuoteStatus } from "@/lib/quotes/status";
import { logAudit } from "@/lib/audit/log";
import { createCopilotMessage } from "@/lib/services/copilot-messages";
import { sendDevAgentLog } from "@/lib/dev/agent-log";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? "",
});

type CreateAutomationPayload = {
  name?: unknown;
  description?: unknown;
  intakeNotes?: unknown;
  automationType?: unknown;
  processDescription?: unknown;
  industry?: unknown;
};

async function generateAutomationNameAndDescription(
  automationType: string,
  processDescription: string,
  industry: string
): Promise<{ name: string; description: string }> {
  if (!process.env.OPENAI_API_KEY) {
    // Fallback if OpenAI is not configured
    const fallbackName = processDescription.slice(0, 50).trim() || "New Automation";
    return {
      name: fallbackName,
      description: `Automation for ${industry}: ${processDescription.slice(0, 200)}`,
    };
  }

  const typeContext = {
    starter: "The user wants AI to recommend their whole process from scratch. They may not know all the steps.",
    intermediate: "The user has a general idea of their process and wants AI to map it out in more detail.",
    advanced: "The user knows their steps inside out and wants AI to optimize their existing workflow.",
  }[automationType] || "The user wants to automate a process.";

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a helpful assistant that generates concise, professional automation names and descriptions for business workflows.

Generate:
1. A short, clear automation name (2-5 words max, no "Automation" suffix)
2. A brief description (1-2 sentences) explaining what the automation does

Be specific and use business-friendly language.`,
        },
        {
          role: "user",
          content: `Context: ${typeContext}

Industry: ${industry}

Process Description:
${processDescription}

Generate a name and description for this automation. Return ONLY valid JSON in this format:
{
  "name": "Short automation name",
  "description": "Brief description of what this automation does"
}`,
        },
      ],
      temperature: 0.7,
      max_tokens: 200,
    });

    const content = completion.choices[0]?.message?.content?.trim();
    if (!content) {
      throw new Error("OpenAI returned empty response");
    }

    // Try to parse JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        name: parsed.name || processDescription.slice(0, 50).trim() || "New Automation",
        description: parsed.description || `Automation for ${industry}`,
      };
    }

    // Fallback if JSON parsing fails
    const fallbackName = processDescription.slice(0, 50).trim() || "New Automation";
    return {
      name: fallbackName,
      description: content.slice(0, 300) || `Automation for ${industry}`,
    };
  } catch (error) {
    // Fallback on error
    const fallbackName = processDescription.slice(0, 50).trim() || "New Automation";
    return {
      name: fallbackName,
      description: `Automation for ${industry}: ${processDescription.slice(0, 200)}`,
    };
  }
}

async function parsePayload(request: Request): Promise<CreateAutomationPayload> {
  try {
    return (await request.json()) as CreateAutomationPayload;
  } catch {
    return {};
  }
}

export async function GET() {
  const requestStart = Date.now();
    sendDevAgentLog(
      {
        location: "app/api/automations/route.ts:117",
        message: "GET /api/automations entry",
        data: {},
        sessionId: "debug-session",
        runId: "run1",
        hypothesisId: "C",
      },
      { dedupeKey: "api-automations-entry", throttleMs: 2000, sampleRate: 0.2 }
    );
  try {
    const session = await requireTenantSession();

    if (!can(session, "automation:read", { type: "automation", tenantId: session.tenantId })) {
      throw new ApiError(403, "Forbidden");
    }

    const rows = await listAutomationsForTenant(session.tenantId);
    sendDevAgentLog(
      {
        location: "app/api/automations/route.ts:125",
        message: "listAutomationsForTenant completed in route",
        data: { rowsCount: rows.length, totalTimeMs: Date.now() - requestStart },
        sessionId: "debug-session",
        runId: "run1",
        hypothesisId: "C",
      },
      { dedupeKey: "api-automations-complete", throttleMs: 2000, sampleRate: 0.2 }
    );

    return NextResponse.json({
      automations: rows.map((automation) => ({
        id: automation.id,
        name: automation.name,
        description: automation.description,
        createdAt: automation.createdAt,
        updatedAt: automation.updatedAt,
        creator: automation.creator
          ? {
              id: automation.creator.id,
              name: automation.creator.name,
              email: automation.creator.email,
              avatarUrl: automation.creator.avatarUrl,
            }
          : null,
        latestVersion: automation.latestVersion
          ? {
              id: automation.latestVersion.id,
              versionLabel: automation.latestVersion.versionLabel,
              status: fromDbAutomationStatus(automation.latestVersion.status),
              intakeNotes: automation.latestVersion.intakeNotes,
              // Ensure the field is always present in the response
              requirementsText: automation.latestVersion.requirementsText ?? null,
              summary: automation.latestVersion.summary,
              updatedAt: automation.latestVersion.updatedAt,
              latestQuote: automation.latestVersion.latestQuote
                ? {
                    id: automation.latestVersion.latestQuote.id,
                    status: fromDbQuoteStatus(automation.latestVersion.latestQuote.status),
                    setupFee: automation.latestVersion.latestQuote.setupFee,
                    unitPrice: automation.latestVersion.latestQuote.unitPrice,
                    updatedAt: automation.latestVersion.latestQuote.updatedAt,
                  }
                : null,
              latestMetrics: automation.latestVersion.latestMetrics
                ? presentMetric(automation.latestVersion.latestMetrics)
                : null,
            }
          : null,
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireTenantSession();

    if (!can(session, "automation:create", { type: "automation", tenantId: session.tenantId })) {
      throw new ApiError(403, "Forbidden");
    }

    const payload = await parsePayload(request);
    
    // Check if this is the new flow (with automationType, processDescription, industry)
    const automationType = typeof payload.automationType === "string" ? payload.automationType : null;
    const processDescription = typeof payload.processDescription === "string" ? payload.processDescription.trim() : null;
    const industry = typeof payload.industry === "string" ? payload.industry.trim() : null;

    let name: string;
    let description: string | null;
    let intakeNotes: string | null;

    if (automationType && processDescription && industry) {
      // New flow: Generate name and description via OpenAI
      const generated = await generateAutomationNameAndDescription(automationType, processDescription, industry);
      name = generated.name;
      description = generated.description;
      
      // Store the full context in intake notes
      const typeLabel = {
        starter: "Starter",
        intermediate: "Intermediate",
        advanced: "Advanced",
      }[automationType] || automationType;
      
      intakeNotes = `Automation Type: ${typeLabel}\nIndustry: ${industry}\n\nProcess Description:\n${processDescription}`;
    } else {
      // Legacy flow: Use provided name/description
      name = typeof payload.name === "string" ? payload.name.trim() : "";
      description =
        typeof payload.description === "string" && payload.description.trim().length > 0
          ? payload.description.trim()
          : null;
      intakeNotes =
        typeof payload.intakeNotes === "string" && payload.intakeNotes.trim().length > 0
          ? payload.intakeNotes.trim()
          : null;

      if (!name) {
        throw new ApiError(400, "name is required");
      }
    }

    const { automation, version } = await createAutomationWithInitialVersion({
      tenantId: session.tenantId,
      userId: session.userId,
      name,
      description,
      intakeNotes,
      requirementsText: automationType && processDescription ? processDescription : undefined,
    });

    // If this is the new flow, create an initial copilot message with the context
    if (automationType && processDescription && industry) {
      const typeContext = {
        starter: "I want you to recommend my whole process from scratch. I may not know all the steps, so please suggest a complete workflow based on what I'm trying to accomplish.",
        intermediate: "I have a general idea of my process and want you to map it out in more detail. Help me identify all the steps, systems, and decision points.",
        advanced: "I know my steps inside out and want you to optimize my existing workflow. Review what I've described and suggest improvements, optimizations, and best practices.",
      }[automationType] || "";

      const initialMessage = `I'm working in the ${industry} industry. ${typeContext}\n\nHere's what I want to automate:\n\n${processDescription}\n\nPlease help me build this automation.`;

      await createCopilotMessage({
        tenantId: session.tenantId,
        automationVersionId: version.id,
        role: "user",
        content: initialMessage,
        createdBy: session.userId,
      });
    }

    await logAudit({
      tenantId: session.tenantId,
      userId: session.userId,
      action: "automation.create",
      resourceType: "automation",
      resourceId: automation.id,
      metadata: { versionId: version.id },
    });

    return NextResponse.json(
      {
        automation: {
          id: automation.id,
          name: automation.name,
          description: automation.description,
          createdAt: automation.createdAt,
          version: {
            id: version.id,
            versionLabel: version.versionLabel,
            status: fromDbAutomationStatus(version.status),
            intakeNotes: version.intakeNotes,
          },
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

function presentMetric(metric: { [key: string]: any }) {
  return {
    asOfDate: metric.asOfDate,
    totalExecutions: Number(metric.totalExecutions ?? 0),
    successRate: Number(metric.successRate ?? 0),
    successCount: Number(metric.successCount ?? 0),
    failureCount: Number(metric.failureCount ?? 0),
    spendUsd: Number(metric.spendUsd ?? 0),
    hoursSaved: Number(metric.hoursSaved ?? 0),
    estimatedCostSavings: Number(metric.estimatedCostSavings ?? 0),
    hoursSavedDeltaPct: metric.hoursSavedDeltaPct !== null ? Number(metric.hoursSavedDeltaPct) : null,
    estimatedCostSavingsDeltaPct:
      metric.estimatedCostSavingsDeltaPct !== null ? Number(metric.estimatedCostSavingsDeltaPct) : null,
    executionsDeltaPct: metric.executionsDeltaPct !== null ? Number(metric.executionsDeltaPct) : null,
    successRateDeltaPct: metric.successRateDeltaPct !== null ? Number(metric.successRateDeltaPct) : null,
    spendDeltaPct: metric.spendDeltaPct !== null ? Number(metric.spendDeltaPct) : null,
    source: metric.source ?? "unknown",
  };
}



import { NextResponse } from "next/server";
import { can } from "@/lib/auth/rbac";
import { ApiError, handleApiError, requireTenantSession } from "@/lib/api/context";
import { getAutomationVersionDetail, updateAutomationVersionMetadata } from "@/lib/services/automations";
import { logAudit } from "@/lib/audit/log";
import { fromDbAutomationStatus } from "@/lib/automations/status";
import { fromDbQuoteStatus } from "@/lib/quotes/status";
import { BlueprintSchema, parseBlueprint } from "@/lib/blueprint/schema";
import type { Blueprint } from "@/lib/blueprint/types";
import { diffBlueprint } from "@/lib/blueprint/diff";
import type { Task } from "@/db/schema";

type RouteParams = {
  params: {
    id: string;
  };
};

type UpdatePayload = {
  intakeNotes?: unknown;
  requirementsText?: unknown;
  workflowJson?: unknown;
};

function validateIntakeNotes(value: unknown) {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new ApiError(400, "intakeNotes must be a string.");
  }
  if (value.length > 20000) {
    throw new ApiError(400, "intakeNotes must be 20k characters or fewer.");
  }
  return value;
}

function validateRequirementsText(value: unknown) {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new ApiError(400, "requirementsText must be a string.");
  }
  if (value.length > 50000) {
    throw new ApiError(400, "requirementsText must be 50k characters or fewer.");
  }
  return value;
}

function validateBlueprint(value: unknown): Blueprint | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  const result = BlueprintSchema.safeParse(value);
  if (!result.success) {
    const message = result.error.issues[0]?.message ?? "Invalid blueprint_json payload.";
    throw new ApiError(400, message);
  }
  return result.data;
}

async function parsePayload(request: Request): Promise<UpdatePayload> {
  try {
    return (await request.json()) as UpdatePayload;
  } catch {
    return {};
  }
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const session = await requireTenantSession();

    if (!can(session, "automation:read", { type: "automation", tenantId: session.tenantId })) {
      throw new ApiError(403, "Forbidden");
    }

    const detail = await getAutomationVersionDetail(session.tenantId, params.id);

    if (!detail) {
      throw new ApiError(404, "Automation version not found");
    }

    return NextResponse.json({
      version: {
        id: detail.version.id,
        versionLabel: detail.version.versionLabel,
        status: fromDbAutomationStatus(detail.version.status),
        intakeNotes: detail.version.intakeNotes,
        requirementsText: detail.version.requirementsText,
        blueprintJson: parseBlueprint(detail.version.workflowJson),
        summary: detail.version.summary,
        createdAt: detail.version.createdAt,
        updatedAt: detail.version.updatedAt,
        tasks: (detail.tasks ?? []).map(presentTask),
      },
      automation: detail.automation
        ? {
            id: detail.automation.id,
            name: detail.automation.name,
            description: detail.automation.description,
          }
        : null,
      project: detail.project
        ? {
            id: detail.project.id,
            status: fromDbAutomationStatus(detail.project.status),
          }
        : null,
      latestQuote: detail.latestQuote
        ? {
            id: detail.latestQuote.id,
            status: fromDbQuoteStatus(detail.latestQuote.status),
            setupFee: detail.latestQuote.setupFee,
            unitPrice: detail.latestQuote.unitPrice,
            estimatedVolume: detail.latestQuote.estimatedVolume,
            clientMessage: detail.latestQuote.clientMessage,
            updatedAt: detail.latestQuote.updatedAt,
          }
        : null,
      latestMetrics: detail.latestMetrics ? presentMetric(detail.latestMetrics) : null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const session = await requireTenantSession();

    if (!can(session, "automation:metadata:update", { type: "automation_version", tenantId: session.tenantId })) {
      throw new ApiError(403, "Forbidden");
    }

    const payload = await parsePayload(request);
    const intakeNotes = validateIntakeNotes(payload.intakeNotes);
    const requirementsText = validateRequirementsText(payload.requirementsText);
    // Accept both `workflowJson` (current) and `blueprintJson` (legacy/tests)
    const blueprintInput = (payload as any).workflowJson ?? (payload as any).blueprintJson;
    const blueprintJson =
      blueprintInput === undefined ? undefined : validateBlueprint(blueprintInput) ?? (blueprintInput as any);

    if (intakeNotes === undefined && requirementsText === undefined && blueprintJson === undefined) {
      throw new ApiError(400, "No valid fields provided.");
    }

    const existingDetail = await getAutomationVersionDetail(session.tenantId, params.id);
    if (!existingDetail) {
      throw new ApiError(404, "Automation version not found");
    }
    const previousBlueprint = parseBlueprint(existingDetail.version.workflowJson ?? existingDetail.version.blueprintJson);

    const updated = await updateAutomationVersionMetadata({
      tenantId: session.tenantId,
      automationVersionId: params.id,
      intakeNotes,
      requirementsText,
      workflowJson: blueprintJson,
      blueprintJson,
    });

    const metadata: Record<string, unknown> = {
      updatedFields: {
        intakeNotes: intakeNotes !== undefined,
        requirementsText: requirementsText !== undefined,
        workflowJson: blueprintJson !== undefined,
      },
    };

    if (blueprintJson !== undefined) {
      const nextBlueprint = parseBlueprint(updated.blueprintJson);
      const blueprintDiff = diffBlueprint(previousBlueprint, nextBlueprint);
      metadata.blueprintSummary = blueprintDiff.summary;
      metadata.blueprintDiff = blueprintDiff;
    }

    await logAudit({
      tenantId: session.tenantId,
      userId: session.userId,
      action: "automation.version.update",
      resourceType: "automation_version",
      resourceId: params.id,
      metadata,
    });

    return NextResponse.json({
      version: {
        id: updated.id,
        intakeNotes: updated.intakeNotes,
        requirementsText: updated.requirementsText,
        blueprintJson: updated.workflowJson,
        updatedAt: updated.updatedAt,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

function presentTask(task: Task) {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    metadata: task.metadata,
    updatedAt: task.updatedAt,
  };
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


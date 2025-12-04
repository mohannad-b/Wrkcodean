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
  blueprintJson?: unknown;
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
        blueprintJson: parseBlueprint(detail.version.blueprintJson),
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
    const blueprintJson = validateBlueprint(payload.blueprintJson);

    if (intakeNotes === undefined && blueprintJson === undefined) {
      throw new ApiError(400, "No valid fields provided.");
    }

    const existingDetail = await getAutomationVersionDetail(session.tenantId, params.id);
    if (!existingDetail) {
      throw new ApiError(404, "Automation version not found");
    }
    const previousBlueprint = parseBlueprint(existingDetail.version.blueprintJson);

    const updated = await updateAutomationVersionMetadata({
      tenantId: session.tenantId,
      automationVersionId: params.id,
      intakeNotes,
      blueprintJson,
    });

    const metadata: Record<string, unknown> = {
      updatedFields: {
        intakeNotes: intakeNotes !== undefined,
        blueprintJson: blueprintJson !== undefined,
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
        blueprintJson: updated.blueprintJson,
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


import { NextResponse } from "next/server";
import { can } from "@/lib/auth/rbac";
import { ApiError, handleApiError, requireTenantSession } from "@/lib/api/context";
import {
  BlueprintJson,
  getAutomationVersionDetail,
  updateAutomationVersionMetadata,
} from "@/lib/services/automations";
import { logAudit } from "@/lib/audit/log";
import { fromDbAutomationStatus } from "@/lib/automations/status";
import { fromDbQuoteStatus } from "@/lib/quotes/status";

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

const ALLOWED_NODE_TYPES = new Set(["trigger", "action", "condition", "delay", "end"]);

function validateBlueprint(value: unknown): BlueprintJson | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value !== "object" || value === null) {
    throw new ApiError(400, "blueprint_json must be an object.");
  }

  const nodes = Array.isArray((value as { nodes?: unknown }).nodes) ? (value as { nodes: unknown[] }).nodes : null;
  const edges = Array.isArray((value as { edges?: unknown }).edges) ? (value as { edges: unknown[] }).edges : null;

  if (!nodes || !edges) {
    throw new ApiError(400, "blueprint_json must include nodes[] and edges[].");
  }

  nodes.forEach((node, index) => {
    if (typeof node !== "object" || node === null) {
      throw new ApiError(400, `Node at index ${index} must be an object.`);
    }
    const { id, type, position } = node as { id?: unknown; type?: unknown; position?: { x?: unknown; y?: unknown } };
    if (typeof id !== "string" || id.length === 0) {
      throw new ApiError(400, `Node at index ${index} is missing a valid id.`);
    }
    if (type && (typeof type !== "string" || !ALLOWED_NODE_TYPES.has(type))) {
      throw new ApiError(400, `Node type "${String(type)}" is not supported.`);
    }
    if (!position || typeof position !== "object" || typeof position.x !== "number" || typeof position.y !== "number") {
      throw new ApiError(400, `Node at index ${index} must include numeric position.x and position.y.`);
    }
  });

  edges.forEach((edge, index) => {
    if (typeof edge !== "object" || edge === null) {
      throw new ApiError(400, `Edge at index ${index} must be an object.`);
    }
    const { id, source, target } = edge as { id?: unknown; source?: unknown; target?: unknown };
    if (typeof id !== "string" || id.length === 0) {
      throw new ApiError(400, `Edge at index ${index} is missing a valid id.`);
    }
    if (typeof source !== "string" || typeof target !== "string") {
      throw new ApiError(400, `Edge at index ${index} must include source and target node ids.`);
    }
  });

  return {
    nodes: nodes as Record<string, unknown>[],
    edges: edges as Record<string, unknown>[],
  };
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
        blueprintJson: detail.version.blueprintJson,
        summary: detail.version.summary,
        createdAt: detail.version.createdAt,
        updatedAt: detail.version.updatedAt,
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

    const updated = await updateAutomationVersionMetadata({
      tenantId: session.tenantId,
      automationVersionId: params.id,
      intakeNotes,
      blueprintJson,
    });

    await logAudit({
      tenantId: session.tenantId,
      userId: session.userId,
      action: "automation.version.update",
      resourceType: "automation_version",
      resourceId: params.id,
      metadata: {
        updatedFields: {
          intakeNotes: intakeNotes !== undefined,
          blueprintJson: blueprintJson !== undefined,
        },
      },
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


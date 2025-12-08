import { NextResponse } from "next/server";
import { can } from "@/lib/auth/rbac";
import { ApiError, handleApiError, requireTenantSession } from "@/lib/api/context";
import { getAutomationDetail } from "@/lib/services/automations";
import { fromDbAutomationStatus } from "@/lib/automations/status";
import { fromDbQuoteStatus } from "@/lib/quotes/status";
import { parseBlueprint } from "@/lib/blueprint/schema";
import type { Task } from "@/db/schema";

type RouteParams = {
  params: {
    id: string;
  };
};

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const session = await requireTenantSession();

    if (!can(session, "automation:read", { type: "automation", tenantId: session.tenantId })) {
      throw new ApiError(403, "Forbidden");
    }

    const detail = await getAutomationDetail(session.tenantId, params.id);

    if (!detail) {
      throw new ApiError(404, "Automation not found");
    }

    return NextResponse.json({
      automation: {
        id: detail.automation.id,
        name: detail.automation.name,
        description: detail.automation.description,
        createdAt: detail.automation.createdAt,
        versions: detail.versions.map((version) => ({
          id: version.id,
          versionLabel: version.versionLabel,
          status: fromDbAutomationStatus(version.status),
          intakeNotes: version.intakeNotes,
          // Ensure the field is always present in the response
          requirementsText: version.requirementsText ?? null,
          workflowJson: parseBlueprint(version.workflowJson),
          summary: version.summary,
          createdAt: version.createdAt,
          updatedAt: version.updatedAt,
          latestQuote: version.latestQuote
            ? {
                id: version.latestQuote.id,
                status: fromDbQuoteStatus(version.latestQuote.status),
                setupFee: version.latestQuote.setupFee,
                unitPrice: version.latestQuote.unitPrice,
                estimatedVolume: version.latestQuote.estimatedVolume,
                updatedAt: version.latestQuote.updatedAt,
              }
            : null,
          tasks: (version.tasks ?? []).map(presentTask),
        })),
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



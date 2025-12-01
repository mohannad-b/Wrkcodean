import { NextResponse } from "next/server";
import { can } from "@/lib/auth/rbac";
import { ApiError, handleApiError, requireTenantSession } from "@/lib/api/context";
import { getAutomationDetail } from "@/lib/services/automations";
import { fromDbAutomationStatus } from "@/lib/automations/status";
import { fromDbQuoteStatus } from "@/lib/quotes/status";

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
          blueprintJson: version.blueprintJson,
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
              }
            : null,
        })),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}



import { NextResponse } from "next/server";
import { can } from "@/lib/auth/rbac";
import { ApiError, handleApiError, requireTenantSession } from "@/lib/api/context";
import { getProjectDetail } from "@/lib/services/projects";
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

    if (!can(session, "admin:project:read")) {
      throw new ApiError(403, "Forbidden");
    }

    const detail = await getProjectDetail(session.tenantId, params.id);

    if (!detail) {
      throw new ApiError(404, "Project not found");
    }

    return NextResponse.json({
      project: {
        id: detail.project.id,
        name: detail.project.name,
        status: fromDbAutomationStatus(detail.project.status),
        automation: detail.automation
          ? {
              id: detail.automation.id,
              name: detail.automation.name,
              description: detail.automation.description,
            }
          : null,
        version: detail.version
          ? {
              id: detail.version.id,
              versionLabel: detail.version.versionLabel,
              status: fromDbAutomationStatus(detail.version.status),
              intakeNotes: detail.version.intakeNotes,
            }
          : null,
        quotes: detail.quotes.map((quote) => ({
          id: quote.id,
          status: fromDbQuoteStatus(quote.status),
          setupFee: quote.setupFee,
          unitPrice: quote.unitPrice,
          estimatedVolume: quote.estimatedVolume,
          clientMessage: quote.clientMessage,
        })),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}



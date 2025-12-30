import { NextResponse } from "next/server";
import { can } from "@/lib/auth/rbac";
import { ApiError, handleApiError, requireTenantSession } from "@/lib/api/context";
import { getCopilotAnalysis } from "@/lib/services/copilot-analysis";
import { createEmptyCopilotAnalysisState } from "@/lib/workflows/copilot-analysis";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireTenantSession();

    if (!can(session, "automation:read", { type: "automation_version", tenantId: session.tenantId })) {
      throw new ApiError(403, "Forbidden");
    }

    let analysis = null;
    try {
      analysis = await getCopilotAnalysis({
        tenantId: session.tenantId,
        automationVersionId: params.id,
      });
    } catch (error) {
      if (error instanceof Error && error.message === "Automation version not found") {
        throw new ApiError(404, error.message);
      }
      throw error;
    }

    return NextResponse.json({
      analysis: analysis ?? createEmptyCopilotAnalysisState(),
    });
  } catch (error) {
    return handleApiError(error);
  }
}



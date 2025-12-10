import { NextResponse } from "next/server";
import { can } from "@/lib/auth/rbac";
import { ApiError, handleApiError, requireTenantSession } from "@/lib/api/context";
import { createAutomationVersion } from "@/lib/services/automations";
import { fromDbAutomationStatus } from "@/lib/automations/status";
import { logAudit } from "@/lib/audit/log";

type RouteParams = {
  params: {
    id: string;
  };
};

type CreateVersionPayload = {
  versionLabel?: unknown;
  summary?: unknown;
  intakeNotes?: unknown;
  copyFromVersionId?: unknown;
};

async function parsePayload(request: Request): Promise<CreateVersionPayload> {
  try {
    return (await request.json()) as CreateVersionPayload;
  } catch {
    return {};
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await requireTenantSession();

    if (!can(session, "automation:version:create", { type: "automation", tenantId: session.tenantId })) {
      throw new ApiError(403, "Forbidden");
    }

    const payload = await parsePayload(request);
    const copyFromVersionId =
      typeof payload.copyFromVersionId === "string" && payload.copyFromVersionId.trim().length > 0
        ? payload.copyFromVersionId.trim()
        : null;
    const version = await createAutomationVersion({
      tenantId: session.tenantId,
      automationId: params.id,
      versionLabel: typeof payload.versionLabel === "string" ? payload.versionLabel : undefined,
      summary: typeof payload.summary === "string" ? payload.summary : undefined,
      intakeNotes: typeof payload.intakeNotes === "string" ? payload.intakeNotes : undefined,
      copyFromVersionId,
    });

    await logAudit({
      tenantId: session.tenantId,
      userId: session.userId,
      action: "automation.version.created",
      resourceType: "automation_version",
      resourceId: version.id,
      metadata: {
        automationId: params.id,
        versionLabel: version.versionLabel,
        summary: [`Created version ${version.versionLabel}`],
        copyFromVersionId,
      },
    });

    return NextResponse.json({
      version: {
        id: version.id,
        versionLabel: version.versionLabel,
        status: fromDbAutomationStatus(version.status),
        summary: version.summary,
        intakeNotes: version.intakeNotes,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}



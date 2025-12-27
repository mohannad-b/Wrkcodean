import { NextResponse } from "next/server";
import { can } from "@/lib/auth/rbac";
import { ApiError, handleApiError, requireTenantSession } from "@/lib/api/context";
import { parseAutomationStatus, fromDbAutomationStatus } from "@/lib/automations/status";
import { getAutomationVersionDetail, updateAutomationVersionStatus } from "@/lib/services/automations";
import { logAudit } from "@/lib/audit/log";
import { deriveLifecycleActorRole } from "@/lib/submissions/actor-role";

type Params = {
  id: string;
};

type StatusPayload = {
  status?: unknown;
};

async function parsePayload(request: Request): Promise<StatusPayload> {
  try {
    return (await request.json()) as StatusPayload;
  } catch {
    return {};
  }
}

export async function PATCH(request: Request, { params }: { params: Params }) {
  try {
    const session = await requireTenantSession();

    if (!can(session, "admin:project:write", { type: "automation_version", tenantId: session.tenantId })) {
      throw new ApiError(403, "Forbidden");
    }

    const payload = await parsePayload(request);
    const nextStatus = parseAutomationStatus(payload.status);

    if (nextStatus !== "Live") {
      throw new ApiError(400, "Only LIVE transitions are supported via this endpoint.");
    }

    const detail = await getAutomationVersionDetail(session.tenantId, params.id);

    if (!detail) {
      throw new ApiError(404, "Automation version not found");
    }

    const previousStatus = fromDbAutomationStatus(detail.version.status);

    const actorRole = deriveLifecycleActorRole(session);

    const { version: updated, previousStatus: persistedStatus } = await updateAutomationVersionStatus({
      tenantId: session.tenantId,
      automationVersionId: params.id,
      nextStatus,
      actorRole: actorRole as any,
    }).catch((error: unknown) => {
      if (error instanceof Error) {
        if (error.message.includes("not found")) {
          throw new ApiError(404, error.message);
        }
        if (error.message.includes("Invalid status transition")) {
          throw new ApiError(400, error.message);
        }
      }
      throw error;
    });

    await logAudit({
      tenantId: session.tenantId,
      userId: session.userId,
      action: "automation.version.status.changed",
      resourceType: "automation_version",
      resourceId: params.id,
      metadata: {
        from: persistedStatus ?? previousStatus,
        to: nextStatus,
        submissionId: detail.project?.id ?? null,
        // Legacy alias during migration
        projectId: detail.project?.id ?? null,
      },
    });

    return NextResponse.json({
      automationVersion: {
        id: updated.id,
        status: fromDbAutomationStatus(updated.status),
        updatedAt: updated.updatedAt,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}



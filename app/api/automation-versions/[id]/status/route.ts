import { NextResponse } from "next/server";
import { can } from "@/lib/auth/rbac";
import { ApiError, handleApiError, requireTenantSession } from "@/lib/api/context";
import { parseAutomationStatus, fromDbAutomationStatus } from "@/lib/automations/status";
import { updateAutomationVersionStatus } from "@/lib/services/automations";
import { logAudit } from "@/lib/audit/log";

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

    if (!can(session, "automation:version:transition", { type: "automation_version", tenantId: session.tenantId })) {
      throw new ApiError(403, "Forbidden");
    }

    const payload = await parsePayload(request);
    const nextStatus = parseAutomationStatus(payload.status);

    if (!nextStatus) {
      throw new ApiError(400, "Invalid status");
    }

    const { version: updated, previousStatus } = await updateAutomationVersionStatus({
      tenantId: session.tenantId,
      automationVersionId: params.id,
      nextStatus,
    }).catch((error: unknown) => {
      if (error instanceof Error) {
        if (error.message.includes("not found")) {
          throw new ApiError(404, error.message);
        }
        if (error.message.includes("Invalid status transition") || error.message.includes("Invalid status")) {
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
      metadata: { from: previousStatus, to: nextStatus },
    });

    return NextResponse.json({
      automationVersion: {
        id: updated.id,
        automationId: updated.automationId,
        status: fromDbAutomationStatus(updated.status),
        updatedAt: updated.updatedAt,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}



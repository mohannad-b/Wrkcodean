import { NextResponse } from "next/server";
import { z } from "zod";
import { can } from "@/lib/auth/rbac";
import { ApiError, handleApiError, requireTenantSession } from "@/lib/api/context";
import { parseAutomationStatus, fromDbAutomationStatus } from "@/lib/automations/status";
import { updateAutomationVersionStatus } from "@/lib/services/automations";
import { logAudit } from "@/lib/audit/log";
import { deriveLifecycleActorRole } from "@/lib/submissions/actor-role";

type Params = {
  id: string;
};

type StatusPayload = {
  status?: unknown;
};

const PayloadSchema = z.object({
  status: z.string(),
});

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

    const rawPayload = await parsePayload(request);
    const parsedPayload = PayloadSchema.safeParse(rawPayload);
    if (!parsedPayload.success) {
      throw new ApiError(400, "invalid_payload");
    }

    const nextStatus = parseAutomationStatus(parsedPayload.data.status);

    if (!nextStatus) {
      throw new ApiError(400, "Invalid status");
    }

    const isProductionPromotion = nextStatus === "Live";
    const isArchive = nextStatus === "Archived";

    if (
      isProductionPromotion &&
      !can(session, "automation:deploy", { type: "automation_version", tenantId: session.tenantId })
    ) {
      throw new ApiError(403, "Only Admins or Owners can deploy to production");
    }

    if (
      isArchive &&
      !can(session, "automation:delete", { type: "automation_version", tenantId: session.tenantId })
    ) {
      throw new ApiError(403, "Only Admins or Owners can archive workflows");
    }

    const actorRole = deriveLifecycleActorRole(session);

    const { version: updated, previousStatus } = await updateAutomationVersionStatus({
      tenantId: session.tenantId,
      automationVersionId: params.id,
      nextStatus,
      actorRole: actorRole as any,
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
      metadata: {
        from: previousStatus,
        to: nextStatus,
        versionLabel: updated.versionLabel,
      },
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



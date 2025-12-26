import { NextResponse } from "next/server";

import { ApiError, handleApiError, requireTenantSession } from "@/lib/api/context";
import { can } from "@/lib/auth/rbac";
import { transferOwnership } from "@/lib/services/workspace-members";
import { logAudit } from "@/lib/audit/log";

type TransferPayload = { membershipId?: unknown };

export async function POST(request: Request) {
  try {
    const session = await requireTenantSession();

    if (!can(session, "workspace:ownership:transfer", { type: "workspace", tenantId: session.tenantId })) {
      throw new ApiError(403, "Only the Owner can transfer ownership.");
    }

    const body = (await request.json().catch(() => ({}))) as TransferPayload;
    const membershipId = typeof body.membershipId === "string" ? body.membershipId : null;

    if (!membershipId) {
      throw new ApiError(400, "membershipId is required");
    }

    const result = await transferOwnership({
      tenantId: session.tenantId,
      targetMembershipId: membershipId,
      actorUserId: session.userId,
    });

    await logAudit({
      tenantId: session.tenantId,
      userId: session.userId,
      action: "workspace.ownership.transferred",
      resourceType: "workspace",
      resourceId: session.tenantId,
      metadata: { targetMembershipId: membershipId },
    });

    return NextResponse.json({ transfer: result });
  } catch (error) {
    return handleApiError(error);
  }
}



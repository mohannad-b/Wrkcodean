import { NextResponse } from "next/server";

import { ApiError, handleApiError, requireTenantSession } from "@/lib/api/context";
import { can } from "@/lib/auth/rbac";
import { resendWorkspaceInvite } from "@/lib/services/workspace-members";

type Params = {
  id: string;
};

export async function POST(_request: Request, { params }: { params: Params }) {
  try {
    const session = await requireTenantSession();

    if (!can(session, "workspace:members:invite", { type: "workspace", tenantId: session.tenantId })) {
      throw new ApiError(403, "Forbidden");
    }

    const invite = await resendWorkspaceInvite({
      tenantId: session.tenantId,
      inviteId: params.id,
      actorUserId: session.userId,
    });

    return NextResponse.json({ invite });
  } catch (error) {
    return handleApiError(error);
  }
}



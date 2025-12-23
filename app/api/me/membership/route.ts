import { NextResponse } from "next/server";

import { ApiError, handleApiError, requireTenantSession } from "@/lib/api/context";
import { can } from "@/lib/auth/rbac";
import { resolvePrimaryRole } from "@/lib/services/workspace-members";

export async function GET() {
  try {
    const session = await requireTenantSession();
    const primaryRole = resolvePrimaryRole(session.roles);

    return NextResponse.json({
      tenantId: session.tenantId,
      roles: session.roles,
      primaryRole,
      canManageTeam: can(session, "workspace:members:invite", { type: "workspace", tenantId: session.tenantId }),
      canViewBilling: can(session, "billing:view", { type: "workspace", tenantId: session.tenantId }),
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return handleApiError(error);
  }
}



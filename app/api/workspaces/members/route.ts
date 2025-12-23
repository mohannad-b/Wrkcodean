import { NextResponse } from "next/server";

import { ApiError, handleApiError, requireTenantSession } from "@/lib/api/context";
import { can } from "@/lib/auth/rbac";
import {
  listWorkspaceInvites,
  listWorkspaceMembers,
  resolvePrimaryRole,
} from "@/lib/services/workspace-members";

export async function GET() {
  try {
    const session = await requireTenantSession();

    if (!can(session, "workspace:members:view", { type: "workspace", tenantId: session.tenantId })) {
      throw new ApiError(403, "Forbidden");
    }

    const [members, invites] = await Promise.all([
      listWorkspaceMembers(session.tenantId),
      listWorkspaceInvites(session.tenantId),
    ]);

    const currentRole = resolvePrimaryRole(session.roles);
    const canManage = can(session, "workspace:members:invite", { type: "workspace", tenantId: session.tenantId });

    return NextResponse.json({
      currentRole,
      canManage,
      availableRoles: ["owner", "admin", "editor", "viewer", "billing"],
      members,
      invites: canManage ? invites : [],
    });
  } catch (error) {
    return handleApiError(error);
  }
}



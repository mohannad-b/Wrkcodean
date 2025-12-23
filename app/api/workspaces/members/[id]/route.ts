import { NextResponse } from "next/server";

import { ApiError, handleApiError, requireTenantSession } from "@/lib/api/context";
import { can } from "@/lib/auth/rbac";
import { removeMember, updateMemberRole } from "@/lib/services/workspace-members";

type Params = {
  id: string;
};

function parseRole(input: unknown) {
  if (typeof input !== "string") return null;
  const normalized = input.toLowerCase();
  const allowed = ["owner", "admin", "editor", "viewer", "billing"];
  return allowed.includes(normalized) ? normalized : null;
}

export async function PATCH(request: Request, { params }: { params: Params }) {
  try {
    const session = await requireTenantSession();

    if (!can(session, "workspace:members:update_role", { type: "workspace", tenantId: session.tenantId })) {
      throw new ApiError(403, "Forbidden");
    }

    const body = (await request.json().catch(() => ({}))) as { role?: unknown };
    const nextRole = parseRole(body.role);
    if (!nextRole) {
      throw new ApiError(400, "Invalid role");
    }

    const updated = await updateMemberRole({
      tenantId: session.tenantId,
      membershipId: params.id,
      actorRoles: session.roles,
      actorUserId: session.userId,
      nextRole,
    });

    return NextResponse.json({ membership: updated });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Params }) {
  try {
    const session = await requireTenantSession();

    if (!can(session, "workspace:members:remove", { type: "workspace", tenantId: session.tenantId })) {
      throw new ApiError(403, "Forbidden");
    }

    const updated = await removeMember({
      tenantId: session.tenantId,
      membershipId: params.id,
      actorRoles: session.roles,
      actorUserId: session.userId,
    });

    return NextResponse.json({ membership: updated });
  } catch (error) {
    return handleApiError(error);
  }
}



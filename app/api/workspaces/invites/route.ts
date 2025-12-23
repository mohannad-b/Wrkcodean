import { NextResponse } from "next/server";

import { ApiError, handleApiError, requireTenantSession } from "@/lib/api/context";
import { can } from "@/lib/auth/rbac";
import { createWorkspaceInvite, listWorkspaceInvites } from "@/lib/services/workspace-members";
import type { MembershipRole } from "@/db/schema";

type InvitePayload = {
  email?: unknown;
  role?: unknown;
};

function parsePayload(body: InvitePayload) {
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const role = typeof body.role === "string" ? body.role.toLowerCase() : "";
  return { email, role };
}

export async function GET() {
  try {
    const session = await requireTenantSession();

    if (!can(session, "workspace:members:invite", { type: "workspace", tenantId: session.tenantId })) {
      throw new ApiError(403, "Forbidden");
    }

    const invites = await listWorkspaceInvites(session.tenantId);
    return NextResponse.json({ invites });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireTenantSession();

    if (!can(session, "workspace:members:invite", { type: "workspace", tenantId: session.tenantId })) {
      throw new ApiError(403, "Forbidden");
    }

    const body = (await request.json().catch(() => ({}))) as InvitePayload;
    const { email, role } = parsePayload(body);

    if (!email) {
      throw new ApiError(400, "Email is required");
    }

    if (!role || !["admin", "editor", "viewer", "billing"].includes(role)) {
      throw new ApiError(400, "Invalid role");
    }

    const invite = await createWorkspaceInvite({
      tenantId: session.tenantId,
      email,
      role: role as MembershipRole,
      invitedBy: session.userId,
    });

    return NextResponse.json({ invite }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}



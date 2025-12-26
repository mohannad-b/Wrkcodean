import { NextResponse } from "next/server";
import { requireWrkStaffSession, handleApiError } from "@/lib/api/context";
import { authorize } from "@/lib/auth/rbac";
import { changeMembershipRoleById } from "@/lib/services/platform-admin";
import type { MembershipRole } from "@/db/schema";

export async function POST(req: Request, { params }: { params: { membershipId: string } }) {
  try {
    const session = await requireWrkStaffSession();
    authorize("platform:membership:write", { type: "platform" }, session);

    const body = (await req.json()) as { role?: MembershipRole };
    if (!body.role) {
      return NextResponse.json({ error: "role is required" }, { status: 400 });
    }

    const updated = await changeMembershipRoleById({
      membershipId: params.membershipId,
      nextRole: body.role,
      actorUserId: session.userId,
    });

    if (!updated) {
      return NextResponse.json({ error: "Membership not found" }, { status: 404 });
    }

    return NextResponse.json({ membership: updated });
  } catch (error) {
    return handleApiError(error);
  }
}


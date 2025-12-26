import { NextResponse } from "next/server";
import { requireWrkStaffSession, handleApiError } from "@/lib/api/context";
import { authorize } from "@/lib/auth/rbac";
import { cancelInviteById } from "@/lib/services/platform-admin";

export async function POST(_: Request, { params }: { params: { inviteId: string } }) {
  try {
    const session = await requireWrkStaffSession();
    authorize("platform:membership:write", { type: "platform" }, session);

    const invite = await cancelInviteById({ inviteId: params.inviteId, actorUserId: session.userId });
    if (!invite) {
      return NextResponse.json({ error: "Invite not found" }, { status: 404 });
    }

    return NextResponse.json({ invite });
  } catch (error) {
    return handleApiError(error);
  }
}


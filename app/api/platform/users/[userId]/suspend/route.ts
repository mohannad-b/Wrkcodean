import { NextResponse } from "next/server";
import { requireWrkStaffSession, handleApiError } from "@/lib/api/context";
import { authorize } from "@/lib/auth/rbac";
import { suspendUser } from "@/lib/services/platform-admin";

export async function POST(_: Request, { params }: { params: { userId: string } }) {
  try {
    const session = await requireWrkStaffSession();
    authorize("platform:user:suspend", { type: "platform" }, session);

    const record = await suspendUser({ userId: params.userId, actorUserId: session.userId });
    return NextResponse.json({ user: record });
  } catch (error) {
    return handleApiError(error);
  }
}


import { NextResponse } from "next/server";
import { requireWrkStaffSession, handleApiError } from "@/lib/api/context";
import { authorize } from "@/lib/auth/rbac";
import { revokeStaffAccess, setStaffRole } from "@/lib/services/platform-admin";
import type { WrkStaffRole } from "@/db/schema";

export async function PATCH(req: Request, { params }: { params: { userId: string } }) {
  try {
    const session = await requireWrkStaffSession();
    authorize("platform:wrk_staff:write", { type: "platform" }, session);

    const body = (await req.json()) as { role?: WrkStaffRole };
    if (!body.role) {
      return NextResponse.json({ error: "role is required" }, { status: 400 });
    }

    const membership = await setStaffRole({
      userId: params.userId,
      role: body.role,
      actorUserId: session.userId,
    });

    return NextResponse.json({ membership });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_: Request, { params }: { params: { userId: string } }) {
  try {
    const session = await requireWrkStaffSession();
    authorize("platform:wrk_staff:write", { type: "platform" }, session);

    await revokeStaffAccess({ userId: params.userId, actorUserId: session.userId });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}


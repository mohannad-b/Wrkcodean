import { NextResponse } from "next/server";
import { handleApiError, requireWrkStaffSession } from "@/lib/api/context";
import { authorize } from "@/lib/auth/rbac";
import { createStaffInvite } from "@/lib/services/staff-invites";
import type { WrkStaffRole } from "@/db/schema";

export async function POST(req: Request) {
  try {
    const session = await requireWrkStaffSession();
    authorize("platform:wrk_staff:write", { type: "platform" }, session);

    const body = (await req.json()) as { email?: string; role?: WrkStaffRole };
    if (!body.email || !body.role) {
      return NextResponse.json({ error: "email and role are required" }, { status: 400 });
    }

    const invite = await createStaffInvite({
      email: body.email,
      role: body.role,
      invitedBy: session.userId,
    });

    return NextResponse.json({ invite });
  } catch (error) {
    return handleApiError(error);
  }
}


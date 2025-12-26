import { NextResponse } from "next/server";
import { requireWrkStaffSession, handleApiError } from "@/lib/api/context";
import { authorize } from "@/lib/auth/rbac";
import { listStaffUsers, setStaffRole } from "@/lib/services/platform-admin";
import type { WrkStaffRole } from "@/db/schema";

export async function GET() {
  try {
    const session = await requireWrkStaffSession();
    authorize("platform:wrk_staff:read", { type: "platform" }, session);

    const staff = await listStaffUsers();
    return NextResponse.json({ staff });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireWrkStaffSession();
    authorize("platform:wrk_staff:write", { type: "platform" }, session);

    const body = (await req.json()) as { userId?: string; role?: WrkStaffRole };
    if (!body.userId || !body.role) {
      return NextResponse.json({ error: "userId and role are required" }, { status: 400 });
    }

    const record = await setStaffRole({ userId: body.userId, role: body.role, actorUserId: session.userId });
    return NextResponse.json({ membership: record });
  } catch (error) {
    return handleApiError(error);
  }
}


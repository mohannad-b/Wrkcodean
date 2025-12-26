import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api/context";
import { acceptStaffInvite } from "@/lib/services/staff-invites";
import { getOrCreateUserFromAuth0Session } from "@/lib/auth/session";

export async function POST(req: Request) {
  try {
    const { token } = (await req.json()) as { token?: string };
    if (!token) {
      return NextResponse.json({ error: "token is required" }, { status: 400 });
    }

    let userRecord;
    try {
      ({ userRecord } = await getOrCreateUserFromAuth0Session());
    } catch {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }

    const result = await acceptStaffInvite({
      token,
      userId: userRecord.id,
      userEmail: userRecord.email,
    });

    return NextResponse.json({ ok: true, role: result.role });
  } catch (error) {
    return handleApiError(error);
  }
}


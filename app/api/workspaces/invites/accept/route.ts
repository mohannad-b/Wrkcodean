import { NextResponse } from "next/server";

import { ApiError, handleApiError } from "@/lib/api/context";
import { getOrCreateUserFromAuth0Session } from "@/lib/auth/session";
import { cookies } from "next/headers";
import { acceptWorkspaceInvite } from "@/lib/services/workspace-members";

type AcceptPayload = { token?: unknown };

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as AcceptPayload;
    const token = typeof body.token === "string" ? body.token.trim() : "";

    if (!token) {
      throw new ApiError(400, "Invite token is required");
    }

    const { userRecord } = await getOrCreateUserFromAuth0Session();

    const { invite, membership } = await acceptWorkspaceInvite({
      token,
      userId: userRecord.id,
      userEmail: userRecord.email,
    });

    const response = NextResponse.json({
      invite,
      membership,
    });
    const cookieStore = cookies();
    cookieStore.set("activeWorkspaceId", membership.tenantId, { path: "/", httpOnly: false, sameSite: "lax" });
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}



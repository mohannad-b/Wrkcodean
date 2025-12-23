import { NextResponse } from "next/server";

import { ApiError, handleApiError } from "@/lib/api/context";
import { getOrCreateUserFromAuth0Session } from "@/lib/auth/session";
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

    return NextResponse.json({
      invite,
      membership,
    });
  } catch (error) {
    return handleApiError(error);
  }
}



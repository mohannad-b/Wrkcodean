import { NextResponse } from "next/server";
import { requireWrkStaffSession, handleApiError } from "@/lib/api/context";
import { authorize } from "@/lib/auth/rbac";
import { suspendWorkspace } from "@/lib/services/platform-admin";

export async function POST(_: Request, { params }: { params: { tenantId: string } }) {
  try {
    const session = await requireWrkStaffSession();
    authorize("platform:workspace:suspend", { type: "platform" }, session);

    const record = await suspendWorkspace({ tenantId: params.tenantId, actorUserId: session.userId });
    return NextResponse.json({ workspace: record });
  } catch (error) {
    return handleApiError(error);
  }
}


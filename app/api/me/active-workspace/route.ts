import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { handleApiError, requireUserSession } from "@/lib/api/context";
import { db } from "@/db";
import { memberships } from "@/db/schema";
import { and, eq } from "drizzle-orm";

const schema = z.object({
  workspaceId: z.string().uuid(),
});

export async function POST(request: Request) {
  try {
    const session = await requireUserSession();
    const body = await request.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
    }

    const workspaceId = parsed.data.workspaceId;
    const membership = await db.query.memberships.findFirst({
      where: and(eq(memberships.userId, session.userId), eq(memberships.tenantId, workspaceId), eq(memberships.status, "active")),
    });

    if (!membership) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const cookieStore = cookies();
    cookieStore.set("activeWorkspaceId", workspaceId, { path: "/", httpOnly: false, sameSite: "lax" });

    return NextResponse.json({ ok: true, workspaceId });
  } catch (error) {
    return handleApiError(error);
  }
}


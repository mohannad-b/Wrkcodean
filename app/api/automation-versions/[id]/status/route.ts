import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { automationVersions } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { canTransition, isAutomationStatus, type AutomationStatus } from "@/lib/automations/status";

type Params = {
  id: string;
};

type StatusPayload = {
  status?: unknown;
};

async function parsePayload(request: Request): Promise<StatusPayload> {
  try {
    return (await request.json()) as StatusPayload;
  } catch {
    return {};
  }
}

export async function PATCH(request: Request, { params }: { params: Params }) {
  const session = await getSession().catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await parsePayload(request);
  const requestedStatus = payload.status;
  if (!isAutomationStatus(requestedStatus)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const version = await db.query.automationVersions.findFirst({
    where: eq(automationVersions.id, params.id),
  });

  if (!version) {
    return NextResponse.json({ error: "Automation version not found" }, { status: 404 });
  }

  if (!session.tenantId || version.tenantId !== session.tenantId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!can(session, "automation:update", { type: "automation_version", tenantId: version.tenantId })) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const currentStatus = version.status as AutomationStatus;
  if (!canTransition(currentStatus, requestedStatus)) {
    return NextResponse.json({ error: "Invalid status transition" }, { status: 400 });
  }

  const [updated] = await db
    .update(automationVersions)
    .set({ status: requestedStatus })
    .where(eq(automationVersions.id, params.id))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Unable to update automation version" }, { status: 500 });
  }

  return NextResponse.json({ automationVersion: updated });
}



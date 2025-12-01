import { NextResponse } from "next/server";
import { db } from "@/db";
import { automations } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";

type CreateAutomationPayload = {
  name?: unknown;
  description?: unknown;
};

async function parsePayload(request: Request): Promise<CreateAutomationPayload> {
  try {
    return (await request.json()) as CreateAutomationPayload;
  } catch {
    return {};
  }
}

export async function POST(request: Request) {
  const session = await getSession().catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!session.tenantId) {
    return NextResponse.json({ error: "Tenant context is missing." }, { status: 400 });
  }

  if (!can(session, "automation:create", { type: "automation", tenantId: session.tenantId })) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const payload = await parsePayload(request);
  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  const description =
    typeof payload.description === "string" && payload.description.trim().length > 0
      ? payload.description.trim()
      : null;

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const [automation] = await db
    .insert(automations)
    .values({
      tenantId: session.tenantId,
      name,
      description,
      createdBy: session.userId,
    })
    .returning();

  if (!automation) {
    return NextResponse.json({ error: "Unable to create automation" }, { status: 500 });
  }

  return NextResponse.json({ automation }, { status: 201 });
}



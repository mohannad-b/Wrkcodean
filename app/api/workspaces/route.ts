import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { memberships, tenants } from "@/db/schema";
import { getOrCreateUserFromAuth0Session } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { ApiError, requireTenantSession } from "@/lib/api/context";

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MIN_SLUG_LENGTH = 3;
const MAX_SLUG_LENGTH = 50;

type WorkspacePayload = {
  name?: string;
  slug?: string;
  industry?: string;
  currency?: string;
  timezone?: string;
};

function validateSlug(slug: string): { ok: boolean; message?: string } {
  if (!slug) return { ok: false, message: "Slug is required." };
  if (slug.length < MIN_SLUG_LENGTH || slug.length > MAX_SLUG_LENGTH) {
    return { ok: false, message: `Slug must be ${MIN_SLUG_LENGTH}-${MAX_SLUG_LENGTH} characters.` };
  }
  if (!SLUG_REGEX.test(slug)) {
    return {
      ok: false,
      message: "Use lowercase letters, numbers, and hyphens only; no leading/trailing hyphen.",
    };
  }
  return { ok: true };
}

export async function POST(request: NextRequest) {
  let body: WorkspacePayload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  const slug = (body.slug ?? "").trim().toLowerCase();

  if (!name) {
    return NextResponse.json({ error: "Workspace name is required." }, { status: 400 });
  }

  const slugValidity = validateSlug(slug);
  if (!slugValidity.ok) {
    return NextResponse.json({ error: slugValidity.message }, { status: 400 });
  }

  const { userRecord } = await getOrCreateUserFromAuth0Session();

  const existingSlug = await db.query.tenants.findFirst({
    where: eq(tenants.slug, slug),
    columns: { id: true },
  });

  if (existingSlug) {
    return NextResponse.json({ error: "Slug is already taken." }, { status: 409 });
  }

  const [tenant] = await db
    .insert(tenants)
    .values({
      name,
      slug,
    })
    .returning();

  await db
    .insert(memberships)
    .values({
      tenantId: tenant.id,
      userId: userRecord.id,
      role: "owner",
      status: "active",
    })
    .onConflictDoNothing({
      target: [memberships.tenantId, memberships.userId],
    });

  return NextResponse.json({
    tenant,
    membership: {
      tenantId: tenant.id,
      userId: userRecord.id,
      role: "owner",
    },
  });
}

export async function PATCH(request: NextRequest) {
  let body: WorkspacePayload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const session = await requireTenantSession();

  if (!can(session, "workspace:update", { type: "workspace", tenantId: session.tenantId })) {
    throw new ApiError(403, "Forbidden");
  }

  const updates: { name?: string; slug?: string; industry?: string; currency?: string; timezone?: string } = {};

  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name) {
      return NextResponse.json({ error: "Workspace name cannot be empty." }, { status: 400 });
    }
    updates.name = name;
  }

  if (body.slug !== undefined) {
    const slug = body.slug.trim().toLowerCase();
    const slugValidity = validateSlug(slug);
    if (!slugValidity.ok) {
      return NextResponse.json({ error: slugValidity.message }, { status: 400 });
    }

    // Check if slug is already taken by another tenant
    const existingSlug = await db.query.tenants.findFirst({
      where: eq(tenants.slug, slug),
      columns: { id: true },
    });

    if (existingSlug && existingSlug.id !== session.tenantId) {
      return NextResponse.json({ error: "Slug is already taken." }, { status: 409 });
    }

    updates.slug = slug;
  }

  if (body.industry !== undefined) {
    updates.industry = body.industry.trim() || null;
  }

  if (body.currency !== undefined) {
    updates.currency = body.currency.trim() || "usd";
  }

  if (body.timezone !== undefined) {
    updates.timezone = body.timezone.trim() || "est";
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update." }, { status: 400 });
  }

  const [updated] = await db
    .update(tenants)
    .set(updates)
    .where(eq(tenants.id, session.tenantId))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
  }

  return NextResponse.json({ tenant: updated });
}

export async function GET() {
  const session = await requireTenantSession();

  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, session.tenantId),
  });

  if (!tenant) {
    return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
  }

  return NextResponse.json({ tenant });
}

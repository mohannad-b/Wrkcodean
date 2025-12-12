import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { memberships, tenants } from "@/db/schema";
import { getOrCreateUserFromAuth0Session } from "@/lib/auth/session";

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MIN_SLUG_LENGTH = 3;
const MAX_SLUG_LENGTH = 50;

type WorkspacePayload = {
  name?: string;
  slug?: string;
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
      role: "client_admin",
    })
    .onConflictDoNothing({
      target: [memberships.tenantId, memberships.userId],
    });

  return NextResponse.json({
    tenant,
    membership: {
      tenantId: tenant.id,
      userId: userRecord.id,
      role: "client_admin",
    },
  });
}

import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { tenants } from "@/db/schema";

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MIN_SLUG_LENGTH = 3;
const MAX_SLUG_LENGTH = 50;

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

export async function GET(request: NextRequest) {
  const slug = (request.nextUrl.searchParams.get("slug") ?? "").trim().toLowerCase();

  const validity = validateSlug(slug);
  if (!validity.ok) {
    return NextResponse.json({ available: false, reason: validity.message }, { status: 400 });
  }

  const existing = await db.query.tenants.findFirst({
    where: eq(tenants.slug, slug),
    columns: { id: true },
  });

  const available = !existing;
  return NextResponse.json({
    available,
    reason: available ? undefined : "Slug is taken.",
  });
}

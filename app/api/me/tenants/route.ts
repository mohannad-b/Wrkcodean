import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { memberships, tenants } from "@/db/schema";
import { getOrCreateUserFromAuth0Session } from "@/lib/auth/session";
import { handleApiError } from "@/lib/api/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { userRecord } = await getOrCreateUserFromAuth0Session();

    const userMemberships = await db
      .select({
        tenantId: tenants.id,
        tenantName: tenants.name,
        tenantSlug: tenants.slug,
        role: memberships.role,
      })
      .from(memberships)
      .innerJoin(tenants, eq(tenants.id, memberships.tenantId))
    .where(and(eq(memberships.userId, userRecord.id), eq(memberships.status, "active")))
      .orderBy(tenants.name);

    return NextResponse.json({ tenants: userMemberships });
  } catch (error) {
    return handleApiError(error);
  }
}


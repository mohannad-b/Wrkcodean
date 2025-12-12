import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { memberships, users } from "@/db/schema";
import { getSession } from "@/lib/auth/session";

export async function GET() {
  const session = await getSession();

  const user = await db.query.users.findFirst({
    where: eq(users.id, session.userId),
    columns: {
      phone: true,
      phoneVerified: true,
      tosAcceptedAt: true,
      tosVersion: true,
    },
  });

  const membershipRow = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.userId, session.userId), eq(memberships.tenantId, session.tenantId)))
    .limit(1);

  return NextResponse.json({
    phone: user?.phone ?? null,
    phoneVerified: Boolean(user?.phoneVerified),
    tosAccepted: Boolean(user?.tosAcceptedAt),
    tosVersion: user?.tosVersion ?? null,
    hasMembership: membershipRow.length > 0,
  });
}

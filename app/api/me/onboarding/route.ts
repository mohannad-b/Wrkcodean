import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { memberships, users } from "@/db/schema";
import { getUserSession } from "@/lib/auth/session";

export async function GET() {
  const session = await getUserSession();

  const user = await db.query.users.findFirst({
    where: eq(users.id, session.userId),
    columns: {
      phone: true,
      phoneVerified: true,
      tosAcceptedAt: true,
      tosVersion: true,
    },
  });

  // Check if user has any membership (not tenant-specific during setup)
  const membershipRow = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(eq(memberships.userId, session.userId))
    .limit(1);

  return NextResponse.json({
    phone: user?.phone ?? null,
    phoneVerified: Boolean(user?.phoneVerified),
    tosAccepted: Boolean(user?.tosAcceptedAt),
    tosVersion: user?.tosVersion ?? null,
    hasMembership: membershipRow.length > 0,
  });
}

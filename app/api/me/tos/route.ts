import { NextResponse, type NextRequest } from "next/server";

import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireUserSession } from "@/lib/api/context";

const DEFAULT_TOS_VERSION = "2025-07-19"; // matches https://wrk.com/terms-of-service/

type Payload = {
  version?: string;
};

export async function POST(request: NextRequest) {
  const session = await requireUserSession();
  const body = (await request.json().catch(() => ({}))) as Payload;

  const tosVersion = (body.version ?? DEFAULT_TOS_VERSION).trim() || DEFAULT_TOS_VERSION;
  const acceptedAt = new Date();

  await db
    .update(users)
    .set({
      tosAcceptedAt: acceptedAt,
      tosVersion,
      updatedAt: acceptedAt,
    })
    .where(eq(users.id, session.userId));

  return NextResponse.json({
    status: "accepted",
    tosVersion,
    acceptedAt,
  });
}

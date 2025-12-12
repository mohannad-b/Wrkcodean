import { NextResponse, type NextRequest } from "next/server";

import { db } from "@/db";
import { users } from "@/db/schema";
import { getSession } from "@/lib/auth/session";

const DEMO_CODE = "123456";

type SendPayload = { phone?: string };
type VerifyPayload = { phone?: string; code?: string };

function normalizePhone(input: string | undefined) {
  if (!input) return "";
  return input.replace(/[^\d+]/g, "").trim();
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  const body = (await request.json().catch(() => ({}))) as SendPayload;
  const phone = normalizePhone(body.phone);

  if (!phone) {
    return NextResponse.json({ error: "Phone number is required." }, { status: 400 });
  }

  // In a real implementation, send SMS here. For now, return a demo code hint.
  return NextResponse.json({
    status: "sent",
    demo: true,
    hint: "Use code 123456 to verify in this environment.",
    phone,
  });
}

export async function PUT(request: NextRequest) {
  const session = await getSession();
  const body = (await request.json().catch(() => ({}))) as VerifyPayload;
  const phone = normalizePhone(body.phone);
  const code = (body.code ?? "").trim();

  if (!phone) {
    return NextResponse.json({ error: "Phone number is required." }, { status: 400 });
  }

  if (code !== DEMO_CODE) {
    return NextResponse.json({ error: "Invalid verification code." }, { status: 400 });
  }

  await db
    .update(users)
    .set({
      phone,
      phoneVerified: 1,
      updatedAt: new Date(),
    })
    .where(users.id.eq(session.userId));

  return NextResponse.json({
    status: "verified",
    phone,
  });
}

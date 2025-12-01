import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import type { AppSession } from "@/lib/auth/session";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function requireTenantSession(): Promise<AppSession> {
  const session = await getSession().catch(() => null);
  if (!session) {
    throw new ApiError(401, "Unauthorized");
  }

  if (!session.tenantId) {
    throw new ApiError(400, "Tenant context missing.");
  }

  return session;
}

export function handleApiError(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error(error);
  return NextResponse.json({ error: "Unexpected error." }, { status: 500 });
}



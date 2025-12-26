import { NextResponse } from "next/server";
import {
  getTenantSession,
  getWrkStaffSession,
  getUserSession,
  NoTenantMembershipError,
  NotWrkStaffError,
  type TenantSession,
  type StaffSession,
  type UserSession,
  type TenantOrStaffSession,
} from "@/lib/auth/session";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function requireTenantSession(): Promise<TenantSession> {
  const session = await getTenantSession().catch(() => null);
  if (!session) {
    throw new ApiError(401, "Unauthorized");
  }

  if (!session.tenantId) {
    throw new ApiError(400, "Tenant context missing.");
  }

  return session;
}

export async function requireWrkStaffSession(): Promise<StaffSession> {
  try {
    const session = await getWrkStaffSession();
    return session;
  } catch (error) {
    if (error instanceof NotWrkStaffError) {
      throw new ApiError(403, "Unauthorized");
    }
    throw new ApiError(401, "Unauthorized");
  }
}

export async function requireEitherTenantOrStaffSession(): Promise<TenantOrStaffSession> {
  let tenantError: unknown;

  try {
    return await getTenantSession();
  } catch (error) {
    tenantError = error;
  }

  try {
    return await getWrkStaffSession();
  } catch (staffError) {
    if (tenantError instanceof NoTenantMembershipError || staffError instanceof NotWrkStaffError) {
      throw new ApiError(403, "Unauthorized");
    }
    throw new ApiError(401, "Unauthorized");
  }
}

export async function requireUserSession(): Promise<UserSession> {
  const session = await getUserSession().catch(() => null);
  if (!session) {
    throw new ApiError(401, "Unauthorized");
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



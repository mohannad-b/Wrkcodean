import { NextResponse } from "next/server";
import {
  getTenantSession,
  getWrkStaffSession,
  getUserSession,
  NoTenantMembershipError,
  NoActiveWorkspaceError,
  NotWrkStaffError,
  type TenantSession,
  type StaffSession,
  type UserSession,
  type TenantOrStaffSession,
} from "@/lib/auth/session";
import { logger } from "@/lib/logger";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function requireTenantSession(): Promise<TenantSession> {
  const session = await getTenantSession().catch((error) => {
    if (error instanceof NoActiveWorkspaceError) {
      throw new ApiError(400, "Active workspace required");
    }
    return null;
  });
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

function getAuthorizationErrorCtor(): any {
  try {
    // Using require avoids static binding to mocks that omit AuthorizationError
    const mod = require("@/lib/auth/rbac");
    return mod.AuthorizationError;
  } catch {
    return undefined;
  }
}

export function handleApiError(error: unknown) {
  const AuthorizationError = getAuthorizationErrorCtor();
  if (typeof AuthorizationError === "function" && error instanceof AuthorizationError) {
    const authError = error as { message: string; code?: string; action?: string; status?: number };
    return NextResponse.json(
      { error: authError.message, code: authError.code, action: authError.action },
      { status: authError.status }
    );
  }
  if (error instanceof ApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  logger.error(error);
  return NextResponse.json({ error: "Unexpected error." }, { status: 500 });
}



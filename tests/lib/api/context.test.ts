import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getTenantSessionMock: vi.fn(),
  getWrkStaffSessionMock: vi.fn(),
  getUserSessionMock: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getTenantSession: mocks.getTenantSessionMock,
  getSession: mocks.getTenantSessionMock,
  getWrkStaffSession: mocks.getWrkStaffSessionMock,
  getUserSession: mocks.getUserSessionMock,
  NoTenantMembershipError: class NoTenantMembershipError extends Error {},
  NoActiveWorkspaceError: class NoActiveWorkspaceError extends Error {},
  NotWrkStaffError: class NotWrkStaffError extends Error {},
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: vi.fn(),
    redirect: vi.fn(),
  },
}));

import {
  ApiError,
  requireEitherTenantOrStaffSession,
  requireTenantSession,
  requireUserSession,
  requireWrkStaffSession,
} from "@/lib/api/context";
import { NoTenantMembershipError, NotWrkStaffError } from "@/lib/auth/session";

const { getTenantSessionMock, getWrkStaffSessionMock, getUserSessionMock } = mocks;

const TENANT_SESSION = {
  kind: "tenant" as const,
  tenantId: "tenant-1",
  userId: "user-1",
  roles: ["editor"],
  wrkStaffRole: null,
};

const STAFF_SESSION = {
  kind: "staff" as const,
  tenantId: null,
  userId: "user-staff",
  roles: [] as const,
  email: "ops@wrk.com",
  name: "Ops",
  wrkStaffRole: "wrk_admin" as const,
};

const USER_SESSION = {
  kind: "user" as const,
  tenantId: null,
  userId: "user-1",
  roles: [] as const,
};

describe("api context guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows tenant routes with a tenant membership", async () => {
    getTenantSessionMock.mockResolvedValueOnce(TENANT_SESSION);

    const session = await requireTenantSession();

    expect(session).toEqual(TENANT_SESSION);
    expect(getTenantSessionMock).toHaveBeenCalledTimes(1);
  });

  it("denies tenant routes without membership", async () => {
    getTenantSessionMock.mockRejectedValueOnce(new NoTenantMembershipError());

    await expect(requireTenantSession()).rejects.toThrow(ApiError);
  });

  it("allows staff routes without tenant membership", async () => {
    getWrkStaffSessionMock.mockResolvedValueOnce(STAFF_SESSION);

    const session = await requireWrkStaffSession();

    expect(session).toEqual(STAFF_SESSION);
  });

  it("denies staff routes for non-staff users", async () => {
    getWrkStaffSessionMock.mockRejectedValueOnce(new NotWrkStaffError());

    await expect(requireWrkStaffSession()).rejects.toMatchObject({ status: 403 });
  });

  it("returns tenant session when available for either guard", async () => {
    getTenantSessionMock.mockResolvedValueOnce(TENANT_SESSION);

    const session = await requireEitherTenantOrStaffSession();

    expect(session.kind).toBe("tenant");
    expect(getWrkStaffSessionMock).not.toHaveBeenCalled();
  });

  it("returns staff session when tenant membership is missing", async () => {
    getTenantSessionMock.mockRejectedValueOnce(new NoTenantMembershipError());
    getWrkStaffSessionMock.mockResolvedValueOnce(STAFF_SESSION);

    const session = await requireEitherTenantOrStaffSession();

    expect(session.kind).toBe("staff");
  });

  it("denies when neither tenant nor staff session is available", async () => {
    getTenantSessionMock.mockRejectedValueOnce(new NoTenantMembershipError());
    getWrkStaffSessionMock.mockRejectedValueOnce(new NotWrkStaffError());

    await expect(requireEitherTenantOrStaffSession()).rejects.toMatchObject({ status: 403 });
  });

  it("returns user session without requiring tenant context", async () => {
    getUserSessionMock.mockResolvedValueOnce(USER_SESSION);

    const session = await requireUserSession();

    expect(session).toEqual(USER_SESSION);
    expect(getUserSessionMock).toHaveBeenCalledTimes(1);
  });

  it("denies unauthenticated user session requests", async () => {
    getUserSessionMock.mockRejectedValueOnce(new Error("not logged in"));

    await expect(requireUserSession()).rejects.toThrow(ApiError);
  });
});


import { describe, it, expect, vi, beforeEach } from "vitest";

const requireWrkStaffSessionMock = vi.fn();
const requireTenantSessionMock = vi.fn();
const authorizeMock = vi.fn();

vi.mock("@/lib/api/context", () => ({
  requireWrkStaffSession: requireWrkStaffSessionMock,
  requireTenantSession: requireTenantSessionMock,
}));

vi.mock("@/lib/auth/rbac", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/rbac")>("@/lib/auth/rbac");
  return {
    ...actual,
    authorize: authorizeMock,
  };
});

vi.mock("@/components/wrk-admin/AdminSidebar", () => ({
  AdminSidebar: () => null,
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("notFound");
  }),
  redirect: vi.fn((url: string) => {
    const error = new Error(`redirect:${url}`);
    // @ts-expect-error annotate redirect marker for assertions if needed
    error.isRedirect = true;
    throw error;
  }),
}));

describe("wrк-admin layout auth", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("allows staff", async () => {
    requireWrkStaffSessionMock.mockResolvedValueOnce({});
    const { default: Layout } = await import("@/app/wrk-admin/layout");
    await expect(Layout({ children: "ok" } as any)).resolves.toBeTruthy();
    expect(requireWrkStaffSessionMock).toHaveBeenCalledTimes(1);
  });

  it("blocks non-staff", async () => {
    requireWrkStaffSessionMock.mockRejectedValueOnce(new Error("nope"));
    const { default: Layout } = await import("@/app/wrk-admin/layout");
    await expect(Layout({ children: "ok" } as any)).rejects.toThrow();
  });
});

describe("workspace-admin layout auth", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("allows tenant admin", async () => {
    requireTenantSessionMock.mockResolvedValueOnce({ tenantId: "t1" });
    authorizeMock.mockReturnValueOnce(true);
    const { default: Layout } = await import("@/app/workspace-admin/layout");
    await expect(Layout({ children: "ok" } as any)).resolves.toBeTruthy();
    expect(requireTenantSessionMock).toHaveBeenCalledTimes(1);
    expect(authorizeMock).toHaveBeenCalledWith("workspace:update", { type: "workspace", tenantId: "t1" }, { tenantId: "t1" });
  });

  it("blocks tenant viewers", async () => {
    requireTenantSessionMock.mockResolvedValueOnce({ tenantId: "t1" });
    authorizeMock.mockImplementationOnce(() => {
      throw new Error("forbidden");
    });
    const { default: Layout } = await import("@/app/workspace-admin/layout");
    await expect(Layout({ children: "ok" } as any)).rejects.toThrow();
  });
});


import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const redirectMock = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => redirectMock(...args),
}));

const getSessionMock = vi.fn();
class FakeNoTenantMembershipError extends Error {}
class FakeNoActiveWorkspaceError extends Error {}

vi.mock("@/lib/auth/session", () => ({
  getSession: getSessionMock,
  NoTenantMembershipError: FakeNoTenantMembershipError,
  NoActiveWorkspaceError: FakeNoActiveWorkspaceError,
}));

describe("ensureUserProvisioned routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockReset();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("redirects to workspace-picker when active workspace is missing", async () => {
    const { ensureUserProvisioned } = await import("@/app/(app)/ensureUserProvisioned");
    const { NoActiveWorkspaceError } = await import("@/lib/auth/session");

    getSessionMock.mockRejectedValue(new NoActiveWorkspaceError());

    await expect(ensureUserProvisioned()).resolves.not.toThrow();
    expect(redirectMock).toHaveBeenCalledWith("/workspace-picker");
  });

  it("redirects to login when not authenticated", async () => {
    const { ensureUserProvisioned } = await import("@/app/(app)/ensureUserProvisioned");

    getSessionMock.mockRejectedValue(new Error("not authenticated"));

    await expect(ensureUserProvisioned()).resolves.not.toThrow();
    expect(redirectMock).toHaveBeenCalledWith("/auth/login");
  });

  it("does nothing when NoTenantMembershipError is thrown", async () => {
    const { ensureUserProvisioned } = await import("@/app/(app)/ensureUserProvisioned");
    const { NoTenantMembershipError } = await import("@/lib/auth/session");

    getSessionMock.mockRejectedValue(new NoTenantMembershipError());

    await ensureUserProvisioned();

    expect(redirectMock).not.toHaveBeenCalled();
  });
});


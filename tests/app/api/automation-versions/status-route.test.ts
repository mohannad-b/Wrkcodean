import { describe, it, expect, beforeEach, vi } from "vitest";

const getSessionMock = vi.fn();
const requireTenantSessionMock = vi.fn();
const canMock = vi.fn();
const updateStatusMock = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  getSession: getSessionMock,
  getTenantSession: requireTenantSessionMock,
}));

vi.mock("@/lib/auth/rbac", () => ({
  can: canMock,
}));

vi.mock("@/lib/services/automations", () => ({
  updateAutomationVersionStatus: updateStatusMock,
}));

describe("PATCH /api/automation-versions/[id]/status", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue({ userId: "user-1", tenantId: "tenant-1", roles: ["admin"] });
    requireTenantSessionMock.mockResolvedValue({ userId: "user-1", tenantId: "tenant-1", roles: ["admin"], kind: "tenant" });
    canMock.mockReturnValue(true);
  });

  it("returns 400 for invalid transitions", async () => {
    updateStatusMock.mockRejectedValue(new Error("Invalid status transition"));
    const { PATCH } = await import("@/app/api/automation-versions/[id]/status/route");
    const response = await PATCH(
      new Request("http://localhost/api/automation-versions/v1/status", {
        method: "PATCH",
        body: JSON.stringify({ status: "Live" }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: { id: "v1" } }
    );

    expect(response.status).toBe(400);
  });
});



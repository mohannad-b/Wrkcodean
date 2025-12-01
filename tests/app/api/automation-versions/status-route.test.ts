import { describe, it, expect, beforeEach, vi } from "vitest";

const getSessionMock = vi.fn();
const canMock = vi.fn();
const findFirstMock = vi.fn();
const returningMock = vi.fn();
const whereMock = vi.fn(() => ({
  returning: returningMock,
}));
const setMock = vi.fn(() => ({
  where: whereMock,
}));
const updateMock = vi.fn(() => ({
  set: setMock,
}));

vi.mock("@/lib/auth/session", () => ({
  getSession: getSessionMock,
}));

vi.mock("@/lib/auth/rbac", () => ({
  can: canMock,
}));

vi.mock("@/db", () => ({
  db: {
    query: {
      automationVersions: {
        findFirst: findFirstMock,
      },
    },
    update: updateMock,
  },
}));

describe("PATCH /api/automation-versions/[id]/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates the status when the transition is allowed", async () => {
    getSessionMock.mockResolvedValue({ userId: "user-1", tenantId: "tenant-1", roles: ["client_admin"] });
    canMock.mockReturnValue(true);
    findFirstMock.mockResolvedValue({ id: "ver-1", tenantId: "tenant-1", status: "Intake" });
    returningMock.mockResolvedValue([{ id: "ver-1", tenantId: "tenant-1", status: "Needs Pricing" }]);

    const { PATCH } = await import("@/app/api/automation-versions/[id]/status/route");
    const request = new Request("http://localhost/api/automation-versions/ver-1/status", {
      method: "PATCH",
      body: JSON.stringify({ status: "Needs Pricing" }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await PATCH(request, { params: { id: "ver-1" } });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.automationVersion.status).toBe("Needs Pricing");
    expect(updateMock).toHaveBeenCalled();
  });

  it("returns 400 when the transition is not allowed", async () => {
    getSessionMock.mockResolvedValue({ userId: "user-1", tenantId: "tenant-1", roles: ["client_admin"] });
    canMock.mockReturnValue(true);
    findFirstMock.mockResolvedValue({ id: "ver-1", tenantId: "tenant-1", status: "Intake" });

    const { PATCH } = await import("@/app/api/automation-versions/[id]/status/route");
    const request = new Request("http://localhost/api/automation-versions/ver-1/status", {
      method: "PATCH",
      body: JSON.stringify({ status: "Live" }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await PATCH(request, { params: { id: "ver-1" } });
    expect(response.status).toBe(400);
    expect(returningMock).not.toHaveBeenCalled();
  });
});



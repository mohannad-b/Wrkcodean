import { describe, it, expect, beforeEach, vi } from "vitest";

const getSessionMock = vi.fn();
const canMock = vi.fn();
const getAutomationDetailMock = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  getSession: getSessionMock,
}));

vi.mock("@/lib/auth/rbac", () => ({
  can: canMock,
}));

vi.mock("@/lib/services/automations", () => ({
  getAutomationDetail: getAutomationDetailMock,
}));

describe("GET /api/automations/[id]", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue({ userId: "user-1", tenantId: "tenant-1", roles: [] });
    canMock.mockReturnValue(true);
  });

  it("returns 404 when automation is not found for the tenant", async () => {
    getAutomationDetailMock.mockResolvedValue(null);
    const { GET } = await import("@/app/api/automations/[id]/route");
    const response = await GET(new Request("http://localhost/api/automations/a1"), { params: { id: "a1" } });

    expect(response.status).toBe(404);
  });
});



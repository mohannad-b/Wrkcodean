import { describe, it, expect, beforeEach, vi } from "vitest";

const getSessionMock = vi.fn();
const canMock = vi.fn();
const getVersionDetailMock = vi.fn();
const updateVersionStatusMock = vi.fn();
const logAuditMock = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  getSession: getSessionMock,
}));

vi.mock("@/lib/auth/rbac", () => ({
  can: canMock,
}));

vi.mock("@/lib/services/automations", () => ({
  getAutomationVersionDetail: getVersionDetailMock,
  updateAutomationVersionStatus: updateVersionStatusMock,
}));

vi.mock("@/lib/audit/log", () => ({
  logAudit: logAuditMock,
}));

describe("PATCH /api/admin/automation-versions/[id]/status", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue({ userId: "ops-1", tenantId: "tenant-1", roles: ["ops_admin"] });
    canMock.mockReturnValue(true);
  });

  it("marks a BuildInProgress version as live", async () => {
    getVersionDetailMock.mockResolvedValue({
      version: { id: "ver-1", status: "BuildInProgress" },
      project: { id: "proj-1", status: "BuildInProgress" },
      automation: null,
      latestQuote: null,
    });
    updateVersionStatusMock.mockResolvedValue({
      version: { id: "ver-1", status: "Live", updatedAt: new Date().toISOString() },
      previousStatus: "BuildInProgress",
    });

    const { PATCH } = await import("@/app/api/admin/automation-versions/[id]/status/route");
    const response = await PATCH(
      new Request("http://localhost/api/admin/automation-versions/ver-1/status", {
        method: "PATCH",
        body: JSON.stringify({ status: "Live" }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: { id: "ver-1" } }
    );

    expect(response.status).toBe(200);
    expect(updateVersionStatusMock).toHaveBeenCalledWith(
      expect.objectContaining({
        automationVersionId: "ver-1",
        nextStatus: "Live",
      })
    );
    expect(logAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "automation.version.status.changed",
        resourceId: "ver-1",
      })
    );
  });

  it("returns 400 when transition is invalid", async () => {
    getVersionDetailMock.mockResolvedValue({
      version: { id: "ver-1", status: "NeedsPricing" },
      project: null,
      automation: null,
      latestQuote: null,
    });
    updateVersionStatusMock.mockRejectedValue(new Error("Invalid status transition"));

    const { PATCH } = await import("@/app/api/admin/automation-versions/[id]/status/route");
    const response = await PATCH(
      new Request("http://localhost/api/admin/automation-versions/ver-1/status", {
        method: "PATCH",
        body: JSON.stringify({ status: "Live" }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: { id: "ver-1" } }
    );

    expect(response.status).toBe(400);
  });

  it("returns 404 when tenant cannot access version", async () => {
    getVersionDetailMock.mockResolvedValue(null);

    const { PATCH } = await import("@/app/api/admin/automation-versions/[id]/status/route");
    const response = await PATCH(
      new Request("http://localhost/api/admin/automation-versions/ver-1/status", {
        method: "PATCH",
        body: JSON.stringify({ status: "Live" }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: { id: "ver-1" } }
    );

    expect(response.status).toBe(404);
  });
});



import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyBlueprint } from "@/lib/workflows/factory";

const canMock = vi.fn();
const logAuditMock = vi.fn();
const requireTenantSessionMock = vi.fn();
const getDetailMock = vi.fn();
const sanitizeMock = vi.fn();
const revalidatePathMock = vi.fn();
const returningMock = vi.fn();
const whereMock = vi.fn(() => ({ returning: returningMock }));
const setMock = vi.fn(() => ({ where: whereMock }));
const updateMock = vi.fn(() => ({ set: setMock }));

vi.mock("@/lib/api/context", () => ({
  requireTenantSession: requireTenantSessionMock,
  handleApiError: (error: unknown) =>
    new Response((error as Error).message, { status: (error as { status?: number }).status ?? 500 }),
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

vi.mock("@/lib/auth/rbac", () => ({
  can: canMock,
}));

vi.mock("@/lib/services/automations", () => ({
  getAutomationVersionDetail: getDetailMock,
}));

vi.mock("@/lib/audit/log", () => ({
  logAudit: logAuditMock,
}));

vi.mock("@/lib/workflows/sanitizer", () => ({
  sanitizeWorkflowTopology: sanitizeMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("@/db", () => ({
  db: {
    update: updateMock,
  },
}));

describe("POST /api/automation-versions/[id]/copilot/optimize", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireTenantSessionMock.mockResolvedValue({ userId: "user-1", tenantId: "tenant-1", roles: ["editor"] });
    canMock.mockReturnValue(true);
    const blueprint = createEmptyBlueprint();
    getDetailMock.mockResolvedValue({
      version: {
        id: "version-1",
        tenantId: "tenant-1",
        automationId: "auto-1",
        status: "Draft",
        intakeNotes: "",
        workflowJson: blueprint,
        updatedAt: new Date().toISOString(),
      },
      automation: { id: "auto-1", name: "Invoice Automation" },
    });
    sanitizeMock.mockImplementation((value) => ({
      workflow: value,
      summary: {
        removedDuplicateEdges: 0,
        reparentedBranches: 0,
        removedCycles: 0,
        trimmedConnections: 0,
        attachedOrphans: 0,
      },
    }));
    returningMock.mockResolvedValue([{ automationId: "auto-1" }]);
  });

  it("optimizes and persists the blueprint", async () => {
    const { POST } = await import("@/app/api/automation-versions/[id]/copilot/optimize/route");
    const request = new Request("http://localhost/api/automation-versions/version-1/copilot/optimize", {
      method: "POST",
    });

    const response = await POST(request, { params: { id: "version-1" } });
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(sanitizeMock).toHaveBeenCalled();
    expect(updateMock).toHaveBeenCalled();
    expect(revalidatePathMock).toHaveBeenCalledWith("/automations/auto-1");
    expect(payload.telemetry?.sanitizationSummary).toBeDefined();
    expect(logAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "automation.workflow.optimized",
        resourceId: "version-1",
      })
    );
  });
});


import { describe, it, expect, beforeEach, vi } from "vitest";

const canMock = vi.fn();
const updateMetadataMock = vi.fn();
const logAuditMock = vi.fn();
const requireTenantSessionMock = vi.fn();

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
  updateAutomationVersionMetadata: updateMetadataMock,
}));

vi.mock("@/lib/audit/log", () => ({
  logAudit: logAuditMock,
}));

const validBlueprint = {
  version: 1,
  status: "Draft",
  goals: ["Launch automation"],
  phases: [
    {
      id: "phase-1",
      name: "Phase 1",
      order: 0,
      steps: [
        {
          id: "step-1",
          title: "Outline requirements",
          type: "Intake",
        },
      ],
    },
  ],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("PATCH /api/automation-versions/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireTenantSessionMock.mockResolvedValue({ userId: "user-1", tenantId: "tenant-1", roles: [] });
    canMock.mockReturnValue(true);
    updateMetadataMock.mockResolvedValue({ id: "version-1", intakeNotes: "notes", blueprintJson: validBlueprint });
  });

  it("rejects invalid blueprint payloads with 400", async () => {
    const { PATCH } = await import("@/app/api/automation-versions/[id]/route");
    const request = new Request("http://localhost/api/automation-versions/version-1", {
      method: "PATCH",
      body: JSON.stringify({ blueprintJson: { version: 2 } }),
    });

    const response = await PATCH(request, { params: { id: "version-1" } });
    expect(response.status).toBe(400);
    expect(updateMetadataMock).not.toHaveBeenCalled();
  });

  it("saves a valid blueprint payload", async () => {
    const { PATCH } = await import("@/app/api/automation-versions/[id]/route");
    const request = new Request("http://localhost/api/automation-versions/version-1", {
      method: "PATCH",
      body: JSON.stringify({ blueprintJson: validBlueprint }),
    });

    const response = await PATCH(request, { params: { id: "version-1" } });
    expect(response.status).toBe(200);
    expect(updateMetadataMock).toHaveBeenCalledWith(
      expect.objectContaining({ blueprintJson: validBlueprint, automationVersionId: "version-1" })
    );
  });
});


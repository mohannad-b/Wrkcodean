import { describe, it, expect, beforeEach, vi } from "vitest";

const sessionMock = { userId: "u1", tenantId: "t1", roles: ["workspace_member"] };
const requireTenantSessionMock = vi.fn();
const canMock = vi.fn();
const listSubmissionsForTenantMock = vi.fn();
const listSubmissionRequestsForTenantMock = vi.fn();

vi.mock("@/lib/api/context", () => ({
  requireTenantSession: requireTenantSessionMock,
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
  handleApiError: (error: any) =>
    new Response(JSON.stringify({ error: error.message }), { status: error.status ?? 500 }),
}));

vi.mock("@/lib/auth/rbac", () => ({
  can: canMock,
}));

vi.mock("@/lib/services/submissions", () => ({
  listSubmissionsForTenant: listSubmissionsForTenantMock,
  listSubmissionRequestsForTenant: listSubmissionRequestsForTenantMock,
}));

describe("GET /api/admin/projects wrapper", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    requireTenantSessionMock.mockResolvedValue(sessionMock);
    canMock.mockImplementation((user: any, action: string) => {
      if (action === "admin:submission:read") return false;
      if (action === "automation:read") return true;
      return false;
    });
  });

  it("returns combined projects and automation requests for tenant readers", async () => {
    listSubmissionsForTenantMock.mockResolvedValue([
      {
        submission: { id: "proj-1", status: "NeedsPricing", updatedAt: "2024-01-01", automationVersionId: "ver-1" },
        automation: { id: "auto-1", name: "A1" },
        version: { id: "ver-1", versionLabel: "v1", status: "NeedsPricing" },
        latestQuote: { id: "q1", status: "DRAFT" },
      },
    ]);
    listSubmissionRequestsForTenantMock.mockResolvedValue([
      {
        submission: { id: "ver-2", status: "IntakeInProgress", updatedAt: "2024-02-01" },
        automation: { id: "auto-2", name: "A2" },
        version: { id: "ver-2", versionLabel: "v1", status: "IntakeInProgress" },
        latestQuote: null,
      },
    ]);

    const { GET } = await import("@/app/api/admin/projects/route");
    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.submissions).toHaveLength(2);
    expect(payload.submissions.map((p: any) => p.id)).toEqual(["proj-1", "ver-2"]);
    expect(listSubmissionsForTenantMock).toHaveBeenCalledWith("t1");
    expect(listSubmissionRequestsForTenantMock).toHaveBeenCalledWith("t1", new Set(["ver-1"]));
  });

  it("returns 403 when user lacks admin or tenant read", async () => {
    canMock.mockReturnValue(false);
    const { GET } = await import("@/app/api/admin/projects/route");
    const response = await GET();
    expect(response.status).toBe(403);
  });
});


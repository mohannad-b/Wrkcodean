import { describe, it, expect, beforeEach, vi } from "vitest";
import { createEmptyCopilotAnalysisState } from "@/lib/workflows/copilot-analysis";

const canMock = vi.fn();
const requireTenantSessionMock = vi.fn();
const getAnalysisMock = vi.fn();

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

vi.mock("@/lib/services/copilot-analysis", () => ({
  getCopilotAnalysis: getAnalysisMock,
}));

describe("GET /api/automation-versions/[id]/copilot/analysis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireTenantSessionMock.mockResolvedValue({ userId: "user-1", tenantId: "tenant-1", roles: [] });
    canMock.mockReturnValue(true);
    getAnalysisMock.mockResolvedValue(null);
  });

  it("returns persisted analysis when available", async () => {
    const stored = createEmptyCopilotAnalysisState();
    stored.readiness.score = 70;
    getAnalysisMock.mockResolvedValue(stored);

    const { GET } = await import("@/app/api/automation-versions/[id]/copilot/analysis/route");
    const response = await GET(new Request("http://localhost/api/automation-versions/version-1/copilot/analysis"), {
      params: { id: "version-1" },
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.analysis).toEqual(stored);
    expect(getAnalysisMock).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      automationVersionId: "version-1",
    });
  });

  it("returns default state when no analysis exists", async () => {
    const { GET } = await import("@/app/api/automation-versions/[id]/copilot/analysis/route");
    const response = await GET(new Request("http://localhost/api/automation-versions/version-1/copilot/analysis"), {
      params: { id: "version-1" },
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.analysis.readiness.score).toBe(0);
    expect(payload.analysis.todos.length).toBeGreaterThanOrEqual(4);
    expect(payload.analysis.todos.filter((todo: any) => todo.status === "open").length).toBeGreaterThanOrEqual(4);
    expect(payload.analysis.readiness.stateItemsMissing).toEqual(
      expect.arrayContaining(["goal_clarity", "trigger", "destination", "output_shape", "scope"])
    );
    expect(Object.keys(payload.analysis.sections)).toHaveLength(8);
  });

  it("returns 404 when automation version is missing", async () => {
    getAnalysisMock.mockRejectedValue(new Error("Automation version not found"));

    const { GET } = await import("@/app/api/automation-versions/[id]/copilot/analysis/route");
    const response = await GET(new Request("http://localhost/api/automation-versions/version-unknown/copilot/analysis"), {
      params: { id: "version-unknown" },
    });

    expect(response.status).toBe(404);
  });
});



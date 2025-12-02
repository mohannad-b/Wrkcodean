import { describe, it, expect, beforeEach, vi } from "vitest";

const canMock = vi.fn();
const updateMetadataMock = vi.fn();
const logAuditMock = vi.fn();
const requireTenantSessionMock = vi.fn();
const getDetailMock = vi.fn();
const rateLimitMock = vi.fn();

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
  updateAutomationVersionMetadata: updateMetadataMock,
}));

vi.mock("@/lib/audit/log", () => ({
  logAudit: logAuditMock,
}));

vi.mock("@/lib/rate-limit", () => ({
  ensureRateLimit: rateLimitMock,
  buildRateLimitKey: (...parts: string[]) => parts.join(":"),
}));

describe("POST /api/automation-versions/[id]/copilot/draft-blueprint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireTenantSessionMock.mockResolvedValue({ userId: "user-1", tenantId: "tenant-1", roles: ["client_admin"] });
    canMock.mockReturnValue(true);
    rateLimitMock.mockReturnValue({ remaining: 4, resetAt: Date.now() + 1000 });
    getDetailMock.mockResolvedValue({
      version: {
        id: "version-1",
        tenantId: "tenant-1",
        automationId: "auto-1",
        status: "IntakeInProgress",
        intakeNotes: "Sample intake",
        blueprintJson: null,
        updatedAt: new Date().toISOString(),
      },
      automation: { id: "auto-1", name: "Invoice Automation", description: "desc" },
      project: null,
      latestQuote: null,
    });
    updateMetadataMock.mockResolvedValue({});
  });

  it("drafts a blueprint from Copilot input", async () => {
    const { POST } = await import("@/app/api/automation-versions/[id]/copilot/draft-blueprint/route");
    const request = new Request("http://localhost/api/automation-versions/version-1/copilot/draft-blueprint", {
      method: "POST",
      body: JSON.stringify({
        messages: [
          { role: "user", content: "We ingest invoices from Gmail and push the data into Xero for approvals." },
        ],
      }),
    });

    const response = await POST(request, { params: { id: "version-1" } });
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.blueprint).toMatchObject({
      status: "Draft",
      sections: expect.any(Array),
      steps: expect.any(Array),
    });
    expect(updateMetadataMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        automationVersionId: "version-1",
        blueprintJson: expect.any(Object),
      })
    );
    expect(logAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "automation.blueprint.drafted",
        resourceId: "version-1",
      })
    );
  });

  it("rejects clearly off-topic input", async () => {
    const { POST } = await import("@/app/api/automation-versions/[id]/copilot/draft-blueprint/route");
    const request = new Request("http://localhost/api/automation-versions/version-1/copilot/draft-blueprint", {
      method: "POST",
      body: JSON.stringify({
        messages: [{ role: "user", content: "What's the weather like in Paris today?" }],
      }),
    });

    const response = await POST(request, { params: { id: "version-1" } });
    expect(response.status).toBe(400);
    expect(updateMetadataMock).not.toHaveBeenCalled();
  });
});


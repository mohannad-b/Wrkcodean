import { describe, it, expect, beforeEach, vi } from "vitest";

const canMock = vi.fn();
const getDetailMock = vi.fn();
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
  getAutomationVersionDetail: getDetailMock,
  updateAutomationVersionMetadata: updateMetadataMock,
}));

vi.mock("@/lib/audit/log", () => ({
  logAudit: logAuditMock,
}));

const sections = [
  { id: "sec-1", key: "business_requirements", title: "Business Requirements", content: "Outline the workflow" },
  { id: "sec-2", key: "business_objectives", title: "Business Objectives", content: "Reduce manual work" },
  { id: "sec-3", key: "success_criteria", title: "Success Criteria", content: "SLA < 24h" },
  { id: "sec-4", key: "systems", title: "Systems", content: "Email, Slack" },
  { id: "sec-5", key: "data_needs", title: "Data Needs", content: "Contact info" },
  { id: "sec-6", key: "exceptions", title: "Exceptions", content: "High value deals" },
  { id: "sec-7", key: "human_touchpoints", title: "Human Touchpoints", content: "Sales review" },
  { id: "sec-8", key: "flow_complete", title: "Flow Complete", content: "CRM updated" },
];

const validBlueprint = {
  version: 1,
  status: "Draft",
  summary: "Draft workflow for onboarding new leads.",
  sections,
  steps: [
    {
      id: "step-1",
      type: "Trigger",
      name: "Lead submitted",
      summary: "Capture inbound leads from the public form.",
      description: "Capture inbound leads from the public form.",
      goalOutcome: "Kick off the workflow when a new submission arrives.",
      responsibility: "Automated",
      systemsInvolved: ["HubSpot"],
      notifications: ["Slack"],
      nextStepIds: [],
      stepNumber: "",
      taskIds: [],
    },
  ],
  branches: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("PATCH /api/automation-versions/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireTenantSessionMock.mockResolvedValue({ userId: "user-1", tenantId: "tenant-1", roles: [] });
    canMock.mockReturnValue(true);
    updateMetadataMock.mockResolvedValue({ id: "version-1", intakeNotes: "notes", blueprintJson: validBlueprint });
    getDetailMock.mockResolvedValue({
      version: {
        id: "version-1",
        versionLabel: "v1.0",
        status: "IntakeInProgress",
        intakeNotes: "notes",
        summary: "Summary",
        blueprintJson: validBlueprint,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
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
    expect(getDetailMock).toHaveBeenCalled();
  });

  it("persists inspector step edits", async () => {
    const { PATCH } = await import("@/app/api/automation-versions/[id]/route");
    const updatedBlueprint = {
      ...validBlueprint,
      steps: validBlueprint.steps.map((step) =>
        step.id === "step-1"
          ? {
              ...step,
              summary: "Updated summary from inspector",
              goalOutcome: "Updated goal",
            }
          : step
      ),
    };
    const request = new Request("http://localhost/api/automation-versions/version-1", {
      method: "PATCH",
      body: JSON.stringify({ blueprintJson: updatedBlueprint }),
    });

    const response = await PATCH(request, { params: { id: "version-1" } });
    expect(response.status).toBe(200);
    expect(updateMetadataMock).toHaveBeenCalledWith(
      expect.objectContaining({ blueprintJson: updatedBlueprint, automationVersionId: "version-1" })
    );
    const auditCall = logAuditMock.mock.calls.at(-1)?.[0];
    expect(auditCall?.metadata?.blueprintSummary).toBeDefined();
    expect(Array.isArray(auditCall?.metadata?.blueprintSummary)).toBe(true);
  });
});


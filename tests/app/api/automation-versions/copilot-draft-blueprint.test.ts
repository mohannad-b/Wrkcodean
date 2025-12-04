import { describe, it, expect, beforeEach, vi } from "vitest";
import { createEmptyBlueprint } from "@/lib/blueprint/factory";

const canMock = vi.fn();
const logAuditMock = vi.fn();
const requireTenantSessionMock = vi.fn();
const getDetailMock = vi.fn();
const rateLimitMock = vi.fn();
const buildBlueprintFromChatMock = vi.fn();
const applyStepNumbersMock = vi.fn();
const revalidatePathMock = vi.fn();
const returningMock = vi.fn();
const whereMock = vi.fn(() => ({ returning: returningMock }));
const setMock = vi.fn(() => ({ where: whereMock }));
const updateMock = vi.fn(() => ({ set: setMock }));
const createCopilotMessageMock = vi.fn();

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

vi.mock("@/lib/blueprint/ai-builder", () => ({
  buildBlueprintFromChat: buildBlueprintFromChatMock,
}));

vi.mock("@/lib/blueprint/step-numbering", () => ({
  applyStepNumbers: applyStepNumbersMock,
}));

vi.mock("@/lib/rate-limit", () => ({
  ensureRateLimit: rateLimitMock,
  buildRateLimitKey: (...parts: string[]) => parts.join(":"),
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("@/db", () => ({
  db: {
    update: updateMock,
  },
}));

vi.mock("@/lib/services/copilot-messages", () => ({
  createCopilotMessage: createCopilotMessageMock,
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
    const baseBlueprint = createEmptyBlueprint();
    const sampleBlueprint = {
      ...baseBlueprint,
      summary: "Sample blueprint",
      steps: [
        {
          id: "step-1",
          stepNumber: "1",
          type: "Trigger",
          name: "Invoice arrives",
          description: "Invoice arrives",
          summary: "Invoice arrives",
          goalOutcome: "Captured",
          responsibility: "Automated",
          systemsInvolved: [],
          notifications: [],
          nextStepIds: [],
          taskIds: [],
        },
      ],
      branches: [],
    };
    buildBlueprintFromChatMock.mockResolvedValue({
      blueprint: sampleBlueprint,
      tasks: [],
      chatResponse: "Got it.",
      followUpQuestion: undefined,
    });
    applyStepNumbersMock.mockImplementation((blueprint) => blueprint);
    returningMock.mockResolvedValue([
      {
        id: "version-1",
        automationId: "auto-1",
        blueprintJson: sampleBlueprint,
      },
    ]);
    updateMock.mockReturnValue({ set: setMock });
    setMock.mockReturnValue({ where: whereMock });
    whereMock.mockReturnValue({ returning: returningMock });
    createCopilotMessageMock.mockImplementation(async (params: any) => ({
      id: "assistant-message",
      tenantId: params.tenantId,
      automationVersionId: params.automationVersionId,
      role: params.role,
      content: params.content,
      createdBy: params.createdBy ?? null,
      createdAt: new Date().toISOString(),
    }));
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
    expect(buildBlueprintFromChatMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userMessage: expect.stringContaining("invoices"),
      })
    );
    expect(createCopilotMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "assistant",
        automationVersionId: "version-1",
      })
    );
    expect(payload.message).toMatchObject({
      role: "assistant",
      content: "Got it.",
    });
    expect(updateMock).toHaveBeenCalled();
    expect(returningMock).toHaveBeenCalled();
    expect(revalidatePathMock).toHaveBeenCalledWith("/automations/auto-1");
    expect(logAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "automation.blueprint.drafted",
        resourceId: "version-1",
        metadata: expect.objectContaining({
          source: "copilot",
          summary: expect.any(Array),
          diff: expect.objectContaining({
            summary: expect.any(Array),
          }),
        }),
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
    expect(buildBlueprintFromChatMock).not.toHaveBeenCalled();
  });

  it("executes direct commands locally", async () => {
    getDetailMock.mockResolvedValue({
      version: {
        id: "version-1",
        tenantId: "tenant-1",
        automationId: "auto-1",
        status: "IntakeInProgress",
        intakeNotes: "Sample intake",
        blueprintJson: {
          ...createEmptyBlueprint(),
          steps: [
            {
              id: "step-1",
              stepNumber: "1",
              type: "Trigger",
              name: "Start",
              description: "Start",
              summary: "Start",
              goalOutcome: "Start",
              responsibility: "Automated",
              systemsInvolved: [],
              notifications: [],
              nextStepIds: [],
              taskIds: [],
            },
          ],
        },
        updatedAt: new Date().toISOString(),
      },
      automation: { id: "auto-1", name: "Invoice Automation", description: "desc" },
      project: null,
      latestQuote: null,
    });

    const { POST } = await import("@/app/api/automation-versions/[id]/copilot/draft-blueprint/route");
    const request = new Request("http://localhost/api/automation-versions/version-1/copilot/draft-blueprint", {
      method: "POST",
      body: JSON.stringify({
        messages: [{ role: "user", content: "delete step 1" }],
      }),
    });

    const response = await POST(request, { params: { id: "version-1" } });
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.commandExecuted).toBe(true);
    expect(payload.message.content).toContain("Deleted step 1");
    expect(buildBlueprintFromChatMock).not.toHaveBeenCalled();
    expect(createCopilotMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        automationVersionId: "version-1",
        content: expect.stringContaining("Deleted step 1"),
      })
    );
    expect(logAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "automation.blueprint.step.deleted",
        resourceId: "version-1",
      })
    );
  });
});


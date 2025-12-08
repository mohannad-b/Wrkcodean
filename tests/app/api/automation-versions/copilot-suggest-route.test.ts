import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyBlueprint } from "@/lib/blueprint/factory";

const canMock = vi.fn();
const logAuditMock = vi.fn();
const requireTenantSessionMock = vi.fn();
const getDetailMock = vi.fn();
const buildBlueprintFromChatMock = vi.fn();
const syncAutomationTasksMock = vi.fn();
const revalidatePathMock = vi.fn();
const createCopilotMessageMock = vi.fn();
const listCopilotMessagesMock = vi.fn();
const determineConversationPhaseMock = vi.fn();
const generateThinkingStepsMock = vi.fn();
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

vi.mock("@/lib/services/copilot-messages", () => ({
  listCopilotMessages: listCopilotMessagesMock,
  createCopilotMessage: createCopilotMessageMock,
}));

vi.mock("@/lib/blueprint/ai-builder", () => ({
  buildBlueprintFromChat: buildBlueprintFromChatMock,
}));

vi.mock("@/lib/blueprint/task-sync", () => ({
  syncAutomationTasks: syncAutomationTasksMock,
}));

vi.mock("@/lib/ai/copilot-orchestrator", () => ({
  determineConversationPhase: determineConversationPhaseMock,
  generateThinkingSteps: generateThinkingStepsMock,
}));

vi.mock("@/lib/audit/log", () => ({
  logAudit: logAuditMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("@/db", () => ({
  db: {
    update: updateMock,
  },
}));

describe("POST /api/automation-versions/[id]/copilot/suggest-next-steps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireTenantSessionMock.mockResolvedValue({ userId: "user-1", tenantId: "tenant-1", roles: ["client_admin"] });
    canMock.mockReturnValue(true);
    const blueprint = createEmptyBlueprint();
    getDetailMock.mockResolvedValue({
      version: {
        id: "version-1",
        tenantId: "tenant-1",
        automationId: "auto-1",
        status: "Draft",
        intakeNotes: "",
        blueprintJson: blueprint,
        updatedAt: new Date().toISOString(),
      },
      automation: { id: "auto-1", name: "Invoice Automation" },
    });
    listCopilotMessagesMock.mockResolvedValue([]);
    buildBlueprintFromChatMock.mockResolvedValue({
      blueprint,
      tasks: [],
      chatResponse: "Here are the next steps.",
      followUpQuestion: undefined,
    });
    syncAutomationTasksMock.mockResolvedValue({});
    returningMock.mockResolvedValue([{ automationId: "auto-1" }]);
    createCopilotMessageMock.mockResolvedValue({
      id: "assistant-message",
      role: "assistant",
      content: "Here are the next steps.",
    });
    determineConversationPhaseMock.mockReturnValue("flow");
    generateThinkingStepsMock.mockReturnValue([]);
  });

  it("persists AI suggestions without user input", async () => {
    const { POST } = await import(
      "@/app/api/automation-versions/[id]/copilot/suggest-next-steps/route"
    );
    const request = new Request(
      "http://localhost/api/automation-versions/version-1/copilot/suggest-next-steps",
      {
        method: "POST",
      }
    );

    const response = await POST(request, { params: { id: "version-1" } });
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain('"status":"complete"');
    expect(buildBlueprintFromChatMock).toHaveBeenCalled();
    expect(createCopilotMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({ automationVersionId: "version-1" })
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/automations/auto-1");
    expect(logAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "automation.blueprint.suggested",
        resourceId: "version-1",
      })
    );
  });
});


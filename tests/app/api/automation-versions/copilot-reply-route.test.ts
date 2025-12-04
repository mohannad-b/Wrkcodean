import { describe, it, expect, beforeEach, vi } from "vitest";

const canMock = vi.fn();
const listMessagesMock = vi.fn();
const createMessageMock = vi.fn();
const requireTenantSessionMock = vi.fn();
const runOrchestratorMock = vi.fn();
const getVersionDetailMock = vi.fn();

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

vi.mock("@/lib/services/copilot-messages", () => ({
  listCopilotMessages: listMessagesMock,
  createCopilotMessage: createMessageMock,
}));

vi.mock("@/lib/ai/openai-client", () => ({
  OpenAIError: class extends Error {},
}));

vi.mock("@/lib/ai/copilot-orchestrator", () => ({
  runCopilotOrchestration: runOrchestratorMock,
}));

vi.mock("@/lib/services/automations", () => ({
  getAutomationVersionDetail: getVersionDetailMock,
}));

describe("copilot reply route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireTenantSessionMock.mockResolvedValue({ userId: "user-1", tenantId: "tenant-1", roles: [] });
    canMock.mockReturnValue(true);
    listMessagesMock.mockResolvedValue([
      { id: "msg-1", role: "user", content: "Hello", createdAt: new Date().toISOString() },
    ]);
    runOrchestratorMock.mockResolvedValue({
      assistantDisplayText: "Here's what happens next…",
      blueprintUpdates: { summary: "Sync invoices", steps: [{ id: "step_1" }] },
      thinkingSteps: [{ id: "thinking-1", label: "Mapping the flow" }],
      conversationPhase: "flow",
    });
    createMessageMock.mockImplementation(async (payload) => ({
      id: "msg-2",
      role: payload.role,
      content: payload.content,
      createdAt: new Date().toISOString(),
    }));
    getVersionDetailMock.mockResolvedValue({
      version: { id: "version-1", status: "IntakeInProgress" } as any,
      automation: { id: "auto-1", name: "Lead Router" } as any,
      project: null,
      latestQuote: null,
    });
  });

  it("calls orchestrator and returns blueprint updates", async () => {
    const { POST } = await import("@/app/api/automation-versions/[id]/copilot/reply/route");
    const response = await POST(new Request("http://localhost/api/automation-versions/version-1/copilot/reply"), {
      params: { id: "version-1" },
    });

    expect(response.status).toBe(200);
    expect(runOrchestratorMock).toHaveBeenCalledWith({
      blueprint: expect.any(Object),
      messages: [
        expect.objectContaining({
          role: "user",
          content: "Hello",
        }),
      ],
      automationName: "Lead Router",
    });

    expect(createMessageMock).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      automationVersionId: "version-1",
      role: "assistant",
      content: "Here's what happens next…",
      createdBy: null,
    });

    const payload = await response.json();
    expect(payload.message.content).toBe("Here's what happens next…");
    expect(payload.blueprintUpdates).toEqual({ summary: "Sync invoices", steps: [{ id: "step_1" }] });
    expect(payload.conversationPhase).toBe("flow");
    expect(payload.thinkingSteps).toEqual([{ id: "thinking-1", label: "Mapping the flow" }]);
  });

  it("returns a friendly message when the latest user input is too long", async () => {
    listMessagesMock.mockResolvedValue([
      { id: "msg-1", role: "user", content: "x".repeat(4001), createdAt: new Date().toISOString() },
    ]);
    createMessageMock.mockResolvedValue({
      id: "msg-2",
      role: "assistant",
      content:
        "This is a bit too long to handle in one go. Can you summarize the key steps of the workflow you want to automate?",
      createdAt: new Date().toISOString(),
    });

    const { POST } = await import("@/app/api/automation-versions/[id]/copilot/reply/route");
    const response = await POST(new Request("http://localhost/api/automation-versions/version-1/copilot/reply"), {
      params: { id: "version-1" },
    });

    expect(response.status).toBe(200);
    expect(runOrchestratorMock).not.toHaveBeenCalled();
    const payload = await response.json();
    expect(payload.conversationPhase).toBe("discovery");
    expect(payload.blueprintUpdates).toBeNull();
    expect(payload.thinkingSteps).toEqual([]);
  });
});


import { describe, it, expect, beforeEach, vi } from "vitest";

const canMock = vi.fn();
const listMessagesMock = vi.fn();
const createMessageMock = vi.fn();
const requireTenantSessionMock = vi.fn();
const generateReplyMock = vi.fn();
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
  generateCopilotReply: generateReplyMock,
  OpenAIError: class extends Error {},
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
    generateReplyMock.mockResolvedValue(
      [
        "- Summary of the automation idea.",
        "",
        "```json blueprint_updates",
        '{"steps":[{"id":"step_1"}],"assumptions":["Example assumption"]}',
        "```",
        "",
        "What volume do you see each week?",
      ].join("\n")
    );
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

  it("calls OpenAI and persists assistant response", async () => {
    const { POST } = await import("@/app/api/automation-versions/[id]/copilot/reply/route");
    const response = await POST(new Request("http://localhost/api/automation-versions/version-1/copilot/reply"), {
      params: { id: "version-1" },
    });

    expect(response.status).toBe(200);
    expect(getVersionDetailMock).toHaveBeenCalledWith("tenant-1", "version-1");
    expect(listMessagesMock).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      automationVersionId: "version-1",
    });
    expect(generateReplyMock).toHaveBeenCalledWith({
      dbMessages: [
        expect.objectContaining({
          role: "user",
          content: "Hello",
        }),
      ],
      automationName: "Lead Router",
      automationStatus: "Intake in Progress",
    });
    expect(createMessageMock).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      automationVersionId: "version-1",
      role: "assistant",
      content: "- Summary of the automation idea.\n\nWhat volume do you see each week?",
      createdBy: null,
    });

    const payload = await response.json();
    expect(payload.message.content).toBe("- Summary of the automation idea.\n\nWhat volume do you see each week?");
    expect(payload.blueprintUpdates).toEqual({
      steps: [{ id: "step_1" }],
      assumptions: ["Example assumption"],
    });
  });

  it("short circuits when the user message is too long", async () => {
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
    expect(generateReplyMock).not.toHaveBeenCalled();
    expect(createMessageMock).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      automationVersionId: "version-1",
      role: "assistant",
      content:
        "This is a bit too long to handle in one go. Can you summarize the key steps of the workflow you want to automate?",
      createdBy: null,
    });
    const payload = await response.json();
    expect(payload.message.content).toBe(
      "This is a bit too long to handle in one go. Can you summarize the key steps of the workflow you want to automate?"
    );
    expect(payload.blueprintUpdates).toBeNull();
  });

  it("gracefully handles malformed blueprint blocks", async () => {
    generateReplyMock.mockResolvedValueOnce(
      ["- Draft", "", "```json blueprint_updates", "{not valid json", "```", "", "Next steps?"].join("\n")
    );

    const { POST } = await import("@/app/api/automation-versions/[id]/copilot/reply/route");
    const response = await POST(new Request("http://localhost/api/automation-versions/version-1/copilot/reply"), {
      params: { id: "version-1" },
    });

    expect(response.status).toBe(200);
    expect(createMessageMock).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      automationVersionId: "version-1",
      role: "assistant",
      content: "- Draft\n\nNext steps?",
      createdBy: null,
    });
    const payload = await response.json();
    expect(payload.message.content).toBe("- Draft\n\nNext steps?");
    expect(payload.blueprintUpdates).toBeNull();
  });
});


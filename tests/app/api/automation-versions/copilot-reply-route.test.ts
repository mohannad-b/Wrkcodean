import { describe, it, expect, beforeEach, vi } from "vitest";

const canMock = vi.fn();
const listMessagesMock = vi.fn();
const createMessageMock = vi.fn();
const requireTenantSessionMock = vi.fn();
const generateReplyMock = vi.fn();

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

describe("copilot reply route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireTenantSessionMock.mockResolvedValue({ userId: "user-1", tenantId: "tenant-1", roles: [] });
    canMock.mockReturnValue(true);
    listMessagesMock.mockResolvedValue([
      { id: "msg-1", role: "user", content: "Hello", createdAt: new Date().toISOString() },
    ]);
    generateReplyMock.mockResolvedValue("Assistant reply");
    createMessageMock.mockResolvedValue({
      id: "msg-2",
      role: "assistant",
      content: "Assistant reply",
      createdAt: new Date().toISOString(),
    });
  });

  it("calls OpenAI and persists assistant response", async () => {
    const { POST } = await import("@/app/api/automation-versions/[id]/copilot/reply/route");
    const response = await POST(new Request("http://localhost/api/automation-versions/version-1/copilot/reply"), {
      params: { id: "version-1" },
    });

    expect(response.status).toBe(200);
    expect(listMessagesMock).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      automationVersionId: "version-1",
    });
    expect(generateReplyMock).toHaveBeenCalled();
    expect(createMessageMock).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      automationVersionId: "version-1",
      role: "assistant",
      content: "Assistant reply",
      createdBy: null,
    });

    const payload = await response.json();
    expect(payload.message.content).toBe("Assistant reply");
  });
});


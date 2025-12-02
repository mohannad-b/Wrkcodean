import { describe, it, expect, beforeEach, vi } from "vitest";

const canMock = vi.fn();
const listMessagesMock = vi.fn();
const createMessageMock = vi.fn();
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

vi.mock("@/lib/services/copilot-messages", () => ({
  listCopilotMessages: listMessagesMock,
  createCopilotMessage: createMessageMock,
}));

describe("automation-version messages route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireTenantSessionMock.mockResolvedValue({ userId: "user-1", tenantId: "tenant-1", roles: [] });
    canMock.mockReturnValue(true);
    listMessagesMock.mockResolvedValue([{ id: "msg-1", role: "assistant", content: "hi", createdAt: new Date().toISOString() }]);
    createMessageMock.mockResolvedValue({
      id: "msg-2",
      role: "user",
      content: "hello",
      createdAt: new Date().toISOString(),
    });
  });

  it("returns persisted messages for GET", async () => {
    const { GET } = await import("@/app/api/automation-versions/[id]/messages/route");
    const response = await GET(new Request("http://localhost/api/automation-versions/version-1/messages"), {
      params: { id: "version-1" },
    });
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.messages).toHaveLength(1);
    expect(listMessagesMock).toHaveBeenCalledWith({ tenantId: "tenant-1", automationVersionId: "version-1" });
  });

  it("creates a new message on POST", async () => {
    const { POST } = await import("@/app/api/automation-versions/[id]/messages/route");
    const request = new Request("http://localhost/api/automation-versions/version-1/messages", {
      method: "POST",
      body: JSON.stringify({ content: "Need help", role: "user" }),
    });

    const response = await POST(request, { params: { id: "version-1" } });
    expect(response.status).toBe(200);
    expect(createMessageMock).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      automationVersionId: "version-1",
      role: "user",
      content: "Need help",
      createdBy: "user-1",
    });
    const payload = await response.json();
    expect(payload.message.id).toBe("msg-2");
  });
});


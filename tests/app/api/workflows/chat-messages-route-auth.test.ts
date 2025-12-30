import { beforeEach, describe, expect, it, vi } from "vitest";

const requireEitherTenantOrStaffSessionMock = vi.fn();
const authorizeMock = vi.fn();
const findFirstMock = vi.fn();
const createMessageMock = vi.fn();
const getOrCreateConversationMock = vi.fn();
const getUnreadCountMock = vi.fn();
const findReceiptMock = vi.fn();

vi.mock("@/lib/api/context", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/context")>("@/lib/api/context");
  return {
    ...actual,
    requireEitherTenantOrStaffSession: requireEitherTenantOrStaffSessionMock,
  };
});

vi.mock("@/lib/auth/rbac", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/rbac")>("@/lib/auth/rbac");
  return {
    ...actual,
    authorize: authorizeMock,
  };
});

vi.mock("@/lib/services/workflow-chat", () => ({
  createMessage: createMessageMock,
  listMessages: vi.fn(),
  getOrCreateConversation: getOrCreateConversationMock,
  getUnreadCount: getUnreadCountMock,
}));

vi.mock("@/db", () => ({
  db: {
    query: {
      automationVersions: { findFirst: findFirstMock },
      workflowReadReceipts: { findFirst: findReceiptMock },
    },
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/db/schema", () => ({
  automationVersions: { id: "id", tenantId: "tenantId" },
  users: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: (...args: unknown[]) => ({ eq: args }),
  and: (...args: unknown[]) => ({ and: args }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  requireEitherTenantOrStaffSessionMock.mockResolvedValue({
    kind: "tenant",
    tenantId: "tenant-1",
    userId: "user-1",
    roles: ["viewer"],
    wrkStaffRole: null,
  });
  findFirstMock.mockResolvedValue({ id: "wf-1", tenantId: "tenant-1" });
  getUnreadCountMock.mockResolvedValue(0);
  findReceiptMock.mockResolvedValue(null);
});

describe("POST /api/workflows/[workflowId]/chat/messages", () => {
  it("denies viewers from posting messages", async () => {
    const { AuthorizationError } = await vi.importActual<typeof import("@/lib/auth/rbac")>("@/lib/auth/rbac");
    authorizeMock.mockImplementation(() => {
      throw new AuthorizationError({
        message: "forbidden",
        action: "workflow:chat:write",
        subject: { userId: "user-1", tenantId: "tenant-1" },
      });
    });

    const { POST } = await import("@/app/api/workflows/[workflowId]/chat/messages/route");
    const response = await POST(
      new Request("http://localhost/api/workflows/wf-1/chat/messages", {
        method: "POST",
        body: JSON.stringify({ body: "hello" }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: { workflowId: "wf-1" } }
    );

    expect(response.status).toBe(403);
    expect(createMessageMock).not.toHaveBeenCalled();
  });
});


import { beforeEach, describe, expect, it, vi } from "vitest";

const requireEitherTenantOrStaffSessionMock = vi.fn();
const authorizeMock = vi.fn();
const findFirstMock = vi.fn();
const createMessageMock = vi.fn();
const getOrCreateConversationMock = vi.fn();
const getUnreadCountMock = vi.fn();
const findReceiptMock = vi.fn();

class MockAuthorizationError extends Error {
  status: number;
  code: "FORBIDDEN" | "UNAUTHORIZED" | "CONTEXT_REQUIRED";
  action: string;
  context?: unknown;
  subject: { userId: string; tenantId: string | null; wrkStaffRole?: string | null };

  constructor(params: {
    message: string;
    status?: number;
    code?: "FORBIDDEN" | "UNAUTHORIZED" | "CONTEXT_REQUIRED";
    action: string;
    context?: unknown;
    subject: { userId: string; tenantId: string | null; wrkStaffRole?: string | null };
  }) {
    super(params.message);
    this.status = params.status ?? 403;
    this.code = params.code ?? "FORBIDDEN";
    this.action = params.action;
    this.context = params.context;
    this.subject = params.subject;
  }
}

vi.mock("@/lib/api/context", () => ({
  requireEitherTenantOrStaffSession: requireEitherTenantOrStaffSessionMock,
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
  handleApiError: (error: unknown) => {
    if (error instanceof MockAuthorizationError) {
      return new Response(
        JSON.stringify({ error: error.message, code: error.code, action: error.action }),
        { status: error.status }
      );
    }
    const status = (error as any)?.status ?? 500;
    const message = (error as any)?.message ?? "Unexpected error.";
    return new Response(JSON.stringify({ error: message }), { status });
  },
}));

vi.mock("@/lib/auth/rbac", () => ({
  AuthorizationError: MockAuthorizationError,
  authorize: authorizeMock,
  can: () => true,
}));

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
    authorizeMock.mockImplementation(() => {
      throw new MockAuthorizationError({
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


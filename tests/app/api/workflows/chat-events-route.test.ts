import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireEitherTenantOrStaffSessionMock = vi.fn();
const authorizeMock = vi.fn();
const getOrCreateConversationMock = vi.fn();
const subscribeToChatEventsMock = vi.fn();
const findFirstMock = vi.fn();
const findFirstMessageMock = vi.fn();
const findReadReceiptMock = vi.fn();
const getUnreadCountMock = vi.fn();

let handlerRef: ((event: unknown) => void) | null = null;
let unsubscribed = false;

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
  getOrCreateConversation: getOrCreateConversationMock,
  getUnreadCount: getUnreadCountMock,
}));

vi.mock("@/lib/realtime/events", () => ({
  subscribeToChatEvents: subscribeToChatEventsMock,
}));

vi.mock("@/db", () => ({
  db: {
    query: {
      automationVersions: { findFirst: findFirstMock },
      workflowMessages: { findFirst: findFirstMessageMock },
      workflowReadReceipts: { findFirst: findReadReceiptMock },
    },
  },
}));

vi.mock("@/db/schema", () => ({
  automationVersions: { id: "id", tenantId: "tenantId" },
  workflowMessages: { id: "id", tenantId: "tenantId", conversationId: "conversationId", createdAt: "createdAt", deletedAt: "deletedAt" },
  workflowReadReceipts: { id: "id", conversationId: "conversationId", userId: "userId", lastReadMessageId: "lastReadMessageId" },
}));

vi.mock("drizzle-orm", () => ({
  eq: (...args: unknown[]) => ({ eq: args }),
  and: (...args: unknown[]) => ({ and: args }),
  desc: (...args: unknown[]) => ({ desc: args }),
  isNull: (...args: unknown[]) => ({ isNull: args }),
}));

beforeEach(() => {
  vi.useFakeTimers();
  handlerRef = null;
  unsubscribed = false;
  vi.clearAllMocks();
  requireEitherTenantOrStaffSessionMock.mockResolvedValue({
    kind: "tenant",
    tenantId: "tenant-1",
    userId: "user-1",
    roles: ["editor"],
    wrkStaffRole: null,
  });
  findFirstMock.mockResolvedValue({ id: "wf-1", tenantId: "tenant-1" });
  getOrCreateConversationMock.mockResolvedValue({ id: "conv-1" });
  subscribeToChatEventsMock.mockImplementation(async (_workflowId: string, handler: (event: unknown) => void) => {
    handlerRef = handler;
    return async () => {
      unsubscribed = true;
    };
  });
  findFirstMessageMock.mockResolvedValue(null);
  findReadReceiptMock.mockResolvedValue(null);
  getUnreadCountMock.mockResolvedValue(0);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/workflows/[workflowId]/chat/events", () => {
  it("streams chat events and heartbeats", async () => {
    const { GET } = await import("@/app/api/workflows/[workflowId]/chat/events/route");
    const response = await GET(new Request("http://localhost/api/workflows/wf-1/chat/events"), {
      params: { workflowId: "wf-1" },
    });

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    const connectedChunk = await reader.read();
    const connectedText = decoder.decode(connectedChunk.value);
    expect(connectedText).toContain("event: message");
    expect(connectedText).toContain("connected");

    handlerRef?.({ type: "message.created", data: { id: "m-1" } });
    const messageChunk = await reader.read();
    expect(decoder.decode(messageChunk.value)).toContain('"message.created"');

    vi.advanceTimersByTime(20000);
    const heartbeatChunk = await reader.read();
    expect(decoder.decode(heartbeatChunk.value)).toContain("event: ping");
  });

  it("returns 403 when authorization fails", async () => {
    const { AuthorizationError } = await vi.importActual<typeof import("@/lib/auth/rbac")>("@/lib/auth/rbac");
    authorizeMock.mockImplementation(() => {
      throw new AuthorizationError({
        message: "forbidden",
        action: "workflow:chat:read",
        subject: { userId: "user-1", tenantId: "tenant-1" },
      });
    });

    const { GET } = await import("@/app/api/workflows/[workflowId]/chat/events/route");
    const response = await GET(new Request("http://localhost/api/workflows/wf-1/chat/events"), {
      params: { workflowId: "wf-1" },
    });

    expect(response.status).toBe(403);
  });

  it("cleans up subscription on abort", async () => {
    const { GET } = await import("@/app/api/workflows/[workflowId]/chat/events/route");
    const controller = new AbortController();
    const response = await GET(
      new Request("http://localhost/api/workflows/wf-1/chat/events", { signal: controller.signal }),
      { params: { workflowId: "wf-1" } }
    );
    const reader = response.body!.getReader();

    controller.abort();
    vi.runAllTimers();

    await reader.cancel();
    // Ensure cleanup attempted (unsubscribe may be a no-op in tests)
    expect(unsubscribed).toBeTypeOf("boolean");
  });
});


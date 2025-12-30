import { beforeEach, describe, expect, it, vi } from "vitest";

const publishMock = vi.fn();
const subscribeMock = vi.fn();
const unsubscribeMock = vi.fn();
const onMock = vi.fn();

vi.mock("ioredis", () => {
  const RedisMock = vi.fn().mockImplementation(() => ({
    publish: publishMock,
    subscribe: subscribeMock,
    unsubscribe: unsubscribeMock,
    on: onMock,
  }));
  return { default: RedisMock };
});

describe("redis bus", () => {
  beforeEach(() => {
    vi.resetModules();
    publishMock.mockReset();
    subscribeMock.mockReset();
    unsubscribeMock.mockReset();
    onMock.mockReset();
    process.env.REDIS_URL = "redis://localhost:6379";
  });

  it("publishes serialized chat event envelopes", async () => {
    const { publishChatEvent } = await import("@/lib/realtime/events");

    const envelope = await publishChatEvent({
      type: "message.created",
      conversationId: "conv-1",
      workflowId: "wf-1",
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      messageId: "msg-1",
      data: { messageId: "msg-1" },
    });

    expect(publishMock).toHaveBeenCalledTimes(1);
    const [channel, payload] = publishMock.mock.calls[0] ?? [];
    expect(channel).toBe("chat:workflow:wf-1");
    const parsed = JSON.parse(payload);
    expect(parsed.eventId).toBeDefined();
    expect(parsed.messageId).toBe("msg-1");
    expect(parsed.data).toEqual({ messageId: "msg-1" });
    expect(envelope?.workflowId).toBe("wf-1");
  });

  it("dispatches subscribed messages and unsubscribes cleanly", async () => {
    let messageHandler: ((channel: string, payload: string) => void) | null = null;
    onMock.mockImplementation((event: string, handler: (channel: string, payload: string) => void) => {
      if (event === "message") {
        messageHandler = handler;
      }
    });
    subscribeMock.mockResolvedValue(1);
    unsubscribeMock.mockResolvedValue(0);

    const { subscribeToChatEvents } = await import("@/lib/realtime/events");
    const received: unknown[] = [];
    const unsubscribe = await subscribeToChatEvents("wf-2", (payload) => received.push(payload));

    expect(subscribeMock).toHaveBeenCalledWith("chat:workflow:wf-2");

    messageHandler?.("chat:workflow:wf-2", JSON.stringify({ type: "message.created", data: { id: "m-1" } }));

    expect(received).toHaveLength(1);
    expect((received[0] as any).type).toBe("message.created");

    await unsubscribe();
    expect(unsubscribeMock).toHaveBeenCalledWith("chat:workflow:wf-2");
  });
});


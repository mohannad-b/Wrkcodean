import { randomUUID } from "crypto";
import { redisPublish, redisSubscribe } from "./redis-bus";
import type { ChatActor, ChatEvent, ChatEventType } from "./chat-contract";
import { logger } from "@/lib/logger";

export const CHAT_CHANNEL_PREFIX = "chat:workflow:";

export type { ChatEvent, ChatEventType, ChatActor } from "./chat-contract";

const workflowChannel = (workflowId: string) => `${CHAT_CHANNEL_PREFIX}${workflowId}`;

export async function subscribeToChatEvents(
  workflowId: string,
  handler: (event: ChatEvent) => void
): Promise<() => Promise<void>> {
  return redisSubscribe(workflowChannel(workflowId), handler);
}

export async function publishChatEvent<TPayload = unknown>(params: {
  type: ChatEventType | string;
  conversationId: string;
  workflowId: string;
  tenantId: string;
  workspaceId?: string;
  messageId?: string;
  actor?: ChatActor;
  data: TPayload;
}): Promise<ChatEvent<TPayload> | undefined> {
  const envelope: ChatEvent<TPayload> = {
    eventId: randomUUID(),
    type: params.type,
    conversationId: params.conversationId,
    workflowId: params.workflowId,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    messageId: params.messageId,
    actor: params.actor,
    createdAt: new Date().toISOString(),
    payload: params.data,
    data: params.data,
  };

  try {
    await redisPublish(workflowChannel(params.workflowId), envelope);
    return envelope;
  } catch (error) {
    logger.error("Failed to publish chat event", error);
    return undefined;
  }
}

/**
 * Backwards-compatible helper for existing call sites.
 */
export async function emitChatEvent<TPayload = unknown>(
  params: Parameters<typeof publishChatEvent<TPayload>>[0]
): Promise<ChatEvent<TPayload> | undefined> {
  return publishChatEvent(params);
}


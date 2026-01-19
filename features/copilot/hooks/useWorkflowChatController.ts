import { useCallback, useEffect, useRef, useState } from "react";
import { logger } from "@/lib/logger";
import { createSseClient, normalizeWorkflowChatEvent } from "@/features/copilot/services/sseClient";
import {
  fetchWorkflowMessages,
  markWorkflowChatRead,
  sendWorkflowMessage,
} from "@/features/workflows/services/workflowChatApi";
import type { WorkflowMessage, WorkflowTypingState } from "@/features/copilot/ui/chat/types";
import type { WorkflowChatController, WorkflowChatOptions } from "./copilotChatTypes";
import { mergeWorkflowIncomingMessage } from "@/features/copilot/utils/workflowMessageMerge";
import { sendCopilotIngest } from "@/features/copilot/services/ingest";

const ingest = sendCopilotIngest;

export function useWorkflowChatController(options: WorkflowChatOptions): WorkflowChatController {
  const [workflowMessages, setWorkflowMessages] = useState<WorkflowMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Map<string, WorkflowTypingState>>(new Map());
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [lastReadMessageId, setLastReadMessageId] = useState<string | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [hasNewMessages, setHasNewMessages] = useState(false);

  const eventSourceRef = useRef<EventSource | null>(null);
  const typingTimeoutRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const optimisticMessagesRef = useRef<Map<string, WorkflowMessage>>(new Map());

  const handleScroll = useCallback(
    (scrollElement: HTMLDivElement | null) => {
      if (!scrollElement) return;
      const { scrollTop, scrollHeight, clientHeight } = scrollElement;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
      setIsAtBottom(isNearBottom);
      if (isNearBottom && hasNewMessages) {
        setHasNewMessages(false);
        const last = workflowMessages[workflowMessages.length - 1];
        if (last?.id && conversationId && last.id !== lastReadMessageId) {
          void markWorkflowChatRead(options.workflowId, last.id);
          setLastReadMessageId(last.id);
        }
      }
    },
    [hasNewMessages, workflowMessages, options.workflowId, conversationId, lastReadMessageId]
  );

  const markScrolledToBottom = useCallback(() => {
    setIsAtBottom(true);
    setHasNewMessages(false);
  }, []);

  const sendMessage = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isSending || options.disabled) return;

    const clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const optimisticMessage: WorkflowMessage = {
      id: clientId,
      conversationId: conversationId || "",
      tenantId: "",
      automationVersionId: options.workflowId,
      senderType: "client",
      senderUserId: options.profile?.id ?? null,
      body: trimmed,
      attachments: [],
      clientGeneratedId: clientId,
      editedAt: null,
      deletedAt: null,
      createdAt: new Date().toISOString(),
      sender: options.profile
        ? {
            id: options.profile.id,
            name: options.profile.name,
            email: options.profile.email,
            avatarUrl: options.profile.avatarUrl,
          }
        : undefined,
      optimistic: true,
      status: "sending",
    };

    setWorkflowMessages((prev) => [...prev, optimisticMessage]);
    optimisticMessagesRef.current.set(clientId, optimisticMessage);
    setInput("");
    setIsSending(true);
    setIsAtBottom(true);

    try {
      const response = await sendWorkflowMessage(options.workflowId, {
        body: trimmed,
        clientGeneratedId: clientId,
      });

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      const data = await response.json();
      const serverMessage = data.message as WorkflowMessage;

      setWorkflowMessages((prev) =>
        prev.map((msg) => (msg.clientGeneratedId === clientId ? { ...serverMessage, status: "sent" } : msg))
      );
      optimisticMessagesRef.current.delete(clientId);
      if (serverMessage.id && conversationId && serverMessage.id !== lastReadMessageId) {
        void markWorkflowChatRead(options.workflowId, serverMessage.id);
        setLastReadMessageId(serverMessage.id);
      }
    } catch (error) {
      logger.error("Failed to send message:", error);
      setWorkflowMessages((prev) =>
        prev.map((msg) => (msg.clientGeneratedId === clientId ? { ...msg, status: "failed" } : msg))
      );
    } finally {
      setIsSending(false);
    }
  }, [
    input,
    isSending,
    options.workflowId,
    options.disabled,
    options.profile,
    conversationId,
    lastReadMessageId,
  ]);

  const retryMessage = useCallback(
    async (message: WorkflowMessage) => {
      if (!message.clientGeneratedId) return;

      setWorkflowMessages((prev) => prev.map((msg) => (msg.id === message.id ? { ...msg, status: "sending" } : msg)));

      try {
        const response = await sendWorkflowMessage(options.workflowId, {
          body: message.body,
          clientGeneratedId: message.clientGeneratedId,
        });

        if (!response.ok) {
          throw new Error("Failed to send message");
        }

        const data = await response.json();
        const serverMessage = data.message as WorkflowMessage;

        setWorkflowMessages((prev) => prev.map((msg) => (msg.id === message.id ? { ...serverMessage, status: "sent" } : msg)));
        if (serverMessage.id && conversationId && serverMessage.id !== lastReadMessageId) {
          void markWorkflowChatRead(options.workflowId, serverMessage.id);
          setLastReadMessageId(serverMessage.id);
        }
      } catch (error) {
        logger.error("Failed to retry message:", error);
        setWorkflowMessages((prev) => prev.map((msg) => (msg.id === message.id ? { ...msg, status: "failed" } : msg)));
      }
    },
    [options.workflowId, conversationId, lastReadMessageId]
  );

  const fetchWorkflowHistory = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetchWorkflowMessages(options.workflowId);
      if (!response.ok) {
        throw new Error("Failed to fetch messages");
      }
      const data = await response.json();
      const reversedMessages = (data.messages || []).reverse();
      setWorkflowMessages(reversedMessages);
      setConversationId(data.conversationId);
      if (data.lastReadMessageId) {
        setLastReadMessageId(data.lastReadMessageId);
      }
      logger.debug("Fetched messages:", reversedMessages.length, reversedMessages);
    } catch (error) {
      logger.error("Failed to fetch messages:", error);
    } finally {
      setIsLoading(false);
    }
  }, [options.workflowId]);

  useEffect(() => {
    void fetchWorkflowHistory();
  }, [fetchWorkflowHistory]);

  useEffect(() => {
    if (workflowMessages.length > 0 && isAtBottom && conversationId) {
      const lastMessage = workflowMessages[workflowMessages.length - 1];
      if (lastMessage.id !== lastReadMessageId) {
        void markWorkflowChatRead(options.workflowId, lastMessage.id);
        setLastReadMessageId(lastMessage.id);
      }
    }
  }, [workflowMessages, isAtBottom, conversationId, lastReadMessageId, options.workflowId]);

  useEffect(() => {
    if (!options.workflowId || options.disabled) return;

    const eventSource = createSseClient(`/api/workflows/${options.workflowId}/chat/events`);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const data = normalizeWorkflowChatEvent(event);
        if (!data) return;
        const payload = (data.payload ?? data.data) as unknown;

        ingest({
          sessionId: "debug-session",
          runId: data.conversationId ?? options.workflowId,
          hypothesisId: "H-wfc-sse",
          location: "useCopilotChat:workflowSse",
          message: "workflow_chat.sse_event",
          data: {
            type: data.type,
            hasPayload: Boolean(payload),
            lastMessageId: data.lastMessageId ?? null,
            lastReadMessageId: data.lastReadMessageId ?? null,
            resyncRecommended: data.resyncRecommended ?? null,
          },
          timestamp: Date.now(),
        });

        if (data.type === "connected") {
          setConversationId(data.conversationId || null);
          if (data.resyncRecommended || data.lastMessageId) {
            void fetchWorkflowHistory();
          }
        } else if (data.type === "message.created") {
          const message = payload as WorkflowMessage;
          setWorkflowMessages((prev) => mergeWorkflowIncomingMessage(prev, message, optimisticMessagesRef.current));

          if (isAtBottom) {
            setTimeout(() => {
              if (conversationId && message.id !== lastReadMessageId) {
                void markWorkflowChatRead(options.workflowId, message.id);
                setLastReadMessageId(message.id);
              }
            }, 100);
          } else {
            setHasNewMessages(true);
          }
        } else if (data.type === "message.updated") {
          const message = payload as WorkflowMessage;
          setWorkflowMessages((prev) => prev.map((m) => (m.id === message.id ? message : m)));
        } else if (data.type === "message.deleted") {
          const { messageId, deletedAt } = (payload as { messageId: string; deletedAt?: string }) || {};
          if (!messageId) return;
          setWorkflowMessages((prev) =>
            prev.map((m) => (m.id === messageId ? { ...m, deletedAt: deletedAt || new Date().toISOString(), body: "" } : m))
          );
        } else if (data.type === "typing.started") {
          const typing = payload as WorkflowTypingState;
          setTypingUsers((prev) => {
            const next = new Map(prev);
            next.set(typing.userId, typing);
            return next;
          });

          const timeout = setTimeout(() => {
            setTypingUsers((prev) => {
              const next = new Map(prev);
              next.delete(typing.userId);
              return next;
            });
          }, 3000);
          typingTimeoutRef.current.set(typing.userId, timeout);
        } else if (data.type === "typing.stopped") {
          const { userId } = (payload as { userId: string }) || {};
          setTypingUsers((prev) => {
            const next = new Map(prev);
            next.delete(userId);
            return next;
          });
          const timeout = typingTimeoutRef.current.get(userId);
          if (timeout) {
            clearTimeout(timeout);
            typingTimeoutRef.current.delete(userId);
          }
        } else if (data.type === "read.updated") {
          const receipt = payload as { lastReadMessageId?: string };
          if (receipt?.lastReadMessageId) {
            setLastReadMessageId(receipt.lastReadMessageId);
          }
        } else {
          ingest({
            sessionId: "debug-session",
            runId: data.conversationId ?? options.workflowId,
            hypothesisId: "H-wfc-sse",
            location: "useCopilotChat:workflowSse",
            message: "workflow_chat.unknown_event",
            data: { type: data.type, payloadSnippet: payload ? JSON.stringify(payload).slice(0, 200) : null },
            timestamp: Date.now(),
          });
        }
      } catch (error) {
        logger.error("Error parsing SSE event:", error);
      }
    };

    eventSource.onerror = (error) => {
      logger.error("SSE error:", error);
      setTimeout(() => {
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
          eventSourceRef.current = null;
        }
      }, 5000);
    };

    return () => {
      eventSource.close();
      eventSourceRef.current = null;
    };
  }, [options.workflowId, options.disabled, isAtBottom, fetchWorkflowHistory]);

  return {
    mode: "workflow",
    messages: workflowMessages,
    input,
    setInput,
    isLoading,
    isSending,
    typingUsers,
    isAtBottom,
    hasNewMessages,
    handleScroll,
    markScrolledToBottom,
    sendMessage,
    retryMessage,
  };
}

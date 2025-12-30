"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Send, Paperclip, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useUserProfile } from "@/components/providers/user-profile-provider";
import { formatDistanceToNow } from "date-fns";

export type WorkflowMessage = {
  id: string;
  conversationId: string;
  tenantId: string;
  automationVersionId: string;
  senderType: "client" | "wrk" | "system";
  senderUserId: string | null;
  body: string;
  attachments: Array<{ fileId: string; filename: string; mimeType: string; sizeBytes: number; url?: string }>;
  clientGeneratedId?: string;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  sender?: {
    id: string;
    name: string | null;
    email: string;
    avatarUrl: string | null;
  };
  optimistic?: boolean;
  status?: "sending" | "sent" | "failed";
};

type TypingState = {
  userId: string;
  userName: string;
  timestamp: number;
};

type ChatEvent = {
  type: string;
  conversationId?: string;
  data?: unknown;
  payload?: unknown;
  timestamp?: string;
  lastMessageId?: string | null;
  lastReadMessageId?: string | null;
  unreadCount?: number;
  resyncRecommended?: boolean;
};

interface WorkflowChatProps {
  workflowId: string;
  disabled?: boolean;
}

export function WorkflowChat({ workflowId, disabled = false }: WorkflowChatProps) {
  const { profile } = useUserProfile();
  const [messages, setMessages] = useState<WorkflowMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Map<string, TypingState>>(new Map());
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [lastReadMessageId, setLastReadMessageId] = useState<string | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const typingTimeoutRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const optimisticMessagesRef = useRef<Map<string, WorkflowMessage>>(new Map());

  // Generate client ID for optimistic UI
  const generateClientId = useCallback(() => {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  // Mark conversation as read
  const markAsRead = useCallback(async (messageId: string) => {
    if (!conversationId || lastReadMessageId === messageId) return;

    try {
      await fetch(`/api/workflows/${workflowId}/chat/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lastReadMessageId: messageId }),
      });
      setLastReadMessageId(messageId);
    } catch (error) {
      console.error("Failed to mark as read:", error);
    }
  }, [workflowId, conversationId, lastReadMessageId]);

  // Fetch messages
  const fetchMessages = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/workflows/${workflowId}/chat/messages`);
      if (!response.ok) {
        throw new Error("Failed to fetch messages");
      }
      const data = await response.json();
      // Reverse messages to show oldest first (API returns newest first)
      const reversedMessages = (data.messages || []).reverse();
      setMessages(reversedMessages);
      setConversationId(data.conversationId);
      if (data.lastReadMessageId) {
        setLastReadMessageId(data.lastReadMessageId);
      }
      console.log("Fetched messages:", reversedMessages.length, reversedMessages);
    } catch (error) {
      console.error("Failed to fetch messages:", error);
    } finally {
      setIsLoading(false);
    }
  }, [workflowId]);

  // Send message
  const sendMessage = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isSending || disabled) return;

    const clientId = generateClientId();
    const optimisticMessage: WorkflowMessage = {
      id: clientId,
      conversationId: conversationId || "",
      tenantId: "",
      automationVersionId: workflowId,
      senderType: "client",
      senderUserId: profile?.id || null,
      body: trimmed,
      attachments: [],
      clientGeneratedId: clientId,
      editedAt: null,
      deletedAt: null,
      createdAt: new Date().toISOString(),
      sender: profile
        ? {
            id: profile.id,
            name: profile.name,
            email: profile.email,
            avatarUrl: profile.avatarUrl,
          }
        : undefined,
      optimistic: true,
      status: "sending",
    };

    // Add optimistic message
    setMessages((prev) => [...prev, optimisticMessage]);
    optimisticMessagesRef.current.set(clientId, optimisticMessage);
    setInput("");
    setIsSending(true);
    setIsAtBottom(true);

    try {
      const response = await fetch(`/api/workflows/${workflowId}/chat/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: trimmed,
          clientGeneratedId: clientId,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      const data = await response.json();
      const serverMessage = data.message as WorkflowMessage;

      // Replace optimistic message with server message
      setMessages((prev) =>
        prev.map((msg) =>
          msg.clientGeneratedId === clientId
            ? { ...serverMessage, status: "sent" }
            : msg
        )
      );
      optimisticMessagesRef.current.delete(clientId);

      // Mark as read
      markAsRead(serverMessage.id);
    } catch (error) {
      console.error("Failed to send message:", error);
      // Mark as failed
      setMessages((prev) =>
        prev.map((msg) =>
          msg.clientGeneratedId === clientId ? { ...msg, status: "failed" } : msg
        )
      );
    } finally {
      setIsSending(false);
    }
  }, [input, isSending, disabled, workflowId, conversationId, profile, generateClientId, markAsRead]);

  // Retry failed message
  const retryMessage = useCallback(
    async (message: WorkflowMessage) => {
      if (!message.clientGeneratedId) return;

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === message.id ? { ...msg, status: "sending" } : msg
        )
      );

      try {
        const response = await fetch(`/api/workflows/${workflowId}/chat/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            body: message.body,
            clientGeneratedId: message.clientGeneratedId,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to send message");
        }

        const data = await response.json();
        const serverMessage = data.message as WorkflowMessage;

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === message.id ? { ...serverMessage, status: "sent" } : msg
          )
        );
        markAsRead(serverMessage.id);
      } catch (error) {
        console.error("Failed to retry message:", error);
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === message.id ? { ...msg, status: "failed" } : msg
          )
        );
      }
    },
    [workflowId, markAsRead]
  );

  // Setup SSE connection
  useEffect(() => {
    if (!workflowId || disabled) return;

    const eventSource = new EventSource(`/api/workflows/${workflowId}/chat/events`);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const data: ChatEvent = JSON.parse(event.data);
        const payload = (data.payload ?? data.data) as unknown;

        if (data.type === "connected") {
          setConversationId(data.conversationId || null);
          // If server hints at resync, fetch fresh messages.
          if (data.resyncRecommended) {
            fetchMessages();
          } else if (data.lastMessageId) {
            // Ensure we have the latest messages without duplication.
            fetchMessages();
          }
        } else if (data.type === "message.created") {
          const message = payload as WorkflowMessage;
          setMessages((prev) => {
            // Deduplicate by checking if message already exists
            const exists = prev.some(
              (m) => m.id === message.id || m.clientGeneratedId === message.clientGeneratedId
            );
            if (exists) return prev;

            // Replace optimistic message if exists
            if (message.clientGeneratedId) {
              const optimistic = optimisticMessagesRef.current.get(message.clientGeneratedId);
              if (optimistic) {
                optimisticMessagesRef.current.delete(message.clientGeneratedId);
                return prev.map((m) =>
                  m.clientGeneratedId === message.clientGeneratedId ? { ...message, status: "sent" } : m
                );
              }
            }

            return [...prev, { ...message, status: "sent" }];
          });

          // Auto-scroll if at bottom
          if (isAtBottom) {
            setTimeout(() => {
              messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
              markAsRead(message.id);
            }, 100);
          } else {
            setHasNewMessages(true);
          }
        } else if (data.type === "message.updated") {
          const message = payload as WorkflowMessage;
          setMessages((prev) =>
            prev.map((m) => (m.id === message.id ? message : m))
          );
        } else if (data.type === "message.deleted") {
          const { messageId, deletedAt } = (payload as { messageId: string; deletedAt?: string }) || {};
          if (!messageId) return;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === messageId ? { ...m, deletedAt: deletedAt || new Date().toISOString(), body: "" } : m
            )
          );
        } else if (data.type === "typing.started") {
          const typing = payload as TypingState;
          setTypingUsers((prev) => {
            const next = new Map(prev);
            next.set(typing.userId, typing);
            return next;
          });

          // Auto-stop typing after 3 seconds
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
        }
      } catch (error) {
        console.error("Error parsing SSE event:", error);
      }
    };

    eventSource.onerror = (error) => {
      console.error("SSE error:", error);
      // Reconnect after delay
      setTimeout(() => {
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
          eventSourceRef.current = null;
        }
        // Will reconnect on next render
      }, 5000);
    };

    return () => {
      eventSource.close();
      eventSourceRef.current = null;
    };
  }, [workflowId, disabled, isAtBottom, markAsRead]);

  // Initial fetch
  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Mark last message as read when messages change and user is at bottom
  useEffect(() => {
    if (messages.length > 0 && isAtBottom && conversationId) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.id !== lastReadMessageId) {
        markAsRead(lastMessage.id);
      }
    }
  }, [messages, isAtBottom, conversationId, lastReadMessageId, markAsRead]);

  // Handle scroll
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
    setIsAtBottom(isNearBottom);

    if (isNearBottom && hasNewMessages) {
      setHasNewMessages(false);
      markAsRead(messages[messages.length - 1]?.id);
    }
  }, [hasNewMessages, messages, markAsRead]);

  // Scroll to bottom on new messages if at bottom
  useEffect(() => {
    if (isAtBottom && messages.length > 0) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }
  }, [messages.length, isAtBottom]);

  // Handle typing indicator
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInput(e.target.value);
      // Emit typing indicator (would need separate endpoint)
    },
    []
  );

  const formatTime = (iso: string) => {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  };

  const typingUsersList = Array.from(typingUsers.values()).filter(
    (t) => t.userId !== profile?.id
  );

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Messages */}
      <ScrollArea
        ref={scrollRef}
        className="flex-1 p-4"
        onScrollCapture={handleScroll}
      >
        <div className="space-y-4">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No messages yet. Start the conversation!
            </div>
          ) : (
            messages.map((message) => {
              if (message.deletedAt) return null;

              const isSystem = message.senderType === "system";
              const isOwn = message.senderUserId === profile?.id;
              const isWrk = message.senderType === "wrk";
              // Wrk team messages always appear on the left, client messages on right if from me
              const isRightAligned = !isWrk && isOwn;

              return (
                <div
                  key={message.id}
                  className={cn(
                    "flex gap-3",
                    isRightAligned && "flex-row-reverse",
                    isSystem && "justify-center"
                  )}
                >
                  {!isSystem && (
                    <Avatar className="w-8 h-8 shrink-0">
                      <AvatarImage src={message.sender?.avatarUrl || undefined} />
                      <AvatarFallback className={cn(
                        isWrk ? "bg-[#E43632] text-white" : "bg-gray-100 text-gray-600"
                      )}>
                        {message.sender?.name
                          ? message.sender.name
                              .split(" ")
                              .map((n) => n[0])
                              .join("")
                              .toUpperCase()
                              .slice(0, 2) || message.sender.email.charAt(0).toUpperCase()
                          : message.sender?.email
                          ? message.sender.email.charAt(0).toUpperCase()
                          : "?"}
                      </AvatarFallback>
                    </Avatar>
                  )}
                  <div
                    className={cn(
                      "flex flex-col gap-1 max-w-[70%]",
                      isSystem && "items-center max-w-full",
                      !isSystem && (isRightAligned ? "items-end" : "items-start")
                    )}
                  >
                    {!isSystem && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-gray-700">
                          {message.sender?.name || message.sender?.email || (isWrk ? "Wrk Team" : "Unknown")}
                        </span>
                        <span className="text-xs text-gray-500">
                          {formatTime(message.createdAt)}
                        </span>
                        <span
                          className={cn(
                            "text-[10px] px-2 py-0.5 rounded-full border",
                            isWrk ? "border-[#E43632] text-[#E43632]" : "border-gray-300 text-gray-500"
                          )}
                        >
                          {isWrk ? "Staff" : "Tenant"}
                        </span>
                        {message.editedAt && (
                          <span className="text-xs text-gray-400">(edited)</span>
                        )}
                      </div>
                    )}
                    <div
                      className={cn(
                        "rounded-2xl px-4 py-2 text-sm",
                        isSystem
                          ? "bg-gray-100 text-gray-600 text-center"
                          : isRightAligned
                          ? "bg-[#0A0A0A] text-white rounded-tr-none"
                          : "bg-gray-50 text-gray-800 rounded-tl-none border border-gray-100"
                      )}
                    >
                      {message.deletedAt ? (
                        <span className="text-gray-500 italic">Message deleted</span>
                      ) : (
                        message.body
                      )}
                      {message.attachments && message.attachments.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {message.attachments.map((att) => (
                            <a
                              key={att.fileId}
                              href={att.url || "#"}
                              className="text-xs text-blue-600 hover:underline"
                            >
                              📎 {att.filename}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                    {message.optimistic && (
                      <div className="flex items-center gap-1 text-xs text-gray-400">
                        {message.status === "sending" && (
                          <>
                            <Loader2 className="h-3 w-3 animate-spin" />
                            <span>Sending...</span>
                          </>
                        )}
                        {message.status === "failed" && (
                          <>
                            <AlertCircle className="h-3 w-3 text-red-500" />
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-auto p-0 text-xs"
                              onClick={() => retryMessage(message)}
                            >
                              Retry
                            </Button>
                          </>
                        )}
                        {message.status === "sent" && (
                          <CheckCircle2 className="h-3 w-3 text-green-500" />
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
          {typingUsersList.length > 0 && (
            <div className="flex gap-3">
              <Avatar className="w-8 h-8 shrink-0">
                <AvatarFallback className="bg-gray-200">?</AvatarFallback>
              </Avatar>
              <div className="bg-gray-50 rounded-2xl rounded-tl-none px-4 py-2">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
        {hasNewMessages && !isAtBottom && (
          <Button
            variant="outline"
            size="sm"
            className="fixed bottom-20 left-1/2 -translate-x-1/2"
            onClick={() => {
              setIsAtBottom(true);
              setHasNewMessages(false);
              messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            New messages
          </Button>
        )}
      </ScrollArea>

      {/* Input */}
      <div className="border-t border-gray-200 p-4">
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={handleInputChange}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Type a message..."
            disabled={disabled || isSending}
            className="min-h-[60px] resize-none"
          />
          <div className="flex flex-col gap-2">
            <Button
              variant="ghost"
              size="icon"
              disabled={disabled}
              title="Attach file"
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <Button
              onClick={sendMessage}
              disabled={!input.trim() || isSending || disabled}
              size="icon"
            >
              {isSending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}


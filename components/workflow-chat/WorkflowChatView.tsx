"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Send, Paperclip, MessageSquare, ShieldCheck, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useUserProfile } from "@/components/providers/user-profile-provider";
import type { WorkflowMessage } from "./WorkflowChat";
import { formatDistanceToNow } from "date-fns";
import { logger } from "@/lib/logger";

type TypingState = {
  userId: string;
  userName: string;
  timestamp: number;
};

type ChatEvent = {
  type: string;
  conversationId?: string;
  data?: unknown;
  timestamp?: string;
};

interface WorkflowChatViewProps {
  workflowId: string;
  workflowName?: string;
  disabled?: boolean;
}

export function WorkflowChatView({ workflowId, workflowName, disabled = false }: WorkflowChatViewProps) {
  const { profile } = useUserProfile();
  const [messages, setMessages] = useState<WorkflowMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Map<string, TypingState>>(new Map());
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const typingTimeoutRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const optimisticMessagesRef = useRef<Map<string, WorkflowMessage>>(new Map());
  const conversationIdRef = useRef<string | null>(null);

  // Generate client ID for optimistic UI
  const generateClientId = useCallback(() => {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }, []);

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
      conversationIdRef.current = data.conversationId;
    logger.debug("Fetched messages:", reversedMessages.length, reversedMessages);
    } catch (error) {
    logger.error("Failed to fetch messages:", error);
    } finally {
      setIsLoading(false);
    }
  }, [workflowId]);

  // Mark conversation as read
  const markAsRead = useCallback(async (messageId: string) => {
    if (!conversationId) return;

    try {
      await fetch(`/api/workflows/${workflowId}/chat/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lastReadMessageId: messageId }),
      });
    } catch (error) {
      logger.error("Failed to mark as read:", error);
    }
  }, [workflowId, conversationId]);

  // Send message
  const handleSend = useCallback(async () => {
    const trimmed = inputText.trim();
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
    setInputText("");
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
      markAsRead(serverMessage.id);
    } catch (error) {
      logger.error("Failed to send message:", error);
      // Mark as failed
      setMessages((prev) =>
        prev.map((msg) =>
          msg.clientGeneratedId === clientId ? { ...msg, status: "failed" } : msg
        )
      );
    } finally {
      setIsSending(false);
    }
  }, [inputText, isSending, disabled, workflowId, conversationId, profile, generateClientId, markAsRead]);

  // Setup SSE connection
  useEffect(() => {
    if (!workflowId || disabled) return;

    const eventSource = new EventSource(`/api/workflows/${workflowId}/chat/events`);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const data: ChatEvent = JSON.parse(event.data);

        if (data.type === "connected") {
          const newConversationId = data.conversationId || null;
          setConversationId(newConversationId);
          conversationIdRef.current = newConversationId;
        } else if (data.type === "message.created") {
          const message = data.data as WorkflowMessage;
          logger.debug("SSE message.created:", message);
          setMessages((prev) => {
            // Deduplicate
            const exists = prev.some(
              (m) => m.id === message.id || m.clientGeneratedId === message.clientGeneratedId
            );
            if (exists) {
              logger.debug("Message already exists, skipping:", message.id);
              return prev;
            }

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

            // Add new message at the end (since messages are oldest first after reverse)
            return [...prev, { ...message, status: "sent" }];
          });

          // Auto-scroll if at bottom
          if (isAtBottom) {
            setTimeout(() => {
              messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
              // Call markAsRead directly using ref to avoid dependency issues
              const currentConversationId = conversationIdRef.current;
              if (currentConversationId) {
                fetch(`/api/workflows/${workflowId}/chat/read`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ lastReadMessageId: message.id }),
                }).catch((error) => {
                  logger.error("Failed to mark as read:", error);
                });
              }
            }, 100);
          }
        } else if (data.type === "message.updated") {
          const message = data.data as WorkflowMessage;
          setMessages((prev) =>
            prev.map((m) => (m.id === message.id ? message : m))
          );
        } else if (data.type === "message.deleted") {
          const { messageId } = data.data as { messageId: string };
          setMessages((prev) => prev.filter((m) => m.id !== messageId));
        } else if (data.type === "typing.started") {
          const typing = data.data as TypingState;
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
          const { userId } = data.data as { userId: string };
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
  }, [workflowId, disabled, isAtBottom]);

  // Initial fetch
  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Handle scroll
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
    setIsAtBottom(isNearBottom);
  }, []);

  // Scroll to bottom on new messages if at bottom
  useEffect(() => {
    if (isAtBottom && messages.length > 0) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }
  }, [messages.length, isAtBottom]);

  const formatTime = (iso: string) => {
    try {
      return formatDistanceToNow(new Date(iso), { addSuffix: true });
    } catch {
      return iso;
    }
  };

  const typingUsersList = Array.from(typingUsers.values()).filter(
    (t) => t.userId !== profile?.id
  );

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-6 shrink-0">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-[#E43632]/10 text-[#E43632] rounded-lg">
                <MessageSquare size={20} />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-[#0A0A0A]">
                  {workflowName || "Workflow Chat"}
                </h1>
                <p className="text-sm text-gray-500">Direct line to your build team</p>
              </div>
            </div>
            <div className="flex -space-x-2">
              <Avatar className="w-8 h-8 border-2 border-white">
                <AvatarFallback className="bg-gray-900 text-white text-xs">
                  {profile?.name?.charAt(0) || "?"}
                </AvatarFallback>
              </Avatar>
              <Avatar className="w-8 h-8 border-2 border-white">
                <AvatarFallback className="bg-gray-200 text-gray-600 text-xs">
                  <ShieldCheck size={12} />
                </AvatarFallback>
              </Avatar>
            </div>
          </div>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full max-w-4xl mx-auto bg-white border-x border-gray-200 flex flex-col">
          {/* Message List */}
          <ScrollArea
            ref={scrollRef}
            className="flex-1 p-6"
            onScrollCapture={handleScroll}
          >
            <div className="space-y-6">
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No messages yet. Start the conversation!
                </div>
              ) : (
                messages.map((msg) => {
                  if (msg.deletedAt) return null;

                  if (msg.senderType === "system") {
                    return (
                      <div key={msg.id} className="flex items-center justify-center gap-2 my-4">
                        <div className="h-px bg-gray-100 flex-1" />
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50 px-2 py-1 rounded-full border border-gray-100">
                          {msg.body} • {formatTime(msg.createdAt)}
                        </span>
                        <div className="h-px bg-gray-100 flex-1" />
                      </div>
                    );
                  }

                  const isMe = msg.senderUserId === profile?.id;
                  const isWrk = msg.senderType === "wrk";
                  // Wrk team messages always appear on the left, client messages on right if from me
                  const isRightAligned = !isWrk && isMe;

                  return (
                    <div
                      key={msg.id}
                      className={cn("flex gap-3", isRightAligned ? "flex-row-reverse" : "flex-row")}
                    >
                      <Avatar className="w-8 h-8 border border-gray-100 shrink-0 mt-1">
                        <AvatarImage src={msg.sender?.avatarUrl || undefined} />
                        <AvatarFallback
                          className={cn(
                            "text-[10px] font-bold",
                            isWrk
                              ? "bg-[#E43632] text-white"
                              : isMe
                              ? "bg-gray-100 text-gray-600"
                              : "bg-gray-100 text-gray-600"
                          )}
                        >
                          {msg.sender?.name
                            ? msg.sender.name
                                .split(" ")
                                .map((n) => n[0])
                                .join("")
                                .toUpperCase()
                                .slice(0, 2) || msg.sender.email.charAt(0).toUpperCase()
                            : msg.sender?.email
                            ? msg.sender.email.charAt(0).toUpperCase()
                            : "?"}
                        </AvatarFallback>
                      </Avatar>

                      <div
                        className={cn(
                          "flex flex-col max-w-[80%]",
                          isRightAligned ? "items-end" : "items-start"
                        )}
                      >
                        <div className="flex items-center gap-2 mb-1 px-1">
                          <span className="text-[11px] font-bold text-gray-900">
                            {msg.sender?.name || msg.sender?.email || (isWrk ? "Wrk Team" : "Unknown")}
                          </span>
                          <span className="text-[10px] text-gray-400">{formatTime(msg.createdAt)}</span>
                          {msg.editedAt && (
                            <span className="text-[10px] text-gray-400">(edited)</span>
                          )}
                          {msg.optimistic && msg.status === "sending" && (
                            <Loader2 className="h-3 w-3 animate-spin text-gray-400" />
                          )}
                          {msg.optimistic && msg.status === "failed" && (
                            <AlertCircle className="h-3 w-3 text-red-500" />
                          )}
                        </div>

                        <div
                          className={cn(
                            "p-3 text-sm shadow-sm leading-relaxed",
                            isRightAligned
                              ? "bg-gray-100 text-gray-800 rounded-2xl rounded-tr-none"
                              : "bg-white border border-gray-200 text-gray-800 rounded-2xl rounded-tl-none"
                          )}
                        >
                          {msg.body}
                          {msg.attachments && msg.attachments.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-gray-200/50 space-y-1">
                              {msg.attachments.map((att) => (
                                <div
                                  key={att.fileId}
                                  className="flex items-center gap-2 text-xs bg-black/5 p-1.5 rounded"
                                >
                                  <Paperclip size={12} /> {att.filename}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              {typingUsersList.length > 0 && (
                <div className="flex gap-3">
                  <Avatar className="w-8 h-8 border border-gray-100 shrink-0 mt-1">
                    <AvatarFallback className="bg-gray-200 text-gray-600 text-[10px]">?</AvatarFallback>
                  </Avatar>
                  <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-none p-3">
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

            {/* Hint Text */}
            {messages.length > 0 && (
              <div className="mt-8 text-center">
                <p className="text-[10px] text-gray-400 max-w-[200px] mx-auto">
                  Use this chat to clarify requirements, ask questions, or request changes. WRK will
                  reply here.
                </p>
              </div>
            )}
          </ScrollArea>

          {/* Input Area */}
          <div className="p-4 border-t border-gray-100 bg-white z-10">
            <div className="relative flex items-end gap-2 bg-gray-50 border border-gray-200 rounded-xl p-2 focus-within:border-gray-300 focus-within:bg-white transition-colors">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-gray-400 hover:text-gray-600 shrink-0 mb-0.5"
                disabled={disabled}
                title="Attach file"
              >
                <Paperclip size={16} />
              </Button>

              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Type a message..."
                disabled={disabled || isSending}
                className="flex-1 bg-transparent border-none text-sm resize-none max-h-[100px] focus:ring-0 focus:outline-none py-2 px-0 placeholder:text-gray-400"
                rows={1}
                style={{ minHeight: "36px" }}
              />

              <Button
                size="icon"
                onClick={handleSend}
                disabled={!inputText.trim() || isSending || disabled}
                className={cn(
                  "h-8 w-8 shrink-0 mb-0.5 transition-all",
                  inputText.trim() && !isSending && !disabled
                    ? "bg-[#E43632] text-white hover:bg-[#C12E2A]"
                    : "bg-gray-200 text-gray-400"
                )}
              >
                {isSending ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Send size={14} />
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


"use client";

import React, { useMemo, useRef } from "react";
import { Send, Paperclip, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { MessageList } from "@/features/copilot/ui/MessageList";
import { Composer } from "@/features/copilot/ui/Composer";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useUserProfile } from "@/components/providers/user-profile-provider";
import { formatDistanceToNow } from "date-fns";
import { useCopilotChat } from "@/features/copilot/hooks/useCopilotChat";

interface WorkflowChatProps {
  workflowId: string;
  disabled?: boolean;
}

export function WorkflowChat({ workflowId, disabled = false }: WorkflowChatProps) {
  const { profile } = useUserProfile();
  const {
    messages,
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
  } = useCopilotChat({ mode: "workflow", workflowId, disabled, profile });

  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const typingUsersList = useMemo(() => Array.from(typingUsers.values()).filter((t) => t.userId !== profile?.id), [
    profile?.id,
    typingUsers,
  ]);

  const formatTime = (iso: string) => {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  };

  React.useEffect(() => {
    if (isAtBottom && messages.length > 0) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }
  }, [isAtBottom, messages.length]);

  return (
    <div className="flex flex-col h-full bg-white">
      <MessageList
        scrollRef={scrollRef}
        className="flex-1"
        contentClassName="space-y-4 p-4"
        onScrollCapture={() => handleScroll(scrollRef.current)}
        endRef={messagesEndRef}
      >
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : messages.length === 0 ? (
          <EmptyState title="No messages yet." description="Start the conversation!" />
        ) : (
          messages.map((message) => {
            if (message.deletedAt) return null;

            const isSystem = message.senderType === "system";
            const isOwn = message.senderUserId === profile?.id;
            const isWrk = message.senderType === "wrk";
            const isRightAligned = !isWrk && isOwn;

            return (
              <div
                key={message.id}
                className={cn("flex gap-3", isRightAligned && "flex-row-reverse", isSystem && "justify-center")}
              >
                {!isSystem && (
                  <Avatar className="w-8 h-8 shrink-0">
                    <AvatarImage src={message.sender?.avatarUrl || undefined} />
                    <AvatarFallback className={cn(isWrk ? "bg-[#E43632] text-white" : "bg-gray-100 text-gray-600")}>
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
                      <span className="text-xs text-gray-500">{formatTime(message.createdAt)}</span>
                      <span
                        className={cn(
                          "text-[10px] px-2 py-0.5 rounded-full border",
                          isWrk ? "border-[#E43632] text-[#E43632]" : "border-gray-300 text-gray-500"
                        )}
                      >
                        {isWrk ? "Staff" : "Tenant"}
                      </span>
                      {message.editedAt && <span className="text-xs text-gray-400">(edited)</span>}
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
                    {message.deletedAt ? <span className="text-gray-500 italic">Message deleted</span> : message.body}
                    {message.attachments && message.attachments.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {message.attachments.map((att) => (
                          <a key={att.fileId} href={att.url || "#"} className="text-xs text-blue-600 hover:underline">
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
                      {message.status === "sent" && <CheckCircle2 className="h-3 w-3 text-green-500" />}
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
                <div
                  className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                  style={{ animationDelay: "150ms" }}
                />
                <div
                  className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                  style={{ animationDelay: "300ms" }}
                />
              </div>
            </div>
          </div>
        )}
        {hasNewMessages && !isAtBottom && (
          <Button
            variant="outline"
            size="sm"
            className="fixed bottom-20 left-1/2 -translate-x-1/2"
            onClick={() => {
              markScrolledToBottom();
              messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            New messages
          </Button>
        )}
      </MessageList>

      <Composer
        className="p-4"
        onSubmit={(event) => {
          event.preventDefault();
          void sendMessage();
        }}
        actions={
          <div className="flex flex-col gap-2">
            <Button variant="ghost" size="icon" disabled={disabled} title="Attach file">
              <Paperclip className="h-4 w-4" />
            </Button>
            <Button onClick={sendMessage} disabled={!input.trim() || isSending || disabled} size="icon">
              {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        }
      >
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
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
      </Composer>
    </div>
  );
}

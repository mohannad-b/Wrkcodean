"use client";

import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Send, Mic, Sparkles, AlertCircle, Paperclip, MonitorPlay } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { currentUser } from "@/lib/mock-automations";
import { motion, AnimatePresence } from "motion/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { BlueprintUpdates } from "@/lib/blueprint/ai-updates";
import type { CopilotThinkingStep } from "@/types/copilot-thinking";

type ChatRole = "user" | "assistant" | "system";

export interface CopilotMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  optimistic?: boolean;
  transient?: boolean;
}

type ConversationPhase = "discovery" | "flow" | "details" | "validation";

interface StudioChatProps {
  automationVersionId: string | null;
  blueprintEmpty: boolean;
  onDraftBlueprint: (messages: CopilotMessage[]) => Promise<void>;
  isDrafting: boolean;
  disabled?: boolean;
  lastError?: string | null;
  onConversationChange?: (messages: CopilotMessage[]) => void;
  onBlueprintUpdates?: (updates: BlueprintUpdates) => void;
}

const INITIAL_AI_MESSAGE: CopilotMessage = {
  id: "ai-initial",
  role: "assistant",
  content:
    "Hi! I'm here to help you design your automation. Describe the workflow you want to automate in your own words — what needs to happen, which systems are involved, and what the end result should be. No technical jargon required.",
  createdAt: new Date().toISOString(),
  transient: true,
};

type ApiCopilotMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
};

type CopilotReplyResponse = {
  message: ApiCopilotMessage;
  blueprintUpdates?: BlueprintUpdates | null;
  thinkingSteps?: CopilotThinkingStep[] | null;
  conversationPhase?: ConversationPhase;
};

const THINKING_BUBBLE_DISPLAY_MS = process.env.NODE_ENV === "test" ? 150 : 950;
const MIN_THINKING_VISIBLE_MS = 250;
type TimeoutHandle = number;
const DEFAULT_USER_FACING_THINKING_STEPS: CopilotThinkingStep[] = [
  { id: "thinking-default-1", label: "Digesting what you're trying to accomplish" },
  { id: "thinking-default-2", label: "Mapping how the systems should connect" },
  { id: "thinking-default-3", label: "Drafting the next blueprint updates" },
];

const STARTER_PROMPTS = [
  "I receive invoices by email and need to extract the data into our accounting system.",
  "When a new customer signs up, create their software accounts and send a welcome email.",
  "Monitor competitor pricing daily and notify me if we should adjust.",
  "Every support ticket should be categorized and routed to the right team automatically.",
];

const formatTimestamp = (iso: string) =>
  new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export function StudioChat({
  automationVersionId,
  blueprintEmpty,
  onDraftBlueprint,
  isDrafting,
  disabled = false,
  lastError,
  onConversationChange,
  onBlueprintUpdates,
}: StudioChatProps) {
  const [messages, setMessages] = useState<CopilotMessage[]>([INITIAL_AI_MESSAGE]);
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [assistantError, setAssistantError] = useState<string | null>(null);
  const [isLoadingThread, setIsLoadingThread] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isAwaitingReply, setIsAwaitingReply] = useState(false);
  const [thinkingSteps, setThinkingSteps] = useState<CopilotThinkingStep[]>([]);
  const [showThinkingBubble, setShowThinkingBubble] = useState(false);
  const [typingDotsVisible, setTypingDotsVisible] = useState(false);
  const [thinkingStartTime, setThinkingStartTime] = useState<number | null>(null);
  const [conversationPhase, setConversationPhase] = useState<ConversationPhase>("discovery");
  const scrollEndRef = useRef<HTMLDivElement>(null);
  const prevBlueprintEmptyRef = useRef<boolean>(blueprintEmpty);
  const thinkingBubbleTimeoutRef = useRef<TimeoutHandle | null>(null);

  const dropTransientMessages = useCallback(
    (list: CopilotMessage[]) => list.filter((message) => !message.transient),
    []
  );

  const mapApiMessage = useCallback(
    (message: ApiCopilotMessage): CopilotMessage => ({
      id: message.id,
      role: message.role,
      content: message.role === "assistant" ? stripBlueprintBlocks(message.content) : message.content,
      createdAt: message.createdAt,
    }),
    []
  );

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!automationVersionId) {
      setMessages([INITIAL_AI_MESSAGE]);
      setThreadError("Select an automation version to start chatting.");
      setAssistantError(null);
      setIsLoadingThread(false);
      return;
    }

    let cancelled = false;
    const loadMessages = async () => {
      setIsLoadingThread(true);
      setThreadError(null);
      setAssistantError(null);
      try {
        const response = await fetch(`/api/automation-versions/${automationVersionId}/messages`, { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Failed to load messages");
        }
        const data: { messages: ApiCopilotMessage[] } = await response.json();
        if (cancelled) return;
        const mapped = data.messages.map(mapApiMessage);
        setMessages(mapped.length > 0 ? mapped : [INITIAL_AI_MESSAGE]);
      } catch {
        if (cancelled) return;
        setThreadError("Unable to load conversation.");
        setMessages([INITIAL_AI_MESSAGE]);
      } finally {
        if (!cancelled) {
          setIsLoadingThread(false);
        }
      }
    };

    loadMessages();
    return () => {
      cancelled = true;
    };
  }, [automationVersionId, mapApiMessage]);

  useEffect(() => {
    if (prevBlueprintEmptyRef.current && !blueprintEmpty) {
      setMessages((prev) => [
        ...prev,
        {
          id: `ai-${Date.now()}`,
          role: "assistant",
          content: "Draft created. Review the canvas and click any step to refine details.",
          createdAt: new Date().toISOString(),
          transient: true,
        },
      ]);
    }
    prevBlueprintEmptyRef.current = blueprintEmpty;
  }, [blueprintEmpty]);

  const durableMessages = useMemo(() => dropTransientMessages(messages), [messages, dropTransientMessages]);

  useEffect(() => {
    setShowThinkingBubble(false);
    setThinkingSteps([]);
    setTypingDotsVisible(false);
    setConversationPhase("discovery");
  }, [automationVersionId]);

  useEffect(() => {
    return () => {
      if (thinkingBubbleTimeoutRef.current !== null) {
        window.clearTimeout(thinkingBubbleTimeoutRef.current);
        thinkingBubbleTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    onConversationChange?.(durableMessages);
  }, [durableMessages, onConversationChange]);

  const hasUserMessage = useMemo(() => durableMessages.some((message) => message.role === "user"), [durableMessages]);
  const canDraft = blueprintEmpty && hasUserMessage && !isDrafting && !disabled && Boolean(automationVersionId);
  const helperMessage = blueprintEmpty
    ? "Share the workflow, systems, and exception cases so the draft is accurate."
    : "Blueprint synced with Copilot. Keep refining via chat or the inspector.";
  const displayedThinkingSteps = useMemo(
    () => (thinkingSteps.length > 0 ? thinkingSteps : DEFAULT_USER_FACING_THINKING_STEPS).slice(0, 3),
    [thinkingSteps]
  );

  const requestAssistantReply = useCallback(async () => {
    if (!automationVersionId) {
      return;
    }
    setIsAwaitingReply(true);
    setAssistantError(null);
    setShowThinkingBubble(true);
    setThinkingSteps(DEFAULT_USER_FACING_THINKING_STEPS);
    setTypingDotsVisible(true);
    setThinkingStartTime(Date.now());
    try {
      const response = await fetch(`/api/automation-versions/${automationVersionId}/copilot/reply`, {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error("Failed to fetch assistant reply");
      }
      const data: CopilotReplyResponse = await response.json();
      if (data.blueprintUpdates && onBlueprintUpdates) {
        onBlueprintUpdates(data.blueprintUpdates);
      }
      if (data.conversationPhase) {
        setConversationPhase(data.conversationPhase);
      }
      const assistantMessage = mapApiMessage(data.message);
      const incomingThinkingSteps =
        data.thinkingSteps && data.thinkingSteps.length > 0 ? data.thinkingSteps : DEFAULT_USER_FACING_THINKING_STEPS;
      const shouldShowBubble = incomingThinkingSteps.length > 0;
      const minimumVisibleDelay = (() => {
        if (!thinkingStartTime) return 0;
        const elapsed = Date.now() - thinkingStartTime;
        return Math.max(0, MIN_THINKING_VISIBLE_MS - elapsed);
      })();
      if (shouldShowBubble) {
        setMessages((prev) => dropTransientMessages(prev));
        if (thinkingBubbleTimeoutRef.current) {
          window.clearTimeout(thinkingBubbleTimeoutRef.current);
        }
        thinkingBubbleTimeoutRef.current = window.setTimeout(() => {
          setMessages((prev) => {
            const trimmed = dropTransientMessages(prev);
            const next = assistantMessage ? [...trimmed, assistantMessage] : trimmed;
            return next.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
          });
          setThinkingSteps([]);
          setShowThinkingBubble(false);
          setTypingDotsVisible(false);
          setIsAwaitingReply(false);
          setThinkingStartTime(null);
        }, THINKING_BUBBLE_DISPLAY_MS + minimumVisibleDelay);
      } else {
        setTimeout(() => {
          setMessages((prev) => {
            const trimmed = dropTransientMessages(prev);
            const next = assistantMessage ? [...trimmed, assistantMessage] : trimmed;
            return next.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
          });
          setThinkingSteps([]);
          setShowThinkingBubble(false);
          setTypingDotsVisible(false);
          setIsAwaitingReply(false);
          setThinkingStartTime(null);
        }, minimumVisibleDelay);
      }
    } catch {
      setAssistantError("Copilot reply failed. Try again.");
      if (thinkingBubbleTimeoutRef.current) {
        window.clearTimeout(thinkingBubbleTimeoutRef.current);
      }
      setThinkingSteps([]);
      setShowThinkingBubble(false);
      setTypingDotsVisible(false);
      setIsAwaitingReply(false);
      setThinkingStartTime(null);
    }
  }, [automationVersionId, dropTransientMessages, mapApiMessage, onBlueprintUpdates, THINKING_BUBBLE_DISPLAY_MS]);

  const handleSend = useCallback(async () => {
    const content = input.trim();
    if (!content) return;
    if (!automationVersionId) {
      setLocalError("Select an automation version to chat.");
      return;
    }
    if (disabled || isSending || isAwaitingReply) {
      return;
    }

    const optimisticMessage: CopilotMessage = {
      id: `temp-${Date.now()}`,
      role: "user",
      content,
      createdAt: new Date().toISOString(),
      optimistic: true,
    };

    setMessages((prev) => [...dropTransientMessages(prev), optimisticMessage]);
    setInput("");
    setLocalError(null);
    setIsSending(true);

    try {
      const response = await fetch(`/api/automation-versions/${automationVersionId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, role: "user" }),
      });
      if (!response.ok) {
        throw new Error("Failed to send message");
      }
      const data: { message: ApiCopilotMessage } = await response.json();
      setMessages((prev) => {
        const withoutOptimistic = dropTransientMessages(prev).filter((msg) => msg.id !== optimisticMessage.id);
        return [...withoutOptimistic, mapApiMessage(data.message)].sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
      });
      void requestAssistantReply();
    } catch {
      setMessages((prev) => prev.filter((msg) => msg.id !== optimisticMessage.id));
      setLocalError("Failed to send message. Try again.");
    } finally {
      setIsSending(false);
    }
  }, [automationVersionId, disabled, dropTransientMessages, input, isAwaitingReply, isSending, mapApiMessage, requestAssistantReply]);

  const handleDraft = async () => {
    if (!hasUserMessage) {
      setLocalError("Add at least one message before drafting.");
      return;
    }
    setLocalError(null);
    await onDraftBlueprint(durableMessages);
  };


  return (
    <div className="flex flex-col h-full bg-[#F9FAFB] border-r border-gray-200 overflow-hidden" data-testid="copilot-pane">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 bg-white flex flex-col gap-3 shadow-sm z-10">
        <div className="flex items-center gap-2">
          <div className="bg-gradient-to-br from-[#E43632] to-[#FF5F5F] text-white p-1.5 rounded-lg shadow-sm animate-pulse">
            <Sparkles size={16} fill="currentColor" />
          </div>
          <div>
            <span className="font-bold text-sm text-[#0A0A0A] block leading-none">WRK Copilot</span>
            <span className="text-[10px] text-gray-400 font-medium">AI Assistant</span>
          </div>
          <Badge variant="secondary" className="ml-auto text-[10px] bg-gray-100 text-gray-600 border-gray-200 px-2 py-0.5">
            {blueprintEmpty ? "Draft Needed" : "Blueprint Synced"}
          </Badge>
        </div>

        <div className="border border-dashed border-gray-200 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600 flex items-center gap-2">
          <Sparkles size={14} className="text-[#E43632]" />
          <span>
            {conversationPhase === "discovery" && "Understanding your workflow…"}
            {conversationPhase === "flow" && "Building out the automation flow…"}
            {conversationPhase === "details" && "Refining edge cases and handoffs…"}
            {conversationPhase === "validation" && "Wrapping up the blueprint for review."}
          </span>
        </div>

        {/* Quick Actions Row */}
        <div className="flex flex-col gap-2">
          <div className="text-[11px] text-gray-500">{helperMessage}</div>
          {messages.length === 1 && (
            <div className="space-y-2">
              <p className="text-xs text-gray-500">Or try one of these examples:</p>
              {STARTER_PROMPTS.map((prompt, index) => (
                <button
                  key={prompt}
                  onClick={() => {
                    setInput(prompt);
                    inputRef.current?.focus();
                  }}
                  className="text-left text-sm text-gray-700 hover:text-gray-900 hover:bg-gray-50 p-3 rounded-lg border border-gray-200 w-full transition-colors"
                  data-testid={`starter-prompt-${index}`}
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}
          {blueprintEmpty && (
            <Button size="sm" onClick={handleDraft} disabled={!canDraft} className="justify-center text-xs font-semibold">
              {isDrafting ? "Drafting Blueprint…" : "Draft Blueprint with Copilot"}
            </Button>
          )}
          {(localError || lastError || threadError || assistantError) && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800 flex items-center gap-1">
              <AlertCircle size={12} />
              {localError || lastError || threadError || assistantError}
            </div>
          )}
          {isLoadingThread && (
            <div className="text-[11px] text-gray-400 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-gray-300 animate-pulse" />
              Loading conversation…
            </div>
          )}
        </div>
      </div>

      {/* Chat Area */}
      <ScrollArea className="flex-1 min-h-0 px-4 py-4 bg-[#F9FAFB]">
        <div className="space-y-6 pb-4">
          {messages.map((msg) => (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              key={msg.id}
              className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
            >
              {msg.role === "assistant" && (
                <div className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center text-[#E43632] shadow-sm shrink-0 mt-0.5">
                  <Sparkles size={14} />
                </div>
              )}
              {msg.role === "user" && (
                <Avatar className="w-8 h-8 mt-0.5 border-2 border-white shadow-sm shrink-0">
                  <AvatarImage src={currentUser.avatar} />
                  <AvatarFallback>ME</AvatarFallback>
                </Avatar>
              )}

              <div className={`max-w-[85%] space-y-2 ${msg.role === "user" ? "items-end flex flex-col" : ""}`}>
                <div
                  className={`p-4 text-sm shadow-sm relative leading-relaxed ${
                    msg.role === "user"
                      ? "bg-white text-[#0A0A0A] rounded-2xl rounded-tr-sm border border-gray-200"
                      : "bg-[#F3F4F6] text-[#0A0A0A] rounded-2xl rounded-tl-sm border border-transparent"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>

                <span className="text-[10px] text-gray-400 px-1 block">
                  {msg.optimistic ? "Sending…" : formatTimestamp(msg.createdAt)}
                </span>
              </div>
            </motion.div>
          ))}
          <AnimatePresence>
            {showThinkingBubble ? (
              <motion.div
                key="thinking-bubble"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="flex gap-3"
                data-testid="thinking-bubble"
              >
                <div className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center text-[#E43632] shadow-sm shrink-0 mt-0.5">
                  <Sparkles size={14} />
                </div>
                <div className="max-w-[85%] space-y-2">
                  <div className="p-4 text-sm shadow-sm relative leading-relaxed bg-[#F3F4F6] text-[#0A0A0A] rounded-2xl rounded-tl-sm border border-transparent">
                    <div className="flex items-center gap-2 text-[11px] font-medium text-gray-500 mb-1">
                      WrkCoPilot is thinking…
                    </div>
                    <ul className="space-y-1.5 text-xs text-gray-600">
                      {displayedThinkingSteps.map((step) => (
                        <li key={step.id} className="flex items-start gap-2">
                          <span className="mt-1 h-1.5 w-1.5 rounded-full bg-gray-300 inline-block" />
                          <span className="leading-relaxed">{step.label}</span>
                        </li>
                      ))}
                    </ul>
                    {typingDotsVisible ? (
                      <div className="mt-3 flex items-center gap-2 text-[11px] text-gray-400" data-testid="typing-dots">
                        <TypingDots />
                        <span>Preparing your next question…</span>
                      </div>
                    ) : null}
                  </div>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
          <div ref={scrollEndRef} />
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="p-4 bg-white border-t border-gray-200">
        <div className="relative flex items-center gap-2">
          <div className="flex items-center gap-2">
            <button className="p-1.5 text-gray-400 hover:text-[#0A0A0A] hover:bg-gray-100 rounded-md transition-colors">
              <Paperclip size={16} />
            </button>
            <button className="p-1.5 text-gray-400 hover:text-[#0A0A0A] hover:bg-gray-100 rounded-md transition-colors">
              <MonitorPlay size={16} />
            </button>
            <button className="p-1.5 text-gray-400 hover:text-[#0A0A0A] hover:bg-gray-100 rounded-md transition-colors">
              <Mic size={16} />
            </button>
          </div>
          <input
            type="text"
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder={
              blueprintEmpty ? "Describe the workflow, systems, and exceptions..." : "Capture refinements or clarifications..."
            }
            className="w-full bg-white text-[#0A0A0A] placeholder:text-gray-400 text-sm rounded-xl py-3 pl-10 pr-12 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#E43632]/10 focus:border-[#E43632] transition-all shadow-sm hover:border-gray-300"
            disabled={disabled || !automationVersionId || isSending || isAwaitingReply}
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || disabled || isSending || !automationVersionId || isAwaitingReply}
            className="absolute right-1.5 p-2 bg-[#E43632] text-white rounded-lg hover:bg-[#C12E2A] transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <span className="flex items-center gap-1">
      {[0, 1, 2].map((dot) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: static list
          key={dot}
          className="h-1.5 w-1.5 rounded-full bg-gray-300 animate-bounce"
          style={{ animationDelay: `${dot * 0.12}s` }}
        />
      ))}
    </span>
  );
}

const BLUEPRINT_BLOCK_REGEX = /```json blueprint_updates[\s\S]*?```/gi;

function stripBlueprintBlocks(content: string): string {
  if (!content) {
    return content;
  }
  return content
    .replace(BLUEPRINT_BLOCK_REGEX, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}


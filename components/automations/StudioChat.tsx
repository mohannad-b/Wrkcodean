"use client";

import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Send, Mic, Sparkles, AlertCircle, Paperclip, MonitorPlay, CheckCircle2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { currentUser } from "@/lib/mock-automations";
import { motion, AnimatePresence } from "motion/react";
import { Badge } from "@/components/ui/badge";
import type { BlueprintUpdates } from "@/lib/blueprint/ai-updates";
import type { Blueprint } from "@/lib/blueprint/types";
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

interface StudioChatProps {
  automationVersionId: string | null;
  blueprintEmpty: boolean;
  disabled?: boolean;
  onConversationChange?: (messages: CopilotMessage[]) => void;
  onBlueprintUpdates?: (updates: BlueprintUpdates) => void;
  onBlueprintRefresh?: () => Promise<void> | void;
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

const THINKING_STEP_INTERVAL_MS = process.env.NODE_ENV === "test" ? 150 : 600;
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
  disabled = false,
  onConversationChange,
  onBlueprintUpdates,
  onBlueprintRefresh,
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
  const [currentThinkingIndex, setCurrentThinkingIndex] = useState(0);
  const scrollEndRef = useRef<HTMLDivElement>(null);
  const prevBlueprintEmptyRef = useRef<boolean>(blueprintEmpty);

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
    setCurrentThinkingIndex(0);
  }, [automationVersionId]);

useEffect(() => {
  if (!showThinkingBubble || thinkingSteps.length === 0) {
    setCurrentThinkingIndex(0);
    return;
  }

  setCurrentThinkingIndex(0);
  const interval = window.setInterval(() => {
    setCurrentThinkingIndex((prev) => {
      if (prev < thinkingSteps.length - 1) {
        return prev + 1;
      }
      window.clearInterval(interval);
      return prev;
    });
  }, THINKING_STEP_INTERVAL_MS);

  return () => {
    window.clearInterval(interval);
  };
}, [showThinkingBubble, thinkingSteps]);

  useEffect(() => {
    onConversationChange?.(durableMessages);
  }, [durableMessages, onConversationChange]);

  const displayedThinkingSteps = useMemo(
    () => (thinkingSteps.length > 0 ? thinkingSteps : DEFAULT_USER_FACING_THINKING_STEPS).slice(0, 3),
    [thinkingSteps]
  );
  const visibleThinkingSteps = displayedThinkingSteps.slice(
    0,
    Math.min(currentThinkingIndex + 1, displayedThinkingSteps.length)
  );
  const activeThinkingIndex = visibleThinkingSteps.length > 0 ? visibleThinkingSteps.length - 1 : -1;

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
    setAssistantError(null);
    setIsSending(true);

    let conversationAfterUser: CopilotMessage[] | null = null;

    try {
      const messageResponse = await fetch(`/api/automation-versions/${automationVersionId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, role: "user" }),
      });
      if (!messageResponse.ok) {
        throw new Error("Failed to send message");
      }

      const data: { message: ApiCopilotMessage } = await messageResponse.json();
      const serverMessage = mapApiMessage(data.message);
      conversationAfterUser = [...durableMessages, serverMessage].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
      setMessages(conversationAfterUser);

      const draftMessages = conversationAfterUser
        .filter(
          (message) =>
            (message.role === "user" || message.role === "assistant") && message.content.trim().length > 0
        )
        .map((message) => ({
          role: message.role,
          content: message.content,
        }));

      if (draftMessages.length === 0) {
        setAssistantError("Describe the workflow so Copilot can draft a blueprint.");
        setShowThinkingBubble(false);
        setThinkingSteps([]);
        setCurrentThinkingIndex(0);
        setIsAwaitingReply(false);
        return;
      }

      setIsAwaitingReply(true);
      setShowThinkingBubble(true);
      setThinkingSteps(DEFAULT_USER_FACING_THINKING_STEPS);
      setCurrentThinkingIndex(0);

      const draftResponse = await fetch(
        `/api/automation-versions/${automationVersionId}/copilot/draft-blueprint`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: draftMessages }),
        }
      );

      if (!draftResponse.ok) {
        throw new Error("Failed to update blueprint");
      }

      const draftData: {
        blueprint?: Blueprint | null;
        message?: ApiCopilotMessage;
        thinkingSteps?: CopilotThinkingStep[];
      } = await draftResponse.json();

      if (draftData.message) {
        const assistantMessage = mapApiMessage(draftData.message);
        setMessages((prev) => {
          const durable = dropTransientMessages(prev);
          const merged = [...durable, assistantMessage].sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
          return merged;
        });
      }

      if (draftData.blueprint && onBlueprintUpdates) {
        onBlueprintUpdates(mapBlueprintToUpdates(draftData.blueprint));
      }

      if (draftData.thinkingSteps && draftData.thinkingSteps.length > 0) {
        setThinkingSteps(draftData.thinkingSteps);
      } else {
        setThinkingSteps([]);
      }

      setShowThinkingBubble(false);
      setCurrentThinkingIndex(0);
      setIsAwaitingReply(false);
      setAssistantError(null);

      await onBlueprintRefresh?.();
    } catch (error) {
      console.error("[STUDIO-CHAT] Failed to process message:", error);
      if (!conversationAfterUser) {
        setMessages((prev) => prev.filter((msg) => msg.id !== optimisticMessage.id));
        setLocalError("Failed to send message. Try again.");
      } else {
        setAssistantError("Failed to update blueprint. Try again.");
      }
      setThinkingSteps([]);
      setShowThinkingBubble(false);
      setCurrentThinkingIndex(0);
      setIsAwaitingReply(false);
    } finally {
      setIsSending(false);
    }
  }, [
    automationVersionId,
    disabled,
    dropTransientMessages,
    durableMessages,
    input,
    isAwaitingReply,
    isSending,
    mapApiMessage,
    onBlueprintRefresh,
    onBlueprintUpdates,
  ]);


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

        {/* Quick Actions Row */}
        <div className="flex flex-col gap-2">
          {(localError || threadError || assistantError) && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800 flex items-center gap-1">
              <AlertCircle size={12} />
              {localError || threadError || assistantError}
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
              {msg.id === INITIAL_AI_MESSAGE.id && messages.length === 1 && (
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {STARTER_PROMPTS.map((prompt, index) => (
                    <button
                      key={prompt}
                      onClick={() => {
                        setInput(prompt);
                        inputRef.current?.focus();
                      }}
                      className="text-left text-sm text-gray-700 bg-white border border-gray-200 rounded-xl px-3 py-2 hover:border-gray-300 hover:bg-gray-50 transition-colors shadow-sm"
                      data-testid={`starter-prompt-${index}`}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              )}

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
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex items-start gap-3 mb-4"
                data-testid="thinking-bubble"
              >
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-[#E43632]" />
                  </div>
                </div>
                <div className="flex-1 bg-white rounded-2xl rounded-tl-none shadow-sm border border-gray-100 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-sm font-semibold text-gray-900">WrkCoPilot is thinking...</span>
                  </div>
                  <div className="space-y-2">
                    {visibleThinkingSteps.map((step, index) => {
                      const isActive = index === activeThinkingIndex;
                      const isComplete = activeThinkingIndex > 0 && index < activeThinkingIndex;
                      const textClass = isActive
                        ? "text-sm leading-relaxed text-gray-900 font-medium"
                        : isComplete
                        ? "text-sm leading-relaxed text-gray-500"
                        : "text-sm leading-relaxed text-gray-400";

                      return (
                        <motion.div
                          key={step.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.1 }}
                          className="flex items-start gap-2"
                        >
                          {isComplete ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                          ) : isActive ? (
                            <div className="relative w-4 h-4 flex-shrink-0 mt-0.5">
                              <span className="absolute w-full h-full bg-[#E43632] rounded-full animate-ping opacity-60" />
                              <span className="relative inline-flex rounded-full w-4 h-4 bg-[#E43632]" />
                            </div>
                          ) : (
                            <div className="w-4 h-4 rounded-full border-2 border-gray-200 flex-shrink-0 mt-0.5" />
                          )}
                          <span className={textClass}>{step.label}</span>
                        </motion.div>
                      );
                    })}
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

function mapBlueprintToUpdates(blueprint: Blueprint): BlueprintUpdates {
  const sections: NonNullable<BlueprintUpdates["sections"]> = {};
  blueprint.sections.forEach((section) => {
    const content = section.content?.trim();
    if (content) {
      sections[section.key] = content;
    }
  });

  const updates: BlueprintUpdates = {
    summary: blueprint.summary,
    steps: blueprint.steps.map((step) => ({
      id: step.id,
      title: step.name,
      type: step.type,
      summary: step.summary,
      goal: step.goalOutcome,
      systemsInvolved: step.systemsInvolved,
      dependsOnIds: step.nextStepIds,
    })),
  };

  if (Object.keys(sections).length > 0) {
    updates.sections = sections;
  }

  return updates;
}


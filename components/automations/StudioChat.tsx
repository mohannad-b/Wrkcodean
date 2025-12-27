"use client";

import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Send, Sparkles, AlertCircle, Paperclip, CheckCircle2, RefreshCw, Lightbulb, Loader2, X, FileText, Image as ImageIcon } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useUserProfile } from "@/components/providers/user-profile-provider";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "@/components/ui/button";
import type { BlueprintUpdates } from "@/lib/blueprint/ai-updates";
import type { Blueprint } from "@/lib/blueprint/types";
import type { CopilotThinkingStep } from "@/types/copilot-thinking";
import type { BlueprintProgressSnapshot } from "@/lib/blueprint/copilot-analysis";

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
  onBlueprintUpdates?: (updates: BlueprintUpdates | Blueprint) => void;
  onBlueprintRefresh?: () => Promise<void> | void;
  onProgressUpdate?: (progress: BlueprintProgressSnapshot | null) => void;
  injectedMessage?: CopilotMessage | null;
  onInjectedMessageConsumed?: () => void;
  onSuggestNextSteps?: () => void;
  isRequestingSuggestions?: boolean;
  suggestionStatus?: string | null;
  onBlueprintUpdatingChange?: (isUpdating: boolean) => void;
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

const THINKING_STEP_INTERVAL_MS = process.env.NODE_ENV === "test" ? 150 : 800;
const DEFAULT_USER_FACING_THINKING_STEPS: CopilotThinkingStep[] = [
  { id: "thinking-default-1", label: "Digesting what you're trying to accomplish" },
  { id: "thinking-default-2", label: "Mapping how the systems should connect" },
  { id: "thinking-default-3", label: "Drafting the next blueprint updates" },
];
const MAX_FOLLOWUP_QUESTIONS = 10;

const formatTimestamp = (iso: string) =>
  new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export function StudioChat({
  automationVersionId,
  blueprintEmpty,
  disabled = false,
  onConversationChange,
  onBlueprintUpdates,
  onBlueprintRefresh,
  onProgressUpdate,
  injectedMessage = null,
  onInjectedMessageConsumed,
  onSuggestNextSteps,
  isRequestingSuggestions = false,
  suggestionStatus = null,
  onBlueprintUpdatingChange,
}: StudioChatProps) {
  const { profile } = useUserProfile();
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
  const [thinkingTextProgress, setThinkingTextProgress] = useState<Record<string, number>>({});
  const typingIntervalRef = useRef<number | null>(null);
  const scrollEndRef = useRef<HTMLDivElement>(null);
  const prevBlueprintEmptyRef = useRef<boolean>(blueprintEmpty);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const actionButtonsDisabled = disabled || !automationVersionId;
  const [attachedFiles, setAttachedFiles] = useState<Array<{ id: string; filename: string; url: string; type: string }>>([]);
  const [isUploadingFile, setIsUploadingFile] = useState(false);

  const getUserInitials = () => {
    if (!profile) return "ME";
    if (profile.firstName && profile.lastName) {
      return `${profile.firstName.charAt(0)}${profile.lastName.charAt(0)}`.toUpperCase();
    }
    if (profile.name) {
      const parts = profile.name.split(/\s+/).filter(Boolean);
      return parts
        .slice(0, 2)
        .map((segment) => segment.charAt(0).toUpperCase())
        .join("");
    }
    return profile.email.charAt(0).toUpperCase();
  };

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
    setThinkingTextProgress({});
    if (typingIntervalRef.current) {
      window.clearInterval(typingIntervalRef.current);
      typingIntervalRef.current = null;
    }
    return;
  }

  // Reset state
  setCurrentThinkingIndex(0);
  setThinkingTextProgress({});
  
  const displayedSteps = (thinkingSteps.length > 0 ? thinkingSteps : DEFAULT_USER_FACING_THINKING_STEPS).slice(0, 3);
  let currentStepIndex = 0;
  let currentCharIndex = 0;
  const progress: Record<string, number> = {};
  
  if (typingIntervalRef.current) {
    window.clearInterval(typingIntervalRef.current);
  }
  
  typingIntervalRef.current = window.setInterval(() => {
    if (currentStepIndex >= displayedSteps.length) {
      if (typingIntervalRef.current) {
        window.clearInterval(typingIntervalRef.current);
        typingIntervalRef.current = null;
      }
      return;
    }
    
    const currentStep = displayedSteps[currentStepIndex];
    const fullText = currentStep.label;
    
    if (currentCharIndex <= fullText.length) {
      progress[currentStep.id] = currentCharIndex;
      setThinkingTextProgress({ ...progress });
      setCurrentThinkingIndex(currentStepIndex);
      currentCharIndex += 4; // Type 4 chars at a time
    } else {
      // Finished current step, move to next
      currentStepIndex++;
      currentCharIndex = 0;
      if (currentStepIndex < displayedSteps.length) {
        setCurrentThinkingIndex(currentStepIndex);
      }
    }
  }, 35); // Update every 35ms for smooth typing
  
  return () => {
    if (typingIntervalRef.current) {
      window.clearInterval(typingIntervalRef.current);
      typingIntervalRef.current = null;
    }
  };
}, [showThinkingBubble, thinkingSteps]);

  useEffect(() => {
    onConversationChange?.(durableMessages);
  }, [durableMessages, onConversationChange]);

  // Accept externally injected messages (e.g., system notices)
  useEffect(() => {
    if (!injectedMessage) return;
    setMessages((prev) => [...prev, injectedMessage]);
    onInjectedMessageConsumed?.();
  }, [injectedMessage, onInjectedMessageConsumed]);

  // Auto-trigger blueprint generation if there's a user message but no assistant response
  useEffect(() => {
    if (!automationVersionId || isSending || isAwaitingReply || isLoadingThread || disabled) {
      return;
    }

    const userMessages = durableMessages.filter((m) => m.role === "user");
    const assistantMessages = durableMessages.filter((m) => m.role === "assistant");
    const assistantCount = assistantMessages.length;
    
    // If there's at least one user message but no assistant response, auto-trigger
    if (userMessages.length > 0 && assistantMessages.length === 0 && blueprintEmpty) {
      if (assistantCount >= MAX_FOLLOWUP_QUESTIONS) {
        return;
      }
      const draftMessages = durableMessages
        .filter(
          (message) =>
            (message.role === "user" || message.role === "assistant") && message.content.trim().length > 0
        )
        .map((message) => ({
          role: message.role,
          content: message.content,
        }));

      if (draftMessages.length > 0) {
        setIsAwaitingReply(true);
        setShowThinkingBubble(true);
        setThinkingSteps(DEFAULT_USER_FACING_THINKING_STEPS);
        setCurrentThinkingIndex(0);
        setAssistantError(null);

        fetch(`/api/automation-versions/${automationVersionId}/copilot/draft-blueprint`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: draftMessages }),
        })
          .then(async (response) => {
            if (!response.ok) {
              const errorData = await response.json().catch(() => ({}));
              throw new Error(errorData.error ?? "Failed to generate blueprint");
            }
            return response.json();
          })
          .then(async (data: {
            blueprint?: Blueprint | null;
            message?: ApiCopilotMessage;
            thinkingSteps?: CopilotThinkingStep[];
            progress?: BlueprintProgressSnapshot | null;
          }) => {
            if (data.message) {
              const assistantMessage = mapApiMessage(data.message);
              setMessages((prev) => {
                const updated = [...prev, assistantMessage].sort(
                  (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
                );
                return updated;
              });
            }
            const runBlueprintUpdate = async () => {
              if (data.blueprint) {
                onBlueprintUpdatingChange?.(true);
                try {
                  onBlueprintUpdates?.(data.blueprint);
                  await onBlueprintRefresh?.();
                } finally {
                  onBlueprintUpdatingChange?.(false);
                }
              }
              if (data.progress) {
                onProgressUpdate?.(data.progress);
              }
            };
            void runBlueprintUpdate();
            if (data.thinkingSteps && data.thinkingSteps.length > 0) {
              setThinkingSteps(data.thinkingSteps);
            }
          })
          .catch((error) => {
            setAssistantError(error instanceof Error ? error.message : "Failed to generate blueprint");
          })
          .finally(() => {
            setIsAwaitingReply(false);
            setShowThinkingBubble(false);
          });
      }
    }
  }, [
    automationVersionId,
    durableMessages,
    blueprintEmpty,
    isSending,
    isAwaitingReply,
    isLoadingThread,
    disabled,
    mapApiMessage,
    onBlueprintUpdates,
    onBlueprintRefresh,
    onProgressUpdate,
    onBlueprintUpdatingChange,
  ]);

  const displayedThinkingSteps = useMemo(
    () => (thinkingSteps.length > 0 ? thinkingSteps : DEFAULT_USER_FACING_THINKING_STEPS).slice(0, 3),
    [thinkingSteps]
  );
  const visibleThinkingSteps = displayedThinkingSteps.slice(
    0,
    Math.min(currentThinkingIndex + 1, displayedThinkingSteps.length)
  );
  const activeThinkingIndex = visibleThinkingSteps.length > 0 ? visibleThinkingSteps.length - 1 : -1;

  const handleFileSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0 || !automationVersionId) return;

    setIsUploadingFile(true);
    setLocalError(null);

    try {
      const uploadPromises = Array.from(files).map(async (file) => {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("purpose", "automation_doc");
        formData.append("resourceType", "automation_version");
        formData.append("resourceId", automationVersionId);

        const response = await fetch("/api/uploads", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error ?? "Failed to upload file");
        }

        const data = await response.json();
        return {
          id: data.version.id,
          filename: data.version.filename,
          url: data.downloadUrl || data.version.storageUrl,
          type: data.version.mimeType || "application/octet-stream",
        };
      });

      const uploadedFiles = await Promise.all(uploadPromises);
      setAttachedFiles((prev) => [...prev, ...uploadedFiles]);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Failed to upload file");
    } finally {
      setIsUploadingFile(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }, [automationVersionId]);

  const handleRemoveFile = useCallback((fileId: string) => {
    setAttachedFiles((prev) => prev.filter((f) => f.id !== fileId));
  }, []);

  const isImageFile = (mimeType: string) => {
    return mimeType.startsWith("image/");
  };

  const handleSend = useCallback(async () => {
    const content = input.trim();
    if (!content && attachedFiles.length === 0) return;
    if (!automationVersionId) {
      setLocalError("Select an automation version to chat.");
      return;
    }
    if (disabled || isSending || isAwaitingReply) {
      return;
    }

    // Build message content with file references
    let messageContent = content;
    if (attachedFiles.length > 0) {
      const fileReferences = attachedFiles.map((f) => `[File: ${f.filename}]`).join(" ");
      messageContent = content ? `${content}\n\n${fileReferences}` : fileReferences;
    }

    const optimisticMessage: CopilotMessage = {
      id: `temp-${Date.now()}`,
      role: "user",
      content: messageContent,
      createdAt: new Date().toISOString(),
      optimistic: true,
    };

    setMessages((prev) => [...dropTransientMessages(prev), optimisticMessage]);
    setInput("");
    setAttachedFiles([]);
    setLocalError(null);
    setAssistantError(null);
    setIsSending(true);

    let conversationAfterUser: CopilotMessage[] | null = null;

    try {
      const messageResponse = await fetch(`/api/automation-versions/${automationVersionId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: messageContent, role: "user" }),
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

      const assistantCount = countAssistantMessages(conversationAfterUser);
      if (assistantCount >= MAX_FOLLOWUP_QUESTIONS) {
        const limitMessage: CopilotMessage = {
          id: `limit-${Date.now()}`,
          role: "assistant",
          content: "I have enough to propose the workflow. Want me to finalize the flowchart or adjust anything else?",
          createdAt: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, limitMessage]);
        setShowThinkingBubble(false);
        setThinkingSteps([]);
        setCurrentThinkingIndex(0);
        setIsAwaitingReply(false);
        setAssistantError(null);
        setIsSending(false);
        return;
      }

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
        progress?: BlueprintProgressSnapshot | null;
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

      const runBlueprintUpdate = async () => {
        const progressValue = draftData.progress ?? null;
        if (draftData.blueprint && onBlueprintUpdates) {
          onBlueprintUpdatingChange?.(true);
          try {
            onBlueprintUpdates(mapBlueprintToUpdates(draftData.blueprint));
            await onBlueprintRefresh?.();
          } finally {
            onBlueprintUpdatingChange?.(false);
          }
        }
        if (typeof onProgressUpdate === "function") {
          onProgressUpdate(progressValue);
        }
      };
      void runBlueprintUpdate();

      if (draftData.thinkingSteps && draftData.thinkingSteps.length > 0) {
        setThinkingSteps(draftData.thinkingSteps);
      } else {
        setThinkingSteps([]);
      }

      setShowThinkingBubble(false);
      setCurrentThinkingIndex(0);
      setIsAwaitingReply(false);
      setAssistantError(null);
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
    attachedFiles,
    isAwaitingReply,
    isSending,
    mapApiMessage,
    onBlueprintRefresh,
    onBlueprintUpdates,
    onBlueprintUpdatingChange,
    onProgressUpdate,
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
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading conversation…
            </div>
          )}
        </div>
      </div>

      {/* Chat Area */}
      <ScrollArea className="flex-1 min-h-0 px-4 py-4 bg-[#F9FAFB]">
        <div className="space-y-6 pb-4">
          {isLoadingThread ? (
            <div className="flex items-center justify-center py-12">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-8 w-8 text-[#E43632] animate-spin" />
                <p className="text-sm text-gray-500">Loading conversation history...</p>
              </div>
            </div>
          ) : (
            <>
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
                  {profile?.avatarUrl ? <AvatarImage src={profile.avatarUrl} alt={profile.name} /> : null}
                  <AvatarFallback>{getUserInitials()}</AvatarFallback>
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
            </>
          )}
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
                  <div className="space-y-3">
                    {visibleThinkingSteps.map((step, index) => {
                      const isActive = index === activeThinkingIndex;
                      const isComplete = activeThinkingIndex > 0 && index < activeThinkingIndex;
                      const textProgress = thinkingTextProgress[step.id] ?? 0;
                      const displayedText = isActive && textProgress > 0
                        ? step.label.slice(0, textProgress)
                        : isComplete
                        ? step.label
                        : "";
                      
                      const textClass = isActive
                        ? "text-sm leading-relaxed text-gray-900 font-normal"
                        : isComplete
                        ? "text-sm leading-relaxed text-gray-500 font-normal"
                        : "text-sm leading-relaxed text-gray-400 font-normal";

                      // Only show step if it's been started or is complete
                      if (!isActive && !isComplete) {
                        return null;
                      }

                      return (
                        <motion.div
                          key={step.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.05 }}
                          className="flex items-start gap-3"
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
                          <div className="flex-1">
                            <span className={textClass}>
                              {displayedText}
                              {isActive && textProgress < step.label.length && (
                                <span className="inline-block w-0.5 h-4 bg-[#E43632] ml-1 animate-pulse" />
                              )}
                            </span>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
          {!isLoadingThread && <div ref={scrollEndRef} />}
        </div>
      </ScrollArea>

      {/* Action + Input Area */}
      <div className="p-4 bg-white border-t border-gray-200 space-y-3">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={onSuggestNextSteps}
              disabled={isRequestingSuggestions || actionButtonsDisabled}
              className="text-xs font-semibold"
            >
              {isRequestingSuggestions ? (
                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
              ) : (
                <Lightbulb className="mr-2 h-3 w-3" />
              )}
              Suggest next steps
            </Button>
            {suggestionStatus ? (
              <p className="text-[11px] text-gray-500">{suggestionStatus}</p>
            ) : null}
          </div>
        </div>

        {/* Hidden file input */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          multiple
          accept="image/*,.pdf,.doc,.docx,.txt,.csv,.xlsx,.xls"
          className="hidden"
        />

        {/* Attached files display */}
        {attachedFiles.length > 0 && (
          <div className="flex flex-wrap gap-2 p-2 bg-gray-50 rounded-lg border border-gray-200">
            {attachedFiles.map((file) => (
              <div
                key={file.id}
                className="flex items-center gap-2 px-2 py-1.5 bg-white rounded-md border border-gray-200 text-xs"
              >
                {isImageFile(file.type) ? (
                  <ImageIcon className="h-3.5 w-3.5 text-[#E43632]" />
                ) : (
                  <FileText className="h-3.5 w-3.5 text-[#E43632]" />
                )}
                <span className="text-gray-700 max-w-[150px] truncate">{file.filename}</span>
                <button
                  onClick={() => handleRemoveFile(file.id)}
                  className="p-0.5 text-gray-400 hover:text-red-600 transition-colors"
                  type="button"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="relative flex items-center gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || !automationVersionId || isUploadingFile || isSending || isAwaitingReply}
              className="p-1.5 text-gray-400 hover:text-[#0A0A0A] hover:bg-gray-100 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              type="button"
              title="Attach file"
            >
              {isUploadingFile ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Paperclip size={16} />
              )}
            </button>
            {/* Video and audio buttons - hidden for now, will be added later */}
            {/* <button className="p-1.5 text-gray-400 hover:text-[#0A0A0A] hover:bg-gray-100 rounded-md transition-colors">
              <MonitorPlay size={16} />
            </button>
            <button className="p-1.5 text-gray-400 hover:text-[#0A0A0A] hover:bg-gray-100 rounded-md transition-colors">
              <Mic size={16} />
            </button> */}
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
            disabled={(!input.trim() && attachedFiles.length === 0) || disabled || isSending || !automationVersionId || isAwaitingReply}
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

function countAssistantMessages(messages: CopilotMessage[]): number {
  return messages.filter((message) => message.role === "assistant").length;
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


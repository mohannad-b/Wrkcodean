"use client";

import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Send, Sparkles, Paperclip, Lightbulb, Loader2, X, FileText, Image as ImageIcon } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useUserProfile } from "@/components/providers/user-profile-provider";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { WorkflowUpdates } from "@/lib/workflows/ai-updates";
import type { Workflow } from "@/lib/workflows/types";
import { workflowToNodes } from "@/lib/workflows/canvas-utils";
import type { CopilotAnalysisState, WorkflowProgressSnapshot } from "@/lib/workflows/copilot-analysis";
import type { Task } from "@/db/schema";
import { logger } from "@/lib/logger";

type ChatRole = "user" | "assistant" | "system";
type RunPhase = "understanding" | "drafting" | "drawing" | "done" | "error";

export interface CopilotMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  optimistic?: boolean;
  transient?: boolean;
  kind?: "system_run";
  runStatus?: {
    phase: RunPhase;
    events: string[];
    stepCount?: number;
    errorMessage?: string | null;
    retryable?: boolean;
    persistenceError?: boolean;
    debugDetails?: Record<string, unknown> | null;
    collapsed?: boolean;
  };
}

interface StudioChatProps {
  automationVersionId: string | null;
  workflowEmpty: boolean;
  disabled?: boolean;
  onConversationChange?: (messages: CopilotMessage[]) => void;
  onWorkflowUpdates?: (updates: WorkflowUpdates | Workflow) => void;
  onWorkflowRefresh?: () => Promise<void> | void;
  onProgressUpdate?: (progress: WorkflowProgressSnapshot | null) => void;
  onTasksUpdate?: (tasks: Task[]) => void;
  injectedMessage?: CopilotMessage | null;
  onInjectedMessageConsumed?: () => void;
  onSuggestNextSteps?: () => void;
  isRequestingSuggestions?: boolean;
  suggestionStatus?: string | null;
  onWorkflowUpdatingChange?: (isUpdating: boolean) => void;
  analysis?: CopilotAnalysisState | null;
  analysisLoading?: boolean;
  onRefreshAnalysis?: () => void | Promise<void>;
  analysisUnavailable?: boolean;
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

const formatTimestamp = (iso: string) =>
  new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export function StudioChat({
  automationVersionId,
  workflowEmpty,
  disabled = false,
  onConversationChange,
  onWorkflowUpdates,
  onWorkflowRefresh: _onWorkflowRefresh,
  onProgressUpdate,
  onTasksUpdate,
  injectedMessage = null,
  onInjectedMessageConsumed,
  onSuggestNextSteps,
  isRequestingSuggestions = false,
  suggestionStatus = null,
  onWorkflowUpdatingChange,
  onRefreshAnalysis,
}: StudioChatProps) {
  const { profile } = useUserProfile();
  const [messages, setMessages] = useState<CopilotMessage[]>([INITIAL_AI_MESSAGE]);
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isLoadingThread, setIsLoadingThread] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isAwaitingReply, setIsAwaitingReply] = useState(false);
  const scrollEndRef = useRef<HTMLDivElement>(null);
  const prevWorkflowEmptyRef = useRef<boolean>(workflowEmpty);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingRequestIdRef = useRef<number>(0);
  const injectedMessageRunSetRef = useRef<Set<string>>(new Set());
  const actionButtonsDisabled = disabled || !automationVersionId;
  const [attachedFiles, setAttachedFiles] = useState<Array<{ id: string; filename: string; url: string; type: string }>>([]);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const lastSentContentRef = useRef<string | null>(null);
  const zeroStepLogGuardRef = useRef<Set<number>>(new Set());
  const injectedFailureRef = useRef<{ id: string; at: number } | null>(null);
  const runContentRef = useRef<Map<string, string>>(new Map());
  const runCollapseTimersRef = useRef<Map<string, number>>(new Map());
  const analysisRefreshRef = useRef<Map<string, number>>(new Map());

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
      content: message.role === "assistant" ? stripWorkflowBlocks(message.content) : message.content,
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
      setIsLoadingThread(false);
      return;
    }

    let cancelled = false;
    const loadMessages = async () => {
      setIsLoadingThread(true);
      try {
        const response = await fetch(`/api/automation-versions/${automationVersionId}/messages`, { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Failed to load messages");
        }
        const data: { messages: ApiCopilotMessage[] } = await response.json();
        if (cancelled) return;
        const mapped = data.messages.map(mapApiMessage);
        setMessages(mapped.length > 0 ? mapped : [INITIAL_AI_MESSAGE]);
      } catch (error) {
        logger.error("[STUDIO-CHAT] Failed to load messages", error);
        if (cancelled) return;
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
    if (prevWorkflowEmptyRef.current && !workflowEmpty) {
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
    prevWorkflowEmptyRef.current = workflowEmpty;
  }, [workflowEmpty]);

  const durableMessages = useMemo(() => dropTransientMessages(messages), [messages, dropTransientMessages]);

  useEffect(() => {
    onConversationChange?.(durableMessages);
  }, [durableMessages, onConversationChange]);

  // Auto-trigger pipeline disabled by default; reserved for future use.

  const handleFileSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0 || !automationVersionId) return;

    setIsUploadingFile(true);

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
    } catch {
      // swallow upload error; input UI will keep state
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

  const sendMessage = useCallback(
    async (
      messageContent: string,
      source: "manual" | "seed",
      options?: { reuseRunId?: string }
    ) => {
      const trimmed = messageContent.trim();
      if (!trimmed) return { ok: false as const };
      if (!automationVersionId) {
        return { ok: false as const };
      }
      if (disabled || isSending || isAwaitingReply) {
        return { ok: false as const };
      }

      const isRetry = Boolean(options?.reuseRunId);
      const optimisticMessageId = isRetry ? null : `temp-${Date.now()}`;
      const requestId = pendingRequestIdRef.current + 1;
      pendingRequestIdRef.current = requestId;
      const runId = options?.reuseRunId ?? `run-${optimisticMessageId ?? Date.now()}`;
      const clientMessageId = isRetry ? `${runId}-retry-${Date.now()}` : optimisticMessageId ?? `msg-${Date.now()}`;
      const initialEvent =
        source === "seed" ? "Seed received" : isRetry ? "Retrying..." : "Processing your prompt";

      lastSentContentRef.current = trimmed;
      runContentRef.current.set(runId, trimmed);
      if (runCollapseTimersRef.current.has(runId)) {
        const timer = runCollapseTimersRef.current.get(runId);
        if (timer) {
          window.clearTimeout(timer);
        }
        runCollapseTimersRef.current.delete(runId);
      }

      const optimisticMessage: CopilotMessage | null = isRetry
        ? null
        : {
            id: optimisticMessageId!,
            role: "user",
            content: trimmed,
            createdAt: new Date().toISOString(),
            optimistic: true,
          };

      const baseRunStatus: CopilotMessage["runStatus"] = {
        phase: "understanding",
        events: [initialEvent],
        errorMessage: null,
        retryable: false,
        persistenceError: false,
        debugDetails: null,
        collapsed: false,
      };

      setMessages((prev) => {
        const durable = dropTransientMessages(prev);
        const next: CopilotMessage[] = [];
        const runIndex = durable.findIndex((msg) => msg.id === runId);
        durable.forEach((msg) => {
          next.push(msg);
        });
        if (optimisticMessage) {
          next.push(optimisticMessage);
        }
        if (runIndex >= 0) {
          next[runIndex] = {
            ...next[runIndex],
            kind: "system_run",
            role: "assistant",
            runStatus: baseRunStatus,
          };
        } else {
          next.push({
            id: runId,
            role: "assistant",
            kind: "system_run",
            content: "",
            createdAt: new Date().toISOString(),
            runStatus: baseRunStatus,
          });
        }
        return next;
      });

      const updateRunMessage = (updater: (status: NonNullable<CopilotMessage["runStatus"]>) => CopilotMessage["runStatus"]) => {
        setMessages((prev) => {
          const next = dropTransientMessages(prev).map((msg) => {
            if (msg.id !== runId || msg.kind !== "system_run") return msg;
            const currentStatus: NonNullable<CopilotMessage["runStatus"]> =
              msg.runStatus ?? {
                phase: "understanding",
                events: [],
                errorMessage: null,
                retryable: false,
                persistenceError: false,
                debugDetails: null,
                collapsed: false,
              };
            return { ...msg, runStatus: updater(currentStatus) };
          });
          return next;
        });
      };

      setIsSending(true);
      setIsAwaitingReply(true);
      onWorkflowUpdatingChange?.(true);

      let stepCount = 0;
      let nodeCount: number | null = null;
      let persistenceError = false;

      try {
        updateRunMessage((status) => ({
          ...status,
          phase: "drafting",
          events: [...status.events, "Calling Copilot"],
          errorMessage: null,
          retryable: false,
          persistenceError: false,
          debugDetails: null,
          collapsed: false,
        }));

        const chatResponse = await fetch(`/api/automation-versions/${automationVersionId}/copilot/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: trimmed,
            clientMessageId,
          }),
        });

        if (!chatResponse.ok) {
          const errorData = await chatResponse.json().catch(() => ({}));
          throw new Error(errorData.error ?? "Failed to update workflow");
        }

        const data: {
          workflow?: Workflow | null;
          message?: ApiCopilotMessage;
          progress?: WorkflowProgressSnapshot | null;
          tasks?: Task[];
          persistenceError?: boolean;
        } = await chatResponse.json();

        const isLatest = requestId === pendingRequestIdRef.current;

        if (data.workflow && onWorkflowUpdates && isLatest) {
          stepCount = data.workflow.steps?.length ?? 0;
          if (stepCount === 0) {
            updateRunMessage((status) => ({
              ...status,
              phase: "error",
              events: [...status.events, "No steps generated"],
              errorMessage: "No steps generated — retry",
              retryable: true,
              stepCount,
              collapsed: false,
            }));
            if (!zeroStepLogGuardRef.current.has(requestId)) {
              zeroStepLogGuardRef.current.add(requestId);
              logger.error("[STUDIO-CHAT] Workflow returned zero steps; logging raw model output", {
                requestId,
                rawWorkflow: data.workflow,
              });
            }
          } else {
            const nodes = workflowToNodes(data.workflow, new Map());
            nodeCount = nodes.length;
            if (nodeCount === 0) {
              logger.error("[STUDIO-CHAT] Workflow has steps but no nodes derived", {
                stepCount,
                steps: data.workflow.steps,
                edges: data.workflow.steps?.flatMap((s) => s.nextStepIds ?? []),
              });
            }
            onWorkflowUpdates(data.workflow);
            updateRunMessage((status) => ({
              ...status,
              phase: "drawing",
              events: [...status.events, `Validated workflow (${stepCount} steps)`],
              stepCount,
              errorMessage: null,
              retryable: false,
            }));
            logger.debug("[STUDIO-CHAT] Copilot chat workflow applied", {
              stepCount,
              nodeCount,
              sectionCount: data.workflow.sections?.length ?? 0,
            });
          }
        }

        if (data.message && isLatest && stepCount !== 0) {
          const assistantMessage = mapApiMessage(data.message);
          setMessages((prev) => {
            const durable = dropTransientMessages(prev);
            const merged = [...durable, assistantMessage].sort(
              (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
            );
            return merged;
          });
        } else {
          setMessages((prev) => dropTransientMessages(prev));
        }

        if (data.tasks && isLatest) {
          onTasksUpdate?.(data.tasks);
          logger.debug("[STUDIO-CHAT] Copilot chat tasks applied", { taskCount: data.tasks.length });
        }

        persistenceError = Boolean(data.persistenceError);
        if (persistenceError) {
          updateRunMessage((status) => ({
            ...status,
            persistenceError: true,
            debugDetails: {
              automationVersionId,
              requestId,
              clientMessageId,
              source,
            },
            events: [...status.events, "Analysis save failed"],
          }));
        }

        if (typeof onProgressUpdate === "function") {
          onProgressUpdate(data.progress ?? null);
        }

        if (isLatest && onRefreshAnalysis && !persistenceError && automationVersionId) {
          const last = analysisRefreshRef.current.get(automationVersionId) ?? 0;
          if (Date.now() - last >= 10_000) {
            analysisRefreshRef.current.set(automationVersionId, Date.now());
            void onRefreshAnalysis();
          }
        }

        const finalPhase: RunPhase = stepCount === 0 ? "error" : "done";
        updateRunMessage((status) => ({
          ...status,
          phase: finalPhase,
          events:
            finalPhase === "done"
              ? [...status.events, `Flow updated (${stepCount} steps)`]
              : status.events,
          errorMessage: finalPhase === "error" ? status.errorMessage ?? "Run failed" : null,
          retryable: finalPhase === "error",
          stepCount: stepCount || status.stepCount,
          collapsed: false,
        }));

        if (finalPhase === "done") {
          const timer = window.setTimeout(() => {
            setMessages((prev) =>
              dropTransientMessages(prev).map((msg) =>
                msg.id === runId && msg.kind === "system_run"
                  ? {
                      ...msg,
                      runStatus: msg.runStatus ? { ...msg.runStatus, collapsed: true } : msg.runStatus,
                    }
                  : msg
              )
            );
            runCollapseTimersRef.current.delete(runId);
          }, 2000);
          runCollapseTimersRef.current.set(runId, timer);
        }

        setIsAwaitingReply(false);
        logger.debug("[STUDIO-CHAT] Run complete", {
          stepCount,
          nodeCount,
          analysisSaved: !persistenceError,
        });
        return { ok: true as const, stepCount, nodeCount, persistenceError, runId };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to send message. Try again.";
        logger.error("[STUDIO-CHAT] Failed to process message:", error);
        updateRunMessage((status) => ({
          ...status,
          phase: "error",
          events: [...status.events, `Error: ${message}`],
          errorMessage: message,
          retryable: true,
          collapsed: false,
        }));
        return { ok: false as const };
      } finally {
        setIsSending(false);
        setIsAwaitingReply(false);
        onWorkflowUpdatingChange?.(false);
      }
    },
    [
      automationVersionId,
      disabled,
      dropTransientMessages,
      isAwaitingReply,
      isSending,
      mapApiMessage,
      onProgressUpdate,
      onRefreshAnalysis,
      onTasksUpdate,
      onWorkflowUpdates,
      onWorkflowUpdatingChange,
      runCollapseTimersRef,
      runContentRef,
      zeroStepLogGuardRef,
    ]
  );

  const handleSend = useCallback(async () => {
    const content = input.trim();
    if (!content && attachedFiles.length === 0) return;

    let messageContent = content;
    if (attachedFiles.length > 0) {
      const fileReferences = attachedFiles.map((f) => `[File: ${f.filename}]`).join(" ");
      messageContent = content ? `${content}\n\n${fileReferences}` : fileReferences;
    }

    setInput("");
    setAttachedFiles([]);
    await sendMessage(messageContent, "manual");
  }, [attachedFiles, input, sendMessage]);

  const handleRunRetry = useCallback(
    (runId: string) => {
      const content = runContentRef.current.get(runId) ?? lastSentContentRef.current;
      if (!content) return;
      void sendMessage(content, "manual", { reuseRunId: runId });
    },
    [sendMessage]
  );

  useEffect(() => {
    if (!injectedMessage || !automationVersionId) return;
    const lastFailure =
      injectedFailureRef.current && injectedFailureRef.current.id === injectedMessage.id
        ? injectedFailureRef.current
        : null;
    if (lastFailure && Date.now() - lastFailure.at < 750) {
      return;
    }
    if (injectedMessageRunSetRef.current.has(injectedMessage.id)) return;
    injectedMessageRunSetRef.current.add(injectedMessage.id);
    void (async () => {
      const result = await sendMessage(injectedMessage.content, "seed");
      logger.debug("Injected message auto-sent", {
        id: injectedMessage.id,
        preview: injectedMessage.content.slice(0, 80),
        ok: result?.ok ?? false,
      });
      if (result?.ok) {
        onInjectedMessageConsumed?.();
      } else {
        injectedMessageRunSetRef.current.delete(injectedMessage.id);
        injectedFailureRef.current = { id: injectedMessage.id, at: Date.now() };
      }
    })();
  }, [automationVersionId, injectedMessage, onInjectedMessageConsumed, sendMessage]);


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
                {msg.kind === "system_run" ? (
                  <RunBubble message={msg} onRetry={() => handleRunRetry(msg.id)} />
                ) : (
                  <>
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
                  </>
                )}
              </div>
            </motion.div>
              ))}
            </>
          )}
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
              workflowEmpty ? "Describe the workflow, systems, and exceptions..." : "Capture refinements or clarifications..."
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

const WORKFLOW_BLOCK_REGEX = /```json workflow_updates[\s\S]*?```/gi;

function stripWorkflowBlocks(content: string): string {
  if (!content) {
    return content;
  }
  return content
    .replace(WORKFLOW_BLOCK_REGEX, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function RunBubble({ message, onRetry }: { message: CopilotMessage; onRetry: () => void }) {
  const status = message.runStatus;
  const [showDebug, setShowDebug] = useState(false);

  if (!status) return null;

  const isError = status.phase === "error";
  const events = status.collapsed && status.events.length > 0 ? [status.events[status.events.length - 1]] : status.events;
  const lastEvent = events[events.length - 1];

  return (
    <div className="w-full">
      <div
        className={cn(
          "p-4 text-sm shadow-sm relative leading-relaxed rounded-2xl rounded-tl-sm border",
          isError
            ? "bg-red-50 border-red-200 text-red-900"
            : status.persistenceError
            ? "bg-amber-50 border-amber-200 text-amber-900"
            : "bg-[#F3F4F6] border-transparent text-[#0A0A0A]"
        )}
      >
        <div className="flex items-center justify-between text-xs font-semibold mb-1">
          <span className="text-gray-900">Copilot run</span>
          <span className="uppercase tracking-wide text-gray-500">{status.phase}</span>
        </div>
        <div className="text-xs text-gray-700 space-y-1">
          {events.map((event, idx) => (
            <div key={`${event}-${idx}`} className="flex items-start gap-2">
              <span className="mt-1 block h-1.5 w-1.5 rounded-full bg-gray-400" />
              <span className={cn(idx === events.length - 1 ? "font-medium" : "text-gray-600")}>{event}</span>
            </div>
          ))}
        </div>

        {status.phase === "done" && status.stepCount !== undefined ? (
          <div className="mt-2 text-xs font-semibold text-emerald-700">Flow updated ({status.stepCount} steps)</div>
        ) : null}

        {status.persistenceError ? (
          <div className="mt-2 rounded-md border border-amber-200 bg-white/60 text-amber-800 p-2 text-[11px] space-y-1">
            <div className="flex items-center justify-between">
              <span>Analysis save failed.</span>
              <button
                type="button"
                className="text-[11px] font-semibold underline"
                onClick={() => setShowDebug((prev) => !prev)}
              >
                {showDebug ? "Hide debug" : "Debug details"}
              </button>
            </div>
            {showDebug ? (
              <pre className="text-[10px] bg-amber-50 border border-amber-200 rounded-md p-2 overflow-x-auto">
                {JSON.stringify(status.debugDetails ?? {}, null, 2)}
              </pre>
            ) : null}
          </div>
        ) : null}

        {isError && (
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-red-800">
              {status.errorMessage ?? "Run failed. Retry?"}
            </span>
            {status.retryable ? (
              <Button size="sm" variant="secondary" className="h-7 text-[11px]" onClick={onRetry}>
                Retry
              </Button>
            ) : null}
          </div>
        )}

        {lastEvent && status.phase !== "error" ? (
          <div className="mt-2 text-[10px] text-gray-400">{lastEvent}</div>
        ) : null}
      </div>
      <span className="text-[10px] text-gray-400 px-1 block mt-1">{formatTimestamp(message.createdAt)}</span>
    </div>
  );
}


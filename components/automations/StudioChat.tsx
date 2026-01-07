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

const DEBUG_UI_ENABLED =
  process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_DEBUG_COPILOT_UI === "true";

type ChatRole = "user" | "assistant" | "system";
type RunPhase = "connected" | "understanding" | "drafting" | "structuring" | "drawing" | "saving" | "done" | "error";

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
    text: string;
    stepCount?: number;
    errorMessage?: string | null;
    retryable?: boolean;
    persistenceError?: boolean;
    debugDetails?: Record<string, unknown> | null;
    collapsed?: boolean;
    debugLines?: string[];
    runId?: string;
    displayLines?: string[];
    completed?: boolean;
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
  const runHeartbeatTimersRef = useRef<Map<
    string,
    { slow?: number; slower?: number; slowest?: number }
  >>(new Map());
  const runSeenServerStatusRef = useRef<Map<string, boolean>>(new Map());
  const runCompletedRef = useRef<Map<string, boolean>>(new Map());
  const lastSeqByRunIdRef = useRef<Map<string, number>>(new Map());
  const runSseEventsRef = useRef<
    Map<
      string,
      Array<{ seq?: number; eventType: string; phase?: string; message?: string; timestamp: string; ignored?: boolean }>
    >
  >(new Map());
  const [, forceSseDebugRender] = useState(0);
  const FORCE_JSON = false;
  const PHASE_COPY: Record<RunPhase, string> = {
    connected: "Connected — starting…",
    understanding: "Understanding your request…",
    drafting: "Drafting workflow steps…",
    structuring: "Structuring and numbering…",
    drawing: "Drawing flowchart…",
    saving: "Saving draft…",
    done: "Run complete",
    error: "Run failed. Retry?",
  };

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
      const clientMessageId =
        options?.reuseRunId && isRetry ? `${runId}-retry-${Date.now()}` : optimisticMessageId ?? `msg-${Date.now()}`;
      const initialText = source === "seed" ? "Understanding…" : isRetry ? "Understanding…" : "Understanding…";
      fetch("http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "debug-session",
          runId,
          hypothesisId: "H-stream-default",
          location: "StudioChat.tsx:sendMessage",
          message: "copilot_chat.streaming_default_on",
          data: { clientMessageId },
          timestamp: Date.now(),
        }),
      }).catch(() => {});

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
        text: initialText,
        errorMessage: null,
        retryable: false,
        persistenceError: false,
        debugDetails: null,
        collapsed: false,
        debugLines: [],
        runId,
        displayLines: [initialText],
        completed: false,
      };
      runSeenServerStatusRef.current.set(runId, false);
      lastSeqByRunIdRef.current.set(runId, 0);
      if (DEBUG_UI_ENABLED) {
        runSseEventsRef.current.set(runId, []);
      }
      runCompletedRef.current.set(runId, false);

      setMessages((prev) => {
        const durable = dropTransientMessages(prev);
        const existingIndex = durable.findIndex((msg) => msg.id === runId && msg.kind === "system_run");
        const next: CopilotMessage[] = [...durable];
        if (optimisticMessage) {
          next.push(optimisticMessage);
        }
        if (existingIndex >= 0) {
          next[existingIndex] = {
            ...next[existingIndex],
            kind: "system_run",
            role: "assistant",
            runStatus: baseRunStatus,
            createdAt: next[existingIndex].createdAt,
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

      const updateRunMessage = (
        updater: (status: NonNullable<CopilotMessage["runStatus"]>) => CopilotMessage["runStatus"]
      ) => {
        setMessages((prev) => {
          const next = dropTransientMessages(prev).map((msg) => {
            if (msg.id !== runId || msg.kind !== "system_run") return msg;
            const currentStatus: NonNullable<CopilotMessage["runStatus"]> =
              msg.runStatus ?? {
                phase: "understanding",
                text: "Understanding…",
                errorMessage: null,
                retryable: false,
                persistenceError: false,
                debugDetails: null,
                collapsed: false,
                debugLines: [],
                runId,
              };
            return { ...msg, runStatus: updater(currentStatus) };
          });
          return next;
        });
      };

      const appendDebugLine = (line: string) => {
        if (!DEBUG_UI_ENABLED) return;
        updateRunMessage((status) => {
          const nextLines = [...(status.debugLines ?? []), line.slice(0, 160)];
          return {
            ...status,
            debugLines: nextLines.slice(-40),
            collapsed: status.collapsed ?? true,
          };
        });
      };

      const clearHeartbeatTimers = (targetRunId: string) => {
        const timers = runHeartbeatTimersRef.current.get(targetRunId);
        if (timers) {
          if (timers.slow) window.clearTimeout(timers.slow);
          if (timers.slower) window.clearTimeout(timers.slower);
          if (timers.slowest) window.clearTimeout(timers.slowest);
          runHeartbeatTimersRef.current.delete(targetRunId);
        }
      };

      const recordSseEvent = (
        eventType: string,
        payload: { seq?: number; phase?: string; message?: string; runId?: string },
        ignored = false
      ) => {
        if (!DEBUG_UI_ENABLED) return;
        const targetRunId = payload.runId ?? runId;
        if (!targetRunId) return;
        const next = runSseEventsRef.current.get(targetRunId) ?? [];
        next.push({
          seq: payload.seq,
          eventType,
          phase: payload.phase,
          message: payload.message,
          timestamp: new Date().toISOString(),
          ignored,
        });
        if (next.length > 50) {
          next.splice(0, next.length - 50);
        }
        runSseEventsRef.current.set(targetRunId, next);
        forceSseDebugRender((value) => value + 1);
      };

      const shouldProcessEvent = (targetRunId: string | undefined, seq?: number) => {
        if (!seq || !targetRunId) return true;
        const last = lastSeqByRunIdRef.current.get(targetRunId) ?? 0;
        if (seq <= last) {
          // #region agent log
          fetch("http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId: "debug-session",
              runId,
              hypothesisId: "H1-parser",
              location: "StudioChat.tsx:shouldProcessEvent",
              message: "seq ignored",
              data: { targetRunId, seq, last },
              timestamp: Date.now(),
            }),
          }).catch(() => {});
          // #endregion
          return false;
        }
        lastSeqByRunIdRef.current.set(targetRunId, seq);
        return true;
      };

      const normalizeLine = (line: string) =>
        line
          .replace(/\u2026/g, "...")
          .replace(/\.{3,}/g, "...")
          .replace(/\s+/g, " ")
          .trim();

      const pushDisplayLine = (line: string, targetRunId: string) => {
        if (runCompletedRef.current.get(targetRunId)) return;
        updateRunMessage((status) => {
          if (status.completed) return status;
          const lines = [...(status.displayLines ?? [])];
          const normIncoming = normalizeLine(line);
          const last = lines.length ? normalizeLine(lines[lines.length - 1]) : null;
          if (last === normIncoming) {
            // #region agent log
            fetch("http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                sessionId: "debug-session",
                runId,
                hypothesisId: "H4-display",
                location: "StudioChat.tsx:pushDisplayLine",
                message: "dedupe skip",
                data: { targetRunId, line },
                timestamp: Date.now(),
              }),
            }).catch(() => {});
            // #endregion
            return { ...status, text: line, displayLines: lines };
          }
          if (lines.length === 1 && normalizeLine(lines[0]) === normIncoming) {
            // #region agent log
            fetch("http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                sessionId: "debug-session",
                runId,
                hypothesisId: "H4-display",
                location: "StudioChat.tsx:pushDisplayLine",
                message: "replace initial fallback",
                data: { targetRunId, line },
                timestamp: Date.now(),
              }),
            }).catch(() => {});
            // #endregion
            return { ...status, text: line, displayLines: [line] };
          }
          lines.push(line);
          // #region agent log
          fetch("http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId: "debug-session",
              runId,
              hypothesisId: "H4-display",
              location: "StudioChat.tsx:pushDisplayLine",
              message: "line added",
              data: { targetRunId, line, count: lines.length + 1 },
              timestamp: Date.now(),
            }),
          }).catch(() => {});
          // #endregion
          return { ...status, text: line, displayLines: lines.slice(-6) };
        });
      };

      const applyStatusFromEvent = (payload: { phase?: string; message?: string; runId?: string; seq?: number }) => {
        if (!payload.message && !payload.phase) return;
        const targetRunId = payload.runId ?? runId;
        if (runCompletedRef.current.get(targetRunId)) return;
        // #region agent log
        fetch("http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: "debug-session",
            runId,
            hypothesisId: "H1-status-flow",
            location: "StudioChat.tsx:applyStatusFromEvent",
            message: "status event received",
            data: { targetRunId, seq: payload.seq, phase: payload.phase, message: payload.message },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
        recordSseEvent("status", payload);
        if (!shouldProcessEvent(targetRunId, payload.seq)) return;
        const phaseMap: Record<string, RunPhase> = {
          connected: "connected",
          understanding: "understanding",
          drafting: "drafting",
          structuring: "structuring",
          saving: "saving",
          drawing: "drawing",
          done: "done",
          error: "error",
        };
        const mappedPhase = payload.phase && phaseMap[payload.phase] ? phaseMap[payload.phase] : undefined;
        if (payload.phase && !mappedPhase) {
          fetch("http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId: "debug-session",
              runId,
              hypothesisId: "H1-status-flow",
              location: "StudioChat.tsx:applyStatusFromEvent",
              message: "copilot_chat.unknown_phase",
              data: { phase: payload.phase },
              timestamp: Date.now(),
            }),
          }).catch(() => {});
        }
        runSeenServerStatusRef.current.set(targetRunId, true);
        clearHeartbeatTimers(targetRunId);
        const displayText =
          mappedPhase && PHASE_COPY[mappedPhase]
            ? PHASE_COPY[mappedPhase]
            : payload.message ?? PHASE_COPY[mappedPhase ?? "understanding"] ?? payload.message ?? "";
        updateRunMessage((status) => ({
          ...status,
          phase: mappedPhase ?? status.phase,
          runId: payload.runId ?? status.runId ?? runId,
          errorMessage: mappedPhase === "error" ? payload.message ?? status.errorMessage : status.errorMessage,
          retryable: mappedPhase === "error" ? true : status.retryable,
          collapsed: false,
        }));
        if (payload.runId && payload.runId !== runId) {
          appendDebugLine(`event runId: ${payload.runId}`);
        }
        pushDisplayLine(displayText, targetRunId);
      };

      const applyErrorFromEvent = (payload: { message?: string; runId?: string; seq?: number }) => {
        const targetRunId = payload.runId ?? runId;
        recordSseEvent("error", payload);
        if (!shouldProcessEvent(targetRunId, payload.seq)) return;
        const message = payload.message ?? "Run failed. Retry?";
        terminalSource = "sse";
        if (sseTerminalReceived) {
          fetch("http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId: "debug-session",
              runId,
              hypothesisId: "H2-terminal",
              location: "StudioChat.tsx:applyErrorFromEvent",
              message: "copilot_chat.terminal_once_guard_hit",
              data: { targetRunId, seq: payload.seq },
              timestamp: Date.now(),
            }),
          }).catch(() => {});
          return;
        }
        sseTerminalReceived = true;
        updateRunMessage((status) => ({
          ...status,
          phase: "error",
          errorMessage: message,
          retryable: true,
          collapsed: false,
          completed: true,
        }));
        runCompletedRef.current.set(targetRunId, true);
        pushDisplayLine(message, targetRunId);
        // #region agent log
        fetch("http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: "debug-session",
            runId,
            hypothesisId: "H2-terminal",
            location: "StudioChat.tsx:applyErrorFromEvent",
            message: "error terminal processed",
            data: { targetRunId, seq: payload.seq, message },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
      };

      setIsSending(true);
      setIsAwaitingReply(true);

      let stepCount = 0;
      let nodeCount: number | null = null;
      let persistenceError = false;
      let receivedTerminalEvent = false;
      let sseFirstChunkReceived = false;
      let sseTerminalReceived = false;
      let metricsLogged = false;
      const fetchStartedAt = Date.now();
      let firstChunkMs: number | null = null;
      let chunkCount = 0;
      let terminalSource: "sse" | "fallback" | "auth_error" | "http_error" | null = null;

      const logStreamMetrics = () => {
        if (metricsLogged) return;
        metricsLogged = true;
        fetch("http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: "debug-session",
            runId,
            hypothesisId: "H-metrics",
            location: "StudioChat.tsx:sendMessage",
            message: "copilot_chat.stream_metrics",
            data: {
              runId,
              requestId,
              firstChunkMs,
              chunkCount,
              terminalSource,
            },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
      };

      const applyResultPayload = async (
        rawData: {
          runId?: string;
          workflow?: Workflow | { workflowSpec?: Workflow } | { workflowJson?: Workflow } | { blueprintJson?: Workflow };
          message?: ApiCopilotMessage;
          progress?: WorkflowProgressSnapshot | null;
          tasks?: Task[];
          persistenceError?: boolean;
          seq?: number;
        },
        responseRunId: string,
        source: "sse" | "fallback"
      ) => {
        if (source === "sse") {
          terminalSource = "sse";
          if (sseTerminalReceived) {
            fetch("http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                sessionId: "debug-session",
                runId,
                hypothesisId: "H2-terminal",
                location: "StudioChat.tsx:applyResultPayload",
                message: "copilot_chat.terminal_once_guard_hit",
                data: { responseRunId, seq: rawData.seq },
                timestamp: Date.now(),
              }),
            }).catch(() => {});
            return { ok: true as const, stepCount, nodeCount, persistenceError, runId: responseRunId };
          }
          sseTerminalReceived = true;
          const timers = runHeartbeatTimersRef.current.get(responseRunId);
          if (timers) {
            if (timers.slow) window.clearTimeout(timers.slow);
            if (timers.slower) window.clearTimeout(timers.slower);
            if (timers.slowest) window.clearTimeout(timers.slowest);
            runHeartbeatTimersRef.current.delete(responseRunId);
          }
        } else if (sseTerminalReceived || sseFirstChunkReceived) {
          // #region agent log
          fetch("http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId: "debug-session",
              runId,
              hypothesisId: "H2-terminal",
              location: "StudioChat.tsx:applyResultPayload",
              message: "copilot_chat.fallback_blocked_due_to_sse",
              data: { responseRunId, source },
              timestamp: Date.now(),
            }),
          }).catch(() => {});
          // #endregion
          return { ok: true as const, stepCount, nodeCount, persistenceError, runId: responseRunId };
        }
        recordSseEvent("result", {
          runId: responseRunId,
          seq: rawData.seq,
          message: rawData.message?.content,
          phase: "result",
        });
        if (!shouldProcessEvent(responseRunId, rawData.seq)) {
          // #region agent log
          fetch("http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId: "debug-session",
              runId,
              hypothesisId: "H1-parser",
              location: "StudioChat.tsx:applyResultPayload",
              message: "result seq ignored",
              data: { responseRunId, seq: rawData.seq, source },
              timestamp: Date.now(),
            }),
          }).catch(() => {});
          // #endregion
          return { ok: true as const, stepCount, nodeCount, persistenceError, runId: responseRunId };
        }
        // #region agent log
        fetch("http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: "debug-session",
            runId,
            hypothesisId: "H2-terminal",
            location: "StudioChat.tsx:applyResultPayload",
            message: "result event processed",
            data: { responseRunId, seq: rawData.seq, source, sseTerminalReceived, sseFirstChunkReceived },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
        // Accept legacy alias where workflow lives under workflowSpec
        const normalizedWorkflow =
          rawData.workflow && "workflowJson" in rawData.workflow && rawData.workflow.workflowJson
            ? (rawData.workflow.workflowJson as Workflow)
            : rawData.workflow && "workflowSpec" in rawData.workflow && rawData.workflow.workflowSpec
            ? (rawData.workflow.workflowSpec as Workflow)
            : rawData.workflow && "blueprintJson" in rawData.workflow && rawData.workflow.blueprintJson
            ? (rawData.workflow.blueprintJson as Workflow)
            : (rawData.workflow as Workflow | null | undefined);

        const data = {
          ...rawData,
          workflow: normalizedWorkflow,
        };
        appendDebugLine(`runId: ${responseRunId}`);
        updateRunMessage((status) => ({ ...status, runId: responseRunId }));

        const isLatest = requestId === pendingRequestIdRef.current;

        if (data.workflow && onWorkflowUpdates && isLatest) {
          stepCount = data.workflow.steps?.length ?? 0;
          if (stepCount === 0) {
            updateRunMessage((status) => ({
              ...status,
              phase: "error",
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
            pushDisplayLine("No steps generated — retry", responseRunId);
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
            onWorkflowUpdatingChange?.(true);
            onWorkflowUpdates(data.workflow);
            updateRunMessage((status) => ({
              ...status,
              phase: "drawing",
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
          errorMessage: finalPhase === "error" ? status.errorMessage ?? "Run failed" : null,
          retryable: finalPhase === "error",
          stepCount: stepCount || status.stepCount,
          collapsed: false,
        }));

        if (!runCompletedRef.current.get(responseRunId)) {
          const terminalLine =
            finalPhase === "done"
              ? "Saved. Ready for review."
              : "Run failed. Retry?";
          pushDisplayLine(terminalLine, responseRunId);
          runCompletedRef.current.set(responseRunId, true);
          updateRunMessage((status) => ({
            ...status,
            completed: true,
          }));
          // #region agent log
          fetch("http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId: "debug-session",
              runId,
              hypothesisId: "H2-terminal",
              location: "StudioChat.tsx:applyResultPayload",
              message: "terminal line pushed",
              data: { responseRunId, terminalLine },
              timestamp: Date.now(),
            }),
          }).catch(() => {});
          // #endregion
        }

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
        receivedTerminalEvent = true;
        return { ok: true as const, stepCount, nodeCount, persistenceError, runId: responseRunId };
      };

      const decoder = new TextDecoder();

      const attemptStreaming = async () => {
        if (FORCE_JSON) {
          fetch("http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId: "debug-session",
              runId,
              hypothesisId: "H0-stream",
              location: "StudioChat.tsx:attemptStreaming",
              message: "stream skipped FORCE_JSON",
              data: {},
              timestamp: Date.now(),
            }),
          }).catch(() => {});
          return false;
        }
        const controller = new AbortController();
        const idleTimeoutMs = 60_000;
        const maxTimeoutMs = 70_000;
        let idleTimer: number | null = null;
        let maxTimer: number | null = null;
        let abortedByTimeout = false;
        let abortedByIdle = false;
        let parsedCount = 0;
        let terminalType: string | null = null;
        let idleArmed = false;
        // #region agent log
        fetch("http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: "debug-session",
            runId,
            hypothesisId: "H0-stream",
            location: "StudioChat.tsx:attemptStreaming",
            message: "stream start",
            data: {},
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
        const resetIdle = () => {
          if (idleTimer) window.clearTimeout(idleTimer);
          idleTimer = window.setTimeout(() => {
            abortedByIdle = true;
            controller.abort();
          }, idleTimeoutMs);
        };
        const startMax = () => {
          maxTimer = window.setTimeout(() => {
            abortedByTimeout = true;
            controller.abort();
          }, maxTimeoutMs);
        };

        const clearAllTimers = () => {
          if (idleTimer) window.clearTimeout(idleTimer);
          if (maxTimer) window.clearTimeout(maxTimer);
        };

        try {
          const response = await fetch(
            `/api/automation-versions/${automationVersionId}/copilot/chat?stream=1`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Accept: "text/event-stream",
              },
              body: JSON.stringify({
                content: trimmed,
                clientMessageId,
              }),
              signal: controller.signal,
            }
          );

          // #region agent log
          fetch("http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId: "debug-session",
              runId,
              hypothesisId: "H0-stream",
              location: "StudioChat.tsx:attemptStreaming",
              message: "response headers",
              data: {
                status: response.status,
                ok: response.ok,
                contentType: response.headers.get("content-type"),
                hasBody: Boolean(response.body),
              },
              timestamp: Date.now(),
            }),
          }).catch(() => {});
          // #endregion

          if (response.status === 401 || response.status === 403) {
            fetch("http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                sessionId: "debug-session",
                runId,
                hypothesisId: "H-auth",
                location: "StudioChat.tsx:attemptStreaming",
                message: "copilot_chat.auth_error",
                data: { status: response.status },
                timestamp: Date.now(),
              }),
            }).catch(() => {});
            const authMessage = response.status === 401 ? "Unauthorized" : "Forbidden";
            terminalSource = "auth_error";
            pushDisplayLine(authMessage, runId);
            runCompletedRef.current.set(runId, true);
            updateRunMessage((status) => ({ ...status, completed: true, phase: "error", errorMessage: authMessage }));
            logStreamMetrics();
            return false;
          }

          if (!response.ok || !response.body) {
            // #region agent log
            let textBody = "";
            try {
              textBody = await response.text();
            } catch {
              textBody = "";
            }
            fetch("http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                sessionId: "debug-session",
                runId,
                hypothesisId: "H0-stream",
                location: "StudioChat.tsx:attemptStreaming",
                message: "response not ok/body missing",
                data: {
                  status: response.status,
                  ok: response.ok,
                  hasBody: Boolean(response.body),
                  contentType: response.headers.get("content-type"),
                  body: textBody.slice(0, 300),
                },
                timestamp: Date.now(),
              }),
            }).catch(() => {});
            // #endregion
            terminalSource = response.ok ? "http_error" : "http_error";
            logStreamMetrics();
            return false;
          }

        const reader = response.body.getReader();
          startMax();
          // #region agent log
          fetch("http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId: "debug-session",
              runId,
              hypothesisId: "H0-stream",
              location: "StudioChat.tsx:attemptStreaming",
              message: "reader acquired",
              data: { contentType: response.headers.get("content-type") },
              timestamp: Date.now(),
            }),
          }).catch(() => {});
          // #endregion
          let buffer = "";
          let chunkCount = 0;

          while (true) {
            const { value, done } = await reader.read();
            if (done) {
              // #region agent log
              fetch("http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  sessionId: "debug-session",
                  runId,
                  hypothesisId: "H0-stream",
                  location: "StudioChat.tsx:attemptStreaming",
                  message: "reader done",
                  data: { parsedCount, terminalType },
                  timestamp: Date.now(),
                }),
              }).catch(() => {});
              // #endregion
              break;
            }
            // #region agent log
            fetch("http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                sessionId: "debug-session",
                runId,
                hypothesisId: "H1-parser",
                location: "StudioChat.tsx:attemptStreaming",
                message: "chunk read",
                data: { size: value?.length ?? 0, chunkCount: chunkCount + 1 },
                timestamp: Date.now(),
              }),
            }).catch(() => {});
            // #endregion
            chunkCount += 1;
            if (!idleArmed) {
              resetIdle();
              idleArmed = true;
            }
            if (value && value.length > 0) {
              sseFirstChunkReceived = true;
              if (firstChunkMs === null) {
                firstChunkMs = Date.now() - fetchStartedAt;
              }
            }
            buffer += decoder.decode(value, { stream: true });
            const parts = buffer.split("\n\n");
            buffer = parts.pop() ?? "";
            for (const part of parts) {
              const lines = part.split("\n");
              let eventType = "message";
              const dataLines: string[] = [];
              for (const line of lines) {
                if (line.startsWith("event:")) {
                  eventType = line.slice("event:".length).trim();
                } else if (line.startsWith("data:")) {
                  dataLines.push(line.slice("data:".length).trim());
                }
              }
              const dataText = dataLines.join("\n");
              if (!dataText) continue;
              try {
                const parsed = JSON.parse(dataText);
                const eventRunId = parsed.runId ?? runId;
                const effectiveType =
                  eventType?.trim() ||
                  (typeof parsed.event === "string" && parsed.event.trim()) ||
                  (typeof parsed.type === "string" && parsed.type.trim()) ||
                  (parsed.message ? "status" : undefined) ||
                  "status";

                const isPing =
                  effectiveType.toLowerCase() === "ping" || (parsed && typeof parsed === "object" && parsed.ping === true);
                parsedCount += 1;
                recordSseEvent(effectiveType, { ...parsed, runId: eventRunId }, isPing);
                // #region agent log
                fetch("http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    sessionId: "debug-session",
                    runId,
                    hypothesisId: "H1-parser",
                    location: "StudioChat.tsx:attemptStreaming",
                    message: "SSE chunk parsed",
                    data: { effectiveType, eventType, hasMessage: Boolean(parsed?.message), seq: parsed?.seq },
                    timestamp: Date.now(),
                  }),
                }).catch(() => {});
                // #endregion
                if (isPing) {
                  resetIdle();
                  continue;
                }

                resetIdle();

                if (effectiveType === "status") {
                  applyStatusFromEvent({ ...parsed, runId: eventRunId });
                } else if (effectiveType === "result") {
                  terminalType = "result";
                  await applyResultPayload(parsed, eventRunId, "sse");
                  await reader.cancel();
                  controller.abort();
                  clearAllTimers();
                  return true;
                } else if (effectiveType === "error") {
                  terminalType = "error";
                  applyErrorFromEvent({ ...parsed, runId: eventRunId });
                  await reader.cancel();
                  controller.abort();
                  clearAllTimers();
                  return true;
                }
              } catch (parseError) {
                // #region agent log
                fetch("http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    sessionId: "debug-session",
                    runId,
                    hypothesisId: "H1-parser",
                    location: "StudioChat.tsx:attemptStreaming",
                    message: "parse error",
                    data: { part: part.slice(0, 200) },
                    timestamp: Date.now(),
                  }),
                }).catch(() => {});
                // #endregion
                logger.warn("[STUDIO-CHAT] Failed to parse SSE message", parseError);
              }
            }
          }
          clearAllTimers();
          // #region agent log
          fetch("http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId: "debug-session",
              runId,
              hypothesisId: "H0-stream",
              location: "StudioChat.tsx:attemptStreaming",
              message: "stream exit",
              data: { parsedCount, terminalType, receivedTerminalEvent },
              timestamp: Date.now(),
            }),
          }).catch(() => {});
          // #endregion
          return receivedTerminalEvent;
        } catch (error) {
          if (DEBUG_UI_ENABLED && (abortedByTimeout || abortedByIdle)) {
            logger.warn("[STUDIO-CHAT] SSE aborted", {
              runId,
              reason: abortedByTimeout ? "timeout" : abortedByIdle ? "idle_timeout" : "error",
            });
            // #region agent log
            fetch("http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                sessionId: "debug-session",
                runId,
                hypothesisId: "H3-timeout",
                location: "StudioChat.tsx:attemptStreaming",
                message: "SSE aborted fallback",
                data: { abortedByTimeout, abortedByIdle },
                timestamp: Date.now(),
              }),
            }).catch(() => {});
            // #endregion
          }
          // #region agent log
          fetch("http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId: "debug-session",
              runId,
              hypothesisId: "H0-stream",
              location: "StudioChat.tsx:attemptStreaming",
              message: "stream error",
              data: { abortedByTimeout, abortedByIdle, error: error instanceof Error ? error.message : String(error) },
              timestamp: Date.now(),
            }),
          }).catch(() => {});
          // #endregion
          logger.warn("[STUDIO-CHAT] SSE stream failed, falling back", error);
          return false;
        }
      };

      try {
        updateRunMessage((status) => ({
          ...status,
          phase: "drafting",
          errorMessage: null,
          retryable: false,
          persistenceError: false,
          debugDetails: null,
          collapsed: false,
        }));

        const slowTimer = window.setTimeout(() => {
          if (runSeenServerStatusRef.current.get(runId)) return;
          updateRunMessage((status) => ({
            ...status,
            text: status.displayLines?.length ? status.text : "Still working…",
          }));
        }, 800);
        const slowerTimer = window.setTimeout(() => {
          if (runSeenServerStatusRef.current.get(runId)) return;
          updateRunMessage((status) => ({
            ...status,
            text: status.displayLines?.length ? status.text : "Pulling systems + edge cases…",
          }));
        }, 3000);
        const slowestTimer = window.setTimeout(() => {
          if (runSeenServerStatusRef.current.get(runId)) return;
          updateRunMessage((status) => ({
            ...status,
            text: status.displayLines?.length ? status.text : "Almost there…",
          }));
        }, 8000);
        runHeartbeatTimersRef.current.set(runId, { slow: slowTimer, slower: slowerTimer, slowest: slowestTimer });

        const streamFinished = await attemptStreaming();

        if (!streamFinished) {
          if (sseFirstChunkReceived || sseTerminalReceived) {
            fetch("http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                sessionId: "debug-session",
                runId,
                hypothesisId: "H2-terminal",
                location: "StudioChat.tsx:sendMessage",
                message: "copilot_chat.fallback_blocked_due_to_sse",
                data: { sseFirstChunkReceived, sseTerminalReceived },
                timestamp: Date.now(),
              }),
            }).catch(() => {});
            logStreamMetrics();
            return { ok: true as const, stepCount, nodeCount, persistenceError, runId };
          }
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

          const rawData = await chatResponse.json();
          // #region agent log
          fetch("http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId: "debug-session",
              runId,
              hypothesisId: "H2-terminal",
              location: "StudioChat.tsx:sendMessage",
              message: "fallback result path",
              data: { hasRunId: Boolean(rawData.runId), hasWorkflow: Boolean(rawData.workflow) },
              timestamp: Date.now(),
            }),
          }).catch(() => {});
          // #endregion
          const result = await applyResultPayload(rawData, rawData.runId ?? runId, "fallback");
          logStreamMetrics();
          return result;
        }

        logStreamMetrics();
        return { ok: true as const, stepCount, nodeCount, persistenceError, runId };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to send message. Try again.";
        logger.error("[STUDIO-CHAT] Failed to process message:", error);
        updateRunMessage((status) => ({
          ...status,
          phase: "error",
          text: "Error — retry",
          errorMessage: message,
          retryable: true,
          collapsed: false,
        }));
        return { ok: false as const };
      } finally {
        clearHeartbeatTimers(runId);
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
                  <RunBubble
                    message={msg}
                    onRetry={() => handleRunRetry(msg.id)}
                    sseEvents={DEBUG_UI_ENABLED ? runSseEventsRef.current.get(msg.id) ?? [] : undefined}
                  />
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

type RunSseEvent = { seq?: number; eventType: string; phase?: string; message?: string; timestamp: string };

function RunBubble({
  message,
  onRetry,
  sseEvents,
}: {
  message: CopilotMessage;
  onRetry: () => void;
  sseEvents?: RunSseEvent[];
}) {
  const status = message.runStatus;
  const [showDebug, setShowDebug] = useState(false);
  const [showDebugLines, setShowDebugLines] = useState(false);
  const [showSseEvents, setShowSseEvents] = useState(false);

  if (!status) return null;

  const isError = status.phase === "error";
  const showErrorLine = isError && status.errorMessage && status.errorMessage !== status.text;
  const hasSseEvents = DEBUG_UI_ENABLED && (sseEvents?.length ?? 0) > 0;
  const displayLines = status.displayLines?.length ? status.displayLines : status.text ? [status.text] : [];
  const lastEvent = displayLines[displayLines.length - 1];

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
          {displayLines.map((line, idx) => (
            <div className="flex items-start gap-2" key={`${message.id}-line-${idx}`}>
              <span className="mt-1 block h-1.5 w-1.5 rounded-full bg-gray-400" />
              <span className="font-medium">{line}</span>
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
            {showErrorLine ? (
              <span className="text-xs font-semibold text-red-800">
                {status.errorMessage ?? "Run failed. Retry?"}
              </span>
            ) : (
              <span className="text-xs font-semibold text-red-800">Run failed. Retry?</span>
            )}
            {status.retryable ? (
              <Button size="sm" variant="secondary" className="h-7 text-[11px]" onClick={onRetry}>
                Retry
              </Button>
            ) : null}
          </div>
        )}

        {DEBUG_UI_ENABLED && (status.debugLines?.length || status.runId || hasSseEvents) ? (
          <div className="mt-3 border-t border-gray-200 pt-2">
            <div className="flex items-center justify-between text-[11px] text-gray-600">
              <span className="font-semibold">Debug</span>
              <button
                type="button"
                className="text-[11px] underline"
                onClick={() => setShowDebugLines((prev) => !prev)}
              >
                {showDebugLines ? "Hide" : "Show"}
              </button>
            </div>
            {showDebugLines ? (
              <div className="mt-1 space-y-1 text-[11px] text-gray-700">
                {status.runId ? (
                  <div className="font-mono text-[10px] text-gray-500">runId: {status.runId}</div>
                ) : null}
                {(status.debugLines ?? []).map((line, idx) => (
                  <div key={`${message.id}-dbg-${idx}`} className="font-mono text-[10px] text-gray-600 truncate">
                    {line}
                  </div>
                ))}
              </div>
            ) : null}
            {hasSseEvents ? (
              <div className="mt-3 border-t border-gray-200 pt-2">
                <div className="flex items-center justify-between text-[11px] text-gray-600">
                  <span className="font-semibold">SSE</span>
                  <button
                    type="button"
                    className="text-[11px] underline"
                    onClick={() => setShowSseEvents((prev) => !prev)}
                  >
                    {showSseEvents ? "Hide" : "Show"}
                  </button>
                </div>
                {showSseEvents ? (
                  <div className="mt-1 space-y-1 text-[11px] text-gray-700">
                    {(sseEvents ?? []).map((evt, idx) => (
                      <div key={`${message.id}-sse-${idx}`} className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-gray-500 w-10">
                          {evt.seq !== undefined ? `#${evt.seq}` : "-"}
                        </span>
                        <div className="flex-1 truncate">
                          <span className="font-semibold mr-1">{evt.eventType}</span>
                          {evt.phase ? <span className="text-gray-500 mr-1">{evt.phase}</span> : null}
                          {evt.message ? <span className="text-gray-700">{evt.message}</span> : null}
                        </div>
                        <span className="text-[9px] text-gray-400">
                          {new Date(evt.timestamp).toLocaleTimeString(undefined, {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {lastEvent && status.phase !== "error" ? (
          <div className="mt-2 text-[10px] text-gray-400">{lastEvent}</div>
        ) : null}
      </div>
      <span className="text-[10px] text-gray-400 px-1 block mt-1">{formatTimestamp(message.createdAt)}</span>
    </div>
  );
}


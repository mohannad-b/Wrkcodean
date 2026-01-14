"use client";

import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Send, Sparkles, Paperclip, Loader2, X, FileText, Image as ImageIcon } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useUserProfile } from "@/components/providers/user-profile-provider";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import type { WorkflowUpdates } from "@/lib/workflows/ai-updates";
import type { Workflow } from "@/lib/workflows/types";
import { workflowToNodes } from "@/lib/workflows/canvas-utils";
import type {
  CopilotAnalysisState,
  ReadinessSignals,
  WorkflowProgressSnapshot,
} from "@/lib/workflows/copilot-analysis";
import type { Task } from "@/db/schema";
import { logger } from "@/lib/logger";
// Legacy status normalization/derivation removed; keep UI lean.

const DEBUG_UI_ENABLED =
  process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_DEBUG_COPILOT_UI === "true";
const INGEST_URL = process.env.NEXT_PUBLIC_COPILOT_INGEST_URL;
const AGENT_LOG_URL = "http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc";
const agentFetch: typeof fetch = DEBUG_UI_ENABLED
  ? fetch
  : async () => undefined as unknown as Response;

const ingest = (payload: Record<string, unknown>) => {
  if (!INGEST_URL) return;
  fetch(INGEST_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {});
};

type ChatRole = "user" | "assistant" | "system";
type RunPhase = "connected" | "understanding" | "drafting" | "structuring" | "drawing" | "saving" | "done" | "error";

export interface CopilotMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  optimistic?: boolean;
  transient?: boolean;
  clientMessageId?: string | null;
  kind?: "proceed_cta";
  proceedMeta?: {
    uiStyle?: string | null;
  };
}

type BuildActivity = {
  runId: string;
  phase: string;
  lastSeq?: number | null;
  rawPhase?: string | null;
  lastLine: string | null;
  startedAt?: number | null;
  completedAt?: number | null;
  isRunning: boolean;
};

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
  onWorkflowUpdatingChange?: (isUpdating: boolean) => void;
  analysis?: CopilotAnalysisState | null;
  analysisLoading?: boolean;
  onRefreshAnalysis?: () => void | Promise<void>;
  onBuildActivityUpdate?: (activity: BuildActivity | null) => void;
  analysisUnavailable?: boolean;
  onProceedToBuild?: () => void;
  proceedToBuildDisabled?: boolean;
  proceedToBuildReason?: string | null;
  proceedingToBuild?: boolean;
  onReadinessUpdate?: (payload: {
    runId?: string;
    readinessScore?: number;
    proceedReady?: boolean;
    proceedReason?: string | null;
    proceedBasicsMet?: boolean;
    proceedThresholdMet?: boolean;
    signals?: ReadinessSignals;
  }) => void;
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

const mergeTranscript = (existing: CopilotMessage[], incoming: CopilotMessage[]) => {
  const byId = new Map<string, CopilotMessage>();
  const byClient = new Map<string, CopilotMessage>();
  existing
    .forEach((m) => {
      if (m.clientMessageId) byClient.set(m.clientMessageId, m);
      byId.set(m.id, m);
    });

  incoming.forEach((m) => {
    if (m.clientMessageId && byClient.has(m.clientMessageId)) {
      byId.delete(byClient.get(m.clientMessageId)!.id);
    } else if (m.clientMessageId) {
      byClient.set(m.clientMessageId, m);
    }

    // Fallback: match optimistic user bubbles without clientMessageId
    if (!m.clientMessageId && m.role === "user") {
      const optimistic = existing.find(
        (msg) =>
          msg.optimistic &&
          msg.role === "user" &&
          msg.content.trim() === m.content.trim() &&
          Math.abs(new Date(msg.createdAt).getTime() - new Date(m.createdAt).getTime()) < 15_000
      );
      if (optimistic) {
        byId.delete(optimistic.id);
      }
    }

    byId.set(m.id, m);
  });

  const merged = Array.from(byId.values()).sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  return merged.length ? merged : [INITIAL_AI_MESSAGE];
};

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
  onWorkflowUpdatingChange,
  onRefreshAnalysis,
  onBuildActivityUpdate,
  analysis,
  analysisLoading = false,
  onProceedToBuild,
  proceedToBuildDisabled = false,
  proceedToBuildReason = null,
  proceedingToBuild = false,
  onReadinessUpdate,
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
  const [attachedFiles, setAttachedFiles] = useState<Array<{ id: string; filename: string; url: string; type: string }>>([]);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const lastSentContentRef = useRef<string | null>(null);
  const zeroStepLogGuardRef = useRef<Set<number>>(new Set());
  const injectedFailureRef = useRef<{ id: string; at: number } | null>(null);
  const runContentRef = useRef<Map<string, string>>(new Map());
  const analysisRefreshRef = useRef<Map<string, number>>(new Map());
  const activeControllerRef = useRef<AbortController | null>(null);
  const activeRunIdRef = useRef<string | null>(null);
  const runSeenServerStatusRef = useRef<Map<string, boolean>>(new Map());
  const runCompletedRef = useRef<Map<string, boolean>>(new Map());
  const seenSeqByRunIdRef = useRef<Map<string, Set<number>>>(new Map());
  const sseFirstChunkByRunIdRef = useRef<Map<string, boolean>>(new Map());
  const activityByRunRef = useRef<Map<string, BuildActivity>>(new Map());
  const runSseEventsRef = useRef<
    Map<
      string,
      Array<{ seq?: number; eventType: string; phase?: string; message?: string; timestamp: string; ignored?: boolean }>
    >
  >(new Map());
  const [, forceSseDebugRender] = useState(0);
  const FORCE_JSON = false;
  const runUsedServerMessageRef = useRef<Map<string, boolean>>(new Map());
  const runCopySourceLoggedRef = useRef<Map<string, boolean>>(new Map());
  const [localAnalysis, setLocalAnalysis] = useState<CopilotAnalysisState | null>(analysis ?? null);
  const [localAnalysisLoading, setLocalAnalysisLoading] = useState(false);

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

  const renderMessages = useMemo(() => {
    const seen = new Set<string>();
    const filtered = messages.filter((message) => {
      if (!message?.id) return false;
      if (seen.has(message.id)) return false;
      seen.add(message.id);
      return true;
    });
    return filtered;
  }, [messages]);
  const [buildActivity, setBuildActivity] = useState<BuildActivity | null>(null);

  const mapApiMessage = useCallback(
    (message: ApiCopilotMessage): CopilotMessage => ({
      id: message.id,
      role: message.role,
      content: message.role === "assistant" ? stripWorkflowBlocks(message.content) : message.content,
      createdAt: message.createdAt,
      clientMessageId: (message as any)?.clientMessageId ?? null,
    }),
    []
  );

  const loadMessages = useCallback(
    async (options: { mergeWithExisting?: boolean; silent?: boolean } = {}) => {
      if (!automationVersionId) {
        setMessages([INITIAL_AI_MESSAGE]);
        return;
      }

      const { mergeWithExisting = true, silent = false } = options;
      if (!silent) {
        setIsLoadingThread(true);
      }

      try {
        const response = await fetch(`/api/automation-versions/${automationVersionId}/messages`, { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Failed to load messages");
        }
        const data: { messages: ApiCopilotMessage[] } = await response.json();
        const mapped = data.messages.map(mapApiMessage);
        setMessages((prev) => mergeTranscript(mergeWithExisting ? prev : [], mapped));
      } catch (error) {
        logger.error("[STUDIO-CHAT] Failed to load messages", error);
        setMessages([INITIAL_AI_MESSAGE]);
      } finally {
        if (!silent) {
          setIsLoadingThread(false);
        }
      }
    },
    [automationVersionId, mapApiMessage]
  );

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: "smooth" });
    // #region agent log
    agentFetch(AGENT_LOG_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "debug-session",
        runId: activeRunIdRef.current ?? "none",
        hypothesisId: "H4-render",
        location: "StudioChat.tsx:messages effect",
        message: "messages state updated",
        data: {
          count: messages.length,
          ids: messages.map((m) => m.id),
          roles: messages.map((m) => m.role),
          kinds: messages.map((m) => m.kind ?? null),
          contentPreviews: messages.map((m) => m.content?.slice(0, 80)),
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // console debug (focus on status-driven flow only)
    // #endregion
    // #region agent log
    requestAnimationFrame(() => {
      const bubbleCount = document.querySelectorAll('[data-testid="copilot-message-bubble"]').length;
      const firstAssistant = document.querySelector('[data-testid="copilot-message-bubble"][data-role="assistant"]') as HTMLElement | null;
      const lastAssistant = (() => {
        const all = Array.from(document.querySelectorAll('[data-testid="copilot-message-bubble"][data-role="assistant"]')) as HTMLElement[];
        return all.length ? all[all.length - 1] : null;
      })();
      const rect = firstAssistant?.getBoundingClientRect();
      const lastRect = lastAssistant?.getBoundingClientRect();
      const style = firstAssistant ? window.getComputedStyle(firstAssistant) : null;
      const lastStyle = lastAssistant ? window.getComputedStyle(lastAssistant) : null;
      const allBubbles = Array.from(document.querySelectorAll('[data-testid="copilot-message-bubble"]')) as HTMLElement[];
      const renderSnapshot = allBubbles.map((el) => ({
        id: el.dataset?.id ?? null,
        role: el.dataset?.role ?? null,
        text: el.innerText?.slice(0, 140) ?? null,
        rect: (() => {
          const r = el.getBoundingClientRect();
          return { top: r.top, left: r.left, width: r.width, height: r.height };
        })(),
        display: window.getComputedStyle(el).display,
        opacity: window.getComputedStyle(el).opacity,
      }));
      // console debug (focus on status-driven flow only)
      agentFetch(AGENT_LOG_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "debug-session",
          runId: activeRunIdRef.current ?? "none",
          hypothesisId: "H4-render",
          location: "StudioChat.tsx:messages effect",
          message: "bubble dom count",
          data: {
            bubbleCount,
            firstAssistant: firstAssistant
              ? {
                  id: firstAssistant.dataset?.id ?? null,
                  rect: rect
                    ? {
                        top: rect.top,
                        left: rect.left,
                        width: rect.width,
                        height: rect.height,
                      }
                    : null,
                  display: style?.display ?? null,
                  opacity: style?.opacity ?? null,
                  color: style?.color ?? null,
                  backgroundColor: style?.backgroundColor ?? null,
                }
              : null,
            lastAssistant: lastAssistant
              ? {
                  id: lastAssistant.dataset?.id ?? null,
                  rect: lastRect
                    ? { top: lastRect.top, left: lastRect.left, width: lastRect.width, height: lastRect.height }
                    : null,
                  display: lastStyle?.display ?? null,
                  opacity: lastStyle?.opacity ?? null,
                  color: lastStyle?.color ?? null,
                  backgroundColor: lastStyle?.backgroundColor ?? null,
                }
              : null,
            renderSnapshot: renderSnapshot.slice(0, 30),
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      if (allBubbles.length) {
        allBubbles[allBubbles.length - 1].scrollIntoView({ behavior: "smooth", block: "end" });
      }
    });
    // #endregion
  }, [messages]);

  useEffect(() => {
    let cancelled = false;
    if (!automationVersionId) {
      setMessages([INITIAL_AI_MESSAGE]);
      setBuildActivity(null);
      setIsLoadingThread(false);
      return;
    }

    void (async () => {
      await loadMessages({ mergeWithExisting: false });
      if (cancelled) return;
    })();

    return () => {
      cancelled = true;
    };
  }, [automationVersionId, loadMessages]);

  useEffect(() => {
    if (prevWorkflowEmptyRef.current && !workflowEmpty) {
      setMessages((prev) => [
        ...prev,
      ]);
    }
    prevWorkflowEmptyRef.current = workflowEmpty;
  }, [workflowEmpty]);

  const durableMessages = useMemo(() => messages, [messages]);

  useEffect(() => {
    onConversationChange?.(durableMessages);
  }, [durableMessages, onConversationChange]);

  useEffect(() => {
    if (analysis) {
      setLocalAnalysis(analysis);
    }
  }, [analysis]);

  const refreshAnalysis = useCallback(async () => {
    if (!automationVersionId) return;
    setLocalAnalysisLoading(true);
    try {
      if (onRefreshAnalysis) {
        await onRefreshAnalysis();
      }
      const response = await fetch(`/api/automation-versions/${automationVersionId}/copilot/analysis`, { cache: "no-store" });
      if (response.ok) {
        const payload = await response.json();
        setLocalAnalysis(payload.analysis ?? null);
      }
    } catch (error) {
      logger.error("[STUDIO-CHAT] Failed to refresh analysis", error);
    } finally {
      setLocalAnalysisLoading(false);
    }
  }, [automationVersionId, onRefreshAnalysis]);

  useEffect(() => {
    if (!analysis && automationVersionId) {
      void refreshAnalysis();
    }
  }, [analysis, automationVersionId, refreshAnalysis]);

  const effectiveAnalysis = analysis ?? localAnalysis;
  const analysisState =
    analysisLoading || localAnalysisLoading ? "loading" : effectiveAnalysis ? "ready" : "idle";

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

  const upsertBuildActivityFromEvent = useCallback(
    (
      targetRunId: string,
      updates: {
        phase?: string;
        rawPhase?: string | null;
        lastSeq?: number | null;
        message?: string | null;
        isRunning?: boolean;
        completedAt?: number | null;
        startedAt?: number | null;
      }
    ) => {
      const prev = activityByRunRef.current.get(targetRunId);
      const startedAt = prev?.startedAt ?? updates.startedAt ?? Date.now();
      const phase = updates.phase ?? prev?.phase ?? "working";
      const rawPhase = updates.rawPhase ?? phase;
      const trimmedMessage = updates.message?.trim() ?? "";
      const nextLastLine = trimmedMessage.length > 0 ? trimmedMessage : prev?.lastLine ?? null;
      const lastSeq = updates.lastSeq ?? prev?.lastSeq ?? null;
      const isTerminal = phase.toLowerCase() === "done" || phase.toLowerCase() === "error";
      const completedAt =
        updates.completedAt ?? (isTerminal ? prev?.completedAt ?? Date.now() : prev?.completedAt ?? null);
      const isRunning = updates.isRunning ?? !isTerminal;

      const next: BuildActivity = {
        runId: targetRunId,
        phase,
        rawPhase,
        lastSeq,
        lastLine: nextLastLine,
        startedAt,
        completedAt,
        isRunning,
      };

      activityByRunRef.current.set(targetRunId, next);
      setBuildActivity(next);
      onBuildActivityUpdate?.(next);
      if (isTerminal) {
        const wasCompleted = runCompletedRef.current.get(targetRunId) ?? false;
        if (!wasCompleted) {
          console.log(
            `[SSE activity] runCompletedRef set run=${targetRunId} seq=${lastSeq ?? "n/a"} phase=${phase}`
          );
        }
        runCompletedRef.current.set(targetRunId, true);
      }
    },
    [onBuildActivityUpdate]
  );

  const sendMessage = useCallback(
    async (
      messageContent: string,
      _source: "manual" | "seed",
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
      const makeTempId = () =>
        (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `temp-${Date.now()}-${Math.random().toString(16).slice(2)}`);
      const optimisticMessageId = isRetry ? options?.reuseRunId ?? null : makeTempId();
      const requestId = pendingRequestIdRef.current + 1;
      pendingRequestIdRef.current = requestId;
      const runId = options?.reuseRunId ?? optimisticMessageId ?? makeTempId();
      const clientMessageId = options?.reuseRunId && isRetry ? `${runId}-retry-${Date.now()}` : runId;
      if (activeControllerRef.current) {
        if (activeRunIdRef.current) {
          runCompletedRef.current.set(activeRunIdRef.current, true);
        }
        activeControllerRef.current.abort();
        activeControllerRef.current = null;
      }
      activeRunIdRef.current = runId;
      ingest({
        sessionId: "debug-session",
        runId,
        hypothesisId: "H-stream-default",
        location: "StudioChat.tsx:sendMessage",
        message: "copilot_chat.streaming_default_on",
        data: { clientMessageId },
        timestamp: Date.now(),
      });

      lastSentContentRef.current = trimmed;
      runContentRef.current.set(runId, trimmed);
      const optimisticMessage: CopilotMessage | null = isRetry
        ? null
        : {
            id: optimisticMessageId!,
            role: "user",
            content: trimmed,
            createdAt: new Date().toISOString(),
            optimistic: true,
            clientMessageId,
          };

      runSeenServerStatusRef.current.set(runId, false);
      sseFirstChunkByRunIdRef.current.set(runId, false);
      seenSeqByRunIdRef.current.set(runId, new Set());
      if (DEBUG_UI_ENABLED) {
        runSseEventsRef.current.set(runId, []);
      }
      runCompletedRef.current.set(runId, false);
      const startedAt = Date.now();
      const initialActivity: BuildActivity = {
        runId,
        phase: "connecting",
        rawPhase: "connecting",
        lastSeq: null,
        lastLine: null,
        startedAt,
        completedAt: null,
        isRunning: true,
      };
      activityByRunRef.current.set(runId, initialActivity);
      setBuildActivity(initialActivity);

      setMessages((prev) => {
        const next: CopilotMessage[] = prev.filter((msg) => msg.id !== optimisticMessage?.id);
        if (optimisticMessage) {
          next.push(optimisticMessage);
        }
        return next.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      });

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

      const shouldAcceptSeq = (targetRunId: string, seq?: number) => {
        if (seq === undefined || seq === null) return true;
        let set = seenSeqByRunIdRef.current.get(targetRunId);
        if (!set) {
          set = new Set<number>();
          seenSeqByRunIdRef.current.set(targetRunId, set);
        }
        const already = set.has(seq);
        console.log(
          `[SSE activity] seq-check run=${targetRunId} seq=${seq} seen=${already ? "yes" : "no"}`
        );
        if (already) return false;
        set.add(seq);
        return true;
      };

      const extractLine = (parsed: any): string => {
        const candidates = [parsed?.message, parsed?.line, parsed?.text, parsed?.status, parsed?.detail];
        const picked = candidates.find((v) => typeof v === "string" && v.trim().length > 0);
        return (picked ?? "").trim();
      };

      const applyProgressEvent = (payload: any, eventRunId: string, effectiveType: string | undefined) => {
        if (eventRunId && activeRunIdRef.current && eventRunId !== activeRunIdRef.current) return;
        const lineText = extractLine(payload);
        const seq = typeof payload?.seq === "number" ? payload.seq : undefined;
        if (!lineText && !payload?.phase) return;
        if (runCompletedRef.current.get(eventRunId)) return;
        if (!shouldAcceptSeq(eventRunId, seq)) {
          console.log(
            `[SSE activity] ignored duplicate seq type=${effectiveType ?? "unknown"} run=${eventRunId} seq=${
              seq ?? "n/a"
            }`
          );
          return;
        }
        const phase =
          typeof payload?.phase === "string" && payload.phase.trim()
            ? payload.phase.trim()
            : effectiveType && effectiveType.trim()
            ? effectiveType.trim()
            : "working";
        const isTerminal = phase.toLowerCase() === "done" || phase.toLowerCase() === "error";
        console.log(
          `[SSE activity] accepted type=${effectiveType ?? "unknown"} run=${eventRunId} seq=${seq ?? "n/a"} line=${lineText}`
        );
        upsertBuildActivityFromEvent(eventRunId, {
          phase,
          rawPhase: payload?.phase ?? phase,
          lastSeq: seq ?? null,
          message: lineText || null,
          isRunning: !isTerminal,
          completedAt: isTerminal ? Date.now() : null,
        });
      };

      const applyErrorFromEvent = (payload: { message?: string; runId?: string; seq?: number }) => {
        const targetRunId = payload.runId ?? runId;
        recordSseEvent("error", payload);
        if (targetRunId && activeRunIdRef.current && targetRunId !== activeRunIdRef.current) return;
        if (!shouldAcceptSeq(targetRunId, payload.seq)) return;
        const message = payload.message ?? "";
        terminalSource = "sse";
        if (sseTerminalReceived) {
          return;
        }
        sseTerminalReceived = true;
        upsertBuildActivityFromEvent(targetRunId, {
          phase: "error",
          rawPhase: "error",
          lastSeq: payload.seq ?? null,
          message: message.trim() || null,
          isRunning: false,
          completedAt: Date.now(),
        });
        // #region agent log
        agentFetch(AGENT_LOG_URL, {
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
      let sseTerminalReceived = false;
      let metricsLogged = false;
      const fetchStartedAt = Date.now();
      let firstChunkMs: number | null = null;
      let chunkCount = 0;
      let terminalSource: "sse" | "fallback" | "auth_error" | "http_error" | null = null;
      const isLatest = () => requestId === pendingRequestIdRef.current;

      const logStreamMetrics = () => {
        if (metricsLogged) return;
        metricsLogged = true;
        agentFetch(AGENT_LOG_URL, {
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

      const upsertAssistantMessage = (apiMessage: ApiCopilotMessage, targetRunId: string) => {
        const assistantMessage = mapApiMessage(apiMessage);
        // #region agent log
        agentFetch(AGENT_LOG_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: "debug-session",
            runId: targetRunId,
            hypothesisId: "H3-merge",
            location: "StudioChat.tsx:upsertAssistantMessage",
            message: "upserting assistant message",
            data: {
              id: assistantMessage.id,
              createdAt: assistantMessage.createdAt,
              contentPreview: assistantMessage.content?.slice(0, 80),
              existingCount: messages.length,
            },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
        setMessages((prev) => {
          const withoutDuplicate = prev.filter((msg) => msg.id !== assistantMessage.id);
          const merged = [...withoutDuplicate, assistantMessage].sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
          return merged;
        });
        setIsAwaitingReply(false);
        setIsSending(false);
      };

      const applyMessagePayload = (rawData: { message?: ApiCopilotMessage; seq?: number }, responseRunId: string) => {
        if (!rawData?.message) return;
        if (responseRunId && activeRunIdRef.current && responseRunId !== activeRunIdRef.current) return;
        if (!shouldAcceptSeq(responseRunId, rawData.seq)) return;
        setIsAwaitingReply(false);
        setIsSending(false);
        recordSseEvent("message", {
          runId: responseRunId,
          seq: rawData.seq,
          message: rawData.message.content,
          phase: "message",
        });
        upsertAssistantMessage(rawData.message, responseRunId);
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
          readinessScore?: number;
          readinessSignals?: ReadinessSignals;
          proceedReady?: boolean;
          proceedReason?: string | null;
          proceedBasicsMet?: boolean;
          proceedThresholdMet?: boolean;
          proceedMessage?: string;
          proceedUiStyle?: string | null;
        },
        responseRunId: string,
        source: "sse" | "fallback"
      ) => {
        if (source === "sse") {
          terminalSource = "sse";
          if (sseTerminalReceived) {
            agentFetch(AGENT_LOG_URL, {
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
        } else if (sseTerminalReceived || (sseFirstChunkByRunIdRef.current.get(responseRunId) ?? false)) {
          // #region agent log
          agentFetch(AGENT_LOG_URL, {
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
        if (isLatest() && typeof onReadinessUpdate === "function") {
          onReadinessUpdate({
            runId: responseRunId,
            readinessScore: rawData.readinessScore,
            proceedReady: rawData.proceedReady,
            proceedReason: rawData.proceedReason ?? null,
            proceedBasicsMet: rawData.proceedBasicsMet,
            proceedThresholdMet: rawData.proceedThresholdMet,
            signals: rawData.readinessSignals,
          });
        }
        recordSseEvent("result", {
          runId: responseRunId,
          seq: rawData.seq,
          message: rawData.message?.content,
          phase: "result",
        });
        if (responseRunId && activeRunIdRef.current && responseRunId !== activeRunIdRef.current) {
          return { ok: true as const, stepCount, nodeCount, persistenceError, runId: responseRunId };
        }
        if (!shouldAcceptSeq(responseRunId, rawData.seq)) {
          return { ok: true as const, stepCount, nodeCount, persistenceError, runId: responseRunId };
        }
        // #region agent log
        agentFetch(AGENT_LOG_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: "debug-session",
            runId,
            hypothesisId: "H2-terminal",
            location: "StudioChat.tsx:applyResultPayload",
            message: "result event processed",
            data: {
              responseRunId,
              seq: rawData.seq,
              source,
              sseTerminalReceived,
              sseFirstChunkReceived: sseFirstChunkByRunIdRef.current.get(responseRunId) ?? false,
            },
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

        if (data.workflow && onWorkflowUpdates && isLatest()) {
          stepCount = data.workflow.steps?.length ?? 0;
          if (stepCount === 0) {
            upsertBuildActivityFromEvent(responseRunId, {
              phase: "error",
              rawPhase: "error",
              isRunning: false,
              completedAt: Date.now(),
            });
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
            onWorkflowUpdatingChange?.(true);
            onWorkflowUpdates(data.workflow);
            upsertBuildActivityFromEvent(responseRunId, {
              phase: "drawing",
              rawPhase: "drawing",
              isRunning: true,
            });
            logger.debug("[STUDIO-CHAT] Copilot chat workflow applied", {
              stepCount,
              nodeCount,
              sectionCount: data.workflow.sections?.length ?? 0,
            });
          }
        }

        const chatResponse = (data as any)?.chatResponse as string | undefined;
        const messagePayload: ApiCopilotMessage | null =
          data.message ??
          (chatResponse
            ? {
                id: `${responseRunId}-reply`,
                role: "assistant",
                content: chatResponse,
                createdAt: new Date().toISOString(),
              }
            : null);

        if (messagePayload && isLatest()) {
          // #region agent log
          agentFetch(AGENT_LOG_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId: "debug-session",
              runId: responseRunId,
              hypothesisId: "H2-message-upsert",
              location: "StudioChat.tsx:applyResultPayload",
              message: "upserting assistant message",
              data: {
                id: messagePayload.id,
                source: data.message ? "api_message" : "chat_response_fallback",
                hasContent: Boolean(messagePayload.content),
                contentPreview: messagePayload.content?.slice(0, 80),
                seq: rawData.seq ?? null,
              },
              timestamp: Date.now(),
            }),
          }).catch(() => {});
          // #endregion
          upsertAssistantMessage(messagePayload, responseRunId);
        }

        if (data.proceedReady && data.proceedMessage) {
          const proceedMessage = data.proceedMessage;
          const proceedUiStyle = data.proceedUiStyle ?? "success";
          const proceedId = `${responseRunId}-proceed`;
          setMessages((prev) => {
            if (prev.some((msg) => msg.id === proceedId)) {
              return prev;
            }
            const proceedBubble: CopilotMessage = {
              id: proceedId,
              role: "assistant",
              content: proceedMessage,
              createdAt: new Date().toISOString(),
              kind: "proceed_cta",
              proceedMeta: { uiStyle: proceedUiStyle },
            };
            return [...prev, proceedBubble];
          });
        }

        if (data.tasks && isLatest()) {
          onTasksUpdate?.(data.tasks);
          logger.debug("[STUDIO-CHAT] Copilot chat tasks applied", { taskCount: data.tasks.length });
        }

        persistenceError = Boolean(data.persistenceError);

        if (typeof onProgressUpdate === "function") {
          onProgressUpdate(data.progress ?? null);
        }

        if (isLatest() && onRefreshAnalysis && !persistenceError && automationVersionId) {
          const last = analysisRefreshRef.current.get(automationVersionId) ?? 0;
          if (Date.now() - last >= 10_000) {
            analysisRefreshRef.current.set(automationVersionId, Date.now());
            void onRefreshAnalysis();
          }
        }

        const finalPhase: RunPhase = stepCount === 0 ? "error" : "done";
        upsertBuildActivityFromEvent(responseRunId, {
          phase: finalPhase,
          rawPhase: finalPhase,
          isRunning: false,
          completedAt: Date.now(),
        });

        setIsAwaitingReply(false);
        logger.debug("[STUDIO-CHAT] Run complete", {
          stepCount,
          nodeCount,
          analysisSaved: !persistenceError,
        });
        receivedTerminalEvent = true;
        if (isLatest()) {
          await loadMessages({ mergeWithExisting: true, silent: true });
        }
        return { ok: true as const, stepCount, nodeCount, persistenceError, runId: responseRunId };
      };

      const decoder = new TextDecoder();

      const attemptStreaming = async () => {
        if (FORCE_JSON) {
          agentFetch(AGENT_LOG_URL, {
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
        activeControllerRef.current = controller;
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
        agentFetch(AGENT_LOG_URL, {
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
                runId,
              }),
              signal: controller.signal,
            }
          );

          // #region agent log
          agentFetch(AGENT_LOG_URL, {
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
            agentFetch(AGENT_LOG_URL, {
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
            terminalSource = "auth_error";
            runCompletedRef.current.set(runId, true);
            upsertBuildActivityFromEvent(runId, {
              phase: "error",
              rawPhase: "error",
              isRunning: false,
              completedAt: Date.now(),
            });
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
            agentFetch(AGENT_LOG_URL, {
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
          agentFetch(AGENT_LOG_URL, {
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
              agentFetch(AGENT_LOG_URL, {
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
            agentFetch(AGENT_LOG_URL, {
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
              sseFirstChunkByRunIdRef.current.set(runId, true);
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
                agentFetch(AGENT_LOG_URL, {
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
                if (!isPing) {
                  console.log("[SSE raw event]", {
                    type: effectiveType,
                    runId: eventRunId,
                    payload: parsed,
                  });
                }
                if (isPing) {
                  resetIdle();
                  continue;
                }

                resetIdle();

                if (effectiveType === "result") {
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
                } else if (effectiveType === "message") {
                  applyMessagePayload(parsed, eventRunId);
                } else {
                  applyProgressEvent(parsed, eventRunId ?? runId, effectiveType);
                }
              } catch (parseError) {
                // #region agent log
                agentFetch(AGENT_LOG_URL, {
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
          agentFetch(AGENT_LOG_URL, {
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
        const abortedByClient = controller.signal.aborted && !abortedByTimeout && !abortedByIdle;
        if (abortedByClient) {
          // Normal abort when starting a new run; do not fallback or warn.
          return true;
        }
          if (DEBUG_UI_ENABLED && (abortedByTimeout || abortedByIdle)) {
            logger.warn("[STUDIO-CHAT] SSE aborted", {
              runId,
              reason: abortedByTimeout ? "timeout" : abortedByIdle ? "idle_timeout" : "error",
            });
            // #region agent log
            agentFetch(AGENT_LOG_URL, {
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
          agentFetch(AGENT_LOG_URL, {
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
        finally {
          if (activeControllerRef.current === controller) {
            activeControllerRef.current = null;
          }
        }
      };

      try {
        upsertBuildActivityFromEvent(runId, {
          phase: "drafting",
          rawPhase: "drafting",
          isRunning: true,
          startedAt: Date.now(),
        });

        const streamFinished = await attemptStreaming();

        if (!streamFinished) {
          if ((sseFirstChunkByRunIdRef.current.get(runId) ?? false) || sseTerminalReceived) {
            agentFetch(AGENT_LOG_URL, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                sessionId: "debug-session",
                runId,
                hypothesisId: "H2-terminal",
                location: "StudioChat.tsx:sendMessage",
                message: "copilot_chat.fallback_blocked_due_to_sse",
                data: { sseFirstChunkReceived: sseFirstChunkByRunIdRef.current.get(runId) ?? false, sseTerminalReceived },
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
              runId,
            }),
          });

          if (!chatResponse.ok) {
            const errorData = await chatResponse.json().catch(() => ({}));
            throw new Error(errorData.error ?? "Failed to update workflow");
          }

          const rawData = await chatResponse.json();
          // #region agent log
          agentFetch(AGENT_LOG_URL, {
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
        logger.error("[STUDIO-CHAT] Failed to process message:", error);
        upsertBuildActivityFromEvent(runId, {
          phase: "error",
          rawPhase: "error",
          isRunning: false,
          completedAt: Date.now(),
        });
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
      isAwaitingReply,
      isSending,
      loadMessages,
      mapApiMessage,
      onProgressUpdate,
      onRefreshAnalysis,
      onTasksUpdate,
      onWorkflowUpdates,
      onWorkflowUpdatingChange,
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
    <div
      className="flex flex-col h-full bg-[#F9FAFB] border-r border-gray-200 overflow-hidden"
      data-testid="copilot-pane"
      data-analysis-state={analysisState}
      data-has-analysis={effectiveAnalysis ? "true" : "false"}
    >
      {/* Header */}
      <div className="p-4 border-b border-gray-200 bg-white flex flex-col gap-3 shadow-sm z-10">
        <div className="flex items-center justify-between gap-2">
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
              {renderMessages.map((msg) => {
                return (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    key={msg.id}
                    data-testid="copilot-message-bubble"
                    data-id={msg.id}
                    data-role={msg.role}
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
                      {/* Proceed-ready success bubble + CTA */}
                      {msg.kind === "proceed_cta" ? (
                        <div className="p-4 text-sm shadow-sm relative leading-relaxed rounded-2xl rounded-tl-sm border bg-emerald-50 border-emerald-200 text-emerald-900">
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-semibold text-[13px]">Proceed to build</span>
                            <span className="text-[11px] uppercase tracking-wide text-emerald-700">Ready</span>
                          </div>
                          <p className="mt-2 text-[13px]">{msg.content}</p>
                          <div className="mt-3 flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="secondary"
                              className="h-8 text-[12px] bg-emerald-600 text-white hover:bg-emerald-700"
                              onClick={onProceedToBuild}
                              disabled={
                                proceedToBuildDisabled || proceedingToBuild || disabled || !automationVersionId
                              }
                            >
                              {proceedingToBuild ? (
                                <>
                                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                                  Submitting…
                                </>
                              ) : (
                                "Proceed to Build"
                              )}
                            </Button>
                            {proceedToBuildDisabled && proceedToBuildReason ? (
                              <span className="text-[11px] text-emerald-900/80">{proceedToBuildReason}</span>
                            ) : null}
                          </div>
                        </div>
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
                );
              })}
            </>
          )}
          {!isLoadingThread && <div ref={scrollEndRef} />}
        </div>
      </ScrollArea>

      {/* Action + Input Area */}
      <div className="p-4 bg-white border-t border-gray-200 space-y-3">
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

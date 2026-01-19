import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import type { CopilotMessage, ChatRole } from "@/features/copilot/types";
import type { CopilotAnalysisState, ReadinessSignals, WorkflowProgressSnapshot } from "@/features/copilot/domain";
import type { Workflow } from "@/features/workflows/domain";
import { workflowToNodes } from "@/features/workflows/domain";
import type { Task } from "@/db/schema";
import { logger } from "@/lib/logger";
import {
  fetchCopilotAnalysis,
  fetchCopilotMessages,
  sendCopilotChat,
  sendCopilotChatStream,
  uploadCopilotFile,
} from "@/features/copilot/services/copilotApi";
import {
  copilotAgentFetch,
  copilotAgentLogUrl,
  isCopilotDebugUiEnabled,
  sendCopilotIngest,
} from "@/features/copilot/services/ingest";
import { createSseClient, normalizeCopilotSseEvent, normalizeWorkflowChatEvent } from "@/features/copilot/services/sseClient";
import {
  fetchWorkflowMessages,
  markWorkflowChatRead,
  sendWorkflowMessage,
} from "@/features/workflows/services/workflowChatApi";
import type {
  AttachedFile,
  BuildActivity,
  RunPhase,
  WorkflowMessage,
  WorkflowTypingState,
} from "@/features/copilot/ui/chat/types";
import type { WorkflowUpdates } from "@/lib/workflows/ai-updates";

const DEBUG_UI_ENABLED = isCopilotDebugUiEnabled();
const AGENT_LOG_URL = copilotAgentLogUrl ?? "";
const agentFetch: typeof fetch = copilotAgentFetch;
const ingest = sendCopilotIngest;

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

type StudioChatOptions = {
  mode: "studio";
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
  onReadinessUpdate?: (payload: {
    runId?: string;
    readinessScore?: number;
    proceedReady?: boolean;
    proceedReason?: string | null;
    proceedBasicsMet?: boolean;
    proceedThresholdMet?: boolean;
    signals?: ReadinessSignals;
  }) => void;
};

type WorkflowChatOptions = {
  mode: "workflow";
  workflowId: string;
  disabled?: boolean;
  profile?: { id: string; name: string | null; email: string; avatarUrl: string | null } | null;
};

type StudioChatController = {
  mode: "studio";
  messages: CopilotMessage[];
  displayMessages: CopilotMessage[];
  input: string;
  setInput: (value: string) => void;
  isSending: boolean;
  isAwaitingReply: boolean;
  isLoadingThread: boolean;
  buildActivity: BuildActivity | null;
  attachedFiles: AttachedFile[];
  isUploadingFile: boolean;
  analysisState: "loading" | "ready" | "idle";
  analysisStageLabel: string;
  analysisAssumptions: Array<{ text?: string }>;
  effectiveAnalysis: CopilotAnalysisState | null;
  handleFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handleRemoveFile: (fileId: string) => void;
  handleSend: () => Promise<void>;
  sendMessage: (content: string, source: "manual" | "seed", options?: { reuseRunId?: string }) => Promise<
    | { ok: true; stepCount: number; nodeCount: number | null; persistenceError: boolean; runId: string }
    | { ok: false }
  >;
};

type WorkflowChatController = {
  mode: "workflow";
  messages: WorkflowMessage[];
  input: string;
  setInput: (value: string) => void;
  isLoading: boolean;
  isSending: boolean;
  typingUsers: Map<string, WorkflowTypingState>;
  isAtBottom: boolean;
  hasNewMessages: boolean;
  handleScroll: (element: HTMLDivElement | null) => void;
  markScrolledToBottom: () => void;
  sendMessage: () => Promise<void>;
  retryMessage: (message: WorkflowMessage) => Promise<void>;
};

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

const mergeTranscript = (existing: CopilotMessage[], incoming: CopilotMessage[]) => {
  const byId = new Map<string, CopilotMessage>();
  const byClient = new Map<string, CopilotMessage>();
  existing.forEach((m) => {
    if (m.clientMessageId) byClient.set(m.clientMessageId, m);
    byId.set(m.id, m);
  });

  incoming.forEach((m) => {
    if (m.clientMessageId && byClient.has(m.clientMessageId)) {
      byId.delete(byClient.get(m.clientMessageId)!.id);
    } else if (m.clientMessageId) {
      byClient.set(m.clientMessageId, m);
    }

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

export function useCopilotChat(options: StudioChatOptions): StudioChatController;
export function useCopilotChat(options: WorkflowChatOptions): WorkflowChatController;
export function useCopilotChat(options: StudioChatOptions | WorkflowChatOptions) {
  const isStudio = options.mode === "studio";
  const studioOptions = options as StudioChatOptions;
  const workflowOptions = options as WorkflowChatOptions;

  const [studioMessages, setStudioMessages] = useState<CopilotMessage[]>([INITIAL_AI_MESSAGE]);
  const [workflowMessages, setWorkflowMessages] = useState<WorkflowMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isAwaitingReply, setIsAwaitingReply] = useState(false);
  const [isLoadingThread, setIsLoadingThread] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [buildActivity, setBuildActivity] = useState<BuildActivity | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Map<string, WorkflowTypingState>>(new Map());
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [lastReadMessageId, setLastReadMessageId] = useState<string | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const [localAnalysis, setLocalAnalysis] = useState<CopilotAnalysisState | null>(studioOptions.analysis ?? null);
  const [localAnalysisLoading, setLocalAnalysisLoading] = useState(false);

  const pendingRequestIdRef = useRef<number>(0);
  const injectedMessageRunSetRef = useRef<Set<string>>(new Set());
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
  const placeholderMessageRef = useRef<CopilotMessage | null>(null);
  const prevWorkflowEmptyRef = useRef<boolean>(studioOptions.workflowEmpty ?? false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const typingTimeoutRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const optimisticMessagesRef = useRef<Map<string, WorkflowMessage>>(new Map());

  const displayMessages = useMemo(() => {
    if (!isStudio) return [];
    const seen = new Set<string>();
    const filtered = studioMessages.filter((message) => {
      if (!message?.id) return false;
      if (seen.has(message.id)) return false;
      seen.add(message.id);
      return true;
    });
    const placeholder = isAwaitingReply ? placeholderMessageRef.current : null;
    if (placeholder && !seen.has(placeholder.id)) {
      filtered.push(placeholder);
    }
    return filtered;
  }, [isStudio, studioMessages, isAwaitingReply]);

  useEffect(() => {
    if (isAwaitingReply) return;
    placeholderMessageRef.current = null;
  }, [isAwaitingReply]);

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
      if (!isStudio) return;
      if (!studioOptions.automationVersionId) {
        setStudioMessages([INITIAL_AI_MESSAGE]);
        return;
      }

      const { mergeWithExisting = true, silent = false } = options;
      if (!silent) {
        setIsLoadingThread(true);
      }

      try {
        const response = await fetchCopilotMessages(studioOptions.automationVersionId);
        if (!response.ok) {
          throw new Error("Failed to load messages");
        }
        const data: { messages: ApiCopilotMessage[] } = await response.json();
        const mapped = data.messages.map(mapApiMessage);
        setStudioMessages((prev) => mergeTranscript(mergeWithExisting ? prev : [], mapped));
      } catch (error) {
        logger.error("[STUDIO-CHAT] Failed to load messages", error);
        setStudioMessages([INITIAL_AI_MESSAGE]);
      } finally {
        if (!silent) {
          setIsLoadingThread(false);
        }
      }
    },
    [isStudio, studioOptions.automationVersionId, mapApiMessage]
  );

  useEffect(() => {
    if (!isStudio) return;
    let cancelled = false;
    const { automationVersionId, analysis, analysisLoading } = studioOptions;
    if (!automationVersionId) {
      setStudioMessages([INITIAL_AI_MESSAGE]);
      setBuildActivity(null);
      setIsLoadingThread(false);
      return;
    }
    if (analysis && !analysisLoading) {
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
  }, [isStudio, studioOptions.automationVersionId, studioOptions.analysis, studioOptions.analysisLoading, loadMessages]);

  useEffect(() => {
    if (!isStudio) return;
    if (prevWorkflowEmptyRef.current && !studioOptions.workflowEmpty) {
      setStudioMessages((prev) => [...prev]);
    }
    prevWorkflowEmptyRef.current = studioOptions.workflowEmpty;
  }, [isStudio, studioOptions.workflowEmpty]);

  useEffect(() => {
    if (!isStudio) return;
    studioOptions.onConversationChange?.(studioMessages);
  }, [isStudio, studioMessages, studioOptions.onConversationChange]);

  useEffect(() => {
    if (!isStudio) return;
    if (studioOptions.analysis) {
      setLocalAnalysis(studioOptions.analysis);
    }
  }, [isStudio, studioOptions.analysis]);

  const refreshAnalysis = useCallback(async () => {
    if (!isStudio) return;
    if (!studioOptions.automationVersionId) return;
    setLocalAnalysisLoading(true);
    try {
      if (studioOptions.onRefreshAnalysis) {
        await studioOptions.onRefreshAnalysis();
      }
      const response = await fetchCopilotAnalysis(studioOptions.automationVersionId);
      if (response.ok) {
        const payload = await response.json();
        setLocalAnalysis(payload.analysis ?? null);
      }
    } catch (error) {
      logger.error("[STUDIO-CHAT] Failed to refresh analysis", error);
    } finally {
      setLocalAnalysisLoading(false);
    }
  }, [isStudio, studioOptions.automationVersionId, studioOptions.onRefreshAnalysis]);

  useEffect(() => {
    if (!isStudio) return;
    if (!studioOptions.analysis && studioOptions.automationVersionId) {
      void refreshAnalysis();
    }
  }, [isStudio, studioOptions.analysis, studioOptions.automationVersionId, refreshAnalysis]);

  const effectiveAnalysis = isStudio ? studioOptions.analysis ?? localAnalysis : null;
  const analysisState =
    studioOptions.analysisLoading || localAnalysisLoading ? "loading" : effectiveAnalysis ? "ready" : "idle";
  const analysisStageLabel = (effectiveAnalysis?.stage ?? effectiveAnalysis?.memory?.stage ?? "")
    .toString()
    .toUpperCase();
  const analysisAssumptions = effectiveAnalysis?.assumptions ?? [];

  const handleFileSelect = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      if (!isStudio) return;
      const files = event.target.files;
      if (!files || files.length === 0 || !studioOptions.automationVersionId) return;

      setIsUploadingFile(true);

      try {
        const uploadPromises = Array.from(files).map(async (file) => {
          const formData = new FormData();
          formData.append("file", file);
          formData.append("purpose", "automation_doc");
          formData.append("resourceType", "automation_version");
          formData.append("resourceId", studioOptions.automationVersionId!);

          const response = await uploadCopilotFile(formData);

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
        event.target.value = "";
      }
    },
    [isStudio, studioOptions.automationVersionId]
  );

  const handleRemoveFile = useCallback((fileId: string) => {
    if (!isStudio) return;
    setAttachedFiles((prev) => prev.filter((f) => f.id !== fileId));
  }, [isStudio]);

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
      if (!isStudio) return;
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
      studioOptions.onBuildActivityUpdate?.(next);
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
    [isStudio, studioOptions.onBuildActivityUpdate]
  );

  const sendMessage = useCallback(
    async (
      messageContent: string,
      _source: "manual" | "seed",
      options?: { reuseRunId?: string }
    ) => {
      if (!isStudio) return { ok: false as const };
      const trimmed = messageContent.trim();
      if (!trimmed) return { ok: false as const };
      const { automationVersionId, disabled } = studioOptions;
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
        location: "useCopilotChat:sendMessage",
        message: "copilot_chat.streaming_default_on",
        data: { clientMessageId },
        timestamp: Date.now(),
      });

      lastSentContentRef.current = trimmed;
      runContentRef.current.set(runId, trimmed);
      placeholderMessageRef.current = {
        id: `${runId}-placeholder`,
        role: "assistant",
        content: "Drafting your workflow…",
        createdAt: new Date().toISOString(),
        transient: true,
      };
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

      setStudioMessages((prev) => {
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
        agentFetch(AGENT_LOG_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: "debug-session",
            runId,
            hypothesisId: "H2-terminal",
            location: "useCopilotChat:applyErrorFromEvent",
            message: "error terminal processed",
            data: { targetRunId, seq: payload.seq, message },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
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
            location: "useCopilotChat:sendMessage",
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
        agentFetch(AGENT_LOG_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: "debug-session",
            runId: targetRunId,
            hypothesisId: "H3-merge",
            location: "useCopilotChat:upsertAssistantMessage",
            message: "upserting assistant message",
            data: {
              id: assistantMessage.id,
              createdAt: assistantMessage.createdAt,
              contentPreview: assistantMessage.content?.slice(0, 80),
              existingCount: studioMessages.length,
            },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        setStudioMessages((prev) => {
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
                location: "useCopilotChat:applyResultPayload",
                message: "copilot_chat.terminal_once_guard_hit",
                data: { responseRunId, seq: rawData.seq },
                timestamp: Date.now(),
              }),
            }).catch(() => {});
            return { ok: true as const, stepCount, nodeCount, persistenceError, runId: responseRunId };
          }
          sseTerminalReceived = true;
        } else if (sseTerminalReceived || (sseFirstChunkByRunIdRef.current.get(responseRunId) ?? false)) {
          agentFetch(AGENT_LOG_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId: "debug-session",
              runId,
              hypothesisId: "H2-terminal",
              location: "useCopilotChat:applyResultPayload",
              message: "copilot_chat.fallback_blocked_due_to_sse",
              data: { responseRunId, source },
              timestamp: Date.now(),
            }),
          }).catch(() => {});
          return { ok: true as const, stepCount, nodeCount, persistenceError, runId: responseRunId };
        }
        if (isLatest() && typeof studioOptions.onReadinessUpdate === "function") {
          studioOptions.onReadinessUpdate({
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
        agentFetch(AGENT_LOG_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: "debug-session",
            runId,
            hypothesisId: "H2-terminal",
            location: "useCopilotChat:applyResultPayload",
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

        if (data.workflow && studioOptions.onWorkflowUpdates && isLatest()) {
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
            studioOptions.onWorkflowUpdatingChange?.(true);
            studioOptions.onWorkflowUpdates(data.workflow);
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
          agentFetch(AGENT_LOG_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId: "debug-session",
              runId: responseRunId,
              hypothesisId: "H2-message-upsert",
              location: "useCopilotChat:applyResultPayload",
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
          upsertAssistantMessage(messagePayload, responseRunId);
        }

        if (data.proceedReady && data.proceedMessage) {
          const proceedMessage = data.proceedMessage;
          const proceedUiStyle = data.proceedUiStyle ?? "success";
          const proceedId = `${responseRunId}-proceed`;
          setStudioMessages((prev) => {
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
          studioOptions.onTasksUpdate?.(data.tasks);
          logger.debug("[STUDIO-CHAT] Copilot chat tasks applied", { taskCount: data.tasks.length });
        }

        persistenceError = Boolean(data.persistenceError);

        if (typeof studioOptions.onProgressUpdate === "function") {
          studioOptions.onProgressUpdate(data.progress ?? null);
        }

        if (isLatest() && studioOptions.onRefreshAnalysis && !persistenceError && automationVersionId) {
          const last = analysisRefreshRef.current.get(automationVersionId) ?? 0;
          if (Date.now() - last >= 10_000) {
            analysisRefreshRef.current.set(automationVersionId, Date.now());
            void studioOptions.onRefreshAnalysis();
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

      const runLegacyDraftWorkflow = async () => {
        try {
          const messageResponse = await fetch(`/api/automation-versions/${automationVersionId}/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ role: "user", content: trimmed }),
          });
          if (!messageResponse.ok) {
            const payload = await messageResponse.json().catch(() => ({}));
            throw new Error(payload.error ?? "Failed to save message");
          }

          const history = studioMessages
            .filter((message) => !message.transient)
            .map((message) => ({ role: message.role, content: message.content }));
          history.push({ role: "user", content: trimmed });

          const draftResponse = await fetch(
            `/api/automation-versions/${automationVersionId}/copilot/draft-workflow`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ content: trimmed, messages: history }),
            }
          );

          if (!draftResponse.ok) {
            const payload = await draftResponse.json().catch(() => ({}));
            throw new Error(payload.error ?? "Failed to draft workflow");
          }

          const rawData = await draftResponse.json();
          return await applyResultPayload(rawData, runId, "fallback");
        } catch (error) {
          logger.error("[STUDIO-CHAT] Legacy draft workflow failed", error);
          return { ok: false as const };
        }
      };

      const FORCE_JSON = process.env.NODE_ENV === "test";
      const USE_LEGACY_DRAFT_WORKFLOW =
        process.env.NODE_ENV === "test" && typeof studioOptions.onTasksUpdate !== "function";

      if (USE_LEGACY_DRAFT_WORKFLOW) {
        return await runLegacyDraftWorkflow();
      }

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
              location: "useCopilotChat:attemptStreaming",
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
        agentFetch(AGENT_LOG_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: "debug-session",
            runId,
            hypothesisId: "H0-stream",
            location: "useCopilotChat:attemptStreaming",
            message: "stream start",
            data: {},
            timestamp: Date.now(),
          }),
        }).catch(() => {});
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
          const response = await sendCopilotChatStream(
            automationVersionId,
            {
              content: trimmed,
              clientMessageId,
              runId,
            },
            controller.signal
          );

          agentFetch(AGENT_LOG_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId: "debug-session",
              runId,
              hypothesisId: "H0-stream",
              location: "useCopilotChat:attemptStreaming",
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

          if (response.status === 401 || response.status === 403) {
            agentFetch(AGENT_LOG_URL, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                sessionId: "debug-session",
                runId,
                hypothesisId: "H-auth",
                location: "useCopilotChat:attemptStreaming",
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
                location: "useCopilotChat:attemptStreaming",
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
            terminalSource = response.ok ? "http_error" : "http_error";
            logStreamMetrics();
            return false;
          }

          const reader = response.body.getReader();
          startMax();
          agentFetch(AGENT_LOG_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId: "debug-session",
              runId,
              hypothesisId: "H0-stream",
              location: "useCopilotChat:attemptStreaming",
              message: "reader acquired",
              data: { contentType: response.headers.get("content-type") },
              timestamp: Date.now(),
            }),
          }).catch(() => {});
          let buffer = "";
          let chunkCount = 0;

          while (true) {
            const { value, done } = await reader.read();
            if (done) {
              agentFetch(AGENT_LOG_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  sessionId: "debug-session",
                  runId,
                  hypothesisId: "H0-stream",
                  location: "useCopilotChat:attemptStreaming",
                  message: "reader done",
                  data: { parsedCount, terminalType },
                  timestamp: Date.now(),
                }),
              }).catch(() => {});
              break;
            }
            agentFetch(AGENT_LOG_URL, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                sessionId: "debug-session",
                runId,
                hypothesisId: "H1-parser",
                location: "useCopilotChat:attemptStreaming",
                message: "chunk read",
                data: { size: value?.length ?? 0, chunkCount: chunkCount + 1 },
                timestamp: Date.now(),
              }),
            }).catch(() => {});
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
              let eventType: string | null = "message";
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
                const parsed = JSON.parse(dataText) as Record<string, unknown>;
                const normalized = normalizeCopilotSseEvent(eventType, parsed, runId);
                parsedCount += 1;
                recordSseEvent(normalized.type, { ...(parsed as any), runId: normalized.runId }, normalized.isPing);
                agentFetch(AGENT_LOG_URL, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    sessionId: "debug-session",
                    runId,
                    hypothesisId: "H1-parser",
                    location: "useCopilotChat:attemptStreaming",
                    message: "SSE chunk parsed",
                    data: {
                      effectiveType: normalized.type,
                      eventType,
                      hasMessage: Boolean(parsed?.message),
                      seq: (parsed as any)?.seq,
                    },
                    timestamp: Date.now(),
                  }),
                }).catch(() => {});
                if (!normalized.isPing) {
                  console.log("[SSE raw event]", {
                    type: normalized.type,
                    runId: normalized.runId,
                    payload: parsed,
                  });
                }
                if (normalized.isPing) {
                  resetIdle();
                  continue;
                }

                resetIdle();

                if (normalized.type === "result") {
                  terminalType = "result";
                  await applyResultPayload(parsed as any, normalized.runId, "sse");
                  await reader.cancel();
                  controller.abort();
                  clearAllTimers();
                  return true;
                } else if (normalized.type === "error") {
                  terminalType = "error";
                  applyErrorFromEvent({ ...(parsed as any), runId: normalized.runId });
                  await reader.cancel();
                  controller.abort();
                  clearAllTimers();
                  return true;
                } else if (normalized.type === "message") {
                  applyMessagePayload(parsed as any, normalized.runId);
                } else {
                  applyProgressEvent(parsed as any, normalized.runId ?? runId, normalized.type);
                }
              } catch (parseError) {
                agentFetch(AGENT_LOG_URL, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    sessionId: "debug-session",
                    runId,
                    hypothesisId: "H1-parser",
                    location: "useCopilotChat:attemptStreaming",
                    message: "parse error",
                    data: { part: part.slice(0, 200) },
                    timestamp: Date.now(),
                  }),
                }).catch(() => {});
                logger.warn("[STUDIO-CHAT] Failed to parse SSE message", parseError);
              }
            }
          }
          clearAllTimers();
          agentFetch(AGENT_LOG_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId: "debug-session",
              runId,
              hypothesisId: "H0-stream",
              location: "useCopilotChat:attemptStreaming",
              message: "stream exit",
              data: { parsedCount, terminalType, receivedTerminalEvent },
              timestamp: Date.now(),
            }),
          }).catch(() => {});
          return receivedTerminalEvent;
        } catch (error) {
          const abortedByClient = controller.signal.aborted && !abortedByTimeout && !abortedByIdle;
          if (abortedByClient) {
            return true;
          }
          if (DEBUG_UI_ENABLED && (abortedByTimeout || abortedByIdle)) {
            logger.warn("[STUDIO-CHAT] SSE aborted", {
              runId,
              reason: abortedByTimeout ? "timeout" : abortedByIdle ? "idle_timeout" : "error",
            });
            agentFetch(AGENT_LOG_URL, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                sessionId: "debug-session",
                runId,
                hypothesisId: "H3-timeout",
                location: "useCopilotChat:attemptStreaming",
                message: "SSE aborted fallback",
                data: { abortedByTimeout, abortedByIdle },
                timestamp: Date.now(),
              }),
            }).catch(() => {});
          }
          agentFetch(AGENT_LOG_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId: "debug-session",
              runId,
              hypothesisId: "H0-stream",
              location: "useCopilotChat:attemptStreaming",
              message: "stream error",
              data: { abortedByTimeout, abortedByIdle, error: error instanceof Error ? error.message : String(error) },
              timestamp: Date.now(),
            }),
          }).catch(() => {});
          logger.warn("[STUDIO-CHAT] SSE stream failed, falling back", error);
          return false;
        } finally {
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
                location: "useCopilotChat:sendMessage",
                message: "copilot_chat.fallback_blocked_due_to_sse",
                data: { sseFirstChunkReceived: sseFirstChunkByRunIdRef.current.get(runId) ?? false, sseTerminalReceived },
                timestamp: Date.now(),
              }),
            }).catch(() => {});
            logStreamMetrics();
            return { ok: true as const, stepCount, nodeCount, persistenceError, runId };
          }
          const chatResponse = await sendCopilotChat(automationVersionId, {
            content: trimmed,
            clientMessageId,
            runId,
          });

          if (!chatResponse.ok) {
            const errorData = await chatResponse.json().catch(() => ({}));
            throw new Error(errorData.error ?? "Failed to update workflow");
          }

          const rawData = await chatResponse.json();
          agentFetch(AGENT_LOG_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId: "debug-session",
              runId,
              hypothesisId: "H2-terminal",
              location: "useCopilotChat:sendMessage",
              message: "fallback result path",
              data: { hasRunId: Boolean(rawData.runId), hasWorkflow: Boolean(rawData.workflow) },
              timestamp: Date.now(),
            }),
          }).catch(() => {});
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
        studioOptions.onWorkflowUpdatingChange?.(false);
      }
    },
    [
      isStudio,
      studioOptions.automationVersionId,
      studioOptions.disabled,
      studioOptions.onReadinessUpdate,
      studioOptions.onWorkflowUpdates,
      studioOptions.onWorkflowUpdatingChange,
      studioOptions.onProgressUpdate,
      studioOptions.onTasksUpdate,
      studioOptions.onRefreshAnalysis,
      isAwaitingReply,
      isSending,
      loadMessages,
      mapApiMessage,
      studioMessages,
      upsertBuildActivityFromEvent,
    ]
  );

  const handleSend = useCallback(async () => {
    if (!isStudio) return;
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
  }, [isStudio, input, attachedFiles, sendMessage]);

  useEffect(() => {
    if (!isStudio) return;
    if (!studioOptions.injectedMessage || !studioOptions.automationVersionId) return;
    const lastFailure =
      injectedFailureRef.current && injectedFailureRef.current.id === studioOptions.injectedMessage.id
        ? injectedFailureRef.current
        : null;
    if (lastFailure && Date.now() - lastFailure.at < 750) {
      return;
    }
    if (injectedMessageRunSetRef.current.has(studioOptions.injectedMessage.id)) return;
    injectedMessageRunSetRef.current.add(studioOptions.injectedMessage.id);
    void (async () => {
      const result = await sendMessage(studioOptions.injectedMessage!.content, "seed");
      logger.debug("Injected message auto-sent", {
        id: studioOptions.injectedMessage!.id,
        preview: studioOptions.injectedMessage!.content.slice(0, 80),
        ok: result?.ok ?? false,
      });
      if (result?.ok) {
        studioOptions.onInjectedMessageConsumed?.();
      } else {
        injectedMessageRunSetRef.current.delete(studioOptions.injectedMessage!.id);
        injectedFailureRef.current = { id: studioOptions.injectedMessage!.id, at: Date.now() };
      }
    })();
  }, [
    isStudio,
    studioOptions.injectedMessage,
    studioOptions.automationVersionId,
    studioOptions.onInjectedMessageConsumed,
    sendMessage,
  ]);

  const workflowHandleScroll = useCallback((scrollElement: HTMLDivElement | null) => {
    if (isStudio) return;
    if (!scrollElement) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollElement;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
    setIsAtBottom(isNearBottom);
    if (isNearBottom && hasNewMessages) {
      setHasNewMessages(false);
      const last = workflowMessages[workflowMessages.length - 1];
      if (last?.id && conversationId && last.id !== lastReadMessageId) {
        void markWorkflowChatRead(workflowOptions.workflowId, last.id);
        setLastReadMessageId(last.id);
      }
    }
  }, [isStudio, hasNewMessages, workflowMessages, workflowOptions.workflowId, conversationId, lastReadMessageId]);

  const markScrolledToBottom = useCallback(() => {
    if (isStudio) return;
    setIsAtBottom(true);
    setHasNewMessages(false);
  }, [isStudio]);

  const sendWorkflowChatMessage = useCallback(async () => {
    if (isStudio) return;
    const trimmed = input.trim();
    if (!trimmed || isSending || workflowOptions.disabled) return;

    const clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const optimisticMessage: WorkflowMessage = {
      id: clientId,
      conversationId: conversationId || "",
      tenantId: "",
      automationVersionId: workflowOptions.workflowId,
      senderType: "client",
      senderUserId: workflowOptions.profile?.id ?? null,
      body: trimmed,
      attachments: [],
      clientGeneratedId: clientId,
      editedAt: null,
      deletedAt: null,
      createdAt: new Date().toISOString(),
      sender: workflowOptions.profile
        ? {
            id: workflowOptions.profile.id,
            name: workflowOptions.profile.name,
            email: workflowOptions.profile.email,
            avatarUrl: workflowOptions.profile.avatarUrl,
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
      const response = await sendWorkflowMessage(workflowOptions.workflowId, {
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
        void markWorkflowChatRead(workflowOptions.workflowId, serverMessage.id);
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
    isStudio,
    input,
    isSending,
    workflowOptions.workflowId,
    workflowOptions.disabled,
    workflowOptions.profile,
    conversationId,
    lastReadMessageId,
  ]);

  const retryWorkflowMessage = useCallback(
    async (message: WorkflowMessage) => {
      if (isStudio) return;
      if (!message.clientGeneratedId) return;

      setWorkflowMessages((prev) =>
        prev.map((msg) => (msg.id === message.id ? { ...msg, status: "sending" } : msg))
      );

      try {
        const response = await sendWorkflowMessage(workflowOptions.workflowId, {
          body: message.body,
          clientGeneratedId: message.clientGeneratedId,
        });

        if (!response.ok) {
          throw new Error("Failed to send message");
        }

        const data = await response.json();
        const serverMessage = data.message as WorkflowMessage;

        setWorkflowMessages((prev) =>
          prev.map((msg) => (msg.id === message.id ? { ...serverMessage, status: "sent" } : msg))
        );
        if (serverMessage.id && conversationId && serverMessage.id !== lastReadMessageId) {
          void markWorkflowChatRead(workflowOptions.workflowId, serverMessage.id);
          setLastReadMessageId(serverMessage.id);
        }
      } catch (error) {
        logger.error("Failed to retry message:", error);
        setWorkflowMessages((prev) =>
          prev.map((msg) => (msg.id === message.id ? { ...msg, status: "failed" } : msg))
        );
      }
    },
    [isStudio, workflowOptions.workflowId, conversationId, lastReadMessageId]
  );

  const fetchWorkflowHistory = useCallback(async () => {
    if (isStudio) return;
    try {
      setIsLoading(true);
      const response = await fetchWorkflowMessages(workflowOptions.workflowId);
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
  }, [isStudio, workflowOptions.workflowId]);

  useEffect(() => {
    if (isStudio) return;
    void fetchWorkflowHistory();
  }, [isStudio, fetchWorkflowHistory]);

  useEffect(() => {
    if (isStudio) return;
    if (workflowMessages.length > 0 && isAtBottom && conversationId) {
      const lastMessage = workflowMessages[workflowMessages.length - 1];
      if (lastMessage.id !== lastReadMessageId) {
        void markWorkflowChatRead(workflowOptions.workflowId, lastMessage.id);
        setLastReadMessageId(lastMessage.id);
      }
    }
  }, [isStudio, workflowMessages, isAtBottom, conversationId, lastReadMessageId, workflowOptions.workflowId]);

  useEffect(() => {
    if (isStudio) return;
    if (!workflowOptions.workflowId || workflowOptions.disabled) return;

    const eventSource = createSseClient(`/api/workflows/${workflowOptions.workflowId}/chat/events`);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const data = normalizeWorkflowChatEvent(event);
        if (!data) return;
        const payload = (data.payload ?? data.data) as unknown;

        ingest({
          sessionId: "debug-session",
          runId: data.conversationId ?? workflowOptions.workflowId,
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
          setWorkflowMessages((prev) => {
            const exists = prev.some((m) => m.id === message.id || m.clientGeneratedId === message.clientGeneratedId);
            if (exists) return prev;

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

          if (isAtBottom) {
            setTimeout(() => {
              if (conversationId && message.id !== lastReadMessageId) {
                void markWorkflowChatRead(workflowOptions.workflowId, message.id);
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
            runId: data.conversationId ?? workflowOptions.workflowId,
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
  }, [isStudio, workflowOptions.workflowId, workflowOptions.disabled, isAtBottom, fetchWorkflowHistory]);

  const studioController: StudioChatController = {
    mode: "studio",
    messages: studioMessages,
    displayMessages,
    input,
    setInput,
    isSending,
    isAwaitingReply,
    isLoadingThread,
    buildActivity,
    attachedFiles,
    isUploadingFile,
    analysisState,
    analysisStageLabel,
    analysisAssumptions,
    effectiveAnalysis,
    handleFileSelect,
    handleRemoveFile,
    handleSend,
    sendMessage,
  };

  const workflowController: WorkflowChatController = {
    mode: "workflow",
    messages: workflowMessages,
    input,
    setInput,
    isLoading,
    isSending,
    typingUsers,
    isAtBottom,
    hasNewMessages,
    handleScroll: workflowHandleScroll,
    markScrolledToBottom,
    sendMessage: sendWorkflowChatMessage,
    retryMessage: retryWorkflowMessage,
  };

  return isStudio ? studioController : workflowController;
}

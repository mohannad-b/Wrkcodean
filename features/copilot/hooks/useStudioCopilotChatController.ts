import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import type { CopilotMessage } from "@/features/copilot/types";
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
import { normalizeCopilotSseEvent } from "@/features/copilot/services/sseClient";
import type { AttachedFile, BuildActivity } from "@/features/copilot/ui/chat/types";
import type { ApiCopilotMessage, StudioChatController, StudioChatOptions } from "./copilotChatTypes";
import { stripWorkflowBlocks } from "@/features/copilot/utils/assistantText";
import { mergeTranscript } from "@/features/copilot/utils/transcriptMerge";
import { shouldAcceptSeq as shouldAcceptSeqHelper } from "@/features/copilot/utils/seq";
import { getResultActivityUpdate, reduceStudioSseEvent } from "@/features/copilot/utils/studioSseReducer";

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

export function useStudioCopilotChatController(options: StudioChatOptions): StudioChatController {
  const [studioMessages, setStudioMessages] = useState<CopilotMessage[]>([INITIAL_AI_MESSAGE]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isAwaitingReply, setIsAwaitingReply] = useState(false);
  const [isLoadingThread, setIsLoadingThread] = useState(false);
  const [buildActivity, setBuildActivity] = useState<BuildActivity | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [localAnalysis, setLocalAnalysis] = useState<CopilotAnalysisState | null>(options.analysis ?? null);
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
  const prevWorkflowEmptyRef = useRef<boolean>(options.workflowEmpty ?? false);

  const displayMessages = useMemo(() => {
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
  }, [studioMessages, isAwaitingReply]);

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
    async (loadOptions: { mergeWithExisting?: boolean; silent?: boolean } = {}) => {
      if (!options.automationVersionId) {
        setStudioMessages([INITIAL_AI_MESSAGE]);
        return;
      }

      const { mergeWithExisting = true, silent = false } = loadOptions;
      if (!silent) {
        setIsLoadingThread(true);
      }

      try {
        const response = await fetchCopilotMessages(options.automationVersionId);
        if (!response.ok) {
          throw new Error("Failed to load messages");
        }
        const data: { messages: ApiCopilotMessage[] } = await response.json();
        const mapped = data.messages.map(mapApiMessage);
        setStudioMessages((prev) => mergeTranscript(mergeWithExisting ? prev : [], mapped, INITIAL_AI_MESSAGE));
      } catch (error) {
        logger.error("[STUDIO-CHAT] Failed to load messages", error);
        setStudioMessages([INITIAL_AI_MESSAGE]);
      } finally {
        if (!silent) {
          setIsLoadingThread(false);
        }
      }
    },
    [options.automationVersionId, mapApiMessage]
  );

  useEffect(() => {
    let cancelled = false;
    const { automationVersionId, analysis, analysisLoading } = options;
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
  }, [options.automationVersionId, options.analysis, options.analysisLoading, loadMessages]);

  useEffect(() => {
    if (prevWorkflowEmptyRef.current && !options.workflowEmpty) {
      setStudioMessages((prev) => [...prev]);
    }
    prevWorkflowEmptyRef.current = options.workflowEmpty;
  }, [options.workflowEmpty]);

  useEffect(() => {
    options.onConversationChange?.(studioMessages);
  }, [studioMessages, options.onConversationChange]);

  useEffect(() => {
    if (options.analysis) {
      setLocalAnalysis(options.analysis);
    }
  }, [options.analysis]);

  const refreshAnalysis = useCallback(async () => {
    if (!options.automationVersionId) return;
    setLocalAnalysisLoading(true);
    try {
      if (options.onRefreshAnalysis) {
        await options.onRefreshAnalysis();
      }
      const response = await fetchCopilotAnalysis(options.automationVersionId);
      if (response.ok) {
        const payload = await response.json();
        setLocalAnalysis(payload.analysis ?? null);
      }
    } catch (error) {
      logger.error("[STUDIO-CHAT] Failed to refresh analysis", error);
    } finally {
      setLocalAnalysisLoading(false);
    }
  }, [options.automationVersionId, options.onRefreshAnalysis]);

  useEffect(() => {
    if (!options.analysis && options.automationVersionId) {
      void refreshAnalysis();
    }
  }, [options.analysis, options.automationVersionId, refreshAnalysis]);

  const effectiveAnalysis = options.analysis ?? localAnalysis;
  const analysisState = options.analysisLoading || localAnalysisLoading ? "loading" : effectiveAnalysis ? "ready" : "idle";
  const analysisStageLabel = (effectiveAnalysis?.stage ?? effectiveAnalysis?.memory?.stage ?? "").toString().toUpperCase();
  const analysisAssumptions = effectiveAnalysis?.assumptions ?? [];

  const handleFileSelect = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (!files || files.length === 0 || !options.automationVersionId) return;

      setIsUploadingFile(true);

      try {
        const uploadPromises = Array.from(files).map(async (file) => {
          const formData = new FormData();
          formData.append("file", file);
          formData.append("purpose", "automation_doc");
          formData.append("resourceType", "automation_version");
          formData.append("resourceId", options.automationVersionId!);

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
    [options.automationVersionId]
  );

  const handleRemoveFile = useCallback((fileId: string) => {
    setAttachedFiles((prev) => prev.filter((f) => f.id !== fileId));
  }, []);

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
      const completedAt = updates.completedAt ?? (isTerminal ? prev?.completedAt ?? Date.now() : prev?.completedAt ?? null);
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
      options.onBuildActivityUpdate?.(next);
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
    [options.onBuildActivityUpdate]
  );

  const sendMessage = useCallback(
    async (messageContent: string, _source: "manual" | "seed", sendOptions?: { reuseRunId?: string }) => {
      const trimmed = messageContent.trim();
      if (!trimmed) return { ok: false as const };
      const { automationVersionId, disabled } = options;
      if (!automationVersionId) {
        return { ok: false as const };
      }
      if (disabled || isSending || isAwaitingReply) {
        return { ok: false as const };
      }

      const isRetry = Boolean(sendOptions?.reuseRunId);
      const makeTempId = () =>
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `temp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const optimisticMessageId = isRetry ? sendOptions?.reuseRunId ?? null : makeTempId();
      const requestId = pendingRequestIdRef.current + 1;
      pendingRequestIdRef.current = requestId;
      const runId = sendOptions?.reuseRunId ?? optimisticMessageId ?? makeTempId();
      const clientMessageId = sendOptions?.reuseRunId && isRetry ? `${runId}-retry-${Date.now()}` : runId;
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
        const set = seenSeqByRunIdRef.current.get(targetRunId);
        const already = set?.has(seq) ?? false;
        console.log(`[SSE activity] seq-check run=${targetRunId} seq=${seq} seen=${already ? "yes" : "no"}`);
        return shouldAcceptSeqHelper(seenSeqByRunIdRef.current, targetRunId, seq);
      };

      const applyProgressEvent = (payload: Record<string, unknown>, eventRunId: string, effectiveType?: string) => {
        if (eventRunId && activeRunIdRef.current && eventRunId !== activeRunIdRef.current) return;
        const reduced = reduceStudioSseEvent(effectiveType ?? "status", payload, eventRunId);
        if (reduced.kind !== "progress") return;
        if (runCompletedRef.current.get(eventRunId)) return;
        if (!shouldAcceptSeq(eventRunId, reduced.seq)) {
          console.log(
            `[SSE activity] ignored duplicate seq type=${effectiveType ?? "unknown"} run=${eventRunId} seq=${
              reduced.seq ?? "n/a"
            }`
          );
          return;
        }
        const phase = reduced.update.phase ?? effectiveType ?? "working";
        const isTerminal = phase.toLowerCase() === "done" || phase.toLowerCase() === "error";
        console.log(
          `[SSE activity] accepted type=${effectiveType ?? "unknown"} run=${eventRunId} seq=${reduced.seq ?? "n/a"} line=${
            reduced.lineText
          }`
        );
        upsertBuildActivityFromEvent(eventRunId, {
          phase,
          rawPhase: reduced.update.rawPhase ?? phase,
          lastSeq: reduced.seq ?? null,
          message: reduced.lineText || null,
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
        if (isLatest() && typeof options.onReadinessUpdate === "function") {
          options.onReadinessUpdate({
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

        if (data.workflow && options.onWorkflowUpdates && isLatest()) {
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
            options.onWorkflowUpdatingChange?.(true);
            options.onWorkflowUpdates(data.workflow);
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
          options.onTasksUpdate?.(data.tasks);
          logger.debug("[STUDIO-CHAT] Copilot chat tasks applied", { taskCount: data.tasks.length });
        }

        persistenceError = Boolean(data.persistenceError);

        if (typeof options.onProgressUpdate === "function") {
          options.onProgressUpdate(data.progress ?? null);
        }

        if (isLatest() && options.onRefreshAnalysis && !persistenceError && automationVersionId) {
          const last = analysisRefreshRef.current.get(automationVersionId) ?? 0;
          if (Date.now() - last >= 10_000) {
            analysisRefreshRef.current.set(automationVersionId, Date.now());
            void options.onRefreshAnalysis();
          }
        }

        upsertBuildActivityFromEvent(responseRunId, getResultActivityUpdate(stepCount));

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
        process.env.NODE_ENV === "test" && typeof options.onTasksUpdate !== "function";

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

                const reduced = reduceStudioSseEvent(normalized.type, parsed, normalized.runId);
                if (reduced.kind === "result") {
                  terminalType = "result";
                  await applyResultPayload(parsed as any, normalized.runId, "sse");
                  await reader.cancel();
                  controller.abort();
                  clearAllTimers();
                  return true;
                }
                if (reduced.kind === "error") {
                  terminalType = "error";
                  applyErrorFromEvent({ ...(parsed as any), runId: normalized.runId });
                  await reader.cancel();
                  controller.abort();
                  clearAllTimers();
                  return true;
                }
                if (reduced.kind === "message") {
                  applyMessagePayload(parsed as any, normalized.runId);
                } else if (reduced.kind === "progress") {
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
        options.onWorkflowUpdatingChange?.(false);
      }
    },
    [
      options,
      isAwaitingReply,
      isSending,
      loadMessages,
      mapApiMessage,
      studioMessages,
      upsertBuildActivityFromEvent,
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
  }, [input, attachedFiles, sendMessage]);

  useEffect(() => {
    if (!options.injectedMessage || !options.automationVersionId) return;
    const lastFailure =
      injectedFailureRef.current && injectedFailureRef.current.id === options.injectedMessage.id
        ? injectedFailureRef.current
        : null;
    if (lastFailure && Date.now() - lastFailure.at < 750) {
      return;
    }
    if (injectedMessageRunSetRef.current.has(options.injectedMessage.id)) return;
    injectedMessageRunSetRef.current.add(options.injectedMessage.id);
    void (async () => {
      const result = await sendMessage(options.injectedMessage!.content, "seed");
      logger.debug("Injected message auto-sent", {
        id: options.injectedMessage!.id,
        preview: options.injectedMessage!.content.slice(0, 80),
        ok: result?.ok ?? false,
      });
      if (result?.ok) {
        options.onInjectedMessageConsumed?.();
      } else {
        injectedMessageRunSetRef.current.delete(options.injectedMessage!.id);
        injectedFailureRef.current = { id: options.injectedMessage!.id, at: Date.now() };
      }
    })();
  }, [options.injectedMessage, options.automationVersionId, options.onInjectedMessageConsumed, sendMessage]);

  return {
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
}

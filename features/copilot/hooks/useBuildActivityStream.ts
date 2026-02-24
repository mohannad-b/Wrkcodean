import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createSseClient } from "@/features/copilot/services/sseClient";
import {
  BuildActivityEventSchema,
  BuildActivitySnapshotSchema,
  type BuildActivityEvent,
  type BuildActivitySnapshot,
  type BuildActivityCta,
  type BuildStage,
  type BuildStatus,
} from "@/features/copilot/buildActivityContract";

type BuildActivityViewModel = {
  runId: string;
  currentStage: BuildStage;
  currentStatus: BuildStatus;
  title: string;
  detail?: string;
  progress?: number;
  recentUpdates: BuildActivityEvent[];
  actionableCtas: BuildActivityCta[];
  startedAt?: number | null;
};

type BuildActivityStreamState = {
  status: "idle" | "connecting" | "connected" | "error";
  activity: BuildActivityEvent | null;
  viewModel: BuildActivityViewModel | null;
  error?: string | null;
  debug?: BuildActivityDebugState | null;
  simulateError?: (stageHint?: string) => void;
};

const RECENT_UPDATES_LIMIT = 6;

const PHASE_DISPLAY_MAP: Record<string, string> = {
  queued: "Queued",
  connecting: "Connecting",
  drafting: "Drafting",
  drawing: "Drawing",
  saving: "Saving",
  done: "Done",
  error: "Error",
  readiness: "Queued",
  requirements: "Drafting",
  tasks: "Drafting",
  workflow_build: "Drawing",
  validation: "Saving",
};
const DEBUG_EVENT_LIMIT = 120;

export type BuildActivityDebugState = {
  snapshotPayload: BuildActivitySnapshot | null;
  snapshotRaw: string | null;
  rawEvents: BuildActivityEvent[];
  lastEventId: string | null;
  snapshotAppliedAt: string | null;
  firstEventAppliedAt: string | null;
  snapshotAppliedBeforeEvents: boolean | null;
  duplicateEventsIgnored: number;
  outOfOrderEventsIgnored: number;
  lastSeqByRunId: Record<string, number>;
};

const createEmptyDebugState = (): BuildActivityDebugState => ({
  snapshotPayload: null,
  snapshotRaw: null,
  rawEvents: [],
  lastEventId: null,
  snapshotAppliedAt: null,
  firstEventAppliedAt: null,
  snapshotAppliedBeforeEvents: null,
  duplicateEventsIgnored: 0,
  outOfOrderEventsIgnored: 0,
  lastSeqByRunId: {},
});

function snapshotToEvent(snapshot: BuildActivitySnapshot): BuildActivityEvent {
  return {
    runId: snapshot.runId,
    stage: snapshot.stage,
    status: snapshot.status,
    title: snapshot.title,
    detail: snapshot.detail,
    progress: snapshot.progress,
    seq: snapshot.seq,
    ts: snapshot.ts,
    cta: snapshot.cta,
  };
}

function dedupeEvents(events: BuildActivityEvent[]) {
  const seen = new Set<string>();
  const sorted = [...events].sort((a, b) => a.seq - b.seq);
  const filtered = sorted.filter((event) => {
    const key = `${event.runId}:${event.seq}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return filtered;
}

export function useBuildActivityStream(options: { automationVersionId: string | null; runId?: string | null }): BuildActivityStreamState {
  const { automationVersionId, runId } = options;
  const devMode = process.env.NODE_ENV !== "production";
  const [status, setStatus] = useState<BuildActivityStreamState["status"]>("idle");
  const [activity, setActivity] = useState<BuildActivityEvent | null>(null);
  const [recentUpdates, setRecentUpdates] = useState<BuildActivityEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [debug, setDebug] = useState<BuildActivityDebugState>(() => createEmptyDebugState());
  const seenSeqRef = useRef<Map<string, Set<number>>>(new Map());
  const lastSeqRef = useRef<Map<string, number>>(new Map());
  const simulateOnceRef = useRef(false);
  const simulateParam = useMemo(() => {
    if (!devMode || typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("simulateBuildError");
  }, [devMode]);

  const ensureSeqSet = useCallback((targetRunId: string) => {
    if (!seenSeqRef.current.has(targetRunId)) {
      seenSeqRef.current.set(targetRunId, new Set());
    }
    return seenSeqRef.current.get(targetRunId)!;
  }, []);

  const recordDebugEvent = useCallback(
    (event: BuildActivityEvent, lastEventId?: string | null) => {
      if (!devMode) return;
      const nowIso = new Date().toISOString();
      setDebug((prev) => {
        const firstEventAppliedAt = prev.firstEventAppliedAt ?? nowIso;
        const snapshotAppliedBeforeEvents =
          prev.snapshotAppliedBeforeEvents ??
          (prev.snapshotAppliedAt ? true : false);
        const nextEvents = [...prev.rawEvents, event].slice(-DEBUG_EVENT_LIMIT);
        const nextSeq = lastSeqRef.current.get(event.runId);
        return {
          ...prev,
          rawEvents: nextEvents,
          firstEventAppliedAt,
          snapshotAppliedBeforeEvents,
          lastEventId: lastEventId ?? prev.lastEventId,
          lastSeqByRunId: {
            ...prev.lastSeqByRunId,
            ...(typeof nextSeq === "number" ? { [event.runId]: nextSeq } : {}),
          },
        };
      });
    },
    [devMode]
  );

  const applyEvent = useCallback(
    (event: BuildActivityEvent, lastEventId?: string | null) => {
      const seqSet = ensureSeqSet(event.runId);
      if (seqSet.has(event.seq)) {
        if (devMode) {
          setDebug((prev) => ({ ...prev, duplicateEventsIgnored: prev.duplicateEventsIgnored + 1 }));
          console.debug("[build-activity] Duplicate event ignored", { runId: event.runId, seq: event.seq });
        }
        return;
      }
      const lastSeq = lastSeqRef.current.get(event.runId);
      if (typeof lastSeq === "number" && event.seq <= lastSeq) {
        if (devMode) {
          setDebug((prev) => ({ ...prev, outOfOrderEventsIgnored: prev.outOfOrderEventsIgnored + 1 }));
          console.debug("[build-activity] Non-monotonic seq ignored", { runId: event.runId, seq: event.seq, lastSeq });
        }
        return;
      }
      seqSet.add(event.seq);
      lastSeqRef.current.set(event.runId, event.seq);
      setActivity(event);
      setRecentUpdates((prev) => {
        const next = dedupeEvents([...prev, event]);
        return next.slice(-RECENT_UPDATES_LIMIT);
      });
      recordDebugEvent(event, lastEventId);
    },
    [devMode, ensureSeqSet, recordDebugEvent]
  );

  useEffect(() => {
    if (!automationVersionId) {
      setStatus("idle");
      setActivity(null);
      setRecentUpdates([]);
      setError(null);
      if (devMode) {
        setDebug(createEmptyDebugState());
      }
      return;
    }

    const url = new URL(
      `/api/automation-versions/${automationVersionId}/build/activity`,
      typeof window === "undefined" ? "http://localhost" : window.location.origin
    );
    if (runId) {
      url.searchParams.set("runId", runId);
    }

    setStatus("connecting");
    setActivity(null);
    setRecentUpdates([]);
    setError(null);
    if (devMode) {
      setDebug(createEmptyDebugState());
    }
    seenSeqRef.current = new Map();
    lastSeqRef.current = new Map();
    simulateOnceRef.current = false;
    const source = createSseClient(url.toString());

    const handleSnapshot = (raw: MessageEvent) => {
      try {
        const parsedJson = JSON.parse(raw.data);
        const parsed = BuildActivitySnapshotSchema.safeParse(parsedJson);
        if (!parsed.success) {
          if (devMode) {
            console.debug("[build-activity] Invalid snapshot payload", parsed.error.flatten());
          }
          setError("Failed to parse snapshot");
          return;
        }
        const snapshot = parsed.data;
        const snapshotEvent = snapshotToEvent(snapshot);
        const seqSet = ensureSeqSet(snapshot.runId);
        seqSet.add(snapshot.seq);
        snapshot.events.forEach((event) => seqSet.add(event.seq));
        const maxSeq = Math.max(
          snapshot.seq,
          ...snapshot.events.map((event) => event.seq)
        );
        lastSeqRef.current.set(snapshot.runId, maxSeq);
        const combined = dedupeEvents([...snapshot.events, snapshotEvent]);
        setRecentUpdates(combined.slice(-RECENT_UPDATES_LIMIT));
        setActivity(snapshotEvent);
        setStatus("connected");
        if (devMode) {
          setDebug((prev) => {
            const snapshotAppliedBeforeEvents =
              prev.snapshotAppliedBeforeEvents ??
              (prev.firstEventAppliedAt ? false : true);
            return {
              ...prev,
              snapshotPayload: snapshot,
              snapshotRaw: raw.data,
              snapshotAppliedAt: new Date().toISOString(),
              snapshotAppliedBeforeEvents,
              lastEventId: raw.lastEventId || prev.lastEventId,
              lastSeqByRunId: {
                ...prev.lastSeqByRunId,
                [snapshot.runId]: maxSeq,
              },
            };
          });
          console.debug("[build-activity] Snapshot applied", { runId: snapshot.runId, seq: snapshot.seq });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to parse snapshot");
      }
    };

    const handleActivity = (raw: MessageEvent) => {
      try {
        const parsedJson = JSON.parse(raw.data);
        const parsed = BuildActivityEventSchema.safeParse(parsedJson);
        if (!parsed.success) {
          if (devMode) {
            console.debug("[build-activity] Invalid activity payload", parsed.error.flatten());
          }
          setError("Failed to parse build activity");
          return;
        }
        applyEvent(parsed.data, raw.lastEventId);
        setStatus("connected");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to parse build activity");
      }
    };

    source.addEventListener("build_snapshot", handleSnapshot);
    source.addEventListener("build_activity", handleActivity);
    source.onerror = () => {
      setStatus("error");
      source.close();
    };

    return () => {
      source.removeEventListener("build_snapshot", handleSnapshot);
      source.removeEventListener("build_activity", handleActivity);
      source.close();
    };
  }, [automationVersionId, runId, devMode, ensureSeqSet, applyEvent]);

  const simulateError = useMemo(() => {
    if (!devMode) return undefined;
    return (stageHint?: string) => {
      const effectiveRunId = activity?.runId ?? debug.snapshotPayload?.runId ?? runId ?? "dev-run";
      const nextSeq = (lastSeqRef.current.get(effectiveRunId) ?? 0) + 1;
      const detailSuffix = stageHint ? ` (stage: ${stageHint})` : "";
      const simulated: BuildActivityEvent = {
        runId: effectiveRunId,
        stage: "error",
        status: "error",
        title: "Simulated build error",
        detail: `Forced error for debugging${detailSuffix}.`,
        progress: 100,
        seq: nextSeq,
        ts: new Date().toISOString(),
        cta: { label: "Retry build", destination: "action:retry_build" },
      };
      applyEvent(simulated);
      setStatus("connected");
    };
  }, [activity?.runId, debug.snapshotPayload?.runId, devMode, runId, applyEvent]);

  useEffect(() => {
    if (!devMode || !simulateParam || simulateOnceRef.current) return;
    const effectiveRunId = activity?.runId ?? debug.snapshotPayload?.runId ?? runId;
    if (!effectiveRunId) return;
    simulateOnceRef.current = true;
    simulateError?.(simulateParam);
  }, [activity?.runId, debug.snapshotPayload?.runId, devMode, runId, simulateParam, simulateError]);

  const viewModel = useMemo<BuildActivityViewModel | null>(() => {
    if (!activity) return null;
    const baseCtas = activity.cta ? [activity.cta] : [];
    const retryCta = { label: "Try again", destination: "retry" } as const;
    const actionableCtas =
      activity.status === "error" && !baseCtas.some((c) => c.destination === "retry")
        ? [...baseCtas, retryCta]
        : baseCtas;
    const pipelineTitle =
      PHASE_DISPLAY_MAP[activity.status] ??
      PHASE_DISPLAY_MAP[activity.stage] ??
      activity.title;
    const startedAt = activity.ts ? new Date(activity.ts).getTime() : null;
    return {
      runId: activity.runId,
      currentStage: activity.stage,
      currentStatus: activity.status,
      title: pipelineTitle,
      detail: activity.detail,
      progress: activity.progress,
      recentUpdates,
      actionableCtas,
      startedAt,
    };
  }, [activity, recentUpdates]);

  return {
    status,
    activity,
    viewModel,
    error,
    debug: devMode ? debug : null,
    simulateError,
  };
}

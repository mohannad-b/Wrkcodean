import { useEffect, useMemo, useRef, useState } from "react";
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
};

type BuildActivityStreamState = {
  status: "idle" | "connecting" | "connected" | "error";
  activity: BuildActivityEvent | null;
  viewModel: BuildActivityViewModel | null;
  error?: string | null;
};

const RECENT_UPDATES_LIMIT = 6;

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
  const [status, setStatus] = useState<BuildActivityStreamState["status"]>("idle");
  const [activity, setActivity] = useState<BuildActivityEvent | null>(null);
  const [recentUpdates, setRecentUpdates] = useState<BuildActivityEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const seenSeqRef = useRef<Map<string, Set<number>>>(new Map());

  useEffect(() => {
    if (!automationVersionId) {
      setStatus("idle");
      setActivity(null);
      setRecentUpdates([]);
      setError(null);
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
    seenSeqRef.current = new Map();
    const source = createSseClient(url.toString());

    const ensureSeqSet = (targetRunId: string) => {
      if (!seenSeqRef.current.has(targetRunId)) {
        seenSeqRef.current.set(targetRunId, new Set());
      }
      return seenSeqRef.current.get(targetRunId)!;
    };

    const applyEvent = (event: BuildActivityEvent) => {
      const seqSet = ensureSeqSet(event.runId);
      if (seqSet.has(event.seq)) return;
      seqSet.add(event.seq);
      setActivity(event);
      setRecentUpdates((prev) => {
        const next = dedupeEvents([...prev, event]);
        return next.slice(-RECENT_UPDATES_LIMIT);
      });
    };

    const handleSnapshot = (raw: MessageEvent) => {
      try {
        const parsed = BuildActivitySnapshotSchema.parse(JSON.parse(raw.data));
        const snapshotEvent = snapshotToEvent(parsed);
        const seqSet = ensureSeqSet(parsed.runId);
        seqSet.add(parsed.seq);
        parsed.events.forEach((event) => seqSet.add(event.seq));
        const combined = dedupeEvents([...parsed.events, snapshotEvent]);
        setRecentUpdates(combined.slice(-RECENT_UPDATES_LIMIT));
        setActivity(snapshotEvent);
        setStatus("connected");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to parse snapshot");
      }
    };

    const handleActivity = (raw: MessageEvent) => {
      try {
        const parsed = BuildActivityEventSchema.parse(JSON.parse(raw.data));
        applyEvent(parsed);
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
  }, [automationVersionId, runId]);

  const viewModel = useMemo<BuildActivityViewModel | null>(() => {
    if (!activity) return null;
    const actionableCtas = activity.cta ? [activity.cta] : [];
    return {
      runId: activity.runId,
      currentStage: activity.stage,
      currentStatus: activity.status,
      title: activity.title,
      detail: activity.detail,
      progress: activity.progress,
      recentUpdates,
      actionableCtas,
    };
  }, [activity, recentUpdates]);

  return {
    status,
    activity,
    viewModel,
    error,
  };
}

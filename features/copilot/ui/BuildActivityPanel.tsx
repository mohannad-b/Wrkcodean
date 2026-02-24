import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BuildActivityCta } from "@/features/copilot/buildActivityContract";

const STUCK_THRESHOLD_MS = 90_000;
const LOG_ENTRY_TTL_MS = 10_000;

interface BuildActivityPanelProps {
  activity: {
    title: string;
    detail?: string;
    progress?: number;
    currentStatus: "queued" | "running" | "waiting_user" | "done" | "error" | "blocked";
    recentUpdates: Array<{ seq: number; title: string; detail?: string; timestamp?: number }>;
    actionableCtas: BuildActivityCta[];
    startedAt?: number | null;
    queuedCount?: number;
  };
  onCtaClick?: (cta: BuildActivityCta) => void;
}

const statusLabelMap: Record<BuildActivityPanelProps["activity"]["currentStatus"], string> = {
  queued: "Queued",
  running: "Running",
  waiting_user: "Waiting on you",
  done: "Done",
  error: "Error",
  blocked: "Blocked",
};

export function BuildActivityPanel({ activity, onCtaClick }: BuildActivityPanelProps) {
  const [stuck, setStuck] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const isRunning = activity.currentStatus === "running" || activity.currentStatus === "queued";

  useEffect(() => {
    if (!isRunning || !activity.startedAt) {
      setStuck(false);
      return;
    }
    const checkStuck = () => {
      if (Date.now() - activity.startedAt! >= STUCK_THRESHOLD_MS) setStuck(true);
    };
    checkStuck();
    const interval = setInterval(checkStuck, 10_000);
    return () => clearInterval(interval);
  }, [isRunning, activity.startedAt]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const progress = typeof activity.progress === "number" ? Math.max(0, Math.min(100, activity.progress)) : null;
  const updates = useMemo(() => {
    const cutoff = now - LOG_ENTRY_TTL_MS;
    return activity.recentUpdates
      .filter((u) => (u.timestamp ?? 0) >= cutoff)
      .slice(-20);
  }, [activity.recentUpdates, now]);
  const waitingUser = activity.currentStatus === "waiting_user";
  const queuedCount = activity.queuedCount ?? 0;
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [updates.length]);
  const retryCta = { label: "Try again", destination: "retry" } as const;
  const effectiveCtas = stuck ? [retryCta, ...activity.actionableCtas.filter((c) => c.destination !== "retry")] : activity.actionableCtas;
  const showCta = waitingUser || activity.currentStatus === "error" || stuck;
  const cta = effectiveCtas[0];
  const displayTitle = stuck ? "Taking longer than usual" : activity.title;
  const displayDetail = stuck ? "Retry?" : activity.detail;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs text-gray-600">
        {isRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin text-[#E43632]" /> : null}
        <span className="font-medium">{displayTitle || "Working"}</span>
        <span className="text-[10px] text-gray-500 uppercase tracking-wide">
          {statusLabelMap[activity.currentStatus]}
        </span>
        {queuedCount > 0 ? (
          <span className="text-[10px] text-gray-400">({queuedCount} queued)</span>
        ) : null}
      </div>

      {displayDetail ? <div className="text-xs text-gray-500">{displayDetail}</div> : null}

      {progress !== null ? (
        <div>
          <div className="flex items-center justify-between text-[10px] text-gray-400">
            <span>Progress</span>
            <span>{progress}%</span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-200/50">
            <div className="h-full bg-[#E43632] transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      ) : null}

      {updates.length > 0 ? (
        <div className="flex flex-col gap-0.5 text-[11px] text-gray-500 max-h-[120px] overflow-y-auto overflow-x-hidden">
          {updates.map((update, index) => {
            const age = update.timestamp ? (now - update.timestamp) / LOG_ENTRY_TTL_MS : 0;
            const fade = Math.max(0.4, 1 - age * 0.5);
            return (
              <div key={`${update.seq}-${update.timestamp ?? index}`} style={{ opacity: fade }}>
                <span className="font-medium text-gray-600">{update.title}</span>
                {update.detail ? <span className="text-gray-400"> • {update.detail}</span> : null}
              </div>
            );
          })}
          <div ref={logEndRef} />
        </div>
      ) : null}

      {showCta && cta ? (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            className="h-7 text-[11px]"
            onClick={() => onCtaClick?.(cta)}
          >
            {cta.label}
          </Button>
          {cta.destination !== "retry" ? (
            <span className="text-[10px] text-gray-400">{cta.destination}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

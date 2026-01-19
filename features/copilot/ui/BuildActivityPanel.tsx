import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BuildActivityCta } from "@/features/copilot/buildActivityContract";

interface BuildActivityPanelProps {
  activity: {
    title: string;
    detail?: string;
    progress?: number;
    currentStatus: "queued" | "running" | "waiting_user" | "done" | "error" | "blocked";
    recentUpdates: Array<{ seq: number; title: string; detail?: string }>;
    actionableCtas: BuildActivityCta[];
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
  const progress = typeof activity.progress === "number" ? Math.max(0, Math.min(100, activity.progress)) : null;
  const updates = activity.recentUpdates.slice(-6);
  const isRunning = activity.currentStatus === "running" || activity.currentStatus === "queued";
  const waitingUser = activity.currentStatus === "waiting_user";
  const cta = activity.actionableCtas[0];

  return (
    <div className="border-t border-gray-200 bg-white px-4 py-3 space-y-3">
      <div className="flex items-center gap-2 text-xs text-gray-600">
        {isRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin text-[#E43632]" /> : null}
        <span className="font-semibold">{activity.title || "Working"}</span>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
          {statusLabelMap[activity.currentStatus]}
        </span>
      </div>

      {activity.detail ? <div className="text-xs text-gray-500">{activity.detail}</div> : null}

      {progress !== null ? (
        <div>
          <div className="flex items-center justify-between text-[10px] text-gray-400">
            <span>Progress</span>
            <span>{progress}%</span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div className="h-full bg-[#E43632] transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      ) : null}

      {updates.length > 0 ? (
        <div className="space-y-1 text-[11px] text-gray-500">
          {updates.map((update, index) => {
            const fade = 0.35 + (index / Math.max(1, updates.length - 1)) * 0.55;
            return (
              <div key={`${update.seq}-${update.title}`} style={{ opacity: fade }}>
                <span className="font-medium text-gray-600">{update.title}</span>
                {update.detail ? <span className="text-gray-400"> • {update.detail}</span> : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {waitingUser && cta ? (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            className="h-7 text-[11px]"
            onClick={() => onCtaClick?.(cta)}
          >
            {cta.label}
          </Button>
          <span className="text-[10px] text-gray-400">{cta.destination}</span>
        </div>
      ) : null}
    </div>
  );
}

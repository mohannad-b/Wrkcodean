"use client";

import { useMemo, useState } from "react";
import type { BuildActivityEvent } from "@/features/copilot/buildActivityContract";
import type { BuildActivityDebugState } from "@/features/copilot/hooks/useBuildActivityStream";
import { Button } from "@/components/ui/button";

export interface BuildActivityDebugViewProps {
  debug: BuildActivityDebugState | null;
  activity: BuildActivityEvent | null;
  streamStatus: "idle" | "connecting" | "connected" | "error";
  onSimulateError?: (stageHint?: string) => void;
  onClose?: () => void;
}

const formatIso = (value?: string | null) => {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleTimeString();
  } catch {
    return value;
  }
};

export function BuildActivityDebugView({
  debug,
  activity,
  streamStatus,
  onSimulateError,
  onClose,
}: BuildActivityDebugViewProps) {
  const [stageHint, setStageHint] = useState("tasks");
  const snapshotRaw = debug?.snapshotRaw ?? null;
  const snapshotPayload = debug?.snapshotPayload ?? null;
  const rawEvents = debug?.rawEvents ?? [];
  const lastEventId = debug?.lastEventId ?? null;
  const snapshotAppliedBeforeEvents = debug?.snapshotAppliedBeforeEvents;

  const orderingLabel = useMemo(() => {
    if (snapshotAppliedBeforeEvents === true) return "Snapshot applied before events";
    if (snapshotAppliedBeforeEvents === false) return "Event arrived before snapshot";
    return "Pending";
  }, [snapshotAppliedBeforeEvents]);

  const lastSeqByRunId = debug?.lastSeqByRunId ?? {};

  return (
    <div className="border-t border-gray-200 bg-white px-4 py-3 text-[11px] text-gray-600 space-y-3">
      <div className="flex items-center justify-between">
        <div className="font-semibold text-gray-700">Build activity debug</div>
        <div className="flex items-center gap-2">
          <div className="text-[10px] uppercase tracking-wide text-gray-400">{streamStatus}</div>
          {onClose ? (
            <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={onClose}>
              ✕
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div>
          <div className="text-gray-400 uppercase text-[10px]">Current run</div>
          <div className="font-medium text-gray-700">{activity?.runId ?? "—"}</div>
        </div>
        <div>
          <div className="text-gray-400 uppercase text-[10px]">Stage / Status</div>
          <div className="font-medium text-gray-700">
            {activity?.stage ?? "—"} / {activity?.status ?? "—"}
          </div>
        </div>
        <div>
          <div className="text-gray-400 uppercase text-[10px]">Current seq</div>
          <div className="font-medium text-gray-700">{activity?.seq ?? "—"}</div>
        </div>
        <div>
          <div className="text-gray-400 uppercase text-[10px]">Last-event-id</div>
          <div className="font-medium text-gray-700">{lastEventId ?? "—"}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="text-gray-400 uppercase text-[10px]">Snapshot applied</div>
          <div className="font-medium text-gray-700">{formatIso(debug?.snapshotAppliedAt)}</div>
        </div>
        <div>
          <div className="text-gray-400 uppercase text-[10px]">First event applied</div>
          <div className="font-medium text-gray-700">{formatIso(debug?.firstEventAppliedAt)}</div>
        </div>
        <div>
          <div className="text-gray-400 uppercase text-[10px]">Ordering</div>
          <div className="font-medium text-gray-700">{orderingLabel}</div>
        </div>
        <div>
          <div className="text-gray-400 uppercase text-[10px]">Ignored events</div>
          <div className="font-medium text-gray-700">
            dup {debug?.duplicateEventsIgnored ?? 0} • out-of-order {debug?.outOfOrderEventsIgnored ?? 0}
          </div>
        </div>
      </div>

      <div>
        <div className="text-gray-400 uppercase text-[10px] mb-1">Last seq per run</div>
        <div className="rounded border border-gray-200 bg-gray-50 px-2 py-1 text-[10px] text-gray-500">
          {Object.keys(lastSeqByRunId).length === 0
            ? "—"
            : Object.entries(lastSeqByRunId)
                .map(([runId, seq]) => `${runId}: ${seq}`)
                .join(" | ")}
        </div>
      </div>

      <div className="space-y-1">
        <div className="text-gray-400 uppercase text-[10px]">Snapshot payload</div>
        <pre className="max-h-40 overflow-auto rounded border border-gray-200 bg-gray-50 p-2 text-[10px] text-gray-600">
          {snapshotRaw ?? (snapshotPayload ? JSON.stringify(snapshotPayload, null, 2) : "—")}
        </pre>
      </div>

      <div className="space-y-1">
        <div className="text-gray-400 uppercase text-[10px]">Raw build_activity events</div>
        <div className="max-h-48 overflow-auto rounded border border-gray-200 bg-gray-50">
          {rawEvents.length === 0 ? (
            <div className="p-2 text-[10px] text-gray-500">—</div>
          ) : (
            <div className="divide-y divide-gray-200 text-[10px] text-gray-600">
              {rawEvents.map((event) => (
                <div key={`${event.runId}-${event.seq}`} className="p-2">
                  <div className="font-medium text-gray-700">
                    seq {event.seq} • {formatIso(event.ts)}
                  </div>
                  <div>
                    {event.stage} / {event.status} • {event.title}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {onSimulateError ? (
        <div className="flex items-center gap-2">
          <input
            value={stageHint}
            onChange={(event) => setStageHint(event.target.value)}
            className="h-7 rounded border border-gray-200 bg-white px-2 text-[10px] text-gray-700"
            placeholder="stage hint"
          />
          <Button size="sm" variant="secondary" className="h-7 text-[10px]" onClick={() => onSimulateError(stageHint)}>
            Simulate error
          </Button>
        </div>
      ) : null}
    </div>
  );
}

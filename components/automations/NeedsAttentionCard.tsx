"use client";

import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AutomationTask } from "@/lib/automations/tasks";

interface NeedsAttentionCardProps {
  tasks: AutomationTask[];
  onGoToWorkflow?: () => void;
  className?: string;
}

export function NeedsAttentionCard({ tasks, onGoToWorkflow, className }: NeedsAttentionCardProps) {
  return (
    <div className={cn("bg-amber-50/60 rounded-xl border border-amber-100 shadow-sm overflow-hidden", className)}>
      <div className="px-5 py-4 flex items-center justify-between gap-2 border-b border-amber-100/50">
        <div className="flex items-center gap-2">
          <AlertTriangle size={16} className="text-amber-600" />
          <span className="text-sm font-bold text-amber-900">Needs attention</span>
        </div>
        <Badge variant="secondary" className="bg-white text-amber-700 border border-amber-200 text-[10px]">
          {tasks.length} open
        </Badge>
      </div>
      <div className="p-5 space-y-3">
        {tasks.length === 0 ? (
          <div className="text-sm text-amber-800">All critical tasks are complete.</div>
        ) : (
          tasks.map((task) => (
            <div key={task.id} className="rounded-lg bg-white/80 border border-amber-100 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold text-amber-900">{task.title}</p>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] font-semibold border",
                    task.priority === "blocker"
                      ? "border-red-200 text-red-700 bg-red-50"
                      : "border-amber-200 text-amber-700 bg-amber-50"
                  )}
                >
                  {task.priority === "blocker" ? "Blocker" : "Important"}
                </Badge>
              </div>
              {task.description ? <p className="text-xs text-amber-800">{task.description}</p> : null}
              <div className="text-[11px] text-amber-700 font-medium capitalize">
                Status: {task.status.replace("_", " ")}
              </div>
            </div>
          ))
        )}
        {onGoToWorkflow ? (
          <Button
            size="sm"
            variant="outline"
            className="w-full border border-amber-200 text-amber-700 hover:bg-amber-50 hover:text-amber-800 hover:border-amber-300 shadow-sm h-8 text-xs font-bold"
            onClick={onGoToWorkflow}
            disabled={tasks.length === 0}
          >
            Go to Workflow
          </Button>
        ) : null}
      </div>
    </div>
  );
}


"use client";

import { useMemo } from "react";
import { AlertTriangle, CheckCircle2, Clock, ListChecks, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { VersionTask } from "../types";

type TaskSectionKey = "blocker" | "important" | "optional";

const TASK_SECTION_CONFIG: Array<{
  key: TaskSectionKey;
  title: string;
  description: string;
  emptyMessage: string;
  accentClass: string;
  icon: typeof AlertTriangle | typeof CheckCircle2 | typeof Clock;
}> = [
  {
    key: "blocker",
    title: "Setup blockers",
    description: "Must be completed before build can start.",
    emptyMessage: "All blocker tasks are complete.",
    accentClass: "border-rose-100 bg-rose-50/40",
    icon: AlertTriangle,
  },
  {
    key: "important",
    title: "Important tasks",
    description: "Recommended before handoff to the build team.",
    emptyMessage: "No open important tasks.",
    accentClass: "border-amber-100 bg-amber-50/30",
    icon: Clock,
  },
  {
    key: "optional",
    title: "Optional tasks",
    description: "Nice-to-have context for the automation.",
    emptyMessage: "No optional tasks yet.",
    accentClass: "border-emerald-100 bg-emerald-50/40",
    icon: CheckCircle2,
  },
];

interface TasksViewCanvasProps {
  tasks: VersionTask[];
  blockersRemaining: number;
  onViewStep: (stepId: string) => void;
  onViewTask: (task: VersionTask) => void;
  loadState: "loading" | "ready" | "empty" | "error";
  onRetry: () => void;
}

export function TasksViewCanvas({
  tasks,
  blockersRemaining,
  onViewStep,
  onViewTask,
  loadState,
  onRetry,
}: TasksViewCanvasProps) {
  return (
    <div className="flex-1 flex flex-col h-full bg-white overflow-hidden">
      {loadState === "loading" ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-sm text-gray-600">
            <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
            <span>Loading tasks…</span>
          </div>
        </div>
      ) : loadState === "error" ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3">
            <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto" />
            <p className="text-sm font-semibold text-gray-800">Couldn’t load tasks</p>
            <p className="text-xs text-gray-500">Check your connection and retry.</p>
            <Button size="sm" onClick={onRetry}>
              Retry
            </Button>
          </div>
        </div>
      ) : loadState === "empty" ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-2 max-w-sm">
            <CheckCircle2 className="h-10 w-10 text-gray-300 mx-auto" />
            <p className="text-sm font-semibold text-gray-700">No tasks yet</p>
            <p className="text-xs text-gray-500">
              Tasks will appear here when the workflow needs information or approvals.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto pt-[100px]">
          <div className="w-[90%] mx-auto">
            <AutomationTasksTab
              tasks={tasks}
              blockersRemaining={blockersRemaining}
              onViewStep={onViewStep}
              onViewTask={onViewTask}
            />
          </div>
        </div>
      )}
    </div>
  );
}

interface AutomationTasksTabProps {
  tasks: VersionTask[];
  blockersRemaining?: number;
  onViewStep?: (stepNumber: string) => void;
  onViewTask?: (task: VersionTask) => void;
}

function AutomationTasksTab({ tasks, blockersRemaining, onViewStep, onViewTask }: AutomationTasksTabProps) {
  const grouped = useMemo(() => {
    const groups: Record<TaskSectionKey, VersionTask[]> = {
      blocker: [],
      important: [],
      optional: [],
    };
    tasks.forEach((task) => {
      const priority = task.priority ?? "important";
      groups[priority].push(task);
    });
    return groups;
  }, [tasks]);

  const stats = useMemo(() => {
    const pending = tasks.filter((task) => task.status !== "complete").length;
    const blockersPending = grouped.blocker.filter((task) => task.status !== "complete").length;
    return {
      total: tasks.length,
      pending,
      completed: tasks.length - pending,
      blockerTotal: grouped.blocker.length,
      blockersPending,
    };
  }, [grouped.blocker, tasks]);

  const effectiveBlockersPending = blockersRemaining ?? stats.blockersPending;

  return (
    <div className="space-y-6">
      <TaskSummaryCard
        stats={{
          total: stats.total,
          pending: stats.pending,
          completed: stats.completed,
          blockerTotal: stats.blockerTotal,
          blockersPending: effectiveBlockersPending,
        }}
      />
      {TASK_SECTION_CONFIG.map((section) => (
        <TaskGroupCard
          key={section.key}
          title={section.title}
          description={section.description}
          emptyMessage={section.emptyMessage}
          accentClass={section.accentClass}
          icon={section.icon}
          tasks={grouped[section.key]}
          onViewStep={onViewStep}
          onViewTask={onViewTask}
        />
      ))}
    </div>
  );
}

interface TaskSummaryCardProps {
  stats: {
    total: number;
    pending: number;
    completed: number;
    blockerTotal: number;
    blockersPending: number;
  };
}

function TaskSummaryCard({ stats }: TaskSummaryCardProps) {
  const summary = [
    {
      label: "Total tasks",
      value: stats.total,
      caption: "Across this automation",
      icon: ListChecks,
      tone: "text-gray-900",
      iconBg: "bg-gray-100 text-gray-600",
    },
    {
      label: "Blockers remaining",
      value: stats.blockersPending,
      caption: `${stats.blockerTotal} blocker${stats.blockerTotal === 1 ? "" : "s"} total`,
      icon: AlertTriangle,
      tone: stats.blockersPending > 0 ? "text-amber-700" : "text-emerald-700",
      iconBg: stats.blockersPending > 0 ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600",
    },
    {
      label: "In progress",
      value: stats.pending,
      caption: "Pending or in review",
      icon: Clock,
      tone: "text-blue-700",
      iconBg: "bg-blue-50 text-blue-600",
    },
    {
      label: "Completed",
      value: stats.completed,
      caption: "Ready for build",
      icon: CheckCircle2,
      tone: "text-emerald-700",
      iconBg: "bg-emerald-50 text-emerald-600",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-4">
      {summary.map((item) => (
        <div key={item.label} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", item.iconBg)}>
              <item.icon size={18} />
            </div>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{item.label}</span>
          </div>
          <div className={cn("text-2xl font-bold leading-tight", item.tone)}>{item.value}</div>
          <p className="text-[11px] text-gray-400 mt-1">{item.caption}</p>
        </div>
      ))}
    </div>
  );
}

interface TaskGroupCardProps {
  title: string;
  description: string;
  emptyMessage: string;
  accentClass: string;
  icon: typeof AlertTriangle | typeof CheckCircle2 | typeof Clock;
  tasks: VersionTask[];
  onViewStep?: (stepNumber: string) => void;
  onViewTask?: (task: VersionTask) => void;
}

function TaskGroupCard({
  title,
  description,
  emptyMessage,
  accentClass,
  icon: Icon,
  tasks,
  onViewStep,
  onViewTask,
}: TaskGroupCardProps) {
  return (
    <div className={cn("rounded-2xl border p-6 space-y-4", accentClass)}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Icon size={16} className="text-gray-500" />
            <h3 className="text-sm font-bold text-[#0A0A0A] uppercase tracking-wide">{title}</h3>
          </div>
          <p className="text-xs text-gray-500 mt-1">{description}</p>
        </div>
        <Badge variant="secondary" className="text-[10px] bg-white text-gray-600 border-gray-200">
          {tasks.length} task{tasks.length === 1 ? "" : "s"}
        </Badge>
      </div>
      {tasks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-white/60 p-4 text-xs text-gray-500">
          {emptyMessage}
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => (
            <TaskListItem key={task.id} task={task} onViewStep={onViewStep} onViewTask={onViewTask} />
          ))}
        </div>
      )}
    </div>
  );
}

interface TaskListItemProps {
  task: VersionTask;
  onViewStep?: (stepNumber: string) => void;
  onViewTask?: (task: VersionTask) => void;
}

function TaskListItem({ task, onViewStep, onViewTask }: TaskListItemProps) {
  const statusLabel = formatTaskStatus(task.status);
  const statusClasses = getStatusBadgeClasses(task.status);
  const priorityClasses = getPriorityBadgeClasses(task.priority ?? "important");
  const relatedSteps = Array.isArray(task.metadata?.relatedSteps) ? task.metadata?.relatedSteps ?? [] : [];

  return (
    <div
      className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm hover:border-gray-300 cursor-pointer transition-colors"
      onClick={() => onViewTask?.(task)}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[#0A0A0A] leading-tight">{task.title}</p>
          {task.description ? <p className="text-xs text-gray-500 mt-1 leading-relaxed">{task.description}</p> : null}
        </div>
        <Badge className={cn("text-[10px] font-semibold", statusClasses)}>{statusLabel}</Badge>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Badge className={cn("text-[10px] font-semibold", priorityClasses)}>
          {task.priority === "blocker" ? "Blocker" : task.priority === "optional" ? "Optional" : "Important"}
        </Badge>
        {task.metadata?.systemType ? (
          <Badge variant="outline" className="text-[10px] font-semibold border-gray-200 text-gray-500 capitalize">
            {task.metadata.systemType}
          </Badge>
        ) : null}
      </div>
      {relatedSteps.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {relatedSteps.map((stepNumber) => (
            <button
              key={`${task.id}-${stepNumber}`}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onViewStep?.(stepNumber);
              }}
              className="px-2 py-1 text-[11px] font-semibold rounded-full border border-gray-200 text-gray-600 hover:border-[#E43632] hover:text-[#E43632]"
            >
              Step {stepNumber}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function formatTaskStatus(status: VersionTask["status"]) {
  switch (status) {
    case "complete":
      return "Complete";
    case "in_progress":
      return "In Progress";
    default:
      return "Pending";
  }
}

function getStatusBadgeClasses(status: VersionTask["status"]) {
  switch (status) {
    case "complete":
      return "bg-emerald-50 text-emerald-700 border border-emerald-100";
    case "in_progress":
      return "bg-blue-50 text-blue-700 border border-blue-100";
    default:
      return "bg-amber-50 text-amber-700 border border-amber-100";
  }
}

function getPriorityBadgeClasses(priority: NonNullable<VersionTask["priority"]>) {
  switch (priority) {
    case "blocker":
      return "bg-red-50 text-red-700 border border-red-100";
    case "optional":
      return "bg-gray-50 text-gray-500 border border-gray-100";
    default:
      return "bg-slate-50 text-slate-700 border border-slate-100";
  }
}

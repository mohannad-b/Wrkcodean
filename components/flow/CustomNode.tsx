"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import {
  Zap,
  Play,
  GitBranch,
  AlertCircle,
  User,
  AlertTriangle,
  CheckCircle,
  LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface OperatorNodeData {
  stepNumber?: string;
  displayId?: string;
  displayLabel?: string;
  title: string;
  description: string;
  type: "Trigger" | "Action" | "Decision" | "Exception" | "Human";
  status?: "ai-suggested" | "complete" | "draft";
  branchCondition?: string;
  totalTaskCount?: number;
  pendingTaskCount?: number;
  isNew?: boolean;
  isUpdated?: boolean;
}

function getIconForStepType(type: string): LucideIcon {
  const iconMap: Record<string, LucideIcon> = {
    Trigger: Zap,
    Action: Play,
    Decision: GitBranch,
    Exception: AlertCircle,
    Human: User,
  };
  return iconMap[type] || Zap;
}

const CustomNode = ({ data, selected }: NodeProps<OperatorNodeData>) => {
  const Icon = getIconForStepType(data.type);
  const isDecision = data.type === "Decision";
  const isException = data.type === "Exception";
  const totalTasks = data.totalTaskCount ?? 0;
  const pendingTasks = data.pendingTaskCount ?? totalTasks;
  const hasPendingTasks = pendingTasks > 0;
  const isNew = Boolean(data.isNew);
  const isUpdated = Boolean(data.isUpdated);
  const badgeLabel = data.displayId || data.stepNumber;

  return (
    <div
      className={cn(
        "relative group transition-all",
        isNew && "animate-in fade-in slide-in-from-bottom-4 duration-700",
        !isNew && isUpdated && "animate-in fade-in zoom-in-50 duration-500"
      )}
    >
      {badgeLabel && (
        <div className="absolute -top-3 -left-3 z-20 bg-[#E43632] text-white w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shadow-lg border-2 border-white">
          {badgeLabel}
        </div>
      )}

      {hasPendingTasks && (
        <div className="absolute -top-2 -right-2 z-20 bg-amber-500 text-white w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shadow">
          {pendingTasks}
        </div>
      )}

      <div
        className={cn(
          "w-[320px] bg-white rounded-xl border shadow-sm p-4 transition-all relative overflow-hidden",
          isDecision && "border-blue-300 bg-blue-50/30",
          isException && "border-amber-300 bg-amber-50/30",
          selected
            ? "border-gray-300 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.08)] ring-2 ring-[#E43632] ring-offset-2"
            : "border-gray-200 hover:border-gray-300 hover:shadow-md"
        )}
      >
        <div
          className={cn(
            "absolute top-0 bottom-0 left-0 w-1 transition-colors duration-300",
            selected ? "bg-[#E43632]" : "bg-transparent"
          )}
        />

        <Handle
          type="target"
          position={Position.Top}
          className="!w-2.5 !h-2.5 !bg-gray-300 !border-2 !border-white transition-all hover:!bg-[#E43632] hover:!w-3.5 hover:!h-3.5"
        />

        <div className="flex items-start gap-3 mb-3 pl-2">
          <div
            className={cn(
              "w-10 h-10 rounded-lg flex items-center justify-center shrink-0 transition-colors border",
              isDecision && "bg-blue-100 border-blue-200 text-blue-600",
              isException && "bg-amber-100 border-amber-200 text-amber-600",
              !isDecision &&
                !isException &&
                (selected
                  ? "bg-[#E43632]/5 border-[#E43632]/20 text-[#E43632]"
                  : "bg-gray-50 border-gray-100 text-gray-500 group-hover:text-[#E43632] group-hover:bg-red-50 group-hover:border-red-100")
            )}
          >
            <Icon size={20} strokeWidth={2} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
              {data.type}
            </div>
            <h4 className="text-sm font-bold text-gray-900 leading-tight">{data.title}</h4>
          </div>
        </div>

        <div className="pl-2">
          <p className="text-xs text-gray-600 leading-relaxed line-clamp-2">{data.description}</p>
        </div>

        {data.branchCondition && (
          <div className="mt-3 p-2 bg-blue-50 border border-blue-100 rounded-lg text-[11px] text-blue-700">
            <span className="font-semibold">Condition: </span>
            {data.branchCondition}
          </div>
        )}

        {totalTasks > 0 && (
          <div className="mt-3 flex items-center gap-2">
            <div
              className={cn(
                "flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium",
                hasPendingTasks
                  ? "bg-amber-50 text-amber-700 border border-amber-200"
                  : "bg-green-50 text-green-700 border border-green-200"
              )}
            >
              {hasPendingTasks ? (
                <>
                  <AlertTriangle size={12} />
                  <span>{pendingTasks} pending task{pendingTasks === 1 ? "" : "s"}</span>
                </>
              ) : (
                <>
                  <CheckCircle size={12} />
                  <span>All tasks complete</span>
                </>
              )}
            </div>
          </div>
        )}

        <Handle
          type="source"
          position={Position.Bottom}
          className="!w-2.5 !h-2.5 !bg-gray-300 !border-2 !border-white transition-all hover:!bg-[#E43632] hover:!w-3.5 hover:!h-3.5"
        />
      </div>
    </div>
  );
};

export default memo(CustomNode);

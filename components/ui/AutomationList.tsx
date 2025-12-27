"use client";

import { AutomationSummary } from "@/lib/types";
import { Avatar, AvatarFallback, AvatarImage } from "./avatar";
import { Badge } from "./badge";
import { Button } from "./button";
import { Zap, MoreVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import type { AutomationLifecycleStatus } from "@/lib/automations/status";
import { getStatusLabel, resolveStatus } from "@/lib/submissions/lifecycle";

interface AutomationListProps {
  automations: AutomationSummary[];
}

const STATUS_BADGE_CLASSES: Record<AutomationLifecycleStatus, string> = {
  IntakeInProgress: "bg-gray-50 text-gray-600 border-gray-200",
  NeedsPricing: "bg-amber-50 text-amber-700 border-amber-200",
  AwaitingClientApproval: "bg-blue-50 text-blue-700 border-blue-200",
  ReadyForBuild: "bg-blue-50 text-blue-700 border-blue-200",
  BuildInProgress: "bg-red-50 text-[#E43632] border-red-200",
  QATesting: "bg-purple-50 text-purple-700 border-purple-200",
  Live: "bg-emerald-100 text-emerald-800 border-emerald-200",
  Archived: "bg-gray-100 text-gray-500 border-gray-200",
};

export function AutomationList({ automations }: AutomationListProps) {
  const router = useRouter();

  return (
    <>
      {automations.map((automation) => (
        <motion.div
          key={automation.id}
          layout
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onClick={() => router.push(`/automations/${automation.id}`)}
          className="bg-white rounded-lg border border-gray-200 p-4 flex items-center gap-6 hover:border-gray-300 transition-all cursor-pointer group"
        >
          <div className="w-10 h-10 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-500 shrink-0">
            <Zap size={20} />
          </div>

          <div className="flex-1 min-w-[200px]">
            <h3 className="font-bold text-[#0A0A0A] text-sm mb-0.5 group-hover:text-[#E43632] transition-colors">
              {automation.name}
            </h3>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span>{automation.version}</span>
              <span className="w-1 h-1 rounded-full bg-gray-300" />
              <span>{automation.department}</span>
            </div>
          </div>

          <div className="w-[140px] shrink-0">
            <div className="flex items-center gap-2">
              <Avatar className="w-5 h-5">
                <AvatarImage src={automation.owner.avatar} />
                <AvatarFallback className="text-[9px] bg-gray-100">
                  {automation.owner.name?.charAt(0) || "U"}
                </AvatarFallback>
              </Avatar>
              <span className="text-xs text-gray-600 truncate">{automation.owner.name}</span>
            </div>
          </div>

          <div className="w-[120px] shrink-0">
            {(() => {
              const resolvedStatus = resolveStatus(automation.status);
              const badgeLabel = resolvedStatus ? getStatusLabel(resolvedStatus) : automation.status;
              const badgeClasses =
                (resolvedStatus ? STATUS_BADGE_CLASSES[resolvedStatus] : null) ??
                "bg-gray-50 text-gray-600 border-gray-200";
              return (
                <Badge
                  variant="outline"
                  className={cn("text-[10px] font-medium border px-2 py-0.5", badgeClasses)}
                >
                  {badgeLabel}
                </Badge>
              );
            })()}
          </div>

          <div className="w-[100px] shrink-0 text-right">
            <p className="text-xs font-bold text-[#0A0A0A]">
              {typeof automation.runs === "number" && automation.runs > 0
                ? automation.runs.toLocaleString()
                : "Pending"}
            </p>
            <p className="text-[10px] text-gray-400">runs</p>
          </div>

          <div className="w-[100px] shrink-0 text-right">
            <p className="text-xs font-bold text-[#0A0A0A]">
              {typeof automation.spend === "number" && automation.spend > 0
                ? `$${Math.round(automation.spend).toLocaleString()}`
                : "Pending"}
            </p>
            <p className="text-[10px] text-gray-400">spend</p>
          </div>

          <div className="w-8 shrink-0 text-right">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-gray-400 hover:text-[#0A0A0A]"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreVertical size={16} />
            </Button>
          </div>
        </motion.div>
      ))}
    </>
  );
}

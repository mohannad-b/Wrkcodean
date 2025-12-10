"use client";

import { AutomationSummary } from "@/lib/types";
import { Avatar, AvatarFallback, AvatarImage } from "./avatar";
import { Badge } from "./badge";
import { Progress } from "./progress";
import { Clock, Zap, ArrowRight, MoreHorizontal } from "lucide-react";
import { Button } from "./button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import { cn } from "@/lib/utils";
import { cardClasses } from "@/components/ui/card-shell";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";

interface AutomationCardProps {
  automation: AutomationSummary;
}

const getStatusColor = (status: string) => {
  switch (status) {
    case "Live":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "Ready to Launch":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "QA & Testing":
      return "bg-purple-50 text-purple-700 border-purple-200";
    case "Build in Progress":
      return "bg-red-50 text-[#E43632] border-red-200";
    case "Awaiting Client Approval":
      return "bg-blue-50 text-blue-700 border-blue-200";
    case "Needs Pricing":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "Intake in Progress":
      return "bg-gray-50 text-gray-600 border-gray-200";
    case "Blocked":
      return "bg-orange-50 text-orange-700 border-orange-200";
    case "Archived":
      return "bg-gray-100 text-gray-500 border-gray-200";
    default:
      return "bg-gray-50 text-gray-600 border-gray-200";
  }
};

export function AutomationCard({ automation }: AutomationCardProps) {
  const router = useRouter();
  const isBuilding = automation.status === "Build in Progress";
  const pendingLabel = "Pending";
  const runsDisplay =
    typeof automation.runs === "number" && automation.runs > 0 ? automation.runs.toLocaleString() : pendingLabel;
  const successDisplay =
    typeof automation.success === "number" && automation.success > 0 ? `${automation.success.toFixed(1)}%` : pendingLabel;
  const spendDisplay =
    typeof automation.spend === "number" && automation.spend > 0 ? `$${Math.round(automation.spend).toLocaleString()}` : pendingLabel;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      onClick={() => router.push(`/automations/${automation.id}`)}
      className={cardClasses("group flex flex-col cursor-pointer w-full")}
    >
      <div className="p-6 flex-1">
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-500">
              <Zap size={20} />
            </div>
            <div>
              <h3 className="font-bold text-[#0A0A0A] leading-tight mb-0.5">{automation.name}</h3>
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className="text-[10px] px-1.5 h-5 text-gray-500 border-gray-200"
                >
                  {automation.version}
                </Badge>
                <span className="text-xs text-gray-400">{automation.department}</span>
              </div>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-gray-400 hover:text-[#0A0A0A]"
                aria-label="More options"
              >
                <MoreHorizontal size={16} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={(e) => e.stopPropagation()}>Rename</DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => e.stopPropagation()}>Clone</DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => e.stopPropagation()}>Pause</DropdownMenuItem>
              <DropdownMenuItem className="text-red-600" onClick={(e) => e.stopPropagation()}>
                Archive
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <p className="text-xs text-gray-500 line-clamp-2 mb-4 h-8">{automation.description}</p>

        {/* Status & Build Tracker */}
        <div className="mb-6">
          {isBuilding && automation.progress !== undefined ? (
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-medium text-gray-600">
                <span className="flex items-center gap-1.5 text-[#E43632]">
                  <Clock size={12} /> Build in Progress
                </span>
                <span>{automation.progress}%</span>
              </div>
              <Progress
                value={automation.progress}
                className="h-1.5 bg-gray-100"
                indicatorClassName="bg-[#E43632]"
              />
            </div>
          ) : (
            <Badge
              variant="outline"
              className={cn(
                "text-xs font-medium border px-2.5 py-0.5",
                getStatusColor(automation.status)
              )}
            >
              {automation.status}
            </Badge>
          )}
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-2 pt-4 border-t border-gray-50">
          <div>
            <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-0.5">
              Runs
            </p>
            <p className="text-sm font-bold text-[#0A0A0A]">
              {runsDisplay}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-0.5">
              Success
            </p>
            <p
              className={cn(
                "text-sm font-bold",
                typeof automation.success === "number" && automation.success > 90 ? "text-emerald-600" : "text-gray-600"
              )}
            >
              {successDisplay}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-0.5">
              Spend
            </p>
            <p className="text-sm font-bold text-[#0A0A0A]">
              {spendDisplay}
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="bg-gray-50 p-3 px-6 rounded-b-xl border-t border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Avatar className="w-5 h-5 border border-white shadow-sm">
            <AvatarImage src={automation.owner.avatar} />
            <AvatarFallback className="text-[9px] bg-gray-200">
              {automation.owner.name
                .split(" ")
                .map((n) => n[0])
                .join("")}
            </AvatarFallback>
          </Avatar>
          <span className="text-[10px] text-gray-500 font-medium">{automation.owner.name}</span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="text-xs font-bold text-[#0A0A0A] hover:text-[#E43632] hover:bg-transparent p-0 h-auto"
          onClick={(e) => e.stopPropagation()}
        >
          Open <ArrowRight size={12} className="ml-1" />
        </Button>
      </div>
    </motion.div>
  );
}

"use client";

import { Badge } from "./badge";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface TaskCardProps {
  id: number;
  type: "approval" | "review" | "missing_info";
  title: string;
  due: string;
  priority: "high" | "medium" | "critical";
  onClick?: () => void;
}

export function TaskCard({ type, title, due, priority, onClick }: TaskCardProps) {
  return (
    <div
      onClick={onClick}
      className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer group relative overflow-hidden"
    >
      <div
        className={cn(
          "absolute top-0 left-0 w-1 h-full",
          priority === "critical"
            ? "bg-red-500"
            : priority === "high"
              ? "bg-orange-500"
              : "bg-blue-500"
        )}
      />
      <div className="flex justify-between items-start mb-3">
        <Badge
          variant="secondary"
          className={cn(
            "text-[10px] font-bold uppercase tracking-wider",
            type === "approval"
              ? "bg-emerald-50 text-emerald-700"
              : type === "review"
                ? "bg-blue-50 text-blue-700"
                : "bg-red-50 text-red-700"
          )}
        >
          {type.replace("_", " ")}
        </Badge>
        <span
          className={cn("text-xs font-bold", due === "Overdue" ? "text-red-600" : "text-gray-400")}
        >
          {due}
        </span>
      </div>
      <h3 className="text-sm font-bold text-[#0A0A0A] mb-4 line-clamp-2 leading-relaxed">
        {title}
      </h3>
      <div className="flex items-center justify-end">
        <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center group-hover:bg-[#E43632] transition-colors">
          <ArrowRight size={14} className="text-gray-400 group-hover:text-white" />
        </div>
      </div>
    </div>
  );
}

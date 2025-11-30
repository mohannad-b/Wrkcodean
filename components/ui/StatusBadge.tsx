import { Badge } from "./badge";
import { cn } from "@/lib/utils";
import { AutomationStatus } from "@/lib/types";

interface StatusBadgeProps {
  status: AutomationStatus | string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
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

  return (
    <Badge
      variant="outline"
      className={cn("text-xs font-medium border px-2.5 py-0.5", getStatusColor(status), className)}
    >
      {status}
    </Badge>
  );
}

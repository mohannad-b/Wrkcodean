import { Badge } from "./badge";
import { cn } from "@/lib/utils";
import { AutomationStatus } from "@/lib/types";

interface StatusBadgeProps {
  status: AutomationStatus | string;
  className?: string;
}

const STATUS_STYLES: Record<string, { label: string; classes: string }> = {
  LIVE: { label: "Live", classes: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  READY_TO_LAUNCH: { label: "Ready to Launch", classes: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  READY_TO_BUILD: { label: "Ready to Build", classes: "bg-blue-50 text-blue-700 border-blue-200" },
  NEEDS_PRICING: { label: "Needs Pricing", classes: "bg-amber-50 text-amber-700 border-amber-200" },
  DRAFT: { label: "Draft", classes: "bg-gray-50 text-gray-600 border-gray-200" },
  ARCHIVED: { label: "Archived", classes: "bg-gray-100 text-gray-500 border-gray-200" },
  BLOCKED: { label: "Blocked", classes: "bg-orange-50 text-orange-700 border-orange-200" },
  "QA_&_TESTING": { label: "QA & Testing", classes: "bg-purple-50 text-purple-700 border-purple-200" },
  BUILD_IN_PROGRESS: { label: "Build in Progress", classes: "bg-red-50 text-[#E43632] border-red-200" },
  AWAITING_CLIENT_APPROVAL: { label: "Awaiting Approval", classes: "bg-blue-50 text-blue-700 border-blue-200" },
  INTAKE_IN_PROGRESS: { label: "Intake", classes: "bg-gray-50 text-gray-600 border-gray-200" },
};

function normalize(status: string) {
  return status.replace(/\s+/g, "_").toUpperCase();
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const normalized = normalize(status);
  const config = STATUS_STYLES[normalized] ?? {
    label: status,
    classes: "bg-gray-50 text-gray-600 border-gray-200",
  };

  return (
    <Badge variant="outline" className={cn("text-xs font-medium border px-2.5 py-0.5", config.classes, className)}>
      {config.label}
    </Badge>
  );
}


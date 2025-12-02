import { Badge } from "./badge";
import { cn } from "@/lib/utils";
import { AutomationStatus } from "@/lib/types";
import { BUILD_STATUS_LABELS, BuildStatus } from "@/lib/build-status/types";

interface StatusBadgeProps {
  status: AutomationStatus | string;
  className?: string;
}

const BUILD_STATUS_CLASSES: Record<BuildStatus | "Archived", string> = {
  IntakeInProgress: "bg-gray-50 text-gray-600 border-gray-200",
  NeedsPricing: "bg-amber-50 text-amber-700 border-amber-200",
  AwaitingClientApproval: "bg-blue-50 text-blue-700 border-blue-200",
  BuildInProgress: "bg-red-50 text-[#E43632] border-red-200",
  QATesting: "bg-purple-50 text-purple-700 border-purple-200",
  Live: "bg-emerald-100 text-emerald-800 border-emerald-300",
  Archived: "bg-gray-100 text-gray-500 border-gray-200",
};

const FALLBACK_STATUS_STYLES: Record<string, { label: string; classes: string }> = {
  readytolaunch: { label: "Ready to Launch", classes: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  readytobuild: { label: "Ready to Build", classes: "bg-blue-50 text-blue-700 border-blue-200" },
  blocked: { label: "Blocked", classes: "bg-orange-50 text-orange-700 border-orange-200" },
  draft: { label: "Draft", classes: "bg-gray-50 text-gray-600 border-gray-200" },
  sent: { label: "Sent", classes: "bg-purple-50 text-purple-700 border-purple-200" },
  signed: { label: "Signed", classes: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  rejected: { label: "Rejected", classes: "bg-red-50 text-red-700 border-red-200" },
  pending: { label: "Pending", classes: "bg-gray-50 text-gray-600 border-gray-200" },
};

const LEGACY_BUILD_STATUS_MAP: Record<string, BuildStatus | "Archived"> = {
  draft: "IntakeInProgress",
  needspricing: "NeedsPricing",
  needs_pricing: "NeedsPricing",
  awaitingapproval: "AwaitingClientApproval",
  awaiting_client_approval: "AwaitingClientApproval",
  ready_to_build: "AwaitingClientApproval",
  buildinprogress: "BuildInProgress",
  build_in_progress: "BuildInProgress",
  qa_testing: "QATesting",
  qaandtesting: "QATesting",
  live: "Live",
  archived: "Archived",
};

const normalize = (value: string) => value.replace(/[\s&_-]+/g, "").toLowerCase();

function resolveBuildStatus(value: string): BuildStatus | "Archived" | null {
  if (!value) {
    return null;
  }

  const normalized = normalize(value);
  if (!normalized) {
    return null;
  }

  for (const status of Object.keys(BUILD_STATUS_LABELS) as BuildStatus[]) {
    if (normalize(status) === normalized || normalize(BUILD_STATUS_LABELS[status]) === normalized) {
      return status;
    }
  }

  return LEGACY_BUILD_STATUS_MAP[normalized] ?? null;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const rawStatus = typeof status === "string" ? status : String(status);
  const buildStatus = resolveBuildStatus(rawStatus);

  if (buildStatus) {
    const label = buildStatus === "Archived" ? "Archived" : BUILD_STATUS_LABELS[buildStatus];
    const classes = BUILD_STATUS_CLASSES[buildStatus];
    return (
      <Badge
        variant="outline"
        className={cn("text-xs font-medium border px-2.5 py-0.5", classes, className)}
      >
        {label}
      </Badge>
    );
  }

  const fallbackKey = normalize(rawStatus);
  const fallback =
    FALLBACK_STATUS_STYLES[fallbackKey] ?? {
      label: rawStatus,
      classes: "bg-gray-50 text-gray-600 border-gray-200",
    };

  return (
    <Badge variant="outline" className={cn("text-xs font-medium border px-2.5 py-0.5", fallback.classes, className)}>
      {fallback.label}
    </Badge>
  );
}


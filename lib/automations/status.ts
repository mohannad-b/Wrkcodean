export const API_AUTOMATION_STATUSES = ["DRAFT", "NEEDS_PRICING", "READY_TO_BUILD", "LIVE", "ARCHIVED"] as const;
export type AutomationLifecycleStatus = (typeof API_AUTOMATION_STATUSES)[number];

const DB_STATUS_MAP: Record<AutomationLifecycleStatus, "Intake" | "Needs Pricing" | "Awaiting Approval" | "Live" | "Archived"> =
  {
    DRAFT: "Intake",
    NEEDS_PRICING: "Needs Pricing",
    READY_TO_BUILD: "Awaiting Approval",
    LIVE: "Live",
    ARCHIVED: "Archived",
  };

const DB_TO_API = Object.fromEntries(Object.entries(DB_STATUS_MAP).map(([api, db]) => [db, api])) as Record<
  string,
  AutomationLifecycleStatus
>;

const AUTOMATION_STATUS_TRANSITIONS: Record<AutomationLifecycleStatus, AutomationLifecycleStatus[]> = {
  DRAFT: ["NEEDS_PRICING"],
  NEEDS_PRICING: ["READY_TO_BUILD"],
  READY_TO_BUILD: ["LIVE"],
  LIVE: ["ARCHIVED"],
  ARCHIVED: [],
};

export function canTransition(from: AutomationLifecycleStatus, to: AutomationLifecycleStatus): boolean {
  if (from === to) {
    return true;
  }
  const allowed = AUTOMATION_STATUS_TRANSITIONS[from] ?? [];
  return allowed.includes(to);
}

export function parseAutomationStatus(input: unknown): AutomationLifecycleStatus | null {
  if (typeof input !== "string") {
    return null;
  }
  const normalized = input.trim().toUpperCase();
  return (API_AUTOMATION_STATUSES as readonly string[]).includes(normalized) ? (normalized as AutomationLifecycleStatus) : null;
}

export function toDbAutomationStatus(status: AutomationLifecycleStatus): string {
  return DB_STATUS_MAP[status];
}

export function fromDbAutomationStatus(dbStatus: string): AutomationLifecycleStatus {
  return DB_TO_API[dbStatus] ?? "DRAFT";
}

export function getDisplayStatus(status: AutomationLifecycleStatus): string {
  switch (status) {
    case "DRAFT":
      return "Draft";
    case "NEEDS_PRICING":
      return "Needs Pricing";
    case "READY_TO_BUILD":
      return "Ready to Build";
    case "LIVE":
      return "Live";
    case "ARCHIVED":
      return "Archived";
    default:
      return status;
  }
}



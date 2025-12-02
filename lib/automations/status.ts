import {
  BUILD_STATUS_LABELS,
  BUILD_STATUS_ORDER,
  BuildStatus,
  DEFAULT_BUILD_STATUS,
  canTransitionBuildStatus,
} from "@/lib/build-status/types";

export const API_AUTOMATION_STATUSES = [...BUILD_STATUS_ORDER, "Archived"] as const;
export type AutomationLifecycleStatus = (typeof API_AUTOMATION_STATUSES)[number];

const LEGACY_DB_STATUS_MAP: Record<string, AutomationLifecycleStatus> = {
  Intake: "IntakeInProgress",
  "Needs Pricing": "NeedsPricing",
  "Awaiting Approval": "AwaitingClientApproval",
  Live: "Live",
  Archived: "Archived",
};

const LEGACY_API_STATUS_MAP: Record<string, AutomationLifecycleStatus> = {
  DRAFT: "IntakeInProgress",
  NEEDS_PRICING: "NeedsPricing",
  READY_TO_BUILD: "AwaitingClientApproval",
  LIVE: "Live",
  ARCHIVED: "Archived",
};

function isBuildStatus(status: AutomationLifecycleStatus): status is BuildStatus {
  return status !== "Archived";
}

export function canTransition(from: AutomationLifecycleStatus, to: AutomationLifecycleStatus): boolean {
  if (from === to) {
    return true;
  }

  if (to === "Archived") {
    return from === "Live" || from === "Archived";
  }

  if (from === "Archived") {
    return false;
  }

  return canTransitionBuildStatus(from, to);
}

export function parseAutomationStatus(input: unknown): AutomationLifecycleStatus | null {
  if (typeof input !== "string") {
    return null;
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  const exactMatch = (API_AUTOMATION_STATUSES as readonly string[]).find((value) => value === trimmed);
  if (exactMatch) {
    return exactMatch as AutomationLifecycleStatus;
  }

  const caseInsensitiveMatch = (API_AUTOMATION_STATUSES as readonly string[]).find(
    (value) => value.toLowerCase() === trimmed.toLowerCase()
  );
  if (caseInsensitiveMatch) {
    return caseInsensitiveMatch as AutomationLifecycleStatus;
  }

  const legacyMatch =
    LEGACY_API_STATUS_MAP[trimmed.toUpperCase()] ??
    LEGACY_DB_STATUS_MAP[trimmed] ??
    LEGACY_DB_STATUS_MAP[trimmed.replace(/_/g, " ")];

  return legacyMatch ?? null;
}

export function toDbAutomationStatus(status: AutomationLifecycleStatus): string {
  return status;
}

export function fromDbAutomationStatus(dbStatus: string): AutomationLifecycleStatus {
  if ((API_AUTOMATION_STATUSES as readonly string[]).includes(dbStatus)) {
    return dbStatus as AutomationLifecycleStatus;
  }
  return LEGACY_DB_STATUS_MAP[dbStatus] ?? DEFAULT_BUILD_STATUS;
}

export function getDisplayStatus(status: AutomationLifecycleStatus): string {
  if (isBuildStatus(status)) {
    return BUILD_STATUS_LABELS[status];
  }
  return "Archived";
}




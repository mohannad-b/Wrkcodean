import {
  KANBAN_COLUMNS,
  SUBMISSION_STATUSES,
  SubmissionLifecycleStatus,
  applyTransition,
  canTransition as lifecycleCanTransition,
  fromDbLifecycleStatus,
  getStatusLabel,
  resolveStatus,
  resolveStatusOrThrow,
  toDbLifecycleStatus,
  DEFAULT_LIFECYCLE_STATUS,
} from "@/lib/submissions/lifecycle";

export const API_AUTOMATION_STATUSES = SUBMISSION_STATUSES;
export type AutomationLifecycleStatus = SubmissionLifecycleStatus;

export function canTransition(from: AutomationLifecycleStatus, to: AutomationLifecycleStatus): boolean {
  return lifecycleCanTransition(from, to);
}

export function parseAutomationStatus(input: unknown): AutomationLifecycleStatus | null {
  if (typeof input !== "string") {
    return null;
  }
  return resolveStatus(input);
}

export function toDbAutomationStatus(status: AutomationLifecycleStatus): AutomationLifecycleStatus {
  return toDbLifecycleStatus(status);
}

export function fromDbAutomationStatus(dbStatus: string): AutomationLifecycleStatus {
  return fromDbLifecycleStatus(dbStatus);
}

export function getDisplayStatus(status: AutomationLifecycleStatus): string {
  return getStatusLabel(status ?? DEFAULT_LIFECYCLE_STATUS);
}

// Convenience wrapper used by services to enforce both transition rules and role permissions.
export function applyAutomationTransition(params: {
  from: AutomationLifecycleStatus | string;
  to: AutomationLifecycleStatus | string;
  actorRole: Parameters<typeof applyTransition>[0]["actorRole"];
  reason?: string;
}): AutomationLifecycleStatus {
  return applyTransition(params);
}

export { resolveStatus as resolveAutomationStatus, resolveStatusOrThrow as resolveAutomationStatusOrThrow, KANBAN_COLUMNS };



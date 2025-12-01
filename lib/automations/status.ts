export const AUTOMATION_STATUSES = ["Intake", "Needs Pricing", "Awaiting Approval", "Live", "Archived"] as const;
export type AutomationStatus = (typeof AUTOMATION_STATUSES)[number];

export const AUTOMATION_STATUS_TRANSITIONS: Record<AutomationStatus, AutomationStatus[]> = {
  Intake: ["Needs Pricing", "Archived"],
  "Needs Pricing": ["Awaiting Approval", "Archived"],
  "Awaiting Approval": ["Live", "Archived"],
  Live: ["Archived"],
  Archived: [],
};

export function canTransition(from: AutomationStatus, to: AutomationStatus): boolean {
  if (from === to) {
    return true;
  }

  const allowed = AUTOMATION_STATUS_TRANSITIONS[from] ?? [];
  return allowed.includes(to);
}

export function isAutomationStatus(value: unknown): value is AutomationStatus {
  return typeof value === "string" && (AUTOMATION_STATUSES as readonly string[]).includes(value);
}



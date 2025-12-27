import { BUILD_STATUS_LABELS, BUILD_STATUS_ORDER, BuildStatus, DEFAULT_BUILD_STATUS } from "@/lib/build-status/types";

export type SubmissionLifecycleStatus = BuildStatus | "Archived";
export type LifecycleStatusInput = SubmissionLifecycleStatus | string | null | undefined;
export type LifecycleRole =
  | "wrk_master_admin"
  | "wrk_admin"
  | "wrk_operator"
  | "tenant_owner"
  | "tenant_admin"
  | "tenant_editor"
  | "tenant_billing"
  | "tenant_viewer"
  | "system";

export type LifecycleEvent =
  | "quote.sent"
  | "quote.signed"
  | "build.started"
  | "qa.completed"
  | "launch"
  | "archive";

export type LifecycleColumn = {
  id: string;
  title: string;
  order: number;
  statuses: SubmissionLifecycleStatus[];
};

export type LifecycleNextAction = { label: string; intent?: string };

export class LifecycleTransitionError extends Error {
  from: SubmissionLifecycleStatus;
  to: SubmissionLifecycleStatus;
  role: LifecycleRole;

  constructor(message: string, from: SubmissionLifecycleStatus, to: SubmissionLifecycleStatus, role: LifecycleRole) {
    super(message);
    this.from = from;
    this.to = to;
    this.role = role;
  }
}

export const SUBMISSION_STATUSES: SubmissionLifecycleStatus[] = [...BUILD_STATUS_ORDER, "Archived"];
export const ACTIVE_LIFECYCLE_ORDER: BuildStatus[] = [...BUILD_STATUS_ORDER];
export const LIFECYCLE_ORDER: SubmissionLifecycleStatus[] = [...SUBMISSION_STATUSES];
export const DEFAULT_LIFECYCLE_STATUS: SubmissionLifecycleStatus = DEFAULT_BUILD_STATUS;

export const STATUS_LABELS: Record<SubmissionLifecycleStatus, string> = {
  ...BUILD_STATUS_LABELS,
  Archived: "Archived",
};

const normalize = (value: string) => value.trim().toLowerCase().replace(/[\s&/_-]+/g, "");

const STATUS_ALIASES: Record<string, SubmissionLifecycleStatus> = {
  intake: "IntakeInProgress",
  intakeinprogress: "IntakeInProgress",
  intake_in_progress: "IntakeInProgress",
  draft: "IntakeInProgress",
  needspricing: "NeedsPricing",
  needs_pricing: "NeedsPricing",
  awaitingclientapproval: "AwaitingClientApproval",
  awaitingapproval: "AwaitingClientApproval",
  awaiting_client_approval: "AwaitingClientApproval",
  readyforbuild: "ReadyForBuild",
  readytobuild: "ReadyForBuild",
  ready_to_build: "ReadyForBuild",
  readyforlaunch: "ReadyForBuild",
  readytolaunch: "ReadyForBuild",
  build: "BuildInProgress",
  buildinprogress: "BuildInProgress",
  build_in_progress: "BuildInProgress",
  qa: "QATesting",
  qatesting: "QATesting",
  qa_testing: "QATesting",
  qaandtesting: "QATesting",
  live: "Live",
  archived: "Archived",
  // Legacy project-facing labels
  "intake in progress": "IntakeInProgress",
  "needs pricing": "NeedsPricing",
  "awaiting client approval": "AwaitingClientApproval",
  "ready for build": "ReadyForBuild",
  "build in progress": "BuildInProgress",
  "qa & testing": "QATesting",
  "ready to launch": "ReadyForBuild",
  blocked: "BuildInProgress",
};

const ALLOWED_TRANSITIONS: Record<SubmissionLifecycleStatus, SubmissionLifecycleStatus[]> = {
  IntakeInProgress: ["IntakeInProgress", "NeedsPricing"],
  NeedsPricing: ["NeedsPricing", "AwaitingClientApproval"],
  AwaitingClientApproval: ["AwaitingClientApproval", "ReadyForBuild"],
  ReadyForBuild: ["ReadyForBuild", "BuildInProgress"],
  BuildInProgress: ["BuildInProgress", "QATesting"],
  QATesting: ["QATesting", "Live"],
  Live: ["Live", "Archived"],
  Archived: ["Archived"],
};

const STAFF_ROLES = new Set<LifecycleRole>(["wrk_operator", "wrk_admin", "wrk_master_admin", "system"]);
const ARCHIVE_ROLES = new Set<LifecycleRole>(["wrk_admin", "wrk_master_admin", "system"]);
const TENANT_ROLES = new Set<LifecycleRole>([
  "tenant_owner",
  "tenant_admin",
  "tenant_editor",
  "tenant_billing",
  "tenant_viewer",
]);

const TENANT_ALLOWED_TRANSITIONS = new Set<string>([
  "IntakeInProgress->NeedsPricing",
  "NeedsPricing->AwaitingClientApproval",
  "AwaitingClientApproval->ReadyForBuild",
]);

const EVENT_TARGETS: Record<LifecycleEvent, SubmissionLifecycleStatus> = {
  "quote.sent": "AwaitingClientApproval",
  "quote.signed": "ReadyForBuild",
  "build.started": "BuildInProgress",
  "qa.completed": "Live",
  launch: "Live",
  archive: "Archived",
};

export const KANBAN_COLUMNS: LifecycleColumn[] = [
  { id: "intake", title: "Intake", order: 0, statuses: ["IntakeInProgress"] },
  { id: "pricing", title: "Pricing", order: 1, statuses: ["NeedsPricing", "AwaitingClientApproval"] },
  { id: "ready", title: "Ready for Build", order: 2, statuses: ["ReadyForBuild"] },
  { id: "build", title: "Build", order: 3, statuses: ["BuildInProgress"] },
  { id: "qa", title: "QA & Testing", order: 4, statuses: ["QATesting"] },
  { id: "live", title: "Live", order: 5, statuses: ["Live"] },
  { id: "archived", title: "Archived", order: 6, statuses: ["Archived"] },
];

const NEXT_ACTIONS: Record<SubmissionLifecycleStatus, LifecycleNextAction> = {
  IntakeInProgress: { label: "Collect requirements", intent: "intake" },
  NeedsPricing: { label: "Generate pricing", intent: "pricing" },
  AwaitingClientApproval: { label: "Send quote / await client", intent: "approval" },
  ReadyForBuild: { label: "Kick off build", intent: "build" },
  BuildInProgress: { label: "Finish build tasks", intent: "build" },
  QATesting: { label: "Complete QA", intent: "qa" },
  Live: { label: "Monitor & measure", intent: "monitor" },
  Archived: { label: "No further action", intent: "none" },
};

const COLUMN_BY_STATUS = new Map<SubmissionLifecycleStatus, LifecycleColumn>();
for (const column of KANBAN_COLUMNS) {
  for (const status of column.statuses) {
    if (COLUMN_BY_STATUS.has(status)) {
      throw new Error(`Status ${status} is assigned to multiple lifecycle columns.`);
    }
    COLUMN_BY_STATUS.set(status, column);
  }
}

function coerceStatus(value: LifecycleStatusInput): SubmissionLifecycleStatus | null {
  if (!value) return null;
  if (SUBMISSION_STATUSES.includes(value as SubmissionLifecycleStatus)) {
    return value as SubmissionLifecycleStatus;
  }
  const normalized = normalize(String(value));
  if (!normalized) return null;
  if (STATUS_ALIASES[normalized]) {
    return STATUS_ALIASES[normalized];
  }
  for (const status of SUBMISSION_STATUSES) {
    if (normalize(status) === normalized || normalize(STATUS_LABELS[status]) === normalized) {
      return status;
    }
  }
  return null;
}

export function resolveStatus(input: LifecycleStatusInput): SubmissionLifecycleStatus | null {
  return coerceStatus(input);
}

export function resolveStatusOrThrow(input: LifecycleStatusInput): SubmissionLifecycleStatus {
  const status = resolveStatus(input);
  if (!status) {
    throw new Error(`Invalid status: ${input}`);
  }
  return status;
}

export function getStatusLabel(input: LifecycleStatusInput): string {
  const status = resolveStatus(input) ?? DEFAULT_BUILD_STATUS;
  return STATUS_LABELS[status];
}

export function getRecommendedAction(input: LifecycleStatusInput): LifecycleNextAction {
  const status = resolveStatus(input) ?? DEFAULT_BUILD_STATUS;
  return NEXT_ACTIONS[status];
}

export function getColumnForStatus(input: LifecycleStatusInput): LifecycleColumn | null {
  const status = resolveStatus(input);
  if (!status) return null;
  return COLUMN_BY_STATUS.get(status) ?? null;
}

export function canTransition(fromInput: LifecycleStatusInput, toInput: LifecycleStatusInput): boolean {
  const from = resolveStatus(fromInput);
  const to = resolveStatus(toInput);
  if (!from || !to) return false;
  const allowedTargets = ALLOWED_TRANSITIONS[from] ?? [];
  return allowedTargets.includes(to);
}

function canRoleTransition(role: LifecycleRole, from: SubmissionLifecycleStatus, to: SubmissionLifecycleStatus): boolean {
  if (STAFF_ROLES.has(role)) {
    if (to === "Archived" && !ARCHIVE_ROLES.has(role)) {
      return false;
    }
    return true;
  }

  if (!TENANT_ROLES.has(role)) {
    return false;
  }

  if (from === to) {
    return true;
  }

  return TENANT_ALLOWED_TRANSITIONS.has(`${from}->${to}`);
}

export function applyTransition(params: {
  from: LifecycleStatusInput;
  to: LifecycleStatusInput;
  actorRole: LifecycleRole;
  reason?: string;
}): SubmissionLifecycleStatus {
  const from = resolveStatusOrThrow(params.from);
  const to = resolveStatusOrThrow(params.to);

  if (!canTransition(from, to)) {
    const message = `Invalid lifecycle transition from ${from} to ${to}`;
    console.warn(`[lifecycle] ${message}${params.reason ? ` (${params.reason})` : ""}`);
    throw new LifecycleTransitionError(message, from, to, params.actorRole);
  }

  if (!canRoleTransition(params.actorRole, from, to)) {
    const message = `Role ${params.actorRole} cannot transition from ${from} to ${to}`;
    console.warn(`[lifecycle] ${message}${params.reason ? ` (${params.reason})` : ""}`);
    throw new LifecycleTransitionError(message, from, to, params.actorRole);
  }

  return to;
}

export function getNextStatusForEvent(event: LifecycleEvent, current?: LifecycleStatusInput): SubmissionLifecycleStatus | null {
  const target = EVENT_TARGETS[event];
  if (!target) return null;
  if (!current) return target;
  const from = resolveStatus(current);
  if (!from) return target;
  return canTransition(from, target) ? target : null;
}

export function toDbLifecycleStatus(input: LifecycleStatusInput): SubmissionLifecycleStatus {
  return resolveStatusOrThrow(input);
}

export function fromDbLifecycleStatus(input: string): SubmissionLifecycleStatus {
  return resolveStatus(input) ?? DEFAULT_BUILD_STATUS;
}



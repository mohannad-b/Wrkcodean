export type BuildStatus =
  | "IntakeInProgress"
  | "NeedsPricing"
  | "AwaitingClientApproval"
  | "ReadyForBuild"
  | "BuildInProgress"
  | "QATesting"
  | "Live";

export const BUILD_STATUS_LABELS: Record<BuildStatus, string> = {
  IntakeInProgress: "Intake in Progress",
  NeedsPricing: "Needs Pricing",
  AwaitingClientApproval: "Awaiting client approval",
  ReadyForBuild: "Ready for build",
  BuildInProgress: "Build in progress",
  QATesting: "QA & Testing",
  Live: "Live",
};

export const BUILD_STATUS_ORDER: BuildStatus[] = [
  "IntakeInProgress",
  "NeedsPricing",
  "AwaitingClientApproval",
  "ReadyForBuild",
  "BuildInProgress",
  "QATesting",
  "Live",
];

export function canTransitionBuildStatus(from: BuildStatus, to: BuildStatus): boolean {
  if (from === to) {
    return true;
  }
  const fromIndex = BUILD_STATUS_ORDER.indexOf(from);
  const toIndex = BUILD_STATUS_ORDER.indexOf(to);
  if (fromIndex === -1 || toIndex === -1) {
    return false;
  }
  return toIndex >= fromIndex;
}

export function getBuildStatusLabel(status: BuildStatus): string {
  return BUILD_STATUS_LABELS[status];
}

export const DEFAULT_BUILD_STATUS: BuildStatus = "IntakeInProgress";


import type { DashboardAutomation } from "@/lib/mock-dashboard";
import type { AutomationLifecycleStatus } from "@/lib/automations/status";

export type ApiAutomationSummary = {
  id: string;
  name: string;
  description: string | null;
  updatedAt: string | null;
  creator: {
    id: string;
    name: string | null;
    email: string;
    avatarUrl: string | null;
  } | null;
  latestVersion: {
    id: string;
    versionLabel: string;
    status: string;
    updatedAt: string | null;
    latestQuote: {
      id: string;
      status: string;
      setupFee: string | null;
      unitPrice: string | null;
      updatedAt: string | null;
    } | null;
    latestMetrics?: {
      totalExecutions?: number;
      successRate?: number;
      spendUsd?: number;
    } | null;
  } | null;
};

export function toDashboardAutomation(api: ApiAutomationSummary): DashboardAutomation {
  const version = api.latestVersion;
  const statusEnum = version?.status as AutomationLifecycleStatus | undefined;
  const status = statusEnum ? mapStatusForCards(statusEnum) : "Intake in Progress";
  const metrics = version?.latestMetrics;
  return {
    id: api.id,
    name: api.name,
    description: api.description,
    version: version?.versionLabel ?? "v1.0",
    status,
    statusEnum: statusEnum || "IntakeInProgress", // Store original enum for filtering
    runs: metrics?.totalExecutions ?? 0,
    success: metrics?.successRate ?? 0,
    spend: metrics?.spendUsd ? Number(metrics.spendUsd) : 0,
    trend: undefined,
    needsApproval: status === "Awaiting Client Approval",
    progress: status === "Build in Progress" ? 50 : undefined,
  };
}

export function summarizeCounts(automations: DashboardAutomation[]) {
  const total = automations.length;
  const live = automations.filter((a) => a.status === "Live").length;
  const building = automations.filter((a) => a.status === "Build in Progress").length;
  return { total, live, building };
}

function mapStatusForCards(status: AutomationLifecycleStatus): DashboardAutomation["status"] {
  switch (status) {
    case "IntakeInProgress":
      return "Intake in Progress";
    case "NeedsPricing":
      return "Needs Pricing";
    case "AwaitingClientApproval":
      return "Awaiting Client Approval";
    case "ReadyForBuild":
      return "Ready for Build";
    case "BuildInProgress":
      return "Build in Progress";
    case "QATesting":
      return "QA & Testing";
    case "Live":
      return "Live";
    case "Archived":
      return "Archived";
    default:
      return "Intake in Progress";
  }
}


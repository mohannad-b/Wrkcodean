import type { AutomationLifecycleStatus } from "@/lib/automations/status";
import type { AutomationTask } from "@/lib/automations/tasks";
import type { Workflow } from "@/features/workflows/domain";
import type { VersionMetric } from "@/lib/metrics/kpi";

export type QuoteSummary = {
  id: string;
  status: string;
  setupFee: string | null;
  unitPrice: string | null;
  estimatedVolume: number | null;
  updatedAt: string;
};

export type SanitizationSummaryPayload = {
  removedDuplicateEdges: number;
  reparentedBranches: number;
  removedCycles: number;
  trimmedConnections: number;
  attachedOrphans: number;
  injectedElseBranches?: number;
};

export type VersionTask = AutomationTask & {
  metadata?: {
    systemType?: string;
    relatedSteps?: string[];
    isBlocker?: boolean;
    requirementsText?: string;
    notes?: string;
    documents?: string[];
    assigneeEmail?: string;
  } | null;
};

export type BuildActivity = {
  runId: string;
  phase: string;
  rawPhase?: string | null;
  lastSeq?: number | null;
  lastLine: string | null;
  isRunning: boolean;
  completedAt?: number | null;
  errorMessage?: string | null;
};

export type AutomationVersion = {
  id: string;
  versionLabel: string;
  status: AutomationLifecycleStatus;
  intakeNotes: string | null;
  requirementsText: string | null;
  workflowJson: Workflow | null;
  summary: string | null;
  businessOwner?: string | null;
  tags?: string[];
  latestQuote: QuoteSummary | null;
  latestMetrics?: VersionMetric | null;
  createdAt: string;
  updatedAt: string;
  tasks?: VersionTask[];
};

export type AutomationDetail = {
  id: string;
  name: string;
  description: string | null;
  createdAt?: string;
  updatedAt?: string;
  versions: AutomationVersion[];
};

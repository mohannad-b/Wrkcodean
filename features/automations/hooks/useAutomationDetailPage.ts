"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import type { Connection, Edge, EdgeChange, Node, NodeChange } from "reactflow";
import { useRouter, useSearchParams } from "next/navigation";
import { logger } from "@/lib/logger";
import { useToast } from "@/components/ui/use-toast";
import { CheckSquare, DollarSign, Edit3, FileText, History, MessageSquare, Play } from "lucide-react";
import { AUTOMATION_TABS, type AutomationTab } from "@/lib/automations/tabs";
import {
  addConnection,
  createEmptyWorkflowSpec,
  generateStepNumbers,
  getWorkflowCompletionState,
  isWorkflowEffectivelyEmpty,
  reconnectEdge,
  removeConnection,
  WORKFLOW_SECTION_TITLES,
  workflowToEdges,
  workflowToNodes,
  type Workflow,
  type WorkflowStep,
} from "@/features/workflows/domain";
import { applyWorkflowUpdates, type WorkflowUpdates as CopilotWorkflowUpdates } from "@/lib/workflows/ai-updates";
import type { CopilotMessage } from "@/features/copilot/types";
import type { CopilotAnalysisState, ReadinessSignals } from "@/features/copilot/domain";
import type { VersionOption } from "@/components/ui/VersionSelector";
import type { ActivityEntry } from "@/features/automations/ui/detail-page/panels/OverviewPanel";
import {
  deleteAutomationVersion,
  estimateAutomationActions,
  fetchAutomationDetail,
  fetchAutomationVersionActivity,
  fetchAutomationVersionAnalysis,
  fetchAutomationVersionMetrics,
  generateAutomationTags,
  optimizeAutomationVersion,
  postAutomationVersionMessage,
  priceAutomationQuote,
  updateAutomationMetrics,
  updateAutomationStatus,
  updateAutomationVersion,
  updateTask,
} from "@/features/automations/services/automationApi";
import { sendDevAgentLog } from "@/lib/dev/agent-log";
import { buildKpiStats, type MetricConfig, type VersionMetric } from "@/lib/metrics/kpi";
import { ACTIVE_LIFECYCLE_ORDER, resolveStatus } from "@/lib/submissions/lifecycle";
import { getAttentionTasks } from "@/lib/automations/tasks";
import { createVersionWithRedirect } from "@/app/(app)/(studio)/automations/[automationId]/create-version";
import { fetchWorkflowMessages } from "@/features/workflows/services/workflowChatApi";
import type { AutomationDetail, AutomationVersion, BuildActivity, VersionTask } from "@/features/automations/ui/detail-page/types";

const READINESS_PROCEED_THRESHOLD = 85;

type ActivityApiItem = {
  id: string;
  action: string;
  displayText: string;
  category: string;
  user: string;
  userAvatarUrl?: string | null;
  userFirstName?: string | null;
  userLastName?: string | null;
  timestamp: string;
};

type SanitizationSummaryPayload = {
  removedDuplicateEdges: number;
  reparentedBranches: number;
  removedCycles: number;
  trimmedConnections: number;
  attachedOrphans: number;
};

const RECENT_ACTIVITY_ICON_MAP: Record<string, { icon: React.ComponentType<{ size?: number | string }>; bg: string; color: string }> = {
  workflow: { icon: FileText, bg: "bg-pink-50", color: "text-pink-600" },
  quote: { icon: DollarSign, bg: "bg-amber-50", color: "text-amber-600" },
  task: { icon: CheckSquare, bg: "bg-blue-50", color: "text-blue-600" },
  build: { icon: Play, bg: "bg-emerald-50", color: "text-emerald-600" },
  message: { icon: MessageSquare, bg: "bg-gray-50", color: "text-gray-600" },
  version: { icon: History, bg: "bg-purple-50", color: "text-purple-600" },
  other: { icon: Edit3, bg: "bg-gray-50", color: "text-gray-500" },
};

const formatDateTime = (value?: string | null) => {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  } catch {
    return value;
  }
};

function formatSanitizationSummary(summary?: SanitizationSummaryPayload | null): string {
  if (!summary) {
    return "Workflow updated.";
  }
  const parts: string[] = [];
  if (summary.reparentedBranches) {
    parts.push(`${summary.reparentedBranches} branch${summary.reparentedBranches === 1 ? "" : "es"} relinked`);
  }
  if (summary.removedCycles) {
    parts.push(`${summary.removedCycles} cycle${summary.removedCycles === 1 ? "" : "s"} removed`);
  }
  if (summary.trimmedConnections) {
    parts.push(`${summary.trimmedConnections} extra connection${summary.trimmedConnections === 1 ? "" : "s"} trimmed`);
  }
  if (summary.attachedOrphans) {
    parts.push(`${summary.attachedOrphans} orphan step${summary.attachedOrphans === 1 ? "" : "s"} attached`);
  }
  if (parts.length === 0 && summary.removedDuplicateEdges) {
    parts.push(`${summary.removedDuplicateEdges} duplicate edge${summary.removedDuplicateEdges === 1 ? "" : "s"} removed`);
  }
  return parts.length > 0 ? `Workflow updated (${parts.join(", ")}).` : "Workflow updated.";
}

function summarizeRequirementsDiff(previous: string, next: string): string {
  const prev = previous?.trim() ?? "";
  const curr = next?.trim() ?? "";
  if (!prev && curr) {
    return "New requirements added.";
  }
  if (prev && !curr) {
    return "Requirements cleared.";
  }
  if (prev === curr) {
    return "No textual changes.";
  }
  const added = curr.length - prev.length;
  const diffHint =
    added > 0 ? `Approximately ${added} more characters.` : `Approximately ${Math.abs(added)} fewer characters.`;
  const sample = curr.slice(0, 200).replace(/\s+/g, " ").trim();
  return `Requirements updated. ${diffHint} Sample: "${sample}${curr.length > 200 ? "…" : ""}"`;
}

function mapActivityToEntry(activity: ActivityApiItem): ActivityEntry {
  const category = activity.category ?? "other";
  const iconConfig = RECENT_ACTIVITY_ICON_MAP[category] ?? RECENT_ACTIVITY_ICON_MAP.other;
  const parsedTime = activity.timestamp ? new Date(activity.timestamp) : new Date();

  return {
    title: activity.displayText || activity.action || "Activity update",
    user: activity.user || "Unknown",
    time: formatDistanceToNow(parsedTime, { addSuffix: true }),
    description: activity.action?.replace(/\./g, " ") ?? "",
    icon: iconConfig.icon,
    iconBg: iconConfig.bg,
    iconColor: iconConfig.color,
  };
}

const cloneWorkflow = (workflow: Workflow | null) => (workflow ? (JSON.parse(JSON.stringify(workflow)) as Workflow) : null);

const isAtOrBeyondBuild = (status: AutomationVersion["status"] | null, target: (typeof ACTIVE_LIFECYCLE_ORDER)[number]): boolean => {
  const resolved = resolveStatus(status ?? "");
  if (!resolved || resolved === "Archived") {
    return false;
  }
  const targetIndex = ACTIVE_LIFECYCLE_ORDER.indexOf(target);
  const statusIndex = ACTIVE_LIFECYCLE_ORDER.indexOf(resolved as (typeof ACTIVE_LIFECYCLE_ORDER)[number]);
  return statusIndex !== -1 && targetIndex !== -1 && statusIndex >= targetIndex;
};

interface UseAutomationDetailPageOptions {
  automationId: string;
}

export function useAutomationDetailPage({ automationId }: UseAutomationDetailPageOptions) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const urlTab = searchParams?.get("tab") ?? null;
  const normalizeTabFromUrl = useCallback((value: string | null): AutomationTab => {
    if (!value) return "Overview";
    const lower = value.toLowerCase();
    if (lower === "blueprint") return "Workflow";
    const match = AUTOMATION_TABS.find((tab) => tab.toLowerCase() === lower);
    return (match ?? "Overview") as AutomationTab;
  }, []);

  const initialTab = useMemo(() => normalizeTabFromUrl(urlTab), [normalizeTabFromUrl, urlTab]);
  const [activeTab, setActiveTab] = useState<AutomationTab>(initialTab);

  useEffect(() => {
    if (!urlTab) return;
    const nextTab = normalizeTabFromUrl(urlTab);
    setActiveTab(nextTab);
  }, [normalizeTabFromUrl, urlTab]);

  const [automation, setAutomation] = useState<AutomationDetail | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [versionTasks, setVersionTasks] = useState<VersionTask[]>([]);
  const [tasksLoadState, setTasksLoadState] = useState<"loading" | "ready" | "empty" | "error">("loading");
  const [recentActivityEntries, setRecentActivityEntries] = useState<ActivityEntry[]>([]);
  const [recentActivityLoading, setRecentActivityLoading] = useState(false);
  const [recentActivityError, setRecentActivityError] = useState<string | null>(null);
  const [showProceedCelebration, setShowProceedCelebration] = useState(false);
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [workflowError, setWorkflowError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "dirty" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [isWorkflowDirty, setWorkflowDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creatingVersion, setCreatingVersion] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [versionMetrics, setVersionMetrics] = useState<Record<string, VersionMetric | null>>({});
  const [metricConfigs, setMetricConfigs] = useState<Record<string, MetricConfig>>({});
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [showManualTimeModal, setShowManualTimeModal] = useState(false);
  const [showHourlyRateModal, setShowHourlyRateModal] = useState(false);
  const [metricForm, setMetricForm] = useState({ manualMinutes: "", hourlyRate: "" });
  const [archivingVersionId, setArchivingVersionId] = useState<string | null>(null);
  const [deletingVersionId, setDeletingVersionId] = useState<string | null>(null);
  const [savingMetricConfig, setSavingMetricConfig] = useState(false);
  const [copilotAnalysis, setCopilotAnalysis] = useState<CopilotAnalysisState | null>(null);
  const [copilotAnalysisLoading, setCopilotAnalysisLoading] = useState(false);
  const [requirementsText, setRequirementsText] = useState("");
  const [savingRequirements, setSavingRequirements] = useState(false);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const previousRequirementsRef = useRef<string>("");
  const [injectedChatMessage, setInjectedChatMessage] = useState<CopilotMessage | null>(null);
  const [selectedTask, setSelectedTask] = useState<VersionTask | null>(null);
  const [savingTask, setSavingTask] = useState(false);
  const seedInjectedRef = useRef(false);
  const [copilotAnalysisError, setCopilotAnalysisError] = useState(false);
  const [canvasViewMode, setCanvasViewMode] = useState<"requirements" | "flowchart" | "tasks">("flowchart");
  const [hasSelectedStep, setHasSelectedStep] = useState(false);
  const [showStepHelper, setShowStepHelper] = useState(false);
  const [proceedingToBuild, setProceedingToBuild] = useState(false);
  const [isSynthesizingWorkflow, setIsSynthesizingWorkflow] = useState(false);
  const [isOptimizingFlow, setIsOptimizingFlow] = useState(false);
  const [canvasActivityFeed, setCanvasActivityFeed] = useState<
    Array<{ id: string; text: string; seq: number | null; signature: string; ts: number }>
  >([]);
  const canvasFeedRunIdRef = useRef<string | null>(null);
  const canvasRemovalTimeoutRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const canvasRemovalIntervalRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
  const canvasDoneAddedRef = useRef<Set<string>>(new Set());
  const [buildActivity, setBuildActivity] = useState<BuildActivity | null>(null);
  const [isSwitchingVersion, setIsSwitchingVersion] = useState(false);
  const [liveReadiness, setLiveReadiness] = useState<{
    readinessScore?: number;
    proceedReady?: boolean;
    proceedReason?: string | null;
    proceedBasicsMet?: boolean;
    proceedThresholdMet?: boolean;
    signals?: ReadinessSignals;
  } | null>(null);
  const completionRef = useRef<ReturnType<typeof getWorkflowCompletionState> | null>(null);
  const preserveSelectionRef = useRef(false);
  const synthesisTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activityItems, setActivityItems] = useState<ActivityApiItem[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [activityNoteError, setActivityNoteError] = useState<string | null>(null);
  const [activityNoteSaving, setActivityNoteSaving] = useState(false);
  const [activityRefreshToken, setActivityRefreshToken] = useState(0);
  const [chatAccessChecking, setChatAccessChecking] = useState(false);
  const [chatHasAccess, setChatHasAccess] = useState<boolean | null>(null);

  const selectedVersion = useMemo(() => {
    if (!automation || !selectedVersionId) {
      return automation?.versions[0] ?? null;
    }
    return automation.versions.find((version) => version.id === selectedVersionId) ?? automation.versions[0] ?? null;
  }, [automation, selectedVersionId]);

  const seededPrompt = useMemo(() => {
    const raw = searchParams?.get("seed") ?? null;
    if (!raw) return { value: null as string | null, tooLong: false, decodeError: false };
    try {
      const decoded = decodeURIComponent(raw);
      if (decoded.length > 4000) {
        return { value: null, tooLong: true, decodeError: false };
      }
      return { value: decoded, tooLong: false, decodeError: false };
    } catch (error) {
      logger.warn("[AUTOMATION-DETAIL] Failed to decode seed param", { error });
      return { value: null, tooLong: false, decodeError: true };
    }
  }, [searchParams]);

  useEffect(() => {
    seedInjectedRef.current = false;
  }, [selectedVersionId]);

  useEffect(() => {
    const { value: seedValue, tooLong, decodeError } = seededPrompt;
    const clearSeedParam = () => {
      try {
        const nextUrl = new URL(window.location.href);
        nextUrl.searchParams.delete("seed");
        router.replace(`${nextUrl.pathname}${nextUrl.search}`);
      } catch {
        // no-op if URL parsing fails
      }
    };
    if (decodeError) {
      toast({
        title: "Could not read seed",
        description: "The seed query param could not be decoded.",
        variant: "error",
      });
      clearSeedParam();
      return;
    }
    if (tooLong) {
      toast({
        title: "Seed too long",
        description: "We skipped a seed because it exceeded 4000 characters.",
        variant: "warning",
      });
      clearSeedParam();
      return;
    }
    if (!seedValue || seedInjectedRef.current) {
      return;
    }

    const message: CopilotMessage = {
      id: `seed-${Date.now()}`,
      role: "user",
      content: seedValue,
      createdAt: new Date().toISOString(),
    };

    seedInjectedRef.current = true;
    setInjectedChatMessage(message);

    requestAnimationFrame(() => {
      try {
        const nextUrl = new URL(window.location.href);
        nextUrl.searchParams.delete("seed");
        const tabParam = nextUrl.searchParams.get("tab");
        if (tabParam && tabParam.toLowerCase() === "blueprint") {
          nextUrl.searchParams.set("tab", "Workflow");
        }
        router.replace(`${nextUrl.pathname}${nextUrl.search}`);
      } catch {
        // no-op if URL parsing fails
      }
    });
  }, [router, seededPrompt, toast]);

  const clearCanvasRemovalTimers = useCallback((runId: string | null) => {
    if (!runId) return;
    const timeout = canvasRemovalTimeoutRef.current.get(runId);
    if (timeout) {
      clearTimeout(timeout);
      canvasRemovalTimeoutRef.current.delete(runId);
    }
    const interval = canvasRemovalIntervalRef.current.get(runId);
    if (interval) {
      clearInterval(interval);
      canvasRemovalIntervalRef.current.delete(runId);
    }
  }, []);

  const scheduleCanvasFadeOut = useCallback((runId: string) => {
    if (canvasRemovalTimeoutRef.current.has(runId) || canvasRemovalIntervalRef.current.has(runId)) {
      return;
    }
    const timeoutId = setTimeout(() => {
      const intervalId = setInterval(() => {
        setCanvasActivityFeed((prev) => {
          if (!prev.length) {
            clearInterval(intervalId);
            canvasRemovalIntervalRef.current.delete(runId);
            return prev;
          }
          const next = prev.slice(1);
          if (next.length === 0) {
            clearInterval(intervalId);
            canvasRemovalIntervalRef.current.delete(runId);
          }
          return next;
        });
      }, 3000);
      canvasRemovalIntervalRef.current.set(runId, intervalId);
    }, 7000);
    canvasRemovalTimeoutRef.current.set(runId, timeoutId);
  }, []);

  const handleBuildActivityUpdate = useCallback(
    (activity: BuildActivity | null) => {
      // Clone to force a new reference so React always re-renders on updates
      setBuildActivity(activity ? { ...activity } : null);
      setCanvasActivityFeed((prev) => {
        const nextRunId = activity?.runId ?? null;
        if (!nextRunId) return prev;

        const lineText = (activity?.lastLine ?? "").trim();
        const hasText = lineText.length > 0;

        const nextSeq = activity?.lastSeq ?? null;
        const signature =
          nextSeq !== null && nextSeq !== undefined
            ? `${nextRunId}|seq:${nextSeq}`
            : `${nextRunId}|msg:${lineText}`;

        let base = prev;
        const runChanged = canvasFeedRunIdRef.current && canvasFeedRunIdRef.current !== nextRunId;
        if (runChanged) {
          base = [];
          clearCanvasRemovalTimers(canvasFeedRunIdRef.current);
          canvasDoneAddedRef.current.delete(canvasFeedRunIdRef.current!);
        }
        canvasFeedRunIdRef.current = nextRunId;

        if (!hasText) return base;
        if (base.some((item) => item.signature === signature)) return base;

        const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const appended = [...base, { id, text: lineText, seq: nextSeq, signature, ts: Date.now() }];
        return appended;
      });

      const runId = activity?.runId ?? null;
      const phase = (activity?.phase ?? "").toLowerCase();
      const isDonePhase = phase === "done";

      if (runId && isDonePhase && !canvasDoneAddedRef.current.has(runId)) {
        const doneSignature = `${runId}|done`;
        setCanvasActivityFeed((prev) => {
          if (prev.some((item) => item.signature === doneSignature)) return prev;
          const next = [
            ...prev,
            { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, text: "Done!", seq: null, signature: doneSignature, ts: Date.now() },
          ];
          canvasDoneAddedRef.current.add(runId);
          return next;
        });
        scheduleCanvasFadeOut(runId);
      }
    },
    [clearCanvasRemovalTimers, scheduleCanvasFadeOut]
  );

  const handleReadinessUpdate = useCallback(
    (payload: {
      readinessScore?: number;
      proceedReady?: boolean;
      proceedReason?: string | null;
      proceedBasicsMet?: boolean;
      proceedThresholdMet?: boolean;
      signals?: ReadinessSignals;
    }) => {
      setLiveReadiness((prev) => ({ ...(prev ?? {}), ...payload }));
    },
    []
  );

  const handleRequirementsUpdate = useCallback((text: string) => {
    setRequirementsText(text);
    previousRequirementsRef.current = text;
  }, []);

  const confirmDiscardWorkflowChanges = useCallback(() => {
    if (!isWorkflowDirty) {
      return true;
    }
    return window.confirm("You have unsaved workflow changes. Discard them?");
  }, [isWorkflowDirty]);

  useEffect(() => {
    if (!isWorkflowDirty) {
      return undefined;
    }
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isWorkflowDirty]);

  const fetchAutomation = useCallback(
    async (options?: { preserveSelection?: boolean }) => {
      const shouldPreserveSelection = Boolean(options?.preserveSelection);
      preserveSelectionRef.current = shouldPreserveSelection;
      setLoading(true);
      setError(null);
      setTasksLoadState("loading");
      try {
        const response = await fetchAutomationDetail(automationId);
        if (!response.ok) {
          throw new Error("Unable to load automation");
        }

        const data = (await response.json()) as { automation: AutomationDetail };
        setAutomation(data.automation);
        const metricMap: Record<string, VersionMetric | null> = {};
        data.automation.versions.forEach((v) => {
          const metric = (v as any).latestMetrics ?? null;
          metricMap[v.id] = metric
            ? {
                ...metric,
                totalExecutions: Number(metric.totalExecutions ?? 0),
                successRate: Number(metric.successRate ?? 0),
                successCount: Number(metric.successCount ?? 0),
                failureCount: Number(metric.failureCount ?? 0),
                spendUsd: Number(metric.spendUsd ?? 0),
                hoursSaved: Number(metric.hoursSaved ?? 0),
                estimatedCostSavings: Number(metric.estimatedCostSavings ?? 0),
                hoursSavedDeltaPct: metric.hoursSavedDeltaPct !== null ? Number(metric.hoursSavedDeltaPct) : null,
                estimatedCostSavingsDeltaPct:
                  metric.estimatedCostSavingsDeltaPct !== null ? Number(metric.estimatedCostSavingsDeltaPct) : null,
                executionsDeltaPct: metric.executionsDeltaPct !== null ? Number(metric.executionsDeltaPct) : null,
                successRateDeltaPct: metric.successRateDeltaPct !== null ? Number(metric.successRateDeltaPct) : null,
                spendDeltaPct: metric.spendDeltaPct !== null ? Number(metric.spendDeltaPct) : null,
              }
            : null;
        });
        setVersionMetrics(metricMap);

        const nextSelected = selectedVersionId ?? data.automation.versions[0]?.id ?? null;
        setSelectedVersionId(nextSelected);
        const version = data.automation.versions.find((v) => v.id === nextSelected);
        setNotes(version?.intakeNotes ?? "");
        sendDevAgentLog({
          location: "page.tsx:398",
          message: "Workflow loaded from API",
          data: {
            versionId: version?.id,
            hasWorkflowJson: !!version?.workflowJson,
            stepCount: version?.workflowJson?.steps?.length ?? 0,
            steps:
              version?.workflowJson?.steps?.map((s) => ({
                id: s.id,
                name: s.name,
                stepNumber: s.stepNumber,
                parentStepId: s.parentStepId,
                nextStepIds: s.nextStepIds,
              })) ?? [],
          },
          timestamp: Date.now(),
          sessionId: "debug-session",
          runId: "run2",
          hypothesisId: "F",
        });
        const workflow = version?.workflowJson ? cloneWorkflow(version.workflowJson) : createEmptyWorkflowSpec();
        sendDevAgentLog({
          location: "page.tsx:400",
          message: "Workflow after clone",
          data: {
            stepCount: workflow?.steps?.length ?? 0,
            steps:
              workflow?.steps?.map((s) => ({
                id: s.id,
                name: s.name,
                stepNumber: s.stepNumber,
              })) ?? [],
          },
          timestamp: Date.now(),
          sessionId: "debug-session",
          runId: "run2",
          hypothesisId: "F",
        });
        setWorkflow(workflow);
        setWorkflowError(null);
        setWorkflowDirty(false);
        setLastSavedAt(version?.updatedAt ? new Date(version.updatedAt) : null);
        setSaveState("idle");
        setSaveError(null);
        if (!shouldPreserveSelection) {
          setSelectedStepId(null);
          setHasSelectedStep(false);
          setShowStepHelper(false);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unexpected error");
        setTasksLoadState("error");
      } finally {
        setLoading(false);
      }
    },
    [automationId, selectedVersionId]
  );

  const fetchVersionMetrics = useCallback(async (versionId: string | null) => {
    if (!versionId) return;
    setMetricsLoading(true);
    setMetricsError(null);
    try {
      const response = await fetchAutomationVersionMetrics(versionId);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "Unable to load metrics");
      }
      const data = await response.json();
      const normalizedConfig = data.config
        ? {
            ...data.config,
            manualSecondsPerExecution: Number(data.config.manualSecondsPerExecution ?? 0),
            hourlyRateUsd: Number(data.config.hourlyRateUsd ?? 0),
          }
        : null;
      setMetricConfigs((prev) => ({
        ...prev,
        ...(normalizedConfig ? { [versionId]: normalizedConfig } : {}),
      }));
      setVersionMetrics((prev) => ({
        ...prev,
        [versionId]: data.latestMetric ?? prev[versionId] ?? null,
      }));
    } catch (err) {
      setMetricsError(err instanceof Error ? err.message : "Unable to load metrics");
    } finally {
      setMetricsLoading(false);
    }
  }, []);

  const fetchRecentActivity = useCallback(async (versionId: string | null) => {
    if (!versionId) {
      setRecentActivityEntries([]);
      return;
    }

    setRecentActivityLoading(true);
    setRecentActivityError(null);
    try {
      const response = await fetchAutomationVersionActivity(versionId, 3);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to load activity");
      }
      const data = await response.json();
      const activities: ActivityApiItem[] = Array.isArray(data.activities) ? data.activities : [];
      setRecentActivityEntries(activities.slice(0, 3).map(mapActivityToEntry));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to load activity";
      setRecentActivityError(message);
      setRecentActivityEntries([]);
    } finally {
      setRecentActivityLoading(false);
    }
  }, []);

  const fetchActivityLog = useCallback(async (signal: AbortSignal) => {
    if (!selectedVersion?.id) {
      setActivityItems([]);
      setActivityLoading(false);
      return;
    }

    setActivityLoading(true);
    setActivityError(null);
    try {
      const response = await fetchAutomationVersionActivity(selectedVersion.id, 100, {
        signal,
      });
      if (!response.ok) {
        throw new Error("Failed to load activity");
      }
      const data = await response.json();
      if (!signal.aborted) {
        setActivityItems(Array.isArray(data.activities) ? data.activities : []);
      }
    } catch (err) {
      if (!signal.aborted) {
        setActivityError(err instanceof Error ? err.message : "Unable to load activity");
      }
    } finally {
      if (!signal.aborted) {
        setActivityLoading(false);
      }
    }
  }, [selectedVersion?.id]);

  const refreshAnalysis = useCallback(async (versionId?: string | null) => {
    if (!versionId) {
      setCopilotAnalysis(null);
      setCopilotAnalysisError(false);
      return;
    }
    setCopilotAnalysisLoading(true);
    setCopilotAnalysisError(false);
    try {
      const res = await fetchAutomationVersionAnalysis(versionId);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to load copilot analysis");
      }
      const json = await res.json();
      setCopilotAnalysis(json.analysis ?? null);
    } catch (err) {
      logger.error("[STUDIO] Failed to load copilot analysis", err);
      setCopilotAnalysisError(true);
    } finally {
      setCopilotAnalysisLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAutomation();
  }, [fetchAutomation]);

  useEffect(() => {
    if (activeTab !== "Overview") return;
    void fetchRecentActivity(selectedVersionId);
  }, [activeTab, fetchRecentActivity, selectedVersionId]);

  useEffect(() => {
    if (activeTab !== "Overview") return;
    void fetchVersionMetrics(selectedVersionId);
  }, [activeTab, fetchVersionMetrics, selectedVersionId]);

  useEffect(() => {
    if (activeTab !== "Workflow") return;
    void refreshAnalysis(selectedVersion?.id ?? null);
  }, [activeTab, refreshAnalysis, selectedVersion?.id]);

  useEffect(() => {
    if (activeTab !== "Activity") return;
    const controller = new AbortController();
    void fetchActivityLog(controller.signal);
    return () => controller.abort();
  }, [activeTab, fetchActivityLog, activityRefreshToken]);

  useEffect(() => {
    if (activeTab !== "Chat" || !selectedVersion?.id) return;
    let cancelled = false;
    const checkAccess = async () => {
      try {
        setChatAccessChecking(true);
        const response = await fetchWorkflowMessages(selectedVersion.id, { limit: 1 });
        if (!cancelled) {
          if (response.status === 403) {
            setChatHasAccess(false);
          } else if (response.ok) {
            setChatHasAccess(true);
          } else {
            setChatHasAccess(false);
          }
        }
      } catch (err) {
        if (!cancelled) {
          logger.error("Failed to check chat access:", err);
          setChatHasAccess(false);
        }
      } finally {
        if (!cancelled) {
          setChatAccessChecking(false);
        }
      }
    };
    checkAccess();
    return () => {
      cancelled = true;
    };
  }, [activeTab, selectedVersion?.id]);

  useEffect(() => {
    if (isSwitchingVersion && !metricsLoading && !recentActivityLoading) {
      setIsSwitchingVersion(false);
    }
  }, [isSwitchingVersion, metricsLoading, recentActivityLoading]);

  useEffect(() => {
    if (selectedVersion) {
      setNotes(selectedVersion.intakeNotes ?? "");
      sendDevAgentLog({
        location: "page.tsx:510",
        message: "Selected version workflowJson",
        data: {
          versionId: selectedVersion.id,
          hasWorkflowJson: !!selectedVersion.workflowJson,
          stepCount: selectedVersion.workflowJson?.steps?.length ?? 0,
          steps:
            selectedVersion.workflowJson?.steps?.map((s) => ({
              id: s.id,
              name: s.name,
              stepNumber: s.stepNumber,
              parentStepId: s.parentStepId,
              nextStepIds: s.nextStepIds,
            })) ?? [],
        },
        timestamp: Date.now(),
        sessionId: "debug-session",
        runId: "run2",
        hypothesisId: "F",
      });
      const nextWorkflow = selectedVersion.workflowJson ? cloneWorkflow(selectedVersion.workflowJson) : createEmptyWorkflowSpec();
      const safeWorkflow = nextWorkflow ?? createEmptyWorkflowSpec();
      sendDevAgentLog({
        location: "page.tsx:514",
        message: "Workflow after clone in useEffect",
        data: {
          stepCount: safeWorkflow?.steps?.length ?? 0,
          steps:
            safeWorkflow?.steps?.map((s) => ({
              id: s.id,
              name: s.name,
              stepNumber: s.stepNumber,
            })) ?? [],
        },
        timestamp: Date.now(),
        sessionId: "debug-session",
        runId: "run2",
        hypothesisId: "F",
      });
      setWorkflow(safeWorkflow);
      setWorkflowError(null);
      setWorkflowDirty(false);

      const shouldPreserveSelection = preserveSelectionRef.current;
      if (shouldPreserveSelection) {
        preserveSelectionRef.current = false;
        if (selectedStepId) {
          const exists = safeWorkflow.steps.some((step) => step.id === selectedStepId);
          if (!exists) {
            setSelectedStepId(null);
            setHasSelectedStep(false);
            setShowStepHelper(false);
          }
        }
      } else {
        setSelectedStepId(null);
        setHasSelectedStep(false);
        setShowStepHelper(false);
      }
    }
  }, [selectedVersion?.id, selectedVersion?.workflowJson?.updatedAt]);

  useEffect(() => {
    if (!selectedVersion) {
      setVersionTasks([]);
      setTasksLoadState(loading ? "loading" : "empty");
      return;
    }

    const nextTasks = selectedVersion.tasks ?? [];
    setVersionTasks(nextTasks);
    setTasksLoadState(nextTasks.length === 0 ? "empty" : "ready");
    setRequirementsText(selectedVersion.requirementsText ?? "");
    previousRequirementsRef.current = selectedVersion.requirementsText ?? "";
  }, [automation?.id, loading, selectedVersion]);

  const taskGroups = useMemo(() => {
    const groups: Record<"blocker" | "important" | "optional", VersionTask[]> = {
      blocker: [],
      important: [],
      optional: [],
    };
    versionTasks.forEach((task) => {
      const priority = task.priority ?? "important";
      groups[priority].push(task);
    });
    return groups;
  }, [versionTasks]);

  const attentionTasks = useMemo(() => getAttentionTasks(versionTasks), [versionTasks]);

  const blockersRemaining = useMemo(
    () => taskGroups.blocker.filter((task) => task.status !== "complete").length,
    [taskGroups.blocker]
  );

  const handleVersionChange = (versionId: string) => {
    if (!confirmDiscardWorkflowChanges()) {
      return;
    }
    setIsSwitchingVersion(true);
    setSelectedVersionId(versionId);
    const version = automation?.versions.find((v) => v.id === versionId);
    setNotes(version?.intakeNotes ?? "");
    const nextWorkflow = version?.workflowJson ? cloneWorkflow(version.workflowJson) : createEmptyWorkflowSpec();
    setWorkflow(nextWorkflow ?? createEmptyWorkflowSpec());
    setWorkflowDirty(false);
    setSaveState("idle");
    setSaveError(null);
    setLastSavedAt(version?.updatedAt ? new Date(version.updatedAt) : null);
    setWorkflowError(null);
    setSelectedStepId(null);
    setHasSelectedStep(false);
    setShowStepHelper(false);
  };

  const handleSaveRequirements = async () => {
    if (!selectedVersion) return;
    const previous = previousRequirementsRef.current ?? "";
    const next = requirementsText ?? "";
    const diffSummary = summarizeRequirementsDiff(previous, next);
    setSavingRequirements(true);
    setError(null);
    try {
      const response = await updateAutomationVersion(selectedVersion.id, { requirementsText: requirementsText });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to save requirements");
      }
      await fetchAutomation();
      previousRequirementsRef.current = next;
      setInjectedChatMessage({
        id: `req-change-${Date.now()}`,
        role: "assistant",
        content: `User changes detected in requirements. Summary: ${diffSummary}\n\nUpdating flowchart now…`,
        createdAt: new Date().toISOString(),
        transient: true,
      });
      toast({ title: "Requirements saved", description: "User changes detected, updating flowchart…", variant: "success" });
      await handleOptimizeFlow();
      toast({ title: "Requirements saved", description: "Requirements updated.", variant: "success" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to save requirements";
      setError(message);
      toast({ title: "Unable to save requirements", description: message, variant: "error" });
    } finally {
      setSavingRequirements(false);
    }
  };

  const handleSaveWorkflow = useCallback(
    async (overrides?: Partial<Workflow>, options?: { preserveSelection?: boolean }) => {
      if (!selectedVersion || !workflow) {
        setWorkflowError("Workflow is not available yet.");
        setSaveState("error");
        setSaveError("Workflow is not available yet.");
        return;
      }
      setSaveState("saving");
      setSaveError(null);
      const payload = { ...workflow, ...overrides, updatedAt: new Date().toISOString() };
      const stepCountBeforeSave = workflow.steps.length;
      const stepCountInPayload = payload.steps.length;

      sendDevAgentLog({
        location: "page.tsx:639",
        message: "Frontend workflow save - before request",
        data: {
          versionId: selectedVersion.id,
          stepCountBeforeSave,
          stepCountInPayload,
          stepIds: payload.steps.map((s) => ({ id: s.id, name: s.name, stepNumber: s.stepNumber })),
        },
        timestamp: Date.now(),
        sessionId: "debug-session",
        runId: "save-tracking",
        hypothesisId: "G",
      });

      if (stepCountInPayload < stepCountBeforeSave) {
        logger.warn(`⚠️ Step count decreased before save: ${stepCountBeforeSave} → ${stepCountInPayload}`);
        sendDevAgentLog({
          location: "page.tsx:644",
          message: "⚠️ STEP COUNT DECREASED BEFORE SAVE",
          data: {
            versionId: selectedVersion.id,
            stepCountBeforeSave,
            stepCountInPayload,
            stepsLost: stepCountBeforeSave - stepCountInPayload,
          },
          timestamp: Date.now(),
          sessionId: "debug-session",
          runId: "save-tracking",
          hypothesisId: "G",
        });
      }

      logger.debug("💾 Saving workflow:", {
        versionId: selectedVersion.id,
        stepCount: payload.steps.length,
      });
      setWorkflowError(null);
      try {
        const response = await updateAutomationVersion(selectedVersion.id, { workflowJson: payload });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error ?? "Failed to save workflow");
        }
        const cloned = cloneWorkflow(payload);
        const stepCountAfterSave = cloned?.steps?.length ?? 0;

        sendDevAgentLog({
          location: "page.tsx:655",
          message: "Frontend workflow save - after response",
          data: {
            versionId: selectedVersion.id,
            stepCountBeforeSave,
            stepCountInPayload,
            stepCountAfterSave,
            stepIds: cloned?.steps?.map((s) => ({ id: s.id, name: s.name, stepNumber: s.stepNumber })) ?? [],
          },
          timestamp: Date.now(),
          sessionId: "debug-session",
          runId: "save-tracking",
          hypothesisId: "G",
        });

        if (stepCountAfterSave < stepCountBeforeSave) {
          logger.error(`⚠️ Step count decreased after save: ${stepCountBeforeSave} → ${stepCountAfterSave}`);
          sendDevAgentLog({
            location: "page.tsx:660",
            message: "⚠️ STEP COUNT DECREASED AFTER SAVE",
            data: {
              versionId: selectedVersion.id,
              stepCountBeforeSave,
              stepCountAfterSave,
              stepsLost: stepCountBeforeSave - stepCountAfterSave,
            },
            timestamp: Date.now(),
            sessionId: "debug-session",
            runId: "save-tracking",
            hypothesisId: "G",
          });
          toast({
            title: "Warning: Steps may have been lost",
            description: `Step count changed from ${stepCountBeforeSave} to ${stepCountAfterSave}. Please verify your workflow.`,
            variant: "warning",
          });
        } else {
          toast({ title: "Workflow saved", description: "Metadata updated successfully.", variant: "success" });
        }

        setWorkflow(cloned);
        setWorkflowDirty(false);
        setLastSavedAt(new Date());
        setSaveState("saved");
        setSaveError(null);
        await fetchAutomation({ preserveSelection: options?.preserveSelection });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unable to save workflow";
        setWorkflowError(message);
        setSaveError(message);
        setSaveState("error");
        toast({ title: "Unable to save workflow", description: message, variant: "error" });
      }
    },
    [workflow, fetchAutomation, selectedVersion, toast]
  );

  const refreshAutomationPreservingSelection = useCallback(async () => {
    await fetchAutomation({ preserveSelection: true });
  }, [fetchAutomation]);

  const handleCreateVersion = async (copyFromVersionId?: string | null) => {
    setCreatingVersion(true);
    setError(null);
    try {
      await createVersionWithRedirect({
        automationId,
        copyFromVersionId,
        notes,
        selectedVersion,
        fetchAutomation,
        setSelectedVersionId,
        toast,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to create version";
      setError(message);
      toast({ title: "Unable to create version", description: message, variant: "error" });
    } finally {
      setCreatingVersion(false);
    }
  };

  const handleArchiveVersion = useCallback(
    async (versionId: string) => {
      const version = automation?.versions.find((v) => v.id === versionId);
      if (!version) return;
      const quoteStatus = version.latestQuote?.status ?? null;
      const hasSignedContract = (quoteStatus ?? "").toLowerCase() === "accepted";
      if (version.status === "Live" && hasSignedContract) {
        toast({
          title: "Cannot archive",
          description: "Active version with a signed contract must be cancelled or paused first.",
          variant: "error",
        });
        return;
      }
      if (version.status === "Archived") {
        return;
      }
      setArchivingVersionId(versionId);
      try {
        const response = await updateAutomationStatus(versionId, "Archived");
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error ?? "Unable to archive version");
        }
        toast({ title: "Version archived", description: version.versionLabel ?? version.id, variant: "success" });
        await fetchAutomation({ preserveSelection: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unable to archive version";
        toast({ title: "Archive failed", description: message, variant: "error" });
      } finally {
        setArchivingVersionId(null);
      }
    },
    [automation?.versions, fetchAutomation, toast]
  );

  const handleDeleteVersion = useCallback(
    async (versionId: string) => {
      const version = automation?.versions.find((v) => v.id === versionId);
      if (!version) return;
      if (version.status !== "IntakeInProgress") {
        toast({
          title: "Cannot delete",
          description: "Only draft versions can be deleted.",
          variant: "error",
        });
        return;
      }
      setDeletingVersionId(versionId);
      try {
        const response = await deleteAutomationVersion(versionId);
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error ?? "Unable to delete version");
        }
        toast({ title: "Version deleted", description: version.versionLabel ?? version.id, variant: "success" });
        await fetchAutomation({ preserveSelection: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unable to delete version";
        toast({ title: "Delete failed", description: message, variant: "error" });
      } finally {
        setDeletingVersionId(null);
      }
    },
    [automation?.versions, fetchAutomation, toast]
  );

  const applyWorkflowUpdate = useCallback(
    (updater: (current: Workflow) => Workflow) => {
      let didUpdate = false;
      setWorkflow((current) => {
        if (!current) {
          return current;
        }
        const next = updater(current);
        if (next !== current) {
          didUpdate = true;
          return next;
        }
        return current;
      });
      if (didUpdate) {
        setWorkflowDirty(true);
        setWorkflowError(null);
        setSaveError(null);
        setSaveState("dirty");
      }
    },
    [setWorkflowDirty, setWorkflowError]
  );

  const handleWorkflowAIUpdates = useCallback(
    (updates: CopilotWorkflowUpdates | Workflow | { workflowJson?: Workflow | null; blueprintJson?: Workflow | null }) => {
      setIsSynthesizingWorkflow(true);
      if (synthesisTimeoutRef.current) {
        clearTimeout(synthesisTimeoutRef.current);
      }
      synthesisTimeoutRef.current = setTimeout(() => {
        setIsSynthesizingWorkflow(false);
      }, 1500);
      applyWorkflowUpdate((current) => {
        if (!current) return current;
        const updatesPayload = updates as Workflow & { workflowJson?: Workflow | null; blueprintJson?: Workflow | null };
        const maybeWorkflow =
          updatesPayload?.workflowJson ?? updatesPayload?.blueprintJson ?? (updates as Workflow);
        if (Array.isArray(maybeWorkflow?.steps) && Array.isArray((maybeWorkflow as any)?.sections)) {
          setWorkflow(maybeWorkflow);
          setWorkflowDirty(true);
          setWorkflowError(null);
          return maybeWorkflow;
        }
        return applyWorkflowUpdates(current, updates as CopilotWorkflowUpdates);
      });
    },
    [applyWorkflowUpdate]
  );

  const handleTasksUpdate = useCallback(
    (tasks: VersionTask[]) => {
      setVersionTasks(tasks);
      setTasksLoadState(tasks.length === 0 ? "empty" : "ready");
      setAutomation((prev) => {
        if (!prev) return prev;
        const activeVersionId = selectedVersionId ?? selectedVersion?.id;
        if (!activeVersionId) return prev;
        return {
          ...prev,
          versions: prev.versions.map((version) =>
            version.id === activeVersionId ? { ...version, tasks } : version
          ),
        };
      });
    },
    [selectedVersion?.id, selectedVersionId]
  );

  useEffect(() => {
    return () => {
      if (synthesisTimeoutRef.current) {
        clearTimeout(synthesisTimeoutRef.current);
      }
    };
  }, []);

  const handleStepChange = useCallback(
    (stepId: string, patch: Partial<WorkflowStep>) => {
      applyWorkflowUpdate((current) => ({
        ...current,
        steps: current.steps.map((step) => (step.id === stepId ? { ...step, ...patch } : step)),
      }));
    },
    [applyWorkflowUpdate]
  );

  const handleDeleteStep = useCallback(
    (stepId: string) => {
      applyWorkflowUpdate((current) => ({
        ...current,
        steps: current.steps
          .filter((step) => step.id !== stepId)
          .map((step) => ({
            ...step,
            nextStepIds: step.nextStepIds.filter((id) => id !== stepId),
          })),
      }));
      if (selectedStepId === stepId) {
        setSelectedStepId(null);
        setHasSelectedStep(false);
        setShowStepHelper(true);
      }
    },
    [applyWorkflowUpdate, selectedStepId]
  );

  const handleConnectNodes = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target || connection.source === connection.target) {
        return;
      }
      applyWorkflowUpdate((current) => addConnection(current, connection));
    },
    [applyWorkflowUpdate]
  );

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const positionChanges = changes.filter(
        (change) => change.type === "position" && change.position
      ) as Array<NodeChange & { type: "position"; position: { x: number; y: number } }>;

      if (positionChanges.length > 0) {
        applyWorkflowUpdate((current) => {
          const nodePositions = { ...(current.metadata?.nodePositions ?? {}) };
          positionChanges.forEach((change) => {
            if (change.id && change.position) {
              nodePositions[change.id] = change.position;
            }
          });
          return {
            ...current,
            metadata: {
              ...current.metadata,
              nodePositions,
            },
            updatedAt: new Date().toISOString(),
          };
        });
      }

      const removeChanges = changes.filter((change) => change.type === "remove");
      if (removeChanges.length > 0) {
        applyWorkflowUpdate((current) => {
          const removedIds = new Set(
            removeChanges
              .map((change) => (change.type === "remove" ? change.id : null))
              .filter((id): id is string => id !== null)
          );

          const nodePositions = { ...(current.metadata?.nodePositions ?? {}) };
          removedIds.forEach((id) => {
            delete nodePositions[id];
          });

          return {
            ...current,
            steps: current.steps.filter((step) => !removedIds.has(step.id)),
            metadata: {
              ...current.metadata,
              nodePositions,
            },
            updatedAt: new Date().toISOString(),
          };
        });
      }
    },
    [applyWorkflowUpdate]
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const removeChanges = changes.filter((change) => change.type === "remove");
      if (removeChanges.length === 0) {
        return;
      }
      applyWorkflowUpdate((current) => {
        let updated = current;
        for (const change of removeChanges) {
          updated = removeConnection(updated, change.id);
        }
        return updated;
      });
    },
    [applyWorkflowUpdate]
  );

  const handleEdgeUpdate = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      if (!oldEdge.id || !newConnection.source || !newConnection.target) {
        return;
      }
      applyWorkflowUpdate((current) => reconnectEdge(current, oldEdge.id, newConnection));
    },
    [applyWorkflowUpdate]
  );

  const parseEdgeId = useCallback((edgeId: string) => {
    const match = edgeId.match(/^edge-(.+)-(.+)$/);
    if (!match) return null;
    return { sourceId: match[1], targetId: match[2] };
  }, []);

  const handleNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    setSelectedStepId(node.id);
    setSelectedEdgeId(null);
    setHasSelectedStep(true);
    setShowStepHelper(false);
  }, []);

  const handleEdgeClick = useCallback((_event: React.MouseEvent, edge: Edge) => {
    setSelectedEdgeId(edge.id);
    setSelectedStepId(null);
    setHasSelectedStep(false);
    setShowStepHelper(false);
  }, []);

  const handleOptimizeFlow = useCallback(async () => {
    if (!selectedVersion?.id) {
      toast({ title: "Select a version", description: "Choose a version before optimizing the flow.", variant: "error" });
      return;
    }
    setIsOptimizingFlow(true);
    try {
      const response = await optimizeAutomationVersion(selectedVersion.id, {});
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "Unable to optimize the flow.");
      }
      const payload = await response.json();
      await refreshAutomationPreservingSelection();
      toast({
        title: "Flow optimized",
        description: formatSanitizationSummary(payload?.telemetry?.sanitizationSummary),
        variant: "success",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to optimize the flow.";
      toast({ title: "Unable to optimize", description: message, variant: "error" });
    } finally {
      setIsOptimizingFlow(false);
    }
  }, [refreshAutomationPreservingSelection, selectedVersion?.id, toast]);

  const handleViewTaskStep = useCallback(
    (stepNumber: string) => {
      if (!workflow || !stepNumber) {
        return;
      }
      const normalized = stepNumber.trim();
      const target = workflow.steps.find((stepEntry) => stepEntry.stepNumber === normalized);
      if (!target) {
        return;
      }
      setActiveTab("Workflow");
      setSelectedStepId(target.id);
      setHasSelectedStep(true);
      setShowStepHelper(false);
    },
    [workflow]
  );

  const handleViewTask = useCallback((task: VersionTask) => {
    setSelectedTask(task);
  }, []);

  const handleSaveTask = useCallback(
    async (taskId: string, patch: { status?: VersionTask["status"]; description?: string | null; metadata?: Record<string, unknown> | null }) => {
      setSavingTask(true);
      try {
        const response = await updateTask(taskId, patch);
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error ?? "Failed to update task");
        }
        const data = (await response.json()) as { task: VersionTask };
        setVersionTasks((prev) => prev.map((t) => (t.id === data.task.id ? { ...t, ...data.task } : t)));
        setSelectedTask((prev) => (prev && prev.id === data.task.id ? { ...prev, ...data.task } : prev));
        toast({ title: "Task updated", description: "Task changes saved.", variant: "success" });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unable to update task";
        toast({ title: "Unable to update task", description: message, variant: "error" });
        throw err;
      } finally {
        setSavingTask(false);
      }
    },
    [toast]
  );

  const completion = useMemo(() => getWorkflowCompletionState(workflow), [workflow]);
  const taskLookup = useMemo(() => {
    const map = new Map<string, VersionTask>();
    versionTasks.forEach((task) => map.set(task.id, task));
    return map;
  }, [versionTasks]);

  const workflowSignature = useMemo(() => {
    if (!workflow) return "empty";
    const stepIds = workflow.steps?.map((step) => step.id).join("|") ?? "";
    return `${workflow.status ?? ""}:${stepIds}`;
  }, [workflow]);

  const flowNodes = useMemo<Node[]>(() => {
    sendDevAgentLog({
      location: "page.tsx:1095",
      message: "flowNodes useMemo entry",
      data: {
        hasWorkflow: !!workflow,
        stepCount: workflow?.steps?.length ?? 0,
        workflowStatus: workflow?.status,
        steps:
          workflow?.steps?.map((s) => ({
            id: s.id,
            name: s.name,
            stepNumber: s.stepNumber,
            parentStepId: s.parentStepId,
            nextStepIds: s.nextStepIds,
          })) ?? [],
      },
      timestamp: Date.now(),
      sessionId: "debug-session",
      runId: "run2",
      hypothesisId: "E",
    });
    const nodes = workflowToNodes(workflow, taskLookup);
    sendDevAgentLog({
      location: "page.tsx:1095",
      message: "flowNodes useMemo exit",
      data: {
        nodeCount: nodes.length,
        nodes: nodes.map((n) => ({ id: n.id, position: n.position, title: n.data.title })),
      },
      timestamp: Date.now(),
      sessionId: "debug-session",
      runId: "run2",
      hypothesisId: "E",
    });
    if ((workflow?.steps?.length ?? 0) > 0 && nodes.length === 0) {
      logger.error("[AUTOMATION] Workflow steps present but rendered nodes are zero", {
        stepCount: workflow?.steps?.length ?? 0,
        steps: workflow?.steps,
        edgeCount: workflow ? workflowToEdges(workflow).length : 0,
        nodePositions: nodes.map((node) => ({ id: node.id, position: node.position })),
      });
    }
    return nodes;
  }, [taskLookup, workflowSignature]);

  const canvasState = useMemo<"loading" | "ready" | "empty" | "error">(() => {
    if (loading || isSwitchingVersion) return "loading";
    if (workflowError || error) return "error";
    const stepCount = workflow?.steps?.length ?? 0;
    if (stepCount === 0) return "empty";
    const nodeCount = flowNodes.length;
    if (nodeCount === 0) return "error";
    return "ready";
  }, [loading, isSwitchingVersion, workflowError, error, workflow?.steps?.length, flowNodes.length]);

  const branchLetters = useMemo(() => {
    const map = new Map<string, string>();
    if (!workflow?.steps) return map;
    workflow.steps.forEach((step) => {
      if (!step.nextStepIds || step.nextStepIds.length <= 1) return;
      const sortedTargets = [...step.nextStepIds].sort();
      sortedTargets.forEach((targetId, index) => {
        map.set(`edge-${step.id}-${targetId}`, String.fromCharCode(65 + index));
      });
    });
    return map;
  }, [workflow]);

  const stepDisplayMap = useMemo(() => (workflow ? generateStepNumbers(workflow) : new Map()), [workflow]);

  const handleEdgeDelete = useCallback(
    (edgeId: string) => {
      applyWorkflowUpdate((current) => removeConnection(current, edgeId));
      setSelectedEdgeId((current) => (current === edgeId ? null : current));
    },
    [applyWorkflowUpdate]
  );

  const handleEdgeChange = useCallback(
    (edgeId: string, updates: Partial<Edge>) => {
      const parsed = parseEdgeId(edgeId);
      if (!parsed) return;
      const rawLabel = updates.label;
      const nextLabel = typeof rawLabel === "string" ? rawLabel : undefined;
      const nextCondition = typeof (updates as { condition?: string }).condition === "string"
        ? (updates as { condition?: string }).condition?.trim() || undefined
        : undefined;
      applyWorkflowUpdate((current) => ({
        ...current,
        steps: current.steps.map((step) => {
          if (step.id !== parsed.targetId) {
            return step;
          }
          const resolvedLabel =
            updates.label !== undefined ? (nextLabel?.trim() ? nextLabel : undefined) : step.branchLabel;
          const resolvedCondition =
            (updates as { condition?: string }).condition !== undefined ? (nextCondition ?? undefined) : step.branchCondition;
          return {
            ...step,
            branchLabel: resolvedLabel,
            branchCondition: resolvedCondition,
          };
        }),
      }));
    },
    [applyWorkflowUpdate, parseEdgeId]
  );

  const flowEdges = useMemo<Edge[]>(() => {
    const edges = workflowToEdges(workflow);
    const stepById = new Map(workflow?.steps?.map((step) => [step.id, step]) ?? []);
    return edges.map((edge) => {
      const parsed = parseEdgeId(edge.id);
      const targetStep = parsed ? stepById.get(parsed.targetId) : null;
      const branchLetter = branchLetters.get(edge.id);
      const label = (edge.data as any)?.label || targetStep?.branchLabel || branchLetter || "";
      const conditionText = targetStep?.branchCondition ?? "";
      const hasCondition = Boolean(label || conditionText);
      return {
        ...edge,
        type: hasCondition ? "condition" : edge.type,
        data: {
          ...edge.data,
          label,
          branchLetter,
          conditionText,
          onDelete: handleEdgeDelete,
          onInspect: (edgeId: string) => {
            setSelectedEdgeId(edgeId);
            setSelectedStepId(null);
            setHasSelectedStep(false);
            setShowStepHelper(false);
          },
        },
      };
    });
  }, [workflowSignature, handleEdgeDelete, parseEdgeId, branchLetters]);

  const selectedStep = useMemo(
    () => (workflow ? workflow.steps.find((step) => step.id === selectedStepId) ?? null : null),
    [workflow, selectedStepId]
  );
  const selectedStepDisplayId = selectedStep
    ? stepDisplayMap.get(selectedStep.id)?.stepNumber ?? selectedStep.stepNumber ?? selectedStep.id
    : null;

  const selectedEdge = useMemo(() => {
    if (!selectedEdgeId || !workflow) return null;
    const parsed = parseEdgeId(selectedEdgeId);
    if (!parsed) return null;
    const sourceStep = workflow.steps.find((step) => step.id === parsed.sourceId);
    const targetStep = workflow.steps.find((step) => step.id === parsed.targetId);
    const branchLetter = branchLetters.get(selectedEdgeId);
    return {
      id: selectedEdgeId,
      label: targetStep?.branchLabel || branchLetter,
      branchLetter,
      condition: targetStep?.branchCondition ?? "",
      sourceName: sourceStep?.name,
      targetName: targetStep?.name,
      displayId: stepDisplayMap.get(parsed.targetId)?.stepNumber ?? targetStep?.stepNumber,
    };
  }, [selectedEdgeId, workflow, parseEdgeId, branchLetters, stepDisplayMap]);

  const inspectorTasks = useMemo(() => {
    if (!selectedStep?.stepNumber) return [];
    const stepNumber = selectedStep.stepNumber;
    return versionTasks
      .filter((task) => Array.isArray(task.metadata?.relatedSteps) && task.metadata.relatedSteps.includes(stepNumber))
      .map((task) => ({
        id: task.id,
        title: task.title,
        description: task.description ?? null,
        status: task.status ?? "pending",
        priority: task.priority ?? "important",
        metadata: task.metadata ?? {},
      }));
  }, [selectedStep?.stepNumber, versionTasks]);

  useEffect(() => {
    if (selectedEdgeId && !flowEdges.some((edge) => edge.id === selectedEdgeId)) {
      setSelectedEdgeId(null);
    }
  }, [selectedEdgeId, flowEdges]);

  const workflowIsEmpty = useMemo(() => isWorkflowEffectivelyEmpty(workflow), [workflow]);
  const [readinessFloor, setReadinessFloor] = useState(0);
  useEffect(() => {
    setReadinessFloor(0);
  }, [selectedVersion?.id]);
  useEffect(() => {
    const score =
      copilotAnalysis?.readiness?.score ??
      copilotAnalysis?.memory?.facts?.readiness_floor ??
      copilotAnalysis?.facts?.readiness_floor ??
      0;
    setReadinessFloor((prev) => Math.max(prev, Math.round(score ?? 0)));
  }, [copilotAnalysis?.readiness?.score, copilotAnalysis?.memory?.facts?.readiness_floor, copilotAnalysis?.facts?.readiness_floor]);
  const triggerPresent = useMemo(() => {
    const facts = copilotAnalysis?.facts ?? copilotAnalysis?.memory?.facts ?? {};
    const sections = workflow?.sections ?? [];
    const steps = workflow?.steps ?? [];
    return (
      Boolean((facts as any).trigger_cadence || (facts as any).trigger_time) ||
      steps.some((step) => step.type === "Trigger") ||
      sections.some(
        (section) =>
          section.key === "business_requirements" &&
          /(\b\d+(?:am|pm)\b|daily|weekly|monthly|every)/i.test(section.content ?? "")
      )
    );
  }, [copilotAnalysis?.facts, copilotAnalysis?.memory?.facts, workflow]);

  const destinationPresent = useMemo(() => {
    const facts = copilotAnalysis?.facts ?? copilotAnalysis?.memory?.facts ?? {};
    const sections = workflow?.sections ?? [];
    return (
      Boolean((facts as any).storage_destination) ||
      Boolean((facts as any).systems && (facts as any).systems.length > 0) ||
      sections.some((section) => section.key === "systems" && Boolean(section.content?.trim()))
    );
  }, [copilotAnalysis?.facts, copilotAnalysis?.memory?.facts, workflow]);

  const readinessScoreLive = liveReadiness?.readinessScore ?? null;
  const readinessPersisted =
    copilotAnalysis?.readiness?.score ??
    copilotAnalysis?.memory?.facts?.readiness_floor ??
    copilotAnalysis?.facts?.readiness_floor ??
    0;
  const readinessScore = Math.max(
    readinessScoreLive ?? 0,
    readinessFloor,
    Math.round(readinessPersisted ?? 0)
  );
  const readinessPercent = Math.max(0, Math.min(100, Math.round(readinessScore)));

  const readinessHint = (score: number, signals?: ReadinessSignals) => {
    if (signals) {
      if (!signals.goal) return "Understanding the goal.";
      if (!signals.output) return "Understanding what data to capture.";
      if (!signals.trigger) return "Understanding how often it should run.";
      if (!signals.destination) return "Understanding where results should go.";
      if (!signals.scope) return "Defining what done looks like.";
      return "Ready to build.";
    }
    if (score >= 85) return "Ready to build.";
    if (score >= 70) return "Almost ready to build.";
    if (score >= 50) return "Understanding schedule and outputs.";
    if (score >= 30) return "Understanding key inputs and data source.";
    if (score >= 10) return "Understanding the goal.";
    return "Starting to understand your workflow.";
  };

  const proceedBasicsMet = liveReadiness?.proceedBasicsMet ?? (triggerPresent && destinationPresent);
  const proceedThresholdMet = liveReadiness?.proceedThresholdMet ?? readinessPercent >= READINESS_PROCEED_THRESHOLD;
  const proceedReady = typeof liveReadiness?.proceedReady === "boolean"
    ? liveReadiness.proceedReady
    : proceedBasicsMet && proceedThresholdMet;
  const readinessHintText = readinessHint(readinessPercent, liveReadiness?.signals);
  const alreadyInBuild = isAtOrBeyondBuild(selectedVersion?.status ?? null, "BuildInProgress");
  const proceedDisabledReason = !proceedReady
    ? !proceedBasicsMet
      ? "Add when and where this should run and deliver results."
      : !proceedThresholdMet
      ? `Build unlocks at ${READINESS_PROCEED_THRESHOLD}% readiness.`
      : liveReadiness?.proceedReason ?? "Provide a bit more detail to proceed."
    : alreadyInBuild
    ? "This version is already in a build phase."
    : !selectedVersion?.id
    ? "Select an automation version first."
    : null;
  const proceedButtonDisabled = Boolean(proceedDisabledReason) || proceedingToBuild;

  const handleProceedToBuild = useCallback(async () => {
    if (!selectedVersion?.id || proceedButtonDisabled || alreadyInBuild) {
      return;
    }
    setProceedingToBuild(true);
    setShowProceedCelebration(true);
    let pricingModalTimer: ReturnType<typeof setTimeout> | null = null;
    pricingModalTimer = setTimeout(() => setShowPricingModal(true), 3000);
    try {
      const response = await updateAutomationStatus(selectedVersion.id, "NeedsPricing");
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error ?? "Unable to update status");
      }
      const estimateResponse = await estimateAutomationActions(selectedVersion.id);
      if (!estimateResponse.ok) {
        const payload = await estimateResponse.json().catch(() => ({}));
        throw new Error(payload?.error ?? "Unable to estimate actions");
      }
      const estimate = await estimateResponse.json();

      const priceResponse = await priceAutomationQuote(selectedVersion.id, {
        complexity: estimate?.complexity ?? "medium",
        estimatedVolume: estimate?.estimatedVolume ?? 1000,
        estimatedActions: estimate?.estimatedActions ?? [],
        discounts: [],
      });
      if (!priceResponse.ok) {
        const payload = await priceResponse.json().catch(() => ({}));
        throw new Error(payload?.error ?? "Unable to generate quote");
      }
      toast({
        title: "Proceeding to build",
        description: "Status updated to Needs Pricing. Quote generated.",
        variant: "success",
      });
      await fetchAutomation({ preserveSelection: true });
      setActiveTab("Build Status");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Proceed request failed";
      toast({ title: "Unable to proceed", description: message, variant: "error" });
    } finally {
      setProceedingToBuild(false);
      if (pricingModalTimer) {
        clearTimeout(pricingModalTimer);
      }
      setShowProceedCelebration(false);
      setShowPricingModal(false);
    }
  }, [selectedVersion?.id, proceedButtonDisabled, alreadyInBuild, fetchAutomation, toast]);

  useEffect(() => {
    if (!workflow) {
      return;
    }
    const prev = completionRef.current;
    if (prev) {
      completion.sections.forEach((section) => {
        const prevSection = prev.sections.find((entry) => entry.key === section.key);
        if (prevSection && !prevSection.complete && section.complete) {
          toast({
            title: `${WORKFLOW_SECTION_TITLES[section.key]} captured`,
            description: "Great progress—keep refining the rest of the workflow.",
            variant: "success",
          });
        }
      });
    }
    completionRef.current = completion;
  }, [workflow, completion, toast]);

  useEffect(() => {
    if (workflow && workflow.steps.length > 0 && !hasSelectedStep) {
      setShowStepHelper(true);
    }
  }, [workflow, hasSelectedStep]);

  useEffect(() => {
    if (saveState !== "saved") {
      return;
    }
    const timer = setTimeout(() => {
      setSaveState(isWorkflowDirty ? "dirty" : "idle");
    }, 2500);
    return () => clearTimeout(timer);
  }, [saveState, isWorkflowDirty]);

  useEffect(() => {
    if (!isWorkflowDirty || !workflow) {
      return undefined;
    }

    const timeoutId = setTimeout(() => {
      handleSaveWorkflow(undefined, { preserveSelection: true });
    }, 2000);

    return () => clearTimeout(timeoutId);
  }, [workflow, isWorkflowDirty, handleSaveWorkflow]);

  const handleOpenManualTime = () => {
    const minutes = selectedVersion ? (metricConfigs[selectedVersion.id]?.manualSecondsPerExecution ?? 0) / 60 : 5;
    setMetricForm((prev) => ({
      ...prev,
      manualMinutes: Number.isFinite(minutes) ? minutes.toString() : "",
    }));
    setShowManualTimeModal(true);
  };

  const handleOpenHourlyRate = () => {
    const hourly = selectedVersion ? metricConfigs[selectedVersion.id]?.hourlyRateUsd ?? 50 : 50;
    setMetricForm((prev) => ({
      ...prev,
      hourlyRate: Number.isFinite(hourly) ? hourly.toString() : "",
    }));
    setShowHourlyRateModal(true);
  };

  const handleSaveMetricConfig = async ({ manualMinutes, hourlyRate }: { manualMinutes?: number; hourlyRate?: number }) => {
    if (!selectedVersion?.id) return;
    if (manualMinutes === undefined && hourlyRate === undefined) {
      return;
    }

    setSavingMetricConfig(true);
    try {
      const body: Record<string, number> = {};
      if (manualMinutes !== undefined) body.manualMinutesPerExecution = manualMinutes;
      if (hourlyRate !== undefined) body.hourlyRateUsd = hourlyRate;

      const response = await updateAutomationMetrics(selectedVersion.id, body);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "Unable to save metric configuration");
      }

      toast({
        title: "Metric configuration saved",
        description: "We will refresh the KPI calculations on the next daily run.",
        variant: "success",
      });
      await fetchVersionMetrics(selectedVersion.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to save metric configuration";
      toast({ title: "Unable to save", description: message, variant: "error" });
    } finally {
      setSavingMetricConfig(false);
      setShowManualTimeModal(false);
      setShowHourlyRateModal(false);
    }
  };

  const handleInviteTeam = () => {
    toast({
      title: "Invite teammates coming soon",
      description: "Connect this action to workspace invitations once backend hooks are live.",
    });
  };

  const handleRunTest = () => {
    toast({
      title: "Test run queued",
      description: "Workflow test harness wiring is on the roadmap.",
      variant: "success",
    });
  };

  const goToTasksView = () => {
    setActiveTab("Workflow");
    setCanvasViewMode("tasks");
  };

  const handleSaveActivityNote = async (note: string) => {
    if (!selectedVersion?.id) return;
    setActivityNoteSaving(true);
    setActivityNoteError(null);
    try {
      const response = await postAutomationVersionMessage(selectedVersion.id, {
        role: "system",
        content: `[Admin Note] ${note}`,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "Failed to save note");
      }
      setActivityRefreshToken((count) => count + 1);
    } catch (err) {
      setActivityNoteError(err instanceof Error ? err.message : "Unable to save note");
    } finally {
      setActivityNoteSaving(false);
    }
  };

  const handleApplyDiscount = async (payload: { versionId: string; discountCode: string; estimatedVolume: number }) => {
    const { versionId, discountCode, estimatedVolume } = payload;
    if (!versionId || !discountCode.trim()) return;
    try {
      await priceAutomationQuote(versionId, {
        complexity: "medium",
        estimatedVolume,
        estimatedActions: [],
        discounts: [],
        discountCode: discountCode.trim(),
      });
    } catch (err) {
      logger.error("Failed to apply discount code", err);
    }
  };

  const handleAdvanceStatus = async (versionId: string) => {
    if (!versionId) return;
    await updateAutomationStatus(versionId, "BuildInProgress");
  };

  const handleSaveGeneralSettings = async (payload: { versionId: string; name: string; description: string | null; tags: string[] }) => {
    const response = await updateAutomationVersion(payload.versionId, {
      automationName: payload.name.trim(),
      automationDescription: payload.description?.trim() ?? null,
      tags: payload.tags,
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error ?? "Unable to save settings");
    }
  };

  const handleGenerateTags = async (versionId: string) => {
    const response = await generateAutomationTags(versionId);
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error ?? "Unable to generate tags");
    }
    const data = await response.json();
    return Array.isArray(data.tags) ? data.tags : [];
  };

  const latestQuote = selectedVersion?.latestQuote ?? null;
  const selectedMetric = selectedVersion
    ? versionMetrics[selectedVersion.id] ?? selectedVersion.latestMetrics ?? null
    : null;
  const selectedMetricConfig = selectedVersion ? metricConfigs[selectedVersion.id] ?? null : null;
  const versionOptions: VersionOption[] = automation?.versions.map((version) => ({
    id: version.id,
    label: version.versionLabel,
    status: version.id === selectedVersion?.id ? "active" : version.status === "IntakeInProgress" ? "draft" : "superseded",
    updated: formatDateTime(version.updatedAt),
  })) ?? [];
  const kpiStats = buildKpiStats(selectedMetric, selectedMetricConfig, {
    onConfigureHours: handleOpenManualTime,
    onConfigureCost: handleOpenHourlyRate,
  });

  const headerProps = {
    automationName: automation?.name ?? "",
    versionOptions,
    selectedVersionId: selectedVersion?.id ?? versionOptions[0]?.id ?? null,
    creatingVersion,
    onVersionChange: handleVersionChange,
    onNewVersion: handleCreateVersion,
    onRefresh: () => fetchAutomation(),
    isLoadingVersion: isSwitchingVersion || metricsLoading || recentActivityLoading,
    saveState,
    lastSavedAt,
    saveError,
    onRetrySave: () => handleSaveWorkflow(undefined, { preserveSelection: true }),
    activeTab,
    onTabChange: setActiveTab,
  };

  const overviewProps = {
    automationName: automation?.name ?? "",
    automationDescription: automation?.description ?? null,
    versionLabel: selectedVersion?.versionLabel ?? "Draft",
    versionStatus: selectedVersion?.status,
    quoteStatus: latestQuote?.status ?? null,
    updatedAtLabel: formatDateTime(selectedVersion?.updatedAt ?? null),
    onInviteTeam: handleInviteTeam,
    onRunTest: handleRunTest,
    onEditWorkflow: () => setActiveTab("Workflow"),
    kpiStats,
    metricsLoading,
    metricsError,
    recentActivityEntries,
    recentActivityLoading,
    recentActivityError,
    onViewAllActivity: () => setActiveTab("Activity"),
    attentionTasks,
    onGoToTasks: goToTasksView,
  };

  const workflowTabProps = {
    workflow,
    workflowError,
    canvasState,
    canvasViewMode,
    onCanvasViewModeChange: setCanvasViewMode,
    workflowIsEmpty,
    isOptimizingFlow,
    onOptimizeFlow: handleOptimizeFlow,
    onRetryAutomation: () => fetchAutomation({ preserveSelection: true }),
    requirementsText,
    onRequirementsChange: setRequirementsText,
    onSaveRequirements: handleSaveRequirements,
    savingRequirements,
    automationVersionId: selectedVersion?.id ?? null,
    tasks: versionTasks,
    blockersRemaining,
    tasksLoadState,
    onViewTaskStep: handleViewTaskStep,
    onViewTask: handleViewTask,
    flowNodes,
    flowEdges,
    onNodesChange: handleNodesChange,
    onEdgesChange: handleEdgesChange,
    onConnectNodes: handleConnectNodes,
    onEdgeUpdate: handleEdgeUpdate,
    onNodeClick: handleNodeClick,
    onEdgeClick: handleEdgeClick,
    selectedEdge,
    selectedStep,
    selectedStepDisplayId,
    inspectorTasks,
    onEdgeChange: handleEdgeChange,
    onEdgeDelete: handleEdgeDelete,
    onEdgeClose: () => setSelectedEdgeId(null),
    onStepChange: handleStepChange,
    onDeleteStep: handleDeleteStep,
    onCloseInspector: () => setSelectedStepId(null),
    hasSelectedStep,
    showStepHelper,
    setHasSelectedStep,
    setShowStepHelper,
    isSwitchingVersion,
    isSynthesizingWorkflow,
    buildActivity,
    canvasActivityFeed,
    injectedChatMessage,
    onInjectedMessageConsumed: () => setInjectedChatMessage(null),
    onWorkflowAIUpdates: handleWorkflowAIUpdates,
    onWorkflowRefresh: refreshAutomationPreservingSelection,
    onTasksUpdate: handleTasksUpdate,
    onWorkflowUpdatingChange: setIsSynthesizingWorkflow,
    analysis: copilotAnalysis,
    analysisLoading: copilotAnalysisLoading,
    analysisUnavailable: copilotAnalysisError,
    onRefreshAnalysis: () => refreshAnalysis(selectedVersion?.id ?? null),
    onBuildActivityUpdate: handleBuildActivityUpdate,
    onProceedToBuild: handleProceedToBuild,
    proceedButtonDisabled,
    proceedDisabledReason,
    proceedingToBuild,
    readinessPercent,
    readinessHintText,
    alreadyInBuild,
    onReadinessUpdate: handleReadinessUpdate,
    onRequirementsUpdate: handleRequirementsUpdate,
  };

  const buildStatusTabProps = {
    status: selectedVersion?.status,
    latestQuote,
    lastUpdated: selectedVersion?.updatedAt ?? null,
    versionLabel: selectedVersion?.versionLabel ?? "",
    tasks: versionTasks,
    onViewTasks: goToTasksView,
    automationVersionId: selectedVersion?.id,
    onPricingRefresh: () => fetchAutomation({ preserveSelection: true }),
    onApplyDiscount: handleApplyDiscount,
    onAdvanceStatus: handleAdvanceStatus,
  };

  const activityTabProps = {
    automationVersionId: selectedVersion?.id ?? "",
    activities: activityItems,
    isLoading: activityLoading,
    error: activityError,
    isSavingNote: activityNoteSaving,
    noteError: activityNoteError,
    onClearNoteError: () => setActivityNoteError(null),
    onSaveNote: handleSaveActivityNote,
    onNavigateToWorkflow: () => setActiveTab("Workflow"),
  };

  const settingsTabProps = {
    onInviteUser: () => {
      toast({ title: "Invite teammates", description: "Coming soon." });
    },
    onAddSystem: () => {
      toast({ title: "Add system", description: "TODO: connect this action to the admin workflow." });
    },
    onNewVersion: handleCreateVersion,
    onManageCredentials: (system: string) => {
      toast({ title: `Manage ${system}`, description: "TODO: connect this action to the admin workflow." });
    },
    onNavigateToTab: (tab: string) => {
      toast({ title: `Navigate to ${tab}`, description: "TODO: connect this action to the admin workflow." });
    },
    onNavigateToSettings: () => {
      toast({ title: "Workspace settings", description: "TODO: connect this action to the admin workflow." });
    },
    onSaveGeneral: handleSaveGeneralSettings,
    onGenerateTags: handleGenerateTags,
    automationId: automation?.id,
    automationName: automation?.name,
    automationDescription: automation?.description ?? null,
    tags: selectedVersion?.tags ?? [],
    automationCreatedAt: automation?.createdAt ?? null,
    automationUpdatedAt: selectedVersion?.updatedAt ?? automation?.updatedAt ?? null,
    onGeneralSaved: () => fetchAutomation({ preserveSelection: true }),
    currentVersionId: selectedVersion?.id ?? null,
    versions: automation?.versions ?? [],
    onArchiveVersion: handleArchiveVersion,
    onDeleteVersion: handleDeleteVersion,
    archivingVersionId,
    deletingVersionId,
  };

  const metricModalsProps = {
    showManualTimeModal,
    setShowManualTimeModal,
    showHourlyRateModal,
    setShowHourlyRateModal,
    metricForm,
    setMetricForm,
    savingMetricConfig,
    onSaveMetricConfig: handleSaveMetricConfig,
  };

  const proceedingModalsProps = {
    showProceedCelebration,
    setShowProceedCelebration,
    showPricingModal,
    setShowPricingModal,
  };

  const taskDrawerProps = {
    task: selectedTask,
    saving: savingTask,
    onClose: () => setSelectedTask(null),
    onSave: (patch: { status?: VersionTask["status"]; description?: string | null; metadata?: Record<string, unknown> | null }) =>
      selectedTask ? handleSaveTask(selectedTask.id, patch) : Promise.resolve(),
  };

  return {
    automation,
    loading,
    error,
    activeTab,
    chatHasAccess,
    chatAccessChecking,
    headerProps,
    overviewProps,
    workflowTabProps,
    buildStatusTabProps,
    activityTabProps,
    settingsTabProps,
    metricModalsProps,
    proceedingModalsProps,
    taskDrawerProps,
  };
}

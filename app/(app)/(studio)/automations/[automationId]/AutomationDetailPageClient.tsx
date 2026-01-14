"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { formatDistanceToNow } from "date-fns";
import { logger } from "@/lib/logger";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  Loader2,
  RefreshCw,
  Send,
  MessageSquare,
  Users,
  Play,
  Edit3,
  Sparkles,
  AlertTriangle,
  Calendar,
  Clock,
  DollarSign,
  CheckCircle2,
  ArrowUpRight,
  ArrowRight,
  History,
  ListChecks,
  FileText,
  GitBranch,
  CheckSquare,
  Settings2,
} from "lucide-react";
import type { Connection, Node, Edge, EdgeChange, NodeChange } from "reactflow";
import { StudioChat, type CopilotMessage } from "@/components/automations/StudioChat";
import type { CopilotAnalysisState } from "@/lib/workflows/copilot-analysis";
import type { StudioCanvasProps } from "@/components/StudioCanvas";
import { StudioInspector } from "@/components/automations/StudioInspector";
import { EdgeInspector } from "@/components/automations/EdgeInspector";
import { ActivityTab } from "@/components/automations/ActivityTab";
import { BuildStatusTab } from "@/components/automations/BuildStatusTab";
import { SettingsTab } from "@/components/automations/SettingsTab";
import { ChatTab } from "@/components/automations/ChatTab";
import { createEmptyWorkflowSpec } from "@/lib/workflows/factory";
import type { Workflow, WorkflowSectionKey, WorkflowStep } from "@/lib/workflows/types";
import { WORKFLOW_SECTION_TITLES } from "@/lib/workflows/types";
import { generateStepNumbers } from "@/lib/workflows/step-numbering";
import { getWorkflowCompletionState } from "@/lib/workflows/completion";
import { isWorkflowEffectivelyEmpty } from "@/lib/workflows/utils";
import { workflowToNodes, workflowToEdges, addConnection, removeConnection, reconnectEdge } from "@/lib/workflows/canvas-utils";
import { applyWorkflowUpdates, type WorkflowUpdates as CopilotWorkflowUpdates } from "@/lib/workflows/ai-updates";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { AutomationLifecycleStatus } from "@/lib/automations/status";
import { AUTOMATION_TABS, type AutomationTab } from "@/lib/automations/tabs";
import { VersionSelector, type VersionOption } from "@/components/ui/VersionSelector";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ACTIVE_LIFECYCLE_ORDER, resolveStatus } from "@/lib/submissions/lifecycle";
import { TaskDrawer } from "@/components/automations/TaskDrawer";
import { NeedsAttentionCard } from "@/components/automations/NeedsAttentionCard";
import { getAttentionTasks, type AutomationTask } from "@/lib/automations/tasks";
import { sendDevAgentLog } from "@/lib/dev/agent-log";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { buildKpiStats, type KpiStat, type MetricConfig, type VersionMetric } from "@/lib/metrics/kpi";
import { createVersionWithRedirect } from "./create-version";
import type { ReadinessSignals } from "@/lib/workflows/copilot-analysis";

const READINESS_PROCEED_THRESHOLD = 85;

const StudioCanvas = dynamic<StudioCanvasProps>(() => import("@/components/StudioCanvas").then((m) => m.StudioCanvas), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-gray-50">
      <span className="text-sm text-gray-500">Loading canvas…</span>
    </div>
  ),
});

type QuoteSummary = {
  id: string;
  status: string;
  setupFee: string | null;
  unitPrice: string | null;
  estimatedVolume: number | null;
  updatedAt: string;
};

type SanitizationSummaryPayload = {
  removedDuplicateEdges: number;
  reparentedBranches: number;
  removedCycles: number;
  trimmedConnections: number;
  attachedOrphans: number;
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

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

function SaveIndicator({
  state,
  lastSavedAt,
  error,
  onRetry,
}: {
  state: SaveState;
  lastSavedAt: Date | null;
  error?: string | null;
  onRetry?: () => void;
}) {
  const savedText = lastSavedAt ? `Saved ${formatDistanceToNow(lastSavedAt, { addSuffix: true })}` : "Saved";

  if (state === "saving") {
    return (
      <div
        className="flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full border border-gray-200 bg-white shadow-sm"
        data-testid="save-indicator"
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-500" />
        <span className="text-gray-700">Saving…</span>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div
        className="flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full border border-red-200 bg-red-50 text-red-700 shadow-sm"
        data-testid="save-indicator"
      >
        <AlertTriangle className="h-3.5 w-3.5" />
        <span>{error || "Save failed"}</span>
        {onRetry ? (
          <Button size="sm" variant="secondary" className="h-6 text-[11px]" onClick={onRetry}>
            Retry
          </Button>
        ) : null}
      </div>
    );
  }

  if (state === "dirty") {
    return (
      <div
        className="flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full border border-amber-200 bg-amber-50 text-amber-800 shadow-sm"
        data-testid="save-indicator"
      >
        <Sparkles className="h-3.5 w-3.5" />
        <span>Unsaved changes</span>
      </div>
    );
  }

  if (state === "saved") {
    return (
      <div
        className="flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 shadow-sm"
        data-testid="save-indicator"
      >
        <CheckCircle2 className="h-3.5 w-3.5" />
        <span>{savedText}</span>
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full border border-gray-200 bg-white text-gray-600 shadow-sm"
      data-testid="save-indicator"
    >
      <Clock className="h-3.5 w-3.5" />
      <span>Idle</span>
    </div>
  );
}

type AutomationVersion = {
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

type AutomationDetail = {
  id: string;
  name: string;
  description: string | null;
  createdAt?: string;
  updatedAt?: string;
  versions: AutomationVersion[];
};

type VersionTask = AutomationTask & {
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

export interface AutomationDetailPageProps {
  params: {
    automationId: string;
  };
}

const formatDateTime = (value?: string | null) => {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  } catch {
    return value;
  }
};


type LifecycleStage = (typeof ACTIVE_LIFECYCLE_ORDER)[number];

const cloneWorkflow = (workflow: Workflow | null) => (workflow ? (JSON.parse(JSON.stringify(workflow)) as Workflow) : null);

const isAtOrBeyondBuild = (status: AutomationLifecycleStatus | null, target: LifecycleStage): boolean => {
  const resolved = resolveStatus(status ?? "");
  if (!resolved || resolved === "Archived") {
    return false;
  }
  const targetIndex = ACTIVE_LIFECYCLE_ORDER.indexOf(target);
  const statusIndex = ACTIVE_LIFECYCLE_ORDER.indexOf(resolved as LifecycleStage);
  return statusIndex !== -1 && targetIndex !== -1 && statusIndex >= targetIndex;
};

type ActivityEntry = {
  title: string;
  user: string;
  time: string;
  description: string;
  icon: typeof Edit3;
  iconBg: string;
  iconColor: string;
};

type ActivityApiItem = {
  id: string;
  action: string;
  displayText: string;
  category: string;
  user: string;
  timestamp: string;
};

const RECENT_ACTIVITY_ICON_MAP: Record<string, { icon: typeof Edit3; bg: string; color: string }> = {
  workflow: { icon: FileText, bg: "bg-pink-50", color: "text-pink-600" },
  quote: { icon: DollarSign, bg: "bg-amber-50", color: "text-amber-600" },
  task: { icon: CheckSquare, bg: "bg-blue-50", color: "text-blue-600" },
  build: { icon: Play, bg: "bg-emerald-50", color: "text-emerald-600" },
  message: { icon: MessageSquare, bg: "bg-gray-50", color: "text-gray-600" },
  version: { icon: History, bg: "bg-purple-50", color: "text-purple-600" },
  other: { icon: Edit3, bg: "bg-gray-50", color: "text-gray-500" },
};

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

// TODO: replace KPI and activity mock data with real analytics + audit feeds.

export default function AutomationDetailPage({ params }: AutomationDetailPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
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
  const [saveState, setSaveState] = useState<SaveState>("idle");
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
  
  // Read tab from URL params, default to "Overview"
  const normalizeTabFromUrl = (value: string | null): AutomationTab => {
    if (!value) return "Overview";
    const lower = value.toLowerCase();
    if (lower === "blueprint") return "Workflow";
    const match = AUTOMATION_TABS.find((tab) => tab.toLowerCase() === lower);
    return (match ?? "Overview") as AutomationTab;
  };

  const urlTab = searchParams?.get("tab") ?? null;
  const initialTab = normalizeTabFromUrl(urlTab);
  const [activeTab, setActiveTab] = useState<AutomationTab>(initialTab);
  const [canvasViewMode, setCanvasViewMode] = useState<"requirements" | "flowchart" | "tasks">("flowchart");
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
  
  // Sync activeTab with URL params when they change
  useEffect(() => {
    setActiveTab(normalizeTabFromUrl(searchParams?.get("tab") ?? null));
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

    // Normalize tab only after the injected message is queued to avoid racing with tab state
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
  type BuildActivity = {
    runId: string;
    phase: string;
    rawPhase?: string | null;
    lastSeq?: number | null;
    lastLine: string | null;
    isRunning: boolean;
    completedAt: number | null;
  };

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
  const handleBuildActivityUpdate = useCallback(
    (activity: BuildActivity | null) => {
      console.log("[BuildActivity -> Canvas prop]", activity);
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
          // clear timers for previous run
          clearCanvasRemovalTimers(canvasFeedRunIdRef.current);
          canvasDoneAddedRef.current.delete(canvasFeedRunIdRef.current!);
        }
        canvasFeedRunIdRef.current = nextRunId;

        if (!hasText) return base;
        if (base.some((item) => item.signature === signature)) return base;

        const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const appended = [
          ...base,
          { id, text: lineText, seq: nextSeq, signature, ts: Date.now() },
        ];
        console.log("[Canvas feed @ parent] append", {
          runId: nextRunId,
          signature,
          seq: nextSeq,
          text: lineText,
          entries: appended.map((e) => ({ signature: e.signature, seq: e.seq, text: e.text })),
        });
        return appended;
      });

      const runId = activity?.runId ?? null;
      const phase = (activity?.phase ?? "").toLowerCase();
      const isDonePhase = phase === "done";

      if (runId && isDonePhase && !canvasDoneAddedRef.current.has(runId)) {
        const doneSignature = `${runId}|done`;
        setCanvasActivityFeed((prev) => {
          // avoid duplicate done
          if (prev.some((item) => item.signature === doneSignature)) return prev;
          const next = [
            ...prev,
            { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, text: "Done!", seq: null, signature: doneSignature, ts: Date.now() },
          ];
          canvasDoneAddedRef.current.add(runId);
          console.log("[Canvas feed @ parent] append done", {
            runId,
            signature: doneSignature,
            entries: next.map((e) => ({ signature: e.signature, seq: e.seq, text: e.text })),
          });
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
  const completionRef = useRef<ReturnType<typeof getWorkflowCompletionState> | null>(null);
  const preserveSelectionRef = useRef(false);
  const synthesisTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        const response = await fetch(`/api/automations/${params.automationId}`, { cache: "no-store" });
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
        // #region agent log
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
        // #endregion
        const workflow = version?.workflowJson ? cloneWorkflow(version.workflowJson) : createEmptyWorkflowSpec();
        // #region agent log
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
        // #endregion
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
    [params.automationId, selectedVersionId]
  );

  const fetchVersionMetrics = useCallback(
    async (versionId: string | null) => {
      if (!versionId) return;
      setMetricsLoading(true);
      setMetricsError(null);
      try {
        const response = await fetch(`/api/automation-versions/${versionId}/metrics`, { cache: "no-store" });
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
    },
    []
  );

  const fetchRecentActivity = useCallback(
    async (versionId: string | null) => {
      if (!versionId) {
        setRecentActivityEntries([]);
        return;
      }

      setRecentActivityLoading(true);
      setRecentActivityError(null);
      try {
        const response = await fetch(`/api/automation-versions/${versionId}/activity?limit=3`, { cache: "no-store" });
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
    },
    []
  );


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
    if (isSwitchingVersion && !metricsLoading && !recentActivityLoading) {
      setIsSwitchingVersion(false);
    }
  }, [isSwitchingVersion, metricsLoading, recentActivityLoading]);

  const selectedVersion = useMemo(() => {
    if (!automation || !selectedVersionId) {
      return automation?.versions[0] ?? null;
    }
    return automation.versions.find((version) => version.id === selectedVersionId) ?? automation.versions[0] ?? null;
  }, [automation, selectedVersionId]);

  const refreshAnalysis = useCallback(
    async (versionId?: string | null) => {
      if (!versionId) {
        setCopilotAnalysis(null);
        setCopilotAnalysisError(false);
        return;
      }
      setCopilotAnalysisLoading(true);
      setCopilotAnalysisError(false);
      try {
        const res = await fetch(`/api/automation-versions/${versionId}/copilot/analysis`, { cache: "no-store" });
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
    },
    []
  );

  useEffect(() => {
    if (activeTab !== "Workflow") return;
    void refreshAnalysis(selectedVersion?.id ?? null);
  }, [activeTab, refreshAnalysis, selectedVersion?.id]);


  useEffect(() => {
    if (selectedVersion) {
      setNotes(selectedVersion.intakeNotes ?? "");
      // #region agent log
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
      // #endregion
      const nextWorkflow = selectedVersion.workflowJson ? cloneWorkflow(selectedVersion.workflowJson) : createEmptyWorkflowSpec();
      const safeWorkflow = nextWorkflow ?? createEmptyWorkflowSpec();
      // #region agent log
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
      // #endregion
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
  }, [selectedVersion?.id, selectedVersion?.workflowJson?.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

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
      const response = await fetch(`/api/automation-versions/${selectedVersion.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requirementsText: requirementsText }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to save requirements");
      }
      await fetchAutomation();
      previousRequirementsRef.current = next;
      // Inject a chat notice and trigger copilot rebuild based on the latest requirements
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
      
      // #region agent log - Track step counts before save
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
      // #endregion
      
      // Safeguard: Warn if steps are missing in payload
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
        const response = await fetch(`/api/automation-versions/${selectedVersion.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workflowJson: payload }),
        });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error ?? "Failed to save workflow");
        }
        const cloned = cloneWorkflow(payload);
        const stepCountAfterSave = cloned?.steps?.length ?? 0;
        
        // #region agent log - Track step counts after save
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
        // #endregion
        
        // Safeguard: Verify steps were preserved
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
            variant: "warning" 
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
      } finally {
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
        automationId: params.automationId,
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
        const response = await fetch(`/api/automation-versions/${versionId}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "Archived" }),
        });
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
        const response = await fetch(`/api/automation-versions/${versionId}`, { method: "DELETE" });
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
      // Handle node position changes
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

      // Handle node removal
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
      const response = await fetch(`/api/automation-versions/${selectedVersion.id}/copilot/optimize`, {
        method: "POST",
      });
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

  const handleInspectTask = useCallback(
    (taskId: string) => {
      const target = versionTasks.find((task) => task.id === taskId);
      if (target) {
        setSelectedTask(target);
      }
    },
    [versionTasks]
  );

  const handleSaveTask = useCallback(
    async (taskId: string, patch: { status?: VersionTask["status"]; description?: string | null; metadata?: Record<string, unknown> | null }) => {
      setSavingTask(true);
      try {
        const response = await fetch(`/api/tasks/${taskId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
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

  const flowNodes = useMemo<Node[]>(() => {
    // #region agent log
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
    // #endregion
    const nodes = workflowToNodes(workflow, taskLookup);
    // #region agent log
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
    // #endregion
    if ((workflow?.steps?.length ?? 0) > 0 && nodes.length === 0) {
      logger.error("[AUTOMATION] Workflow steps present but rendered nodes are zero", {
        stepCount: workflow?.steps?.length ?? 0,
        steps: workflow?.steps,
        edgeCount: workflow ? workflowToEdges(workflow).length : 0,
        nodePositions: nodes.map((node) => ({ id: node.id, position: node.position })),
      });
    }
    return nodes;
  }, [workflow, taskLookup]);
  
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
    (edgeId: string, updates: { label?: string; condition?: string }) => {
      const parsed = parseEdgeId(edgeId);
      if (!parsed) return;
      applyWorkflowUpdate((current) => ({
        ...current,
        steps: current.steps.map((step) => {
          if (step.id !== parsed.targetId) {
            return step;
          }
          const nextLabel =
            updates.label !== undefined ? (updates.label?.trim() ? updates.label : undefined) : step.branchLabel;
          const nextCondition =
            updates.condition !== undefined ? (updates.condition?.trim() || undefined) : step.branchCondition;
          return {
            ...step,
            branchLabel: nextLabel,
            branchCondition: nextCondition,
          };
        }),
      }));
    },
    [applyWorkflowUpdate, parseEdgeId]
  );

  const flowEdges = useMemo<Edge[]>(() => {
    const edges = workflowToEdges(workflow);
    const stepById = new Map(workflow?.steps?.map((step) => [step.id, step]) ?? []);
    // Add handlers and branch metadata to all edges
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
  }, [workflow, handleEdgeDelete, parseEdgeId, branchLetters]);

  // Debug logging (commented out to reduce console noise)
  // useEffect(() => {
  //   console.log("🎨 Workflow updated:", {
  //     stepCount: workflow?.steps?.length ?? 0,
  //     steps: workflow?.steps?.map((step) => step.name),
  //     nodeCount: flowNodes.length,
  //     edgeCount: flowEdges.length,
  //   });
  // }, [workflow, flowNodes, flowEdges]);
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
      Boolean(facts.trigger_cadence || facts.trigger_time) ||
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
      Boolean(facts.storage_destination) ||
      Boolean(facts.systems && facts.systems.length > 0) ||
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
  const buildStatusText = useMemo(() => {
    if (!buildActivity) return null;
    if (buildActivity.errorMessage) return buildActivity.errorMessage;
    if (buildActivity.lastLine) return buildActivity.lastLine;
    if (buildActivity.phase) return buildActivity.phase;
    return null;
  }, [buildActivity]);

  const handleProceedToBuild = useCallback(async () => {
    if (!selectedVersion?.id || proceedButtonDisabled || alreadyInBuild) {
      return;
    }
    setProceedingToBuild(true);
    setShowProceedCelebration(true);
    let pricingModalTimer: ReturnType<typeof setTimeout> | null = null;
    pricingModalTimer = setTimeout(() => setShowPricingModal(true), 3000);
    try {
      const response = await fetch(`/api/automation-versions/${selectedVersion.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "NeedsPricing" }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error ?? "Unable to update status");
      }
      // Estimate actions (LLM) then generate quote with that estimate.
      const estimateResponse = await fetch(
        `/api/automation-versions/${selectedVersion.id}/estimate-actions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }
      );
      if (!estimateResponse.ok) {
        const payload = await estimateResponse.json().catch(() => ({}));
        throw new Error(payload?.error ?? "Unable to estimate actions");
      }
      const estimate = await estimateResponse.json();

      const priceResponse = await fetch(
        `/api/automation-versions/${selectedVersion.id}/price-and-quote`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            complexity: estimate?.complexity ?? "medium",
            estimatedVolume: estimate?.estimatedVolume ?? 1000,
            estimatedActions: estimate?.estimatedActions ?? [],
            discounts: [],
          }),
        }
      );
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

  // Auto-save workflow with 2-second debounce
  useEffect(() => {
    if (!isWorkflowDirty || !workflow) {
      return undefined;
    }

    const timeoutId = setTimeout(() => {
      handleSaveWorkflow(undefined, { preserveSelection: true });
    }, 2000);

    return () => clearTimeout(timeoutId);
  }, [workflow, isWorkflowDirty, handleSaveWorkflow]);

  if (loading && !automation) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!automation) {
    return (
      <div className="p-10">
        <p className="text-sm text-gray-600">Automation not found.</p>
        <Button variant="link" className="px-0" onClick={() => router.push("/automations")}>
          Back to automations
        </Button>
      </div>
    );
  }

  const latestQuote = selectedVersion?.latestQuote ?? null;
  const selectedMetric = selectedVersion
    ? versionMetrics[selectedVersion.id] ?? selectedVersion.latestMetrics ?? null
    : null;
  const selectedMetricConfig = selectedVersion ? metricConfigs[selectedVersion.id] ?? null : null;
  const versionOptions: VersionOption[] = automation.versions.map((version) => ({
    id: version.id,
    label: version.versionLabel,
    status: version.id === selectedVersion?.id ? "active" : version.status === "IntakeInProgress" ? "draft" : "superseded",
    updated: formatDateTime(version.updatedAt),
  }));
  const kpiStats = buildKpiStats(selectedMetric, selectedMetricConfig, {
    onConfigureHours: handleOpenManualTime,
    onConfigureCost: handleOpenHourlyRate,
  });

  const handleInviteTeam = () => {
    toast({
      title: "Invite teammates coming soon",
      description: "Connect this action to workspace invitations once backend hooks are live.",
    });
  };

  const goToTasksView = () => {
    setActiveTab("Workflow");
    setCanvasViewMode("tasks");
  };

  const handleRunTest = () => {
    toast({
      title: "Test run queued",
      description: "Workflow test harness wiring is on the roadmap.",
      variant: "success",
    });
  };

  const handleMockAction = (label: string) => {
    toast({
      title: label,
      description: "TODO: connect this action to the admin workflow.",
    });
  };

  function handleOpenManualTime() {
    const minutes = selectedMetricConfig ? selectedMetricConfig.manualSecondsPerExecution / 60 : 5;
    setMetricForm((prev) => ({
      ...prev,
      manualMinutes: Number.isFinite(minutes) ? minutes.toString() : "",
    }));
    setShowManualTimeModal(true);
  }

  function handleOpenHourlyRate() {
    const hourly = selectedMetricConfig ? selectedMetricConfig.hourlyRateUsd : 50;
    setMetricForm((prev) => ({
      ...prev,
      hourlyRate: Number.isFinite(hourly) ? hourly.toString() : "",
    }));
    setShowHourlyRateModal(true);
  }

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

      const response = await fetch(`/api/automation-versions/${selectedVersion.id}/metrics`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
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

  const overviewContent = (
    <div className="space-y-8">
      <AutomationHeader
        name={automation.name}
        description={automation.description}
        versionLabel={selectedVersion?.versionLabel ?? "Draft"}
        versionStatus={selectedVersion?.status}
        quoteStatus={latestQuote?.status ?? null}
        updatedAt={selectedVersion?.updatedAt ?? null}
        onInviteTeam={handleInviteTeam}
        onRunTest={handleRunTest}
        onEditWorkflow={() => setActiveTab("Workflow")}
      />

      <OverviewMetrics stats={kpiStats} isLoading={metricsLoading} error={metricsError} />

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <RecentActivity
            entries={recentActivityEntries}
            isLoading={recentActivityLoading}
            error={recentActivityError}
            onViewAll={() => setActiveTab("Activity")}
          />
        </div>

        <div className="space-y-6">
          <NeedsAttentionCard tasks={attentionTasks} onGoToWorkflow={goToTasksView} />
        </div>
      </section>
    </div>
  );

  const workflowContent = !workflow ? (
    <div className="p-6">
      <div className="rounded-lg border border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-500">Loading workflow…</div>
    </div>
  ) : (
    <div className="flex flex-col h-full w-full relative bg-gray-50 min-h-0">
      <div className="border-b border-gray-100 bg-white px-6 py-4 z-20 relative">
        <div className="flex items-center gap-4">
          <div className="flex flex-col flex-1 min-w-0 gap-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-700">Build readiness</span>
                <span className="text-xs font-semibold text-gray-900">{readinessPercent}%</span>
              </div>
              <div className="flex items-center gap-2">
                {proceedButtonDisabled && !alreadyInBuild && !proceedingToBuild ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div>
                        <Button
                          size="sm"
                          onClick={handleProceedToBuild}
                          disabled={proceedButtonDisabled}
                          className={cn(
                            "gap-2 rounded-full px-4 py-1 text-xs font-semibold",
                            alreadyInBuild
                              ? "bg-gray-200 text-gray-600"
                              : proceedButtonDisabled
                              ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                              : "bg-gray-900 text-white hover:bg-gray-800"
                          )}
                        >
                          {proceedingToBuild ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              Updating…
                            </>
                          ) : alreadyInBuild ? (
                            "Build in progress"
                          ) : (
                            <>
                              Proceed to Build
                              <ArrowRight className="w-3.5 h-3.5" />
                            </>
                          )}
                        </Button>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent
                      side="bottom"
                      sideOffset={4}
                      className="text-xs bg-gray-900 text-white border border-gray-700 shadow-lg [&>svg]:fill-gray-900 [&>svg]:stroke-gray-700 [&>svg]:w-4 [&>svg]:h-4"
                    >
                      {proceedDisabledReason || "We need a little bit more information before we have enough information to build this automation."}
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <Button
                    size="sm"
                    onClick={handleProceedToBuild}
                    disabled={proceedButtonDisabled}
                    className={cn(
                      "gap-2 rounded-full px-4 py-1 text-xs font-semibold",
                      alreadyInBuild
                        ? "bg-gray-200 text-gray-600"
                        : proceedButtonDisabled
                        ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                        : "bg-gray-900 text-white hover:bg-gray-800"
                    )}
                  >
                    {proceedingToBuild ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Updating…
                      </>
                    ) : alreadyInBuild ? (
                      "Build in progress"
                    ) : (
                      <>
                        Proceed to Build
                        <ArrowRight className="w-3.5 h-3.5" />
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
            <div className="w-full h-3 rounded-full bg-gray-100 border border-gray-200 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-400 via-yellow-500 to-emerald-500 transition-all duration-300"
                style={{ width: `${Math.max(4, Math.min(100, readinessPercent))}%` }}
              />
            </div>
            <div className="text-[11px] text-gray-600">{readinessHintText}</div>
          </div>
        </div>
      </div>

      {workflowError ? (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{workflowError}</div>
      ) : null}

      <div className="flex-1 flex relative overflow-hidden bg-gray-50 min-h-0">
        <div className="w-[360px] shrink-0 z-20 h-full bg-[#F9FAFB] border-r border-gray-200 shadow-[4px_0_24px_rgba(0,0,0,0.02)] overflow-hidden">
          <StudioChat
            automationVersionId={selectedVersion?.id ?? null}
            workflowEmpty={workflowIsEmpty}
            onWorkflowUpdates={handleWorkflowAIUpdates}
            onWorkflowRefresh={refreshAutomationPreservingSelection}
            onTasksUpdate={(tasks) => handleTasksUpdate(tasks as unknown as VersionTask[])}
            injectedMessage={injectedChatMessage}
            onInjectedMessageConsumed={() => setInjectedChatMessage(null)}
            onWorkflowUpdatingChange={setIsSynthesizingWorkflow}
            analysis={copilotAnalysis}
            analysisLoading={copilotAnalysisLoading}
            analysisUnavailable={copilotAnalysisError}
            onRefreshAnalysis={() => refreshAnalysis(selectedVersion?.id ?? null)}
            onBuildActivityUpdate={handleBuildActivityUpdate}
            onProceedToBuild={handleProceedToBuild}
            proceedToBuildDisabled={proceedButtonDisabled}
            proceedToBuildReason={proceedDisabledReason}
            proceedingToBuild={proceedingToBuild}
            onReadinessUpdate={handleReadinessUpdate}
          />
        </div>

        <div className="flex-1 relative h-full z-10 bg-gray-50 min-h-0 flex flex-col">
          {/* View Mode Toggle */}
          <div className="absolute top-4 left-4 z-50 flex gap-2 items-center">
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-1 flex gap-2">
              <Button
                size="sm"
                variant={canvasViewMode === "requirements" ? "default" : "ghost"}
                onClick={() => setCanvasViewMode("requirements")}
                className={cn(
                  "text-xs font-semibold h-8 px-3",
                  canvasViewMode === "requirements"
                    ? "bg-gray-900 text-white hover:bg-gray-800"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                )}
              >
                <FileText className="h-3.5 w-3.5 mr-1.5" />
                Requirements
              </Button>
              <Button
                size="sm"
                variant={canvasViewMode === "flowchart" ? "default" : "ghost"}
                onClick={() => setCanvasViewMode("flowchart")}
                className={cn(
                  "text-xs font-semibold h-8 px-3",
                  canvasViewMode === "flowchart"
                    ? "bg-gray-900 text-white hover:bg-gray-800"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                )}
              >
                <GitBranch className="h-3.5 w-3.5 mr-1.5" />
                Flowchart
              </Button>
              <Button
                size="sm"
                variant={canvasViewMode === "tasks" ? "default" : "ghost"}
                onClick={() => setCanvasViewMode("tasks")}
                className={cn(
                  "text-xs font-semibold h-8 px-3",
                  canvasViewMode === "tasks"
                    ? "bg-gray-900 text-white hover:bg-gray-800"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                )}
              >
                <CheckSquare className="h-3.5 w-3.5 mr-1.5" />
                Tasks
              </Button>
            </div>
            {canvasViewMode === "flowchart" && (
              <Button
                size="sm"
                variant="secondary"
                onClick={handleOptimizeFlow}
                disabled={isOptimizingFlow || workflowIsEmpty}
                className="text-xs font-semibold h-8 px-3 bg-white border border-gray-200 shadow-sm hover:bg-gray-50"
              >
                {isOptimizingFlow ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    Re-arranging...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                    Re-arrange Workflow
                  </>
                )}
              </Button>
            )}
          </div>

          {/* View Content */}
          {canvasViewMode === "requirements" ? (
            <RequirementsView
              requirementsText={requirementsText}
              onRequirementsChange={setRequirementsText}
              onSave={handleSaveRequirements}
              saving={savingRequirements}
              automationVersionId={selectedVersion?.id ?? null}
            />
          ) : canvasViewMode === "tasks" ? (
            <TasksViewCanvas
              tasks={versionTasks}
              blockersRemaining={blockersRemaining}
              onViewStep={handleViewTaskStep}
              onViewTask={handleViewTask}
              loadState={tasksLoadState}
              onRetry={fetchAutomation}
            />
          ) : (
            <div className="flex-1 relative h-full">
              {canvasState === "loading" ? (
                <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm">
                  <Loader2 className="h-8 w-8 animate-spin text-gray-500 mb-2" />
                  <p className="text-sm font-semibold text-gray-600">Loading workflow…</p>
                </div>
              ) : null}
              {canvasState === "error" ? (
                <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-white/85 backdrop-blur-sm px-6 text-center">
                  <AlertTriangle className="h-10 w-10 text-amber-500 mb-3" />
                  <p className="text-sm font-semibold text-gray-800">Couldn’t render workflow</p>
                  <p className="text-xs text-gray-500 mb-3">Try reloading the version.</p>
                  <Button size="sm" onClick={() => fetchAutomation()} className="px-4">
                    Retry
                  </Button>
                </div>
              ) : null}
              <StudioCanvas
                key={
                  buildActivity
                    ? `${buildActivity.runId}-${buildActivity.lastSeq ?? "none"}`
                    : "canvas-idle"
                }
                nodes={flowNodes}
                edges={flowEdges}
                onNodesChange={handleNodesChange}
                onEdgesChange={handleEdgesChange}
                onConnect={handleConnectNodes}
                onEdgeUpdate={handleEdgeUpdate}
                onNodeClick={handleNodeClick}
                onEdgeClick={handleEdgeClick}
                isSynthesizing={isSynthesizingWorkflow}
                buildActivity={buildActivity}
                activityFeed={canvasActivityFeed}
                emptyState={
                  canvasState === "empty"
                    ? (
                      <div className="text-center max-w-md mx-auto space-y-2">
                        <Sparkles className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                        <p className="text-sm font-semibold text-gray-600">Workflow Canvas</p>
                        <p className="text-xs text-gray-500 leading-relaxed">
                          Describe your workflow in chat and steps will appear here.
                        </p>
                      </div>
                    )
                    : null
                }
              />

            </div>
          )}
        </div>

        {canvasViewMode === "flowchart" && (selectedEdge || selectedStep) ? (
          <div
            className={cn(
              "shrink-0 z-20 bg-white transition-all duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)] border-l border-gray-200 shadow-xl overflow-y-auto min-h-0",
              "w-[420px] translate-x-0"
            )}
          >
            {selectedEdge ? (
              <EdgeInspector
                edge={selectedEdge}
                onChange={handleEdgeChange}
                onDelete={handleEdgeDelete}
                onClose={() => setSelectedEdgeId(null)}
              />
            ) : selectedStep ? (
              <StudioInspector
                step={selectedStep}
                onClose={() => {
                  setSelectedStepId(null);
                  setHasSelectedStep(false);
                  setShowStepHelper(true);
                }}
                onChange={handleStepChange}
                onDelete={handleDeleteStep}
                tasks={inspectorTasks}
                onViewTask={handleInspectTask}
                automationVersionId={selectedVersion?.id ?? null}
                displayId={selectedStepDisplayId}
              />
            ) : null}
          </div>
        ) : null}

        {isSwitchingVersion ? (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/85 backdrop-blur-sm">
            <div className="flex items-center gap-3 text-sm font-semibold text-gray-700">
              <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
              Loading version…
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
  const errorBanner = error ? (
    <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
  ) : null;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
      <div className="bg-white border-b border-gray-200 shrink-0">
        <div className="border-b border-gray-100">
          <div className="h-10 flex items-center px-6 text-xs font-medium text-gray-500 gap-1">
            <Link href="/automations" className="hover:text-[#0A0A0A] transition-colors">
              Automations
            </Link>
            <span className="text-gray-300">/</span>
            <span className="text-[#0A0A0A] font-bold">{automation.name}</span>
          </div>
          <div className="h-12 flex items-center justify-between px-6">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Version</span>
              <VersionSelector
                currentVersionId={selectedVersion?.id ?? versionOptions[0]?.id ?? null}
                versions={versionOptions}
                creatingVersion={creatingVersion}
                onChange={handleVersionChange}
                onNewVersion={handleCreateVersion}
              />
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-gray-400 hover:text-[#0A0A0A]"
                onClick={() => {
                  void fetchAutomation();
                }}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
              {(isSwitchingVersion || metricsLoading || recentActivityLoading) && (
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                  <span>Loading version…</span>
                </div>
              )}
              <SaveIndicator
                state={saveState}
                lastSavedAt={lastSavedAt}
                error={saveError}
                onRetry={() => handleSaveWorkflow(undefined, { preserveSelection: true })}
              />
            </div>
            <div className="flex h-full gap-1">
              {AUTOMATION_TABS.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "relative h-full px-4 text-xs font-semibold uppercase tracking-wide transition-colors",
                    activeTab === tab
                      ? "text-[#E43632] bg-red-50/50 border-b-2 border-[#E43632]"
                      : "text-gray-500 hover:text-gray-900 hover:bg-gray-50 border-b-2 border-transparent"
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div
        className={cn(
          "flex-1",
          activeTab === "Workflow" || activeTab === "Chat" ? "flex flex-col overflow-hidden" : "overflow-y-auto"
        )}
      >
        {activeTab === "Workflow" ? (
          <>
            {errorBanner ? <div className="px-6 pt-6">{errorBanner}</div> : null}
            <div className="flex-1 min-h-0">{workflowContent}</div>
          </>
        ) : activeTab === "Chat" ? (
          <div className="flex-1 min-h-0">
            <ChatTab
              automationVersionId={selectedVersion?.id ?? ""}
              automationName={automation.name}
            />
          </div>
        ) : (
          <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
            {errorBanner}
            {activeTab === "Overview" ? (
              overviewContent
            ) : activeTab === "Build Status" ? (
              <BuildStatusTab
                status={selectedVersion?.status}
                latestQuote={selectedVersion?.latestQuote}
                lastUpdated={selectedVersion?.updatedAt ?? null}
                versionLabel={selectedVersion?.versionLabel ?? ""}
                tasks={versionTasks}
                onViewTasks={goToTasksView}
                automationVersionId={selectedVersion?.id}
                onPricingRefresh={() => fetchAutomation({ preserveSelection: true })}
              />
            ) : activeTab === "Activity" ? (
              <ActivityTab
                automationVersionId={selectedVersion?.id ?? ""}
                onNavigateToWorkflow={() => setActiveTab("Workflow")}
              />
            ) : activeTab === "Settings" ? (
              <SettingsTab
                onInviteUser={() => toast({ title: "Invite teammates", description: "Coming soon." })}
                onAddSystem={() => handleMockAction("Add system")}
                onNewVersion={handleCreateVersion}
                onManageCredentials={(system) => handleMockAction(`Manage ${system}`)}
                onNavigateToTab={(tab) => handleMockAction(`Navigate to ${tab}`)}
                onNavigateToSettings={() => handleMockAction("Workspace settings")}
                automationId={automation.id}
                automationName={automation.name}
                automationDescription={automation.description}
                tags={selectedVersion?.tags ?? []}
                automationCreatedAt={automation.createdAt ?? null}
                automationUpdatedAt={selectedVersion?.updatedAt ?? automation.updatedAt ?? null}
                onGeneralSaved={() => fetchAutomation({ preserveSelection: true })}
                currentVersionId={selectedVersion?.id ?? null}
                versions={automation.versions}
                onArchiveVersion={handleArchiveVersion}
                onDeleteVersion={handleDeleteVersion}
                archivingVersionId={archivingVersionId}
                deletingVersionId={deletingVersionId}
              />
            ) : null}
          </div>
        )}
      </div>

      <Dialog open={showManualTimeModal} onOpenChange={setShowManualTimeModal}>
        <DialogContent className="max-w-md bg-white">
          <DialogHeader>
            <DialogTitle>Configure manual effort per run</DialogTitle>
            <DialogDescription>
              This feeds Hours Saved and Est. Cost Savings. We refresh calculations daily once runs are reported.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="manualMinutes">Minutes per run (manual process)</Label>
              <Input
                id="manualMinutes"
                type="number"
                min={0}
                step={1}
                value={metricForm.manualMinutes}
                onChange={(e) => setMetricForm((prev) => ({ ...prev, manualMinutes: e.target.value }))}
              />
              <p className="text-xs text-gray-500">Example: If a human takes 7 minutes to do this task.</p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowManualTimeModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                handleSaveMetricConfig({
                  manualMinutes: Number(metricForm.manualMinutes || 0),
                })
              }
              disabled={savingMetricConfig}
            >
              {savingMetricConfig ? "Saving..." : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showHourlyRateModal} onOpenChange={setShowHourlyRateModal}>
        <DialogContent className="max-w-md bg-white">
          <DialogHeader>
            <DialogTitle>Configure hourly salary</DialogTitle>
            <DialogDescription>
              Used to translate hours saved into estimated cost savings for your team.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="hourlyRate">Hourly salary (USD)</Label>
              <Input
                id="hourlyRate"
                type="number"
                min={0}
                step={1}
                value={metricForm.hourlyRate}
                onChange={(e) => setMetricForm((prev) => ({ ...prev, hourlyRate: e.target.value }))}
              />
              <p className="text-xs text-gray-500">Average hourly fully-loaded cost of the role doing this work.</p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowHourlyRateModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                handleSaveMetricConfig({
                  hourlyRate: Number(metricForm.hourlyRate || 0),
                })
              }
              disabled={savingMetricConfig}
            >
              {savingMetricConfig ? "Saving..." : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {selectedTask ? (
        <TaskDrawer
          task={selectedTask}
          saving={savingTask}
          onClose={() => setSelectedTask(null)}
          onSave={(patch) => handleSaveTask(selectedTask.id, patch)}
        />
      ) : null}

      <Dialog open={showProceedCelebration} onOpenChange={setShowProceedCelebration}>
        <DialogContent className="max-w-sm text-center bg-white">
          <DialogHeader>
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 animate-bounce">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <DialogTitle className="mt-3 text-xl">Submitted for build</DialogTitle>
            <DialogDescription className="text-sm text-gray-600">
              We’re moving your automation to the next step. Sit tight while we get pricing started.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>

      <Dialog open={showPricingModal} onOpenChange={setShowPricingModal}>
        <DialogContent className="max-w-sm text-center bg-white">
          <DialogHeader>
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-blue-600 animate-pulse">
              <Clock className="h-8 w-8" />
            </div>
            <DialogTitle className="mt-3 text-xl">Pricing in progress</DialogTitle>
            <DialogDescription className="text-sm text-gray-600">
              This should only take a couple of minutes. We’ll update the build status as soon as it’s ready.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface AutomationHeaderProps {
  name: string;
  description: string | null;
  versionLabel: string;
  versionStatus?: AutomationLifecycleStatus;
  quoteStatus?: string | null;
  updatedAt: string | null;
  onInviteTeam: () => void;
  onRunTest: () => void;
  onEditWorkflow: () => void;
}

function AutomationHeader({
  name,
  description,
  versionLabel,
  versionStatus,
  quoteStatus,
  updatedAt,
  onInviteTeam,
  onRunTest,
  onEditWorkflow,
}: AutomationHeaderProps) {
  return (
    <section className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
      <div className="space-y-2">
        <div className="flex items-center flex-wrap gap-3">
          <h1 className="text-2xl font-bold text-[#0A0A0A] leading-tight">{name}</h1>
          {versionStatus ? <StatusBadge status={versionStatus} /> : null}
          {quoteStatus ? <StatusBadge status={quoteStatus} /> : null}
        </div>
        <p className="text-gray-500 max-w-2xl leading-relaxed text-sm">
          {description ?? "No description provided yet. Capture the goal of this automation so stakeholders stay aligned."}
        </p>
        <div className="flex items-center gap-4 text-xs text-gray-400 pt-1 flex-wrap">
          <span className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-blue-500" />
            {versionLabel} (Current)
          </span>
          <span className="w-1 h-1 rounded-full bg-gray-300" />
          <span className="flex items-center gap-1.5">
            <Calendar size={12} />
            Last updated {formatDateTime(updatedAt)} by <span className="text-gray-600 font-medium">Wrk Ops</span>
          </span>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0 flex-wrap">
        <Button onClick={onInviteTeam} variant="outline" className="h-9 text-xs font-medium bg-white hover:bg-gray-50 text-gray-700 border-gray-200">
          <Users size={14} className="mr-2" />
          Invite Team
        </Button>
        <Button variant="outline" className="h-9 text-xs font-medium bg-white hover:bg-gray-50 text-gray-700 border-gray-200" onClick={onRunTest}>
          <Play size={14} className="mr-2" />
          Run Test
        </Button>
        <Button
          onClick={onEditWorkflow}
          className="h-9 text-xs font-bold bg-[#0A0A0A] hover:bg-gray-900 text-white shadow-lg shadow-gray-900/10 transition-all hover:-translate-y-0.5"
        >
          <Edit3 size={14} className="mr-2" />
          Edit Workflow
        </Button>
      </div>
    </section>
  );
}

interface OverviewMetricsProps {
  stats: KpiStat[];
  isLoading?: boolean;
  error?: string | null;
}

function OverviewMetrics({ stats, isLoading, error }: OverviewMetricsProps) {
  return (
    <section className="space-y-2">
      {error ? <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">Metrics unavailable right now: {error}</p> : null}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {stats.map((kpi) => (
          <KpiCard key={kpi.label} {...kpi} isLoading={isLoading} />
        ))}
      </div>
    </section>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  trend,
  trendPositive,
  subtext,
  placeholder,
  onConfigure,
  isLoading,
}: KpiStat & { isLoading?: boolean }) {
  const pillClass = placeholder
    ? "text-gray-400 bg-gray-100"
    : trendPositive
      ? "text-emerald-700 bg-emerald-50"
      : "text-amber-700 bg-amber-50";

  return (
    <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-[0_2px_8px_rgba(0,0,0,0.02)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.04)] transition-all group">
      <div className="flex items-start justify-between mb-4 gap-2 min-w-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 bg-gray-50 rounded-lg group-hover:bg-red-50 group-hover:text-[#E43632] transition-colors text-gray-400">
            <Icon size={18} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#0A0A0A] whitespace-nowrap">{label}</p>
            <p className="text-[10px] text-gray-400 mt-0.5 whitespace-nowrap">{subtext}</p>
          </div>
        </div>
        {onConfigure || !placeholder ? (
          <div className="flex items-center gap-1">
            {onConfigure ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-gray-400 hover:text-[#0A0A0A] relative -top-5 translate-x-[10px]"
                onClick={(e) => {
                  e.stopPropagation();
                  onConfigure();
                }}
              >
                <Settings2 size={14} />
              </Button>
            ) : null}
            {!placeholder ? (
              <div className={cn("flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full", pillClass)}>
                {trendPositive ? <ArrowUpRight size={10} /> : <ArrowRight size={10} className="rotate-45" />}
                {trend}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      {placeholder ? (
        <div className="flex flex-col items-center justify-center text-gray-400 gap-2 py-2">
          <div className="h-6 w-6 rounded-full border-2 border-dashed border-gray-300 animate-spin" />
          <p className="text-[11px] font-medium">populates after first live run</p>
        </div>
      ) : (
        <div>
          <h3 className={cn("text-2xl font-bold mb-1 tracking-tight", placeholder ? "text-gray-400" : "text-[#0A0A0A]")}>
            {isLoading ? "Refreshing..." : value}
          </h3>
        </div>
      )}
    </div>
  );
}

interface RecentActivityProps {
  entries: ActivityEntry[];
  onViewAll?: () => void;
  isLoading?: boolean;
  error?: string | null;
}

function RecentActivity({ entries, onViewAll, isLoading, error }: RecentActivityProps) {
  return (
    <Card className="shadow-sm border-gray-100">
      <CardHeader className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-bold text-[#0A0A0A]">
          <History size={16} className="text-gray-400" />
          Recent activity
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-auto p-0 text-xs text-gray-400 hover:text-[#E43632]"
          onClick={onViewAll}
        >
          View all
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-6 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          </div>
        ) : error ? (
          <div className="py-4 text-sm text-red-600">{error}</div>
        ) : entries.length === 0 ? (
          <div className="py-4 text-sm text-gray-500">No activity yet.</div>
        ) : (
          <div className="space-y-8 relative before:absolute before:left-2.5 before:top-2 before:h-full before:w-px before:bg-gray-100">
            {entries.map((entry, index) => (
              <div key={`${entry.title}-${entry.time}-${index}`} className="relative pl-8">
                <div
                  className={cn(
                    "absolute left-0 top-0 w-5 h-5 rounded-full flex items-center justify-center border-2 border-white ring-1 ring-gray-100 shadow-sm",
                    entry.iconBg,
                    entry.iconColor
                  )}
                >
                  <entry.icon size={10} />
                </div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className="text-sm font-bold text-gray-900">{entry.title}</p>
                  <span className="text-[10px] text-gray-400">{entry.time}</span>
                </div>
                <p className="text-xs text-gray-600 leading-relaxed">{entry.description}</p>
                <div className="flex items-center gap-1.5 mt-2">
                  <div className="w-4 h-4 rounded-full bg-gray-200 flex items-center justify-center text-[8px] font-bold text-gray-500">
                    {entry.user.charAt(0)}
                  </div>
                  <span className="text-[10px] text-gray-500 font-medium">{entry.user}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface AutomationTasksTabProps {
  tasks: VersionTask[];
  blockersRemaining?: number;
  onViewStep?: (stepNumber: string) => void;
  onViewTask?: (task: VersionTask) => void;
}

type TaskSectionKey = "blocker" | "important" | "optional";

const TASK_SECTION_CONFIG: Array<{
  key: TaskSectionKey;
  title: string;
  description: string;
  emptyMessage: string;
  accentClass: string;
  icon: typeof AlertTriangle | typeof CheckCircle2 | typeof Clock;
}> = [
  {
    key: "blocker",
    title: "Setup blockers",
    description: "Must be completed before build can start.",
    emptyMessage: "All blocker tasks are complete.",
    accentClass: "border-rose-100 bg-rose-50/40",
    icon: AlertTriangle,
  },
  {
    key: "important",
    title: "Important tasks",
    description: "Recommended before handoff to the build team.",
    emptyMessage: "No open important tasks.",
    accentClass: "border-amber-100 bg-amber-50/30",
    icon: Clock,
  },
  {
    key: "optional",
    title: "Optional tasks",
    description: "Nice-to-have context for the automation.",
    emptyMessage: "No optional tasks yet.",
    accentClass: "border-emerald-100 bg-emerald-50/40",
    icon: CheckCircle2,
  },
];

// Requirements View Component
interface RequirementsViewProps {
  requirementsText: string;
  onRequirementsChange: (text: string) => void;
  onSave: () => void;
  saving: boolean;
  automationVersionId: string | null;
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

function RequirementsView({ requirementsText, onRequirementsChange, onSave, saving, automationVersionId }: RequirementsViewProps) {
  return (
    <div className="flex-1 flex flex-col h-full bg-white overflow-hidden">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Requirements</h2>
            <p className="text-sm text-gray-500">
              Edit in Markdown (single view). Include triggers, steps, systems, and desired outcomes.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Textarea
              value={requirementsText}
              onChange={(e) => onRequirementsChange(e.target.value)}
              placeholder="Describe your workflow in detail. Markdown supported."
              className="min-h-[600px] resize-none font-mono text-sm bg-white"
              disabled={!automationVersionId}
            />
            <div className="min-h-[600px] rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-800 overflow-y-auto">
              <ReactMarkdown remarkPlugins={[remarkGfm]} className="prose prose-sm max-w-none">
                {requirementsText?.trim() || "_No requirements yet._"}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      </div>
      <div className="border-t border-gray-200 bg-gray-50 px-6 py-4 flex items-center justify-end gap-3">
        <Button
          onClick={onSave}
          disabled={saving || !automationVersionId}
          className="bg-gray-900 text-white hover:bg-gray-800"
        >
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Send className="mr-2 h-4 w-4" />
              Save Requirements
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

// Tasks View Canvas Component
interface TasksViewCanvasProps {
  tasks: VersionTask[];
  blockersRemaining: number;
  onViewStep: (stepId: string) => void;
  onViewTask: (task: VersionTask) => void;
  loadState: "loading" | "ready" | "empty" | "error";
  onRetry: () => void;
}

function TasksViewCanvas({ tasks, blockersRemaining, onViewStep, onViewTask, loadState, onRetry }: TasksViewCanvasProps) {
  return (
    <div className="flex-1 flex flex-col h-full bg-white overflow-hidden">
      {loadState === "loading" ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-sm text-gray-600">
            <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
            <span>Loading tasks…</span>
          </div>
        </div>
      ) : loadState === "error" ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3">
            <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto" />
            <p className="text-sm font-semibold text-gray-800">Couldn’t load tasks</p>
            <p className="text-xs text-gray-500">Check your connection and retry.</p>
            <Button size="sm" onClick={onRetry}>
              Retry
            </Button>
          </div>
        </div>
      ) : loadState === "empty" ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-2 max-w-sm">
            <CheckCircle2 className="h-10 w-10 text-gray-300 mx-auto" />
            <p className="text-sm font-semibold text-gray-700">No tasks yet</p>
            <p className="text-xs text-gray-500">
              Tasks will appear here when the workflow needs information or approvals.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto pt-[100px]">
          <div className="w-[90%] mx-auto">
            <AutomationTasksTab
              tasks={tasks}
              blockersRemaining={blockersRemaining}
              onViewStep={onViewStep}
              onViewTask={onViewTask}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function AutomationTasksTab({ tasks, blockersRemaining, onViewStep, onViewTask }: AutomationTasksTabProps) {
  const grouped = useMemo(() => {
    const groups: Record<TaskSectionKey, VersionTask[]> = {
      blocker: [],
      important: [],
      optional: [],
    };
    tasks.forEach((task) => {
      const priority = task.priority ?? "important";
      groups[priority].push(task);
    });
    return groups;
  }, [tasks]);

  const stats = useMemo(() => {
    const pending = tasks.filter((task) => task.status !== "complete").length;
    const blockersPending = grouped.blocker.filter((task) => task.status !== "complete").length;
    return {
      total: tasks.length,
      pending,
      completed: tasks.length - pending,
      blockerTotal: grouped.blocker.length,
      blockersPending,
    };
  }, [grouped.blocker, tasks]);

  const effectiveBlockersPending = blockersRemaining ?? stats.blockersPending;

  return (
    <div className="space-y-6">
      <TaskSummaryCard
        stats={{
          total: stats.total,
          pending: stats.pending,
          completed: stats.completed,
          blockerTotal: stats.blockerTotal,
          blockersPending: effectiveBlockersPending,
        }}
      />
      {TASK_SECTION_CONFIG.map((section) => (
        <TaskGroupCard
          key={section.key}
          title={section.title}
          description={section.description}
          emptyMessage={section.emptyMessage}
          accentClass={section.accentClass}
          icon={section.icon}
          tasks={grouped[section.key]}
          onViewStep={onViewStep}
          onViewTask={onViewTask}
        />
      ))}
    </div>
  );
}

interface TaskSummaryCardProps {
  stats: {
    total: number;
    pending: number;
    completed: number;
    blockerTotal: number;
    blockersPending: number;
  };
}

function TaskSummaryCard({ stats }: TaskSummaryCardProps) {
  const summary = [
    {
      label: "Total tasks",
      value: stats.total,
      caption: "Across this automation",
      icon: ListChecks,
      tone: "text-gray-900",
      iconBg: "bg-gray-100 text-gray-600",
    },
    {
      label: "Blockers remaining",
      value: stats.blockersPending,
      caption: `${stats.blockerTotal} blocker${stats.blockerTotal === 1 ? "" : "s"} total`,
      icon: AlertTriangle,
      tone: stats.blockersPending > 0 ? "text-amber-700" : "text-emerald-700",
      iconBg: stats.blockersPending > 0 ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600",
    },
    {
      label: "In progress",
      value: stats.pending,
      caption: "Pending or in review",
      icon: Clock,
      tone: "text-blue-700",
      iconBg: "bg-blue-50 text-blue-600",
    },
    {
      label: "Completed",
      value: stats.completed,
      caption: "Ready for build",
      icon: CheckCircle2,
      tone: "text-emerald-700",
      iconBg: "bg-emerald-50 text-emerald-600",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-4">
      {summary.map((item) => (
        <div key={item.label} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", item.iconBg)}>
              <item.icon size={18} />
            </div>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{item.label}</span>
          </div>
          <div className={cn("text-2xl font-bold leading-tight", item.tone)}>{item.value}</div>
          <p className="text-[11px] text-gray-400 mt-1">{item.caption}</p>
        </div>
      ))}
    </div>
  );
}

interface TaskGroupCardProps {
  title: string;
  description: string;
  emptyMessage: string;
  accentClass: string;
  icon: typeof AlertTriangle | typeof CheckCircle2 | typeof Clock;
  tasks: VersionTask[];
  onViewStep?: (stepNumber: string) => void;
  onViewTask?: (task: VersionTask) => void;
}

function TaskGroupCard({
  title,
  description,
  emptyMessage,
  accentClass,
  icon: Icon,
  tasks,
  onViewStep,
  onViewTask,
}: TaskGroupCardProps) {
  return (
    <div className={cn("rounded-2xl border p-6 space-y-4", accentClass)}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Icon size={16} className="text-gray-500" />
            <h3 className="text-sm font-bold text-[#0A0A0A] uppercase tracking-wide">{title}</h3>
          </div>
          <p className="text-xs text-gray-500 mt-1">{description}</p>
        </div>
        <Badge variant="secondary" className="text-[10px] bg-white text-gray-600 border-gray-200">
          {tasks.length} task{tasks.length === 1 ? "" : "s"}
        </Badge>
      </div>
      {tasks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-white/60 p-4 text-xs text-gray-500">
          {emptyMessage}
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => (
            <TaskListItem key={task.id} task={task} onViewStep={onViewStep} onViewTask={onViewTask} />
          ))}
        </div>
      )}
    </div>
  );
}

interface TaskListItemProps {
  task: VersionTask;
  onViewStep?: (stepNumber: string) => void;
  onViewTask?: (task: VersionTask) => void;
}

function TaskListItem({ task, onViewStep, onViewTask }: TaskListItemProps) {
  const statusLabel = formatTaskStatus(task.status);
  const statusClasses = getStatusBadgeClasses(task.status);
  const priorityClasses = getPriorityBadgeClasses(task.priority ?? "important");
  const relatedSteps = Array.isArray(task.metadata?.relatedSteps) ? task.metadata?.relatedSteps ?? [] : [];

  return (
    <div
      className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm hover:border-gray-300 cursor-pointer transition-colors"
      onClick={() => onViewTask?.(task)}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[#0A0A0A] leading-tight">{task.title}</p>
          {task.description ? <p className="text-xs text-gray-500 mt-1 leading-relaxed">{task.description}</p> : null}
        </div>
        <Badge className={cn("text-[10px] font-semibold", statusClasses)}>{statusLabel}</Badge>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Badge className={cn("text-[10px] font-semibold", priorityClasses)}>
          {task.priority === "blocker" ? "Blocker" : task.priority === "optional" ? "Optional" : "Important"}
        </Badge>
        {task.metadata?.systemType ? (
          <Badge variant="outline" className="text-[10px] font-semibold border-gray-200 text-gray-500 capitalize">
            {task.metadata.systemType}
          </Badge>
        ) : null}
      </div>
      {relatedSteps.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {relatedSteps.map((stepNumber) => (
            <button
              key={`${task.id}-${stepNumber}`}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onViewStep?.(stepNumber);
              }}
              className="px-2 py-1 text-[11px] font-semibold rounded-full border border-gray-200 text-gray-600 hover:border-[#E43632] hover:text-[#E43632]"
            >
              Step {stepNumber}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function formatTaskStatus(status: VersionTask["status"]) {
  switch (status) {
    case "complete":
      return "Complete";
    case "in_progress":
      return "In Progress";
    default:
      return "Pending";
  }
}

function getStatusBadgeClasses(status: VersionTask["status"]) {
  switch (status) {
    case "complete":
      return "bg-emerald-50 text-emerald-700 border border-emerald-100";
    case "in_progress":
      return "bg-blue-50 text-blue-700 border border-blue-100";
    default:
      return "bg-amber-50 text-amber-700 border border-amber-100";
  }
}


function getPriorityBadgeClasses(priority: NonNullable<VersionTask["priority"]>) {
  switch (priority) {
    case "blocker":
      return "bg-red-50 text-red-700 border border-red-100";
    case "optional":
      return "bg-gray-50 text-gray-500 border border-gray-100";
    default:
      return "bg-slate-50 text-slate-700 border border-slate-100";
  }
}


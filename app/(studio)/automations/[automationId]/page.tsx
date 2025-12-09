"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  Loader2,
  RefreshCw,
  Send,
  StickyNote,
  Plus,
  Users,
  Play,
  Edit3,
  Sparkles,
  AlertTriangle,
  Calendar,
  Clock,
  DollarSign,
  Zap,
  CheckCircle2,
  ArrowUpRight,
  ArrowRight,
  History,
  ListChecks,
  Lightbulb,
  FileText,
  GitBranch,
  CheckSquare,
} from "lucide-react";
import type { Connection, Node, Edge, EdgeChange, NodeChange } from "reactflow";
import { StudioChat } from "@/components/automations/StudioChat";
import { StudioInspector } from "@/components/automations/StudioInspector";
import { ActivityTab } from "@/components/automations/ActivityTab";
import { BuildStatusTab } from "@/components/automations/BuildStatusTab";
import { SettingsTab } from "@/components/automations/SettingsTab";
import { createEmptyBlueprint } from "@/lib/blueprint/factory";
import type { Blueprint, BlueprintSectionKey, BlueprintStep } from "@/lib/blueprint/types";
import { BLUEPRINT_SECTION_TITLES } from "@/lib/blueprint/types";
import { getBlueprintCompletionState } from "@/lib/blueprint/completion";
import { isBlueprintEffectivelyEmpty } from "@/lib/blueprint/utils";
import { blueprintToNodes, blueprintToEdges, addConnection, removeConnection, reconnectEdge } from "@/lib/blueprint/canvas-utils";
import { applyBlueprintUpdates, type BlueprintUpdates as CopilotBlueprintUpdates } from "@/lib/blueprint/ai-updates";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { AutomationLifecycleStatus } from "@/lib/automations/status";
import { AUTOMATION_TABS, type AutomationTab } from "@/lib/automations/tabs";
import { VersionSelector, type VersionOption } from "@/components/ui/VersionSelector";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { BUILD_STATUS_ORDER, type BuildStatus } from "@/lib/build-status/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";

const StudioCanvas = dynamic(
  () => import("@/components/automations/StudioCanvas").then((mod) => ({ default: mod.StudioCanvas })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center bg-gray-50">
        <span className="text-sm text-gray-500">Loading canvas…</span>
      </div>
    ),
  }
);

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

type SuggestionStreamEvent =
  | { status: "thinking" }
  | { status: "message"; content: string }
  | {
      status: "complete";
      payload: {
        telemetry?: {
          sanitizationSummary?: SanitizationSummaryPayload;
        };
      };
    }
  | { status: "error"; message?: string };

function formatSanitizationSummary(summary?: SanitizationSummaryPayload | null): string {
  if (!summary) {
    return "Blueprint updated.";
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
  return parts.length > 0 ? `Blueprint updated (${parts.join(", ")}).` : "Blueprint updated.";
}

type AutomationVersion = {
  id: string;
  versionLabel: string;
  status: AutomationLifecycleStatus;
  intakeNotes: string | null;
  requirementsText: string | null;
  workflowJson: Blueprint | null;
  summary: string | null;
  latestQuote: QuoteSummary | null;
  createdAt: string;
  updatedAt: string;
  tasks?: VersionTask[];
};

type AutomationDetail = {
  id: string;
  name: string;
  description: string | null;
  versions: AutomationVersion[];
};

type VersionTask = {
  id: string;
  title: string;
  description: string | null;
  status: "pending" | "in_progress" | "complete";
  priority: "blocker" | "important" | "optional";
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

interface AutomationDetailPageProps {
  params: {
    automationId: string;
  };
}

const currency = (value?: string | null) => {
  if (!value) return "—";
  const parsed = Number(value);
  return Number.isNaN(parsed) ? value : `$${parsed.toLocaleString()}`;
};

const perUnit = (value?: string | null) => {
  if (!value) return "—";
  const parsed = Number(value);
  return Number.isNaN(parsed) ? value : `$${parsed.toFixed(4)}`;
};

const formatDateTime = (value?: string | null) => {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  } catch {
    return value;
  }
};


type BlueprintChecklistItem = {
  id: string;
  label: string;
  sectionKey: BlueprintSectionKey | null;
  completed: boolean;
};

const cloneBlueprint = (blueprint: Blueprint | null) => (blueprint ? (JSON.parse(JSON.stringify(blueprint)) as Blueprint) : null);

type KpiStatConfig = {
  label: string;
  subtext: string;
  icon: typeof Clock;
};

type KpiStat = KpiStatConfig & {
  value: string;
  trend: string;
  trendPositive: boolean;
};

const KPI_CONFIG: KpiStatConfig[] = [
  { label: "Hours Saved", subtext: "vs last month", icon: Clock },
  { label: "Est. Cost Savings", subtext: "vs last month", icon: DollarSign },
  { label: "Total Executions", subtext: "last 30 days", icon: Zap },
  { label: "Success Rate", subtext: "last 30 days", icon: CheckCircle2 },
];

const computeSeed = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

const isAtOrBeyondBuild = (status: AutomationLifecycleStatus | null, target: BuildStatus): boolean => {
  if (!status) {
    return false;
  }
  const targetIndex = BUILD_STATUS_ORDER.indexOf(target);
  const statusIndex = BUILD_STATUS_ORDER.indexOf(status as BuildStatus);
  if (statusIndex === -1) {
    return status === "Archived";
  }
  return statusIndex >= targetIndex;
};

const getKpiStats = (automationId: string): KpiStat[] => {
  const seed = computeSeed(automationId || "automation");
  return KPI_CONFIG.map((config, index) => {
    const delta = ((seed + index * 7) % 15) + 1;
    const trendPositive = index !== 3 || delta < 8;
    const formattedTrend = `${trendPositive ? "+" : "-"}${delta}%`;

    let value = "—";
    if (config.label === "Hours Saved") {
      value = `${140 + (seed % 60)}h`;
    } else if (config.label === "Est. Cost Savings") {
      value = `$${(4000 + (seed % 2500)).toLocaleString()}`;
    } else if (config.label === "Total Executions") {
      value = `${1_000 + (seed % 600)}`;
    } else {
      value = `${(97 + (seed % 3) / 10).toFixed(1)}%`;
    }

    return {
      ...config,
      value,
      trend: formattedTrend,
      trendPositive,
    };
  });
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

const MOCK_ACTIVITY_ENTRIES: ActivityEntry[] = [
  {
    title: "Logic updated",
    user: "Mo",
    time: "2 hours ago",
    description: "Changed approval threshold from $5k to $10k.",
    icon: Edit3,
    iconBg: "bg-blue-50",
    iconColor: "text-blue-500",
  },
  {
    title: "Execution warning",
    user: "System",
    time: "5 hours ago",
    description: "PDF extraction confidence was low (45%) for Invoice #9921.",
    icon: AlertTriangle,
    iconBg: "bg-amber-50",
    iconColor: "text-amber-500",
  },
  {
    title: "Manual run",
    user: "Sarah (Finance)",
    time: "1 day ago",
    description: "Triggered manual reconciliation for Q3 expenses.",
    icon: Play,
    iconBg: "bg-emerald-50",
    iconColor: "text-emerald-500",
  },
];

const MOCK_ATTENTION_ITEMS = [
  {
    id: "credentials",
    title: "Missing credentials",
    description: "The Salesforce connector needs re-authentication.",
    actionLabel: "Fix credentials",
  },
  {
    id: "exceptions",
    title: "Unhandled exception",
    description: "Exception branch not defined for >$25k invoices.",
    actionLabel: "Add exception",
  },
];

const MOCK_SUGGESTIONS = [
  { title: "Add error handling", description: "Add a fallback branch if Xero is down." },
  { title: "Optimize trigger", description: "Filter emails by subject contains 'Invoice' to reduce noise." },
];
// TODO: replace KPI, activity, attention, and suggestion mock data with real analytics + audit feeds.

export default function AutomationDetailPage({ params }: AutomationDetailPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const [automation, setAutomation] = useState<AutomationDetail | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [blueprint, setBlueprint] = useState<Blueprint | null>(null);
  const [versionTasks, setVersionTasks] = useState<VersionTask[]>([]);
  const [blueprintError, setBlueprintError] = useState<string | null>(null);
  const [isBlueprintDirty, setBlueprintDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingNotes, setSavingNotes] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [creatingVersion, setCreatingVersion] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Read tab from URL params, default to "Overview"
  const urlTab = searchParams?.get("tab");
  const initialTab = (urlTab && AUTOMATION_TABS.includes(urlTab as AutomationTab)) 
    ? (urlTab as AutomationTab) 
    : "Overview";
  const [activeTab, setActiveTab] = useState<AutomationTab>(initialTab);
  const [canvasViewMode, setCanvasViewMode] = useState<"requirements" | "flowchart" | "tasks">("flowchart");
  const [requirementsText, setRequirementsText] = useState("");
  const [savingRequirements, setSavingRequirements] = useState(false);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const previousRequirementsRef = useRef<string>("");
  const [injectedChatMessage, setInjectedChatMessage] = useState<CopilotMessage | null>(null);
  const [selectedTask, setSelectedTask] = useState<VersionTask | null>(null);
  const [savingTask, setSavingTask] = useState(false);
  
  // Sync activeTab with URL params when they change
  useEffect(() => {
    const tabFromUrl = searchParams?.get("tab");
    if (tabFromUrl && AUTOMATION_TABS.includes(tabFromUrl as AutomationTab)) {
      setActiveTab(tabFromUrl as AutomationTab);
    }
  }, [searchParams]);
  const [hasSelectedStep, setHasSelectedStep] = useState(false);
  const [showStepHelper, setShowStepHelper] = useState(false);
  const [proceedingToBuild, setProceedingToBuild] = useState(false);
  const [isSynthesizingBlueprint, setIsSynthesizingBlueprint] = useState(false);
  const [isOptimizingFlow, setIsOptimizingFlow] = useState(false);
  const [isRequestingSuggestions, setIsRequestingSuggestions] = useState(false);
  const [suggestionStatus, setSuggestionStatus] = useState<string | null>(null);
  const completionRef = useRef<ReturnType<typeof getBlueprintCompletionState> | null>(null);
  const preserveSelectionRef = useRef(false);
  const synthesisTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const confirmDiscardBlueprintChanges = useCallback(() => {
    if (!isBlueprintDirty) {
      return true;
    }
    return window.confirm("You have unsaved blueprint changes. Discard them?");
  }, [isBlueprintDirty]);

  useEffect(() => {
    if (!isBlueprintDirty) {
      return undefined;
    }
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isBlueprintDirty]);

  const fetchAutomation = useCallback(
    async (options?: { preserveSelection?: boolean }) => {
      const shouldPreserveSelection = Boolean(options?.preserveSelection);
      preserveSelectionRef.current = shouldPreserveSelection;
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/automations/${params.automationId}`, { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Unable to load automation");
        }

        const data = (await response.json()) as { automation: AutomationDetail };
        setAutomation(data.automation);

        const nextSelected = selectedVersionId ?? data.automation.versions[0]?.id ?? null;
        setSelectedVersionId(nextSelected);
        const version = data.automation.versions.find((v) => v.id === nextSelected);
        setNotes(version?.intakeNotes ?? "");
        const blueprint = version?.workflowJson ? cloneBlueprint(version.workflowJson) : createEmptyBlueprint();
        setBlueprint(blueprint);
        setBlueprintError(null);
        setBlueprintDirty(false);
        if (!shouldPreserveSelection) {
          setSelectedStepId(null);
          setHasSelectedStep(false);
          setShowStepHelper(false);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unexpected error");
      } finally {
        setLoading(false);
      }
    },
    [params.automationId, selectedVersionId]
  );


  useEffect(() => {
    fetchAutomation();
  }, [fetchAutomation]);

  const selectedVersion = useMemo(() => {
    if (!automation || !selectedVersionId) {
      return automation?.versions[0] ?? null;
    }
    return automation.versions.find((version) => version.id === selectedVersionId) ?? automation.versions[0] ?? null;
  }, [automation, selectedVersionId]);


  useEffect(() => {
    if (selectedVersion) {
      setNotes(selectedVersion.intakeNotes ?? "");
      const nextBlueprint = selectedVersion.workflowJson ? cloneBlueprint(selectedVersion.workflowJson) : createEmptyBlueprint();
      const safeBlueprint = nextBlueprint ?? createEmptyBlueprint();
      setBlueprint(safeBlueprint);
      setBlueprintError(null);
      setBlueprintDirty(false);

      const shouldPreserveSelection = preserveSelectionRef.current;
      if (shouldPreserveSelection) {
        preserveSelectionRef.current = false;
        if (selectedStepId) {
          const exists = safeBlueprint.steps.some((step) => step.id === selectedStepId);
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
    setVersionTasks(selectedVersion?.tasks ?? []);
    setRequirementsText(selectedVersion?.requirementsText ?? "");
    previousRequirementsRef.current = selectedVersion?.requirementsText ?? "";
  }, [selectedVersion?.id, selectedVersion?.tasks, selectedVersion?.requirementsText]);

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

  const blockersRemaining = useMemo(
    () => taskGroups.blocker.filter((task) => task.status !== "complete").length,
    [taskGroups.blocker]
  );


  const handleVersionChange = (versionId: string) => {
    if (!confirmDiscardBlueprintChanges()) {
      return;
    }
    setSelectedVersionId(versionId);
    const version = automation?.versions.find((v) => v.id === versionId);
    setNotes(version?.intakeNotes ?? "");
    const nextBlueprint = version?.workflowJson ? cloneBlueprint(version.workflowJson) : createEmptyBlueprint();
    setBlueprint(nextBlueprint ?? createEmptyBlueprint());
    setBlueprintDirty(false);
    setBlueprintError(null);
    setSelectedStepId(null);
    setHasSelectedStep(false);
    setShowStepHelper(false);
  };

  const handleSaveNotes = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedVersion) return;
    setSavingNotes(true);
    setError(null);
    try {
      const response = await fetch(`/api/automation-versions/${selectedVersion.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intakeNotes: notes }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to save notes");
      }
      await fetchAutomation();
      toast({ title: "Notes saved", description: "Intake notes updated.", variant: "success" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to save notes";
      setError(message);
      toast({ title: "Unable to save notes", description: message, variant: "error" });
    } finally {
      setSavingNotes(false);
    }
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

  const handleSaveBlueprint = useCallback(
    async (overrides?: Partial<Blueprint>, options?: { preserveSelection?: boolean }) => {
      if (!selectedVersion || !blueprint) {
        setBlueprintError("Blueprint is not available yet.");
        return;
      }
      const payload = { ...blueprint, ...overrides, updatedAt: new Date().toISOString() };
      console.log("💾 Saving blueprint:", {
        versionId: selectedVersion.id,
        stepCount: payload.steps.length,
      });
      setBlueprintError(null);
      try {
        const response = await fetch(`/api/automation-versions/${selectedVersion.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workflowJson: payload }),
        });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error ?? "Failed to save blueprint");
        }
        const cloned = cloneBlueprint(payload);
        setBlueprint(cloned);
        setBlueprintDirty(false);
        await fetchAutomation({ preserveSelection: options?.preserveSelection });
        toast({ title: "Blueprint saved", description: "Metadata updated successfully.", variant: "success" });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unable to save blueprint";
        setBlueprintError(message);
        toast({ title: "Unable to save blueprint", description: message, variant: "error" });
      } finally {
      }
    },
    [blueprint, fetchAutomation, selectedVersion, toast]
  );

  const handleSendForPricing = async () => {
    if (!selectedVersion) return;
    setTransitioning(true);
    setError(null);
    try {
      const response = await fetch(`/api/automation-versions/${selectedVersion.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "NeedsPricing" }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to update status");
      }
      await fetchAutomation();
      toast({ title: "Sent for pricing", description: "Version moved to Needs Pricing.", variant: "success" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to send for pricing";
      setError(message);
      toast({ title: "Unable to send for pricing", description: message, variant: "error" });
    } finally {
      setTransitioning(false);
    }
  };

  const refreshAutomationPreservingSelection = useCallback(async () => {
    await fetchAutomation({ preserveSelection: true });
  }, [fetchAutomation]);

  const handleCreateVersion = async (copyFromVersionId?: string | null) => {
    // Handle case where event object might be passed instead of version ID
    const versionId = typeof copyFromVersionId === "string" ? copyFromVersionId : null;
    
    setCreatingVersion(true);
    setError(null);
    try {
      const response = await fetch(`/api/automations/${params.automationId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: selectedVersion?.summary ?? "",
          intakeNotes: versionId ? selectedVersion?.intakeNotes ?? notes : notes,
          copyFromVersionId: versionId,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "Unable to create version");
      }
      await fetchAutomation();
      toast({
        title: "New version created",
        description: versionId ? "A new version copied from the current version is ready." : "A draft version is ready.",
        variant: "success",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to create version";
      setError(message);
      toast({ title: "Unable to create version", description: message, variant: "error" });
    } finally {
      setCreatingVersion(false);
    }
  };

  const applyBlueprintUpdate = useCallback(
    (updater: (current: Blueprint) => Blueprint) => {
      let didUpdate = false;
      setBlueprint((current) => {
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
        setBlueprintDirty(true);
        setBlueprintError(null);
      }
    },
    [setBlueprintDirty, setBlueprintError]
  );

  const handleBlueprintAIUpdates = useCallback(
    (updates: CopilotBlueprintUpdates) => {
      setIsSynthesizingBlueprint(true);
      if (synthesisTimeoutRef.current) {
        clearTimeout(synthesisTimeoutRef.current);
      }
      synthesisTimeoutRef.current = setTimeout(() => {
        setIsSynthesizingBlueprint(false);
      }, 1500);
      applyBlueprintUpdate((current) => applyBlueprintUpdates(current, updates));
    },
    [applyBlueprintUpdate]
  );

  useEffect(() => {
    return () => {
      if (synthesisTimeoutRef.current) {
        clearTimeout(synthesisTimeoutRef.current);
      }
    };
  }, []);

  const handleStepChange = useCallback(
    (stepId: string, patch: Partial<BlueprintStep>) => {
      applyBlueprintUpdate((current) => ({
        ...current,
        steps: current.steps.map((step) => (step.id === stepId ? { ...step, ...patch } : step)),
      }));
    },
    [applyBlueprintUpdate]
  );

  const handleDeleteStep = useCallback(
    (stepId: string) => {
      applyBlueprintUpdate((current) => ({
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
    [applyBlueprintUpdate, selectedStepId]
  );

  const handleConnectNodes = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target || connection.source === connection.target) {
        return;
      }
      applyBlueprintUpdate((current) => addConnection(current, connection));
    },
    [applyBlueprintUpdate]
  );

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      // Handle node position changes
      const positionChanges = changes.filter(
        (change) => change.type === "position" && change.position
      ) as Array<NodeChange & { type: "position"; position: { x: number; y: number } }>;
      
      if (positionChanges.length > 0) {
        applyBlueprintUpdate((current) => {
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
        applyBlueprintUpdate((current) => {
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
    [applyBlueprintUpdate]
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const removeChanges = changes.filter((change) => change.type === "remove");
      if (removeChanges.length === 0) {
        return;
      }
      applyBlueprintUpdate((current) => {
        let updated = current;
        for (const change of removeChanges) {
          updated = removeConnection(updated, change.id);
        }
        return updated;
      });
    },
    [applyBlueprintUpdate]
  );

  const handleEdgeUpdate = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      if (!oldEdge.id || !newConnection.source || !newConnection.target) {
        return;
      }
      applyBlueprintUpdate((current) => reconnectEdge(current, oldEdge.id, newConnection));
    },
    [applyBlueprintUpdate]
  );

  const handleNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    setSelectedStepId(node.id);
    setHasSelectedStep(true);
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

  const handleSuggestNextSteps = useCallback(async () => {
    if (!selectedVersion?.id) {
      toast({ title: "Select a version", description: "Choose a version before requesting suggestions.", variant: "error" });
      return;
    }
    setIsRequestingSuggestions(true);
    setIsSynthesizingBlueprint(true);
    setSuggestionStatus("Evaluating blueprint…");
    const decoder = new TextDecoder();
    let telemetrySummary: SanitizationSummaryPayload | null = null;

    try {
      const response = await fetch(`/api/automation-versions/${selectedVersion.id}/copilot/suggest-next-steps`, {
        method: "POST",
      });
      if (!response.ok || !response.body) {
        const data = await response.text().catch(() => "");
        throw new Error(data || "Unable to suggest next steps.");
      }

      const reader = response.body.getReader();
      let buffer = "";
      let completed = false;

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        let boundary: number;
        while ((boundary = buffer.indexOf("\n\n")) !== -1) {
          const chunk = buffer.slice(0, boundary).trim();
          buffer = buffer.slice(boundary + 2);
          if (!chunk.startsWith("data:")) {
            continue;
          }
          const event = JSON.parse(chunk.slice(5)) as SuggestionStreamEvent;
          if (event.status === "thinking") {
            setSuggestionStatus("Evaluating blueprint…");
          } else if (event.status === "message") {
            setSuggestionStatus(event.content);
          } else if (event.status === "complete") {
            telemetrySummary = event.payload.telemetry?.sanitizationSummary ?? null;
            completed = true;
            break;
          } else if (event.status === "error") {
            throw new Error(event.message ?? "Unable to suggest next steps.");
          }
        }
        if (completed) {
          break;
        }
      }

      await refreshAutomationPreservingSelection();
      toast({
        title: "Suggestions added",
        description: formatSanitizationSummary(telemetrySummary),
        variant: "success",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to suggest next steps.";
      toast({ title: "Unable to suggest next steps", description: message, variant: "error" });
    } finally {
      setSuggestionStatus(null);
      setIsRequestingSuggestions(false);
      setIsSynthesizingBlueprint(false);
    }
  }, [refreshAutomationPreservingSelection, selectedVersion?.id, toast]);

  const handleViewTaskStep = useCallback(
    (stepNumber: string) => {
      if (!blueprint || !stepNumber) {
        return;
      }
      const normalized = stepNumber.trim();
      const target = blueprint.steps.find((stepEntry) => stepEntry.stepNumber === normalized);
      if (!target) {
        return;
      }
      setActiveTab("Workflow");
      setSelectedStepId(target.id);
      setHasSelectedStep(true);
      setShowStepHelper(false);
    },
    [blueprint]
  );

  const handleViewTask = useCallback((task: VersionTask) => {
    setSelectedTask(task);
  }, []);

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

  const completion = useMemo(() => getBlueprintCompletionState(blueprint), [blueprint]);
  const taskLookup = useMemo(() => {
    const map = new Map<string, VersionTask>();
    versionTasks.forEach((task) => map.set(task.id, task));
    return map;
  }, [versionTasks]);

  const flowNodes = useMemo<Node[]>(() => blueprintToNodes(blueprint, taskLookup), [blueprint, taskLookup]);
  
  const handleEdgeDelete = useCallback(
    (edgeId: string) => {
      applyBlueprintUpdate((current) => removeConnection(current, edgeId));
    },
    [applyBlueprintUpdate]
  );

  const flowEdges = useMemo<Edge[]>(() => {
    const edges = blueprintToEdges(blueprint);
    // Add onDelete handler to all edges
    return edges.map((edge) => ({
      ...edge,
      data: {
        ...edge.data,
        onDelete: handleEdgeDelete,
      },
    }));
  }, [blueprint, handleEdgeDelete]);

  // Debug logging (commented out to reduce console noise)
  // useEffect(() => {
  //   console.log("🎨 Blueprint updated:", {
  //     stepCount: blueprint?.steps?.length ?? 0,
  //     steps: blueprint?.steps?.map((step) => step.name),
  //     nodeCount: flowNodes.length,
  //     edgeCount: flowEdges.length,
  //   });
  // }, [blueprint, flowNodes, flowEdges]);
  const selectedStep = useMemo(
    () => (blueprint ? blueprint.steps.find((step) => step.id === selectedStepId) ?? null : null),
    [blueprint, selectedStepId]
  );
  const blueprintIsEmpty = useMemo(() => isBlueprintEffectivelyEmpty(blueprint), [blueprint]);
  const summaryComplete = completion.summaryComplete;

  // Simple checkmark-based checklist - only show the 4 required items
  const REQUIRED_CHECKLIST_ITEMS = [
    { id: "business_requirements", label: "Business Requirements", sectionKey: "business_requirements" as BlueprintSectionKey },
    { id: "business_objectives", label: "Business Objectives", sectionKey: "business_objectives" as BlueprintSectionKey },
    { id: "success_criteria", label: "Success Criteria", sectionKey: "success_criteria" as BlueprintSectionKey },
    { id: "systems", label: "Systems", sectionKey: "systems" as BlueprintSectionKey },
  ] as const;

  const checklistItems = useMemo<BlueprintChecklistItem[]>(() => {
    return REQUIRED_CHECKLIST_ITEMS.map((item) => {
      // Check if section exists and has content
      const hasContent = item.sectionKey && blueprint?.sections?.some(
        (s) => s.key === item.sectionKey && s.content?.trim().length > 0
      );
      
      return {
        id: item.id,
        label: item.label,
        sectionKey: item.sectionKey,
        completed: hasContent ?? false,
      };
    });
  }, [blueprint]);
  // Check if all 4 required items are completed
  const requiredItemsComplete = useMemo(() => {
    return checklistItems.every((item) => item.completed);
  }, [checklistItems]);

  const readyForBuild = requiredItemsComplete;
  const alreadyInBuild = isAtOrBeyondBuild(selectedVersion?.status ?? null, "BuildInProgress");
  const pendingBlockerCopy =
    blockersRemaining === 1
      ? "Cannot start build - 1 setup task remaining"
      : `Cannot start build - ${blockersRemaining} setup tasks remaining`;
  const proceedDisabledReason = blockersRemaining > 0
    ? pendingBlockerCopy
    : !readyForBuild
    ? "We need a little bit more information before we have enough information to build this automation."
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
    try {
      const response = await fetch(`/api/automation-versions/${selectedVersion.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "BuildInProgress" }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error ?? "Unable to update status");
      }
      toast({
        title: "Proceeding to build",
        description: "Status updated to Build in Progress.",
        variant: "success",
      });
      await fetchAutomation({ preserveSelection: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Proceed request failed";
      toast({ title: "Unable to proceed", description: message, variant: "error" });
    } finally {
      setProceedingToBuild(false);
    }
  }, [selectedVersion?.id, proceedButtonDisabled, alreadyInBuild, fetchAutomation, toast]);
  useEffect(() => {
    if (!blueprint) {
      return;
    }
    const prev = completionRef.current;
    if (prev) {
      completion.sections.forEach((section) => {
        const prevSection = prev.sections.find((entry) => entry.key === section.key);
        if (prevSection && !prevSection.complete && section.complete) {
          toast({
            title: `${BLUEPRINT_SECTION_TITLES[section.key]} captured`,
            description: "Great progress—keep refining the rest of the blueprint.",
            variant: "success",
          });
        }
      });
    }
    completionRef.current = completion;
  }, [blueprint, completion, toast]);

  useEffect(() => {
    if (blueprint && blueprint.steps.length > 0 && !hasSelectedStep) {
      setShowStepHelper(true);
    }
  }, [blueprint, hasSelectedStep]);

  // Auto-save blueprint with 2-second debounce
  useEffect(() => {
    if (!isBlueprintDirty || !blueprint) {
      return undefined;
    }

    const timeoutId = setTimeout(() => {
      handleSaveBlueprint(undefined, { preserveSelection: true });
    }, 2000);

    return () => clearTimeout(timeoutId);
  }, [blueprint, isBlueprintDirty, handleSaveBlueprint]);

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
  const showSendForPricing =
    selectedVersion &&
    (selectedVersion.status === "IntakeInProgress" || selectedVersion.status === "NeedsPricing") &&
    !latestQuote;
  const awaitingApproval = latestQuote?.status === "SENT";
  const buildUnderway =
    latestQuote?.status === "SIGNED" && selectedVersion?.status === "BuildInProgress";
  const versionOptions: VersionOption[] = automation.versions.map((version) => ({
    id: version.id,
    label: version.versionLabel,
    status: version.id === selectedVersion?.id ? "active" : version.status === "IntakeInProgress" ? "draft" : "superseded",
    updated: formatDateTime(version.updatedAt),
  }));
  const kpiStats = getKpiStats(automation.id);
  const activityEntries = MOCK_ACTIVITY_ENTRIES.map((entry, index) =>
    index === 0
      ? {
          ...entry,
          description: `Changed approval thresholds for ${automation.name}.`,
        }
      : entry
  );

  const handleInviteTeam = () => {
    toast({
      title: "Invite teammates coming soon",
      description: "Connect this action to workspace invitations once backend hooks are live.",
    });
  };

  const handleRunTest = () => {
    toast({
      title: "Test run queued",
      description: "Blueprint test harness wiring is on the roadmap.",
      variant: "success",
    });
  };

  const handleMockAction = (label: string) => {
    toast({
      title: label,
      description: "TODO: connect this action to the admin workflow.",
    });
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
        onEditBlueprint={() => setActiveTab("Workflow")}
      />

      <OverviewMetrics stats={kpiStats} />

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <StatusStepper
            selectedVersion={selectedVersion}
            latestQuote={latestQuote}
            showSendForPricing={Boolean(showSendForPricing)}
            awaitingApproval={awaitingApproval}
            buildUnderway={buildUnderway}
            onSendForPricing={handleSendForPricing}
            transitioning={transitioning}
          />
          <RecentActivity entries={activityEntries} onViewAll={() => handleMockAction("View all activity")} />
        </div>

        <div className="space-y-6">
          <Card className="shadow-sm border-gray-100">
            <CardHeader>
              <CardTitle>Version history</CardTitle>
              <CardDescription>Select a version to inspect or update.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {automation.versions.map((version) => {
                  const isActive = version.id === selectedVersion?.id;
                  return (
                    <button
                      key={version.id}
                      type="button"
                      onClick={() => handleVersionChange(version.id)}
                      className={cn(
                        "w-full text-left rounded-lg border bg-white p-4 shadow-sm transition-colors",
                        isActive
                          ? "border-rose-200 bg-rose-50/40"
                          : "border-gray-100 hover:border-gray-200 hover:bg-gray-50/60"
                      )}
                    >
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] px-2 py-0.5 font-mono",
                              isActive ? "bg-white text-[#E43632] border-rose-200" : "bg-gray-50 text-gray-600 border-gray-200"
                            )}
                          >
                            {version.versionLabel}
                          </Badge>
                          <span className="text-[11px] text-gray-400">{formatDateTime(version.updatedAt)}</span>
                        </div>
                        <StatusBadge status={version.status} />
                      </div>
                      <p className="text-xs text-gray-500 line-clamp-3">
                        {version.intakeNotes ? version.intakeNotes.slice(0, 160) : "No notes yet."}
                      </p>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <NeedsAttentionCard items={MOCK_ATTENTION_ITEMS} onAction={handleMockAction} />
          <CopilotSuggestions
            suggestions={MOCK_SUGGESTIONS}
            onSelectSuggestion={(title) => handleMockAction(title)}
            onAskForMore={() => handleMockAction("Ask Copilot")}
          />
        </div>
      </section>

      <Card className="shadow-sm border-gray-100">
        <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Tasks / Intake</CardTitle>
            <CardDescription>Capture notes for this version.</CardDescription>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <Badge variant="secondary" className="bg-gray-100 text-gray-600">
              {selectedVersion?.versionLabel ?? "Draft"}
            </Badge>
            {selectedVersion ? <StatusBadge status={selectedVersion.status} /> : null}
          </div>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSaveNotes}>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                <StickyNote className="h-4 w-4" />
                Intake notes
              </label>
              <Textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={6}
                placeholder="Document intake notes, requirements, and linked resources."
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={savingNotes || !selectedVersion}>
                {savingNotes ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save notes
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" disabled={creatingVersion || !selectedVersion}>
                    {creatingVersion ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Plus className="mr-2 h-4 w-4" />
                        New version
                        <ChevronDown className="ml-2 h-4 w-4" />
                      </>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => handleCreateVersion(null)}
                    disabled={creatingVersion}
                  >
                    <div className="flex flex-col">
                      <span className="font-semibold">Start from scratch</span>
                      <span className="text-xs text-gray-500">Create a new empty version</span>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleCreateVersion(selectedVersion?.id ?? null)}
                    disabled={creatingVersion || !selectedVersion}
                  >
                    <div className="flex flex-col">
                      <span className="font-semibold">Copy from this version</span>
                      <span className="text-xs text-gray-500">Duplicate the current version</span>
                    </div>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );

  const blueprintContent = !blueprint ? (
    <div className="p-6">
      <div className="rounded-lg border border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-500">Loading blueprint…</div>
    </div>
  ) : (
    <div className="flex flex-col h-full w-full relative bg-gray-50 min-h-0">
      <div className="border-b border-gray-100 bg-white px-6 py-3 z-20 relative">
        <div className="flex items-center gap-6 min-w-max overflow-x-auto no-scrollbar">
          {checklistItems.map((item) => {
            const chipVisual = (
              <div className="flex items-center gap-2">
                {item.completed ? (
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  </div>
                ) : (
                  <div className="h-5 w-5 rounded-full border-2 border-gray-300" />
                )}
                <span
                  className={cn(
                    "text-xs font-semibold transition-colors duration-300",
                    item.completed ? "text-[#0A0A0A]" : "text-gray-500"
                  )}
                >
                  {item.label}
                </span>
              </div>
            );
            return (
              <div key={item.id} className="flex items-center gap-2">
                {chipVisual}
              </div>
            );
          })}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex flex-col gap-1">
              {proceedButtonDisabled && !alreadyInBuild && !proceedingToBuild ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div>
                      <Button
                        size="sm"
                        onClick={handleProceedToBuild}
                        disabled={proceedButtonDisabled}
                        className={cn(
                          "ml-2 gap-2 rounded-full px-4 py-1 text-xs font-semibold",
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
                    "ml-2 gap-2 rounded-full px-4 py-1 text-xs font-semibold",
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
        </div>
      </div>

      {blueprintError ? (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{blueprintError}</div>
      ) : null}

      <div className="flex-1 flex relative overflow-hidden bg-gray-50 min-h-0">
        <div className="w-[360px] shrink-0 z-20 h-full bg-[#F9FAFB] border-r border-gray-200 shadow-[4px_0_24px_rgba(0,0,0,0.02)] overflow-hidden">
          <StudioChat
            automationVersionId={selectedVersion?.id ?? null}
            blueprintEmpty={blueprintIsEmpty}
            onBlueprintUpdates={handleBlueprintAIUpdates}
            onBlueprintRefresh={refreshAutomationPreservingSelection}
            injectedMessage={injectedChatMessage}
            onInjectedMessageConsumed={() => setInjectedChatMessage(null)}
          />
        </div>

        <div className="flex-1 relative h-full z-10 bg-gray-50 min-h-0 flex flex-col">
          {/* View Mode Toggle */}
          <div className="absolute top-4 left-4 z-50 flex gap-2 bg-white rounded-lg border border-gray-200 shadow-sm p-1">
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

          <div className="absolute top-4 right-4 z-50 flex flex-wrap gap-2">
            {canvasViewMode === "flowchart" && (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleOptimizeFlow}
                  disabled={isOptimizingFlow || !selectedVersion}
                  className="text-xs font-semibold"
                >
                  {isOptimizingFlow ? (
                    <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-3 w-3" />
                  )}
                  Optimize flow
                </Button>
                <Button
                  size="sm"
                  onClick={handleSuggestNextSteps}
                  disabled={isRequestingSuggestions || !selectedVersion}
                  className="text-xs font-semibold"
                >
                  {isRequestingSuggestions ? (
                    <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                  ) : (
                    <Lightbulb className="mr-2 h-3 w-3" />
                  )}
                  Suggest next steps
                </Button>
                {suggestionStatus && (
                  <p className="w-full text-[11px] text-gray-500">{suggestionStatus}</p>
                )}
              </>
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
            />
          ) : (
            <div className="flex-1 relative h-full">
              <StudioCanvas
                nodes={flowNodes}
                edges={flowEdges}
                onNodesChange={handleNodesChange}
                onEdgesChange={handleEdgesChange}
                onConnect={handleConnectNodes}
                onEdgeUpdate={handleEdgeUpdate}
                onNodeClick={handleNodeClick}
                isSynthesizing={isSynthesizingBlueprint}
                emptyState={
                  blueprintIsEmpty ? (
                    <div className="text-center max-w-md mx-auto space-y-2">
                      <Sparkles className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                      <p className="text-sm font-semibold text-gray-600">Blueprint Canvas</p>
                      <p className="text-xs text-gray-500 leading-relaxed">
                        Chat with the copilot to build your automation. Steps will appear here as you describe your workflow.
                      </p>
                    </div>
                  ) : null
                }
              />

              {showStepHelper && !blueprintIsEmpty && (
                <div className="absolute bottom-4 right-4 bg-gray-900/90 text-white text-xs px-4 py-2 rounded-full shadow-lg pointer-events-none">
                  Click on any step to configure or refine.
                </div>
              )}
            </div>
          )}
        </div>

        {canvasViewMode === "flowchart" && (
          <div
            className={cn(
              "shrink-0 z-20 bg-white transition-all duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)] border-l border-gray-200 shadow-xl overflow-y-auto min-h-0",
              selectedStep ? "w-[420px] translate-x-0" : "w-0 translate-x-full opacity-0"
            )}
          >
            <StudioInspector
              step={selectedStep}
              onClose={() => {
                setSelectedStepId(null);
                setHasSelectedStep(false);
                setShowStepHelper(true);
              }}
              onChange={handleStepChange}
              onDelete={handleDeleteStep}
              tasks={versionTasks}
            />
          </div>
        )}
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
          activeTab === "Workflow" ? "flex flex-col overflow-hidden" : "overflow-y-auto"
        )}
      >
        {activeTab === "Workflow" ? (
          <>
            {errorBanner ? <div className="px-6 pt-6">{errorBanner}</div> : null}
            <div className="flex-1 min-h-0">{blueprintContent}</div>
          </>
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
              />
            ) : activeTab === "Activity" ? (
              <ActivityTab
                automationVersionId={selectedVersion?.id ?? ""}
                onNavigateToBlueprint={() => setActiveTab("Workflow")}
              />
            ) : activeTab === "Settings" ? (
              <SettingsTab
                onInviteUser={() => toast({ title: "Invite teammates", description: "Coming soon." })}
                onAddSystem={() => handleMockAction("Add system")}
                onNewVersion={handleCreateVersion}
                onManageCredentials={(system) => handleMockAction(`Manage ${system}`)}
                onNavigateToTab={(tab) => handleMockAction(`Navigate to ${tab}`)}
                onNavigateToSettings={() => handleMockAction("Workspace settings")}
                currentVersionId={selectedVersion?.id ?? null}
              />
            ) : null}
          </div>
        )}
      </div>

      {selectedTask ? (
        <TaskDrawer
          task={selectedTask}
          saving={savingTask}
          onClose={() => setSelectedTask(null)}
          onSave={(patch) => handleSaveTask(selectedTask.id, patch)}
        />
      ) : null}
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
  onEditBlueprint: () => void;
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
  onEditBlueprint,
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
          onClick={onEditBlueprint}
          className="h-9 text-xs font-bold bg-[#0A0A0A] hover:bg-gray-900 text-white shadow-lg shadow-gray-900/10 transition-all hover:-translate-y-0.5"
        >
          <Edit3 size={14} className="mr-2" />
          Edit Blueprint
        </Button>
      </div>
    </section>
  );
}

interface StatusStepperProps {
  selectedVersion: AutomationVersion | null;
  latestQuote: QuoteSummary | null;
  showSendForPricing: boolean;
  awaitingApproval: boolean;
  buildUnderway: boolean;
  onSendForPricing: () => void;
  transitioning: boolean;
}

function StatusStepper({
  selectedVersion,
  latestQuote,
  showSendForPricing,
  awaitingApproval,
  buildUnderway,
  onSendForPricing,
  transitioning,
}: StatusStepperProps) {
  return (
    <Card className="shadow-sm border-gray-100">
      <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle>Commercial status</CardTitle>
          <CardDescription>Track pricing progress and quote state.</CardDescription>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {selectedVersion ? <StatusBadge status={selectedVersion.status} /> : null}
          {latestQuote ? <StatusBadge status={latestQuote.status} /> : <Badge variant="outline">No quote</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {latestQuote ? (
          <div className="rounded-lg border border-gray-100 bg-white p-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-900">Quote</p>
                <p className="text-xs text-gray-500">Status: {latestQuote.status}</p>
              </div>
              <StatusBadge status={latestQuote.status} />
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-3 text-sm text-gray-600">
              <div>
                <p className="text-xs uppercase text-gray-400 mb-1">Setup fee</p>
                <p className="font-medium text-gray-900">{currency(latestQuote.setupFee)}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-gray-400 mb-1">Unit price</p>
                <p className="font-medium text-gray-900">{perUnit(latestQuote.unitPrice)}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-gray-400 mb-1">Estimated volume</p>
                <p className="font-medium text-gray-900">{latestQuote.estimatedVolume ?? "—"}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
            No quote generated yet. Request pricing to send this automation to the commercial team.
          </div>
        )}

        {showSendForPricing ? (
          <Button type="button" onClick={onSendForPricing} disabled={transitioning}>
            {transitioning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Request pricing
          </Button>
        ) : awaitingApproval ? (
          <div className="rounded-md border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-800">Quote sent—awaiting approval.</div>
        ) : buildUnderway ? (
          <div className="rounded-md border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Signed – Build underway.</div>
        ) : null}
      </CardContent>
    </Card>
  );
}

interface OverviewMetricsProps {
  stats: KpiStat[];
}

function OverviewMetrics({ stats }: OverviewMetricsProps) {
  return (
    <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((kpi) => (
        <div
          key={kpi.label}
          className="bg-white p-5 rounded-xl border border-gray-200 shadow-[0_2px_8px_rgba(0,0,0,0.02)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.04)] transition-all group"
        >
          <div className="flex items-start justify-between mb-4">
            <div className="p-2 bg-gray-50 rounded-lg group-hover:bg-red-50 group-hover:text-[#E43632] transition-colors text-gray-400">
              <kpi.icon size={18} />
            </div>
            <div
              className={cn(
                "flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                kpi.trendPositive ? "text-emerald-700 bg-emerald-50" : "text-amber-700 bg-amber-50"
              )}
            >
              {kpi.trendPositive ? <ArrowUpRight size={10} /> : <ArrowRight size={10} className="rotate-45" />}
              {kpi.trend}
            </div>
          </div>
          <div>
            <h3 className="text-2xl font-bold text-[#0A0A0A] mb-1 tracking-tight">{kpi.value}</h3>
            <p className="text-xs text-gray-500 font-medium">{kpi.label}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">{kpi.subtext}</p>
          </div>
        </div>
      ))}
    </section>
  );
}

interface RecentActivityProps {
  entries: ActivityEntry[];
  onViewAll?: () => void;
}

function RecentActivity({ entries, onViewAll }: RecentActivityProps) {
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
        <div className="space-y-8 relative before:absolute before:left-2.5 before:top-2 before:h-full before:w-px before:bg-gray-100">
          {entries.map((entry) => (
            <div key={entry.title} className="relative pl-8">
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
      </CardContent>
    </Card>
  );
}

interface NeedsAttentionCardProps {
  items: typeof MOCK_ATTENTION_ITEMS;
  onAction: (label: string) => void;
}

function NeedsAttentionCard({ items, onAction }: NeedsAttentionCardProps) {
  return (
    <div className="bg-amber-50/60 rounded-xl border border-amber-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 flex items-center gap-2 border-b border-amber-100/50">
        <AlertTriangle size={16} className="text-amber-600" />
        <span className="text-sm font-bold text-amber-900">Needs attention</span>
      </div>
      <div className="p-5 space-y-3">
        {items.map((item) => (
          <div key={item.id} className="rounded-lg bg-white/80 border border-amber-100 p-3 space-y-2">
            <p className="text-xs font-bold text-amber-900">{item.title}</p>
            <p className="text-xs text-amber-800">{item.description}</p>
            <Button
              size="sm"
              variant="outline"
              className="w-full border border-amber-200 text-amber-700 hover:bg-amber-50 hover:text-amber-800 hover:border-amber-300 shadow-sm h-8 text-xs font-bold"
              onClick={() => onAction(item.title)}
            >
              {item.actionLabel}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

interface CopilotSuggestionsProps {
  suggestions: typeof MOCK_SUGGESTIONS;
  onSelectSuggestion: (title: string) => void;
  onAskForMore: () => void;
}

function CopilotSuggestions({ suggestions, onSelectSuggestion, onAskForMore }: CopilotSuggestionsProps) {
  return (
    <Card className="shadow-sm border-gray-100">
      <CardHeader className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-[#E43632]" />
          <span className="text-sm font-bold text-[#0A0A0A]">Copilot suggestions</span>
        </div>
        <Badge variant="secondary" className="bg-gray-100 text-gray-600 text-[10px]">
          {suggestions.length} New
        </Badge>
      </CardHeader>
      <CardContent className="divide-y divide-gray-50 p-0">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion.title}
            type="button"
            className="w-full text-left p-4 hover:bg-gray-50 transition-colors cursor-pointer group"
            onClick={() => onSelectSuggestion(suggestion.title)}
          >
            <div className="flex items-start justify-between mb-1">
              <h4 className="text-xs font-bold text-gray-700 group-hover:text-[#0A0A0A]">{suggestion.title}</h4>
              <ArrowRight
                size={12}
                className="text-gray-300 group-hover:text-[#E43632] transition-colors opacity-0 group-hover:opacity-100"
              />
            </div>
            <p className="text-[11px] text-gray-500 leading-relaxed">{suggestion.description}</p>
          </button>
        ))}
      </CardContent>
      <div className="p-3 bg-gray-50 border-t border-gray-100">
        <Button variant="ghost" className="w-full text-xs text-gray-500 hover:text-[#E43632] h-auto py-1" onClick={onAskForMore}>
          Ask Copilot for more...
        </Button>
      </div>
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
}

function TasksViewCanvas({ tasks, blockersRemaining, onViewStep, onViewTask }: TasksViewCanvasProps) {
  return (
    <div className="flex-1 flex flex-col h-full bg-white overflow-hidden">
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

interface TaskDrawerProps {
  task: VersionTask;
  saving: boolean;
  onClose: () => void;
  onSave: (patch: { status?: VersionTask["status"]; description?: string | null; metadata?: Record<string, unknown> | null }) => Promise<void>;
}

function TaskDrawer({ task, onClose, onSave, saving }: TaskDrawerProps) {
  const [status, setStatus] = useState<VersionTask["status"]>(task.status);
  const [requirements, setRequirements] = useState<string>(task.metadata?.requirementsText ?? "");
  const [notes, setNotes] = useState<string>(task.metadata?.notes ?? "");
  const [documents, setDocuments] = useState<string[]>(task.metadata?.documents ?? []);
  const [assignee, setAssignee] = useState<string>(task.metadata?.assigneeEmail ?? "");
  const [description, setDescription] = useState<string>(task.description ?? "");

  useEffect(() => {
    setStatus(task.status);
    setRequirements(task.metadata?.requirementsText ?? "");
    setNotes(task.metadata?.notes ?? "");
    setDocuments(task.metadata?.documents ?? []);
    setAssignee(task.metadata?.assigneeEmail ?? "");
    setDescription(task.description ?? "");
  }, [task]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;
    const names = files.map((file) => file.name);
    setDocuments((prev) => [...prev, ...names]);
  };

  const handleRemoveDoc = (name: string) => {
    setDocuments((prev) => prev.filter((doc) => doc !== name));
  };

  const handleSubmit = async (nextStatus?: VersionTask["status"]) => {
    const patchStatus = nextStatus ?? status;
    await onSave({
      status: patchStatus,
      description,
      metadata: {
        ...task.metadata,
        requirementsText: requirements || undefined,
        notes: notes || undefined,
        documents,
        assigneeEmail: assignee || undefined,
      },
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-[420px] max-w-full h-full bg-white shadow-2xl border-l border-gray-200 flex flex-col">
        <div className="p-5 border-b border-gray-100 flex items-start justify-between">
          <div>
            <p className="text-[11px] uppercase font-bold text-gray-400">Task</p>
            <h3 className="text-lg font-bold text-[#0A0A0A] leading-tight">{task.title}</h3>
            {task.metadata?.systemType ? (
              <p className="text-xs text-gray-500 mt-1 capitalize">System: {task.metadata.systemType}</p>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} className="text-xs text-gray-500">
              Close
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-gray-700">Status</Label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as VersionTask["status"])}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              <option value="pending">Pending</option>
              <option value="in_progress">In Progress</option>
              <option value="complete">Complete</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold text-gray-700">Task requirements / how to complete</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[80px] text-sm"
              placeholder="Add instructions or requirements to complete this task."
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold text-gray-700">Additional notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="min-h-[80px] text-sm"
              placeholder="Internal notes or clarifications."
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold text-gray-700">Task requirements (Markdown)</Label>
            <Textarea
              value={requirements}
              onChange={(e) => setRequirements(e.target.value)}
              className="min-h-[120px] text-sm font-mono"
              placeholder="Add detailed requirements in Markdown."
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold text-gray-700">Documents</Label>
            <input type="file" multiple onChange={handleFileChange} className="text-sm" />
            {documents.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {documents.map((doc) => (
                  <div
                    key={doc}
                    className="flex items-center gap-2 px-3 py-1 rounded-full border border-gray-200 bg-gray-50 text-xs text-gray-700"
                  >
                    <span>{doc}</span>
                    <button
                      type="button"
                      className="text-gray-400 hover:text-red-500"
                      onClick={() => handleRemoveDoc(doc)}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400">No documents attached.</p>
            )}
            <p className="text-[11px] text-gray-400">Uploads are captured as filenames for now; wire storage later.</p>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold text-gray-700">Assign / invite</Label>
            <Input
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              placeholder="email@company.com"
              className="text-sm"
            />
            <p className="text-[11px] text-gray-400">
              Enter teammate email to tag/invite (invites to be wired later).
            </p>
          </div>
        </div>

        <div className="p-4 border-t border-gray-200 bg-white flex items-center justify-between gap-3">
          <Button
            variant="outline"
            size="sm"
            className="text-sm"
            disabled={saving}
            onClick={() => handleSubmit("complete")}
          >
            Mark complete
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" className="text-sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" className="bg-gray-900 text-white" disabled={saving} onClick={() => handleSubmit()}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save task"
              )}
            </Button>
          </div>
        </div>
      </div>
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


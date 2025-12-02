"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Loader2, RefreshCw, Send, StickyNote, Plus, Users, Play, Edit3, Sparkles, AlertTriangle, Calendar, Clock, DollarSign, Zap, CheckCircle2, ArrowUpRight, ArrowRight, History } from "lucide-react";
import type { Connection, Node, Edge, EdgeChange } from "reactflow";
import { StudioChat, type CopilotMessage } from "@/components/automations/StudioChat";
import { StudioInspector } from "@/components/automations/StudioInspector";
import { ActivityTab } from "@/components/automations/ActivityTab";
import { BuildStatusTab } from "@/components/automations/BuildStatusTab";
import { ContributorsTab } from "@/components/automations/ContributorsTab";
import { SettingsTab } from "@/components/automations/SettingsTab";
import { TestTab } from "@/components/automations/TestTab";
import { createEmptyBlueprint } from "@/lib/blueprint/factory";
import type { Blueprint, BlueprintSectionKey, BlueprintStep } from "@/lib/blueprint/types";
import { BLUEPRINT_SECTION_TITLES } from "@/lib/blueprint/types";
import { getBlueprintCompletionState } from "@/lib/blueprint/completion";
import { isBlueprintEffectivelyEmpty, sortSections } from "@/lib/blueprint/utils";
import { blueprintToNodes, blueprintToEdges, addConnection, removeConnection } from "@/lib/blueprint/canvas-utils";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import type { AutomationLifecycleStatus } from "@/lib/automations/status";
import { VersionSelector, type VersionOption } from "@/components/ui/VersionSelector";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

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

type AutomationVersion = {
  id: string;
  versionLabel: string;
  status: AutomationLifecycleStatus;
  intakeNotes: string | null;
  blueprintJson: Blueprint | null;
  summary: string | null;
  latestQuote: QuoteSummary | null;
  createdAt: string;
  updatedAt: string;
};

type AutomationDetail = {
  id: string;
  name: string;
  description: string | null;
  versions: AutomationVersion[];
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

const AUTOMATION_TABS = ["Overview", "Build Status", "Blueprint", "Test", "Activity", "Contributors", "Settings"] as const;

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

const generateStepId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `step-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
};

const computeSeed = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
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

type AutomationTab = (typeof AUTOMATION_TABS)[number];

export default function AutomationDetailPage({ params }: AutomationDetailPageProps) {
  const router = useRouter();
  const toast = useToast();
  const [automation, setAutomation] = useState<AutomationDetail | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [blueprint, setBlueprint] = useState<Blueprint | null>(null);
  const [blueprintError, setBlueprintError] = useState<string | null>(null);
  const [isBlueprintDirty, setBlueprintDirty] = useState(false);
  const [selectedSectionKey, setSelectedSectionKey] = useState<BlueprintSectionKey>("business_requirements");
  const [loading, setLoading] = useState(true);
  const [savingNotes, setSavingNotes] = useState(false);
  const [savingBlueprint, setSavingBlueprint] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [creatingVersion, setCreatingVersion] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AutomationTab>("Overview");
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [draftingBlueprint, setDraftingBlueprint] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [hasSelectedStep, setHasSelectedStep] = useState(false);
  const [showStepHelper, setShowStepHelper] = useState(false);
  const [sectionCelebrations, setSectionCelebrations] = useState<Partial<Record<BlueprintSectionKey, number>>>({});
  const completionRef = useRef<ReturnType<typeof getBlueprintCompletionState> | null>(null);

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

  const fetchAutomation = useCallback(async () => {
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
      const blueprint = version?.blueprintJson ? cloneBlueprint(version.blueprintJson) : createEmptyBlueprint();
      setBlueprint(blueprint);
      setBlueprintError(null);
      setBlueprintDirty(false);
      setSelectedSectionKey("business_requirements");
      setSelectedStepId(null);
      setHasSelectedStep(false);
      setShowStepHelper(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  }, [params.automationId, selectedVersionId]);

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
      const nextBlueprint = selectedVersion.blueprintJson ? cloneBlueprint(selectedVersion.blueprintJson) : createEmptyBlueprint();
      setBlueprint(nextBlueprint);
      setBlueprintError(null);
      setBlueprintDirty(false);
      setSelectedSectionKey("business_requirements");
      setSelectedStepId(null);
      setHasSelectedStep(false);
      setShowStepHelper(false);
    }
  }, [selectedVersion?.id, selectedVersion?.blueprintJson?.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleVersionChange = (versionId: string) => {
    if (!confirmDiscardBlueprintChanges()) {
      return;
    }
    setSelectedVersionId(versionId);
    const version = automation?.versions.find((v) => v.id === versionId);
    setNotes(version?.intakeNotes ?? "");
    const nextBlueprint = version?.blueprintJson ? cloneBlueprint(version.blueprintJson) : createEmptyBlueprint();
    setBlueprint(nextBlueprint);
    setBlueprintDirty(false);
    setBlueprintError(null);
    setSelectedSectionKey("business_requirements");
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

  const handleSaveBlueprint = useCallback(
    async (overrides?: Partial<Blueprint>) => {
      if (!selectedVersion || !blueprint) {
        setBlueprintError("Blueprint is not available yet.");
        return;
      }
      const payload = { ...blueprint, ...overrides, updatedAt: new Date().toISOString() };
      setSavingBlueprint(true);
      setBlueprintError(null);
      try {
        const response = await fetch(`/api/automation-versions/${selectedVersion.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ blueprintJson: payload }),
        });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error ?? "Failed to save blueprint");
        }
        const cloned = cloneBlueprint(payload);
        setBlueprint(cloned);
        setBlueprintDirty(false);
        await fetchAutomation();
        toast({ title: "Blueprint saved", description: "Metadata updated successfully.", variant: "success" });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unable to save blueprint";
        setBlueprintError(message);
        toast({ title: "Unable to save blueprint", description: message, variant: "error" });
      } finally {
        setSavingBlueprint(false);
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

  const handleCreateVersion = async () => {
    setCreatingVersion(true);
    setError(null);
    try {
      const response = await fetch(`/api/automations/${params.automationId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: selectedVersion?.summary ?? "",
          intakeNotes: notes,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "Unable to create version");
      }
      await fetchAutomation();
      toast({ title: "New version created", description: "A draft version is ready.", variant: "success" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to create version";
      setError(message);
      toast({ title: "Unable to create version", description: message, variant: "error" });
    } finally {
      setCreatingVersion(false);
    }
  };

  const handleDraftBlueprint = useCallback(
    async (messages: CopilotMessage[]) => {
      if (!selectedVersion) {
        return;
      }
      setDraftingBlueprint(true);
      setChatError(null);
      try {
        const response = await fetch(`/api/automation-versions/${selectedVersion.id}/copilot/draft-blueprint`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages,
            intakeNotes: notes,
          }),
        });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error ?? "Failed to draft blueprint");
        }
        const data = (await response.json()) as { blueprint: Blueprint };
        const nextBlueprint = cloneBlueprint(data.blueprint);
        setBlueprint(nextBlueprint);
        setBlueprintDirty(false);
        setSelectedSectionKey("business_requirements");
        setSelectedStepId(null);
        setHasSelectedStep(false);
        setShowStepHelper(true);
        toast({
          title: "Blueprint draft created",
          description: "Click on any step in the canvas to refine details.",
          variant: "success",
        });
        await fetchAutomation();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unable to draft blueprint";
        setChatError(message);
        toast({ title: "Unable to draft blueprint", description: message, variant: "error" });
      } finally {
        setDraftingBlueprint(false);
      }
    },
    [selectedVersion, notes, fetchAutomation, toast]
  );

  const validateReadyForPricing = useCallback((candidate: Blueprint) => {
    const issues: string[] = [];
    if (!candidate.summary.trim()) {
      issues.push("Add a short blueprint summary.");
    }
    if (!candidate.sections.some((section) => section.content.trim().length > 0)) {
      issues.push("Document at least one section.");
    }
    if (!candidate.steps.some((step) => step.type === "Trigger")) {
      issues.push("Add at least one trigger step.");
    }
    if (!candidate.steps.some((step) => step.type === "Action")) {
      issues.push("Add at least one action step.");
    }
    return issues;
  }, []);

  const handleMarkReadyForPricing = useCallback(async () => {
    if (!blueprint) {
      return;
    }
    const issues = validateReadyForPricing(blueprint);
    if (issues.length > 0) {
      const message = issues.join(" ");
      setBlueprintError(message);
      toast({ title: "Complete the blueprint first", description: message, variant: "error" });
      return;
    }
    await handleSaveBlueprint({ status: "ReadyForQuote" });
    toast({
      title: "Blueprint marked Ready for Pricing",
      description: "The pricing team can now prepare a quote.",
      variant: "success",
    });
  }, [blueprint, handleSaveBlueprint, toast, validateReadyForPricing]);

  const applyBlueprintUpdate = useCallback(
    (updater: (current: Blueprint) => Blueprint) => {
      let didUpdate = false;
      setBlueprint((current) => {
        if (!current) {
          return current;
        }
        const next = updater(current);
        didUpdate = true;
        return next;
      });
      if (didUpdate) {
        setBlueprintDirty(true);
        setBlueprintError(null);
      }
    },
    [setBlueprintDirty, setBlueprintError]
  );

  const handleSectionContentChange = useCallback(
    (sectionId: string, content: string) => {
      applyBlueprintUpdate((current) => ({
        ...current,
        sections: current.sections.map((section) => (section.id === sectionId ? { ...section, content } : section)),
      }));
    },
    [applyBlueprintUpdate]
  );

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

  const handleAddStep = useCallback(() => {
    const newStep: BlueprintStep = {
      id: generateStepId(),
      type: "Action",
      name: "New Step",
      summary: "Describe what happens in this step.",
      goalOutcome: "Describe the desired outcome.",
      responsibility: "Automated",
      systemsInvolved: [],
      notifications: [],
      nextStepIds: [],
    };
    applyBlueprintUpdate((current) => ({
      ...current,
      steps: [...current.steps, newStep],
    }));
    setSelectedStepId(newStep.id);
    setHasSelectedStep(true);
    setShowStepHelper(false);
  }, [applyBlueprintUpdate]);

  const handleConnectNodes = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target || connection.source === connection.target) {
        return;
      }
      applyBlueprintUpdate((current) => addConnection(current, connection));
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

  const handleNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    setSelectedStepId(node.id);
    setHasSelectedStep(true);
    setShowStepHelper(false);
  }, []);

  const orderedSections = useMemo(() => (blueprint ? sortSections(blueprint.sections) : []), [blueprint]);
  const activeSection = orderedSections.find((section) => section.key === selectedSectionKey) ?? orderedSections[0] ?? null;
  const completion = useMemo(() => getBlueprintCompletionState(blueprint), [blueprint]);
  const flowNodes = useMemo<Node[]>(() => blueprintToNodes(blueprint), [blueprint]);
  const flowEdges = useMemo<Edge[]>(() => blueprintToEdges(blueprint), [blueprint]);
  const selectedStep = useMemo(
    () => (blueprint ? blueprint.steps.find((step) => step.id === selectedStepId) ?? null : null),
    [blueprint, selectedStepId]
  );
  const blueprintIsEmpty = useMemo(() => isBlueprintEffectivelyEmpty(blueprint), [blueprint]);
  const completionBySection = useMemo(
    () => new Map(completion.sections.map((section) => [section.key, section.complete])),
    [completion]
  );

  useEffect(() => {
    if (!blueprint) {
      return;
    }
    const prev = completionRef.current;
    if (prev) {
      completion.sections.forEach((section) => {
        const prevSection = prev.sections.find((entry) => entry.key === section.key);
        if (prevSection && !prevSection.complete && section.complete) {
          setSectionCelebrations((current) => ({ ...current, [section.key]: Date.now() }));
          toast({
            title: `${BLUEPRINT_SECTION_TITLES[section.key]} captured`,
            description: "Great progress—keep refining the rest of the blueprint.",
            variant: "success",
          });
          setTimeout(() => {
            setSectionCelebrations((current) => {
              const next = { ...current };
              delete next[section.key];
              return next;
            });
          }, 2000);
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
      handleSaveBlueprint();
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
        onEditBlueprint={() => setActiveTab("Blueprint")}
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
            <CardTitle>Requirements / Intake</CardTitle>
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
              <Button type="button" variant="outline" onClick={handleCreateVersion} disabled={creatingVersion || !selectedVersion}>
                {creatingVersion ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                New version
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );

  const blueprintContent = blueprint ? (
    <div className="w-full space-y-4">
      {blueprintError ? (
        <div className="mx-6 mt-6 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{blueprintError}</div>
      ) : null}
      <div className="px-6 pt-4 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase text-gray-400">Blueprint status</p>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <Badge variant="outline" className="text-xs font-semibold">
                {blueprint.status}
              </Badge>
              {selectedVersion ? <StatusBadge status={selectedVersion.status} /> : null}
            </div>
            <div className="flex items-center gap-3 mt-3">
              <span className="text-sm font-medium text-gray-700">
                Completeness {Math.round(completion.score * 100)}%
              </span>
              <Progress value={Number((completion.score * 100).toFixed(1))} className="w-48 h-2" />
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="ghost" onClick={handleAddStep}>
              <Plus size={14} className="mr-2" />
              Add Step
            </Button>
            <Button
              variant="outline"
              onClick={() => handleSaveBlueprint()}
              disabled={!isBlueprintDirty || savingBlueprint}
            >
              {savingBlueprint ? "Saving..." : "Save Blueprint"}
            </Button>
            <Button
              onClick={handleMarkReadyForPricing}
              disabled={
                !blueprint ||
                blueprint.status === "ReadyForQuote" ||
                completion.score < 0.5 ||
                isBlueprintDirty ||
                savingBlueprint
              }
            >
              Ready for Pricing
            </Button>
          </div>
        </div>
      </div>
      <div className="px-6 pb-6">
        <div className="flex flex-col gap-6 lg:flex-row min-h-[620px]">
          <div className="w-full lg:w-[320px] border border-gray-200 rounded-2xl overflow-hidden bg-white flex">
            <StudioChat
              blueprintEmpty={blueprintIsEmpty}
              onDraftBlueprint={handleDraftBlueprint}
              isDrafting={draftingBlueprint}
              lastError={chatError}
            />
          </div>
          <div className="flex-1 border border-gray-200 rounded-2xl bg-white flex flex-col min-w-0">
            <div className="border-b border-gray-100 bg-white/90 backdrop-blur">
              <div className="flex items-center gap-2 overflow-x-auto px-4 py-3">
                {orderedSections.map((section) => {
                  const complete = completionBySection.get(section.key) ?? false;
                  const isActive = activeSection?.id === section.id;
                  const celebrating = Boolean(sectionCelebrations[section.key]);
                  return (
                    <button
                      key={section.id}
                      type="button"
                      onClick={() => setSelectedSectionKey(section.key)}
                      className={cn(
                        "px-3 py-1.5 rounded-full text-xs font-semibold transition-all border",
                        isActive
                          ? "bg-[#E43632] border-[#E43632] text-white"
                          : complete
                            ? "bg-emerald-50 border-emerald-100 text-emerald-700"
                            : "bg-gray-100 border-gray-200 text-gray-600 hover:bg-white",
                        celebrating && "ring-2 ring-[#E43632]/40"
                      )}
                    >
                      {section.title}
                    </button>
                  );
                })}
              </div>
              {activeSection ? (
                <div className="px-4 pb-4">
                  <Textarea
                    rows={4}
                    value={activeSection.content}
                    onChange={(event) => handleSectionContentChange(activeSection.id, event.target.value)}
                    placeholder="This copy populates the red-chip overview."
                  />
                  <p className="text-[11px] text-gray-400 mt-1">Keep each section concise and actionable.</p>
                </div>
              ) : (
                <div className="px-4 py-6 text-sm text-gray-500">Sections will appear once the blueprint is drafted.</div>
              )}
            </div>
            <div className="flex-1 relative min-h-[320px]">
              <StudioCanvas
                nodes={flowNodes}
                edges={flowEdges}
                onConnect={handleConnectNodes}
                onEdgesChange={handleEdgesChange}
                onNodeClick={handleNodeClick}
                emptyState={
                  <div className="max-w-xs text-center text-gray-500 text-sm leading-relaxed">
                    <p className="font-semibold text-[#0A0A0A] mb-1">No steps yet</p>
                    Start by telling Copilot about your workflow. I’ll map out the steps for you.
                  </div>
                }
              />
              {showStepHelper && !blueprintIsEmpty && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-gray-900/90 text-white text-xs px-4 py-2 rounded-full shadow-lg pointer-events-none">
                  Click on any step to configure or refine.
                </div>
              )}
            </div>
          </div>
          <div className="w-full lg:w-[340px] border border-gray-200 rounded-2xl overflow-hidden bg-white flex">
            <StudioInspector
              step={selectedStep}
              onClose={() => {
                setSelectedStepId(null);
                setHasSelectedStep(false);
                setShowStepHelper(true);
              }}
              onChange={handleStepChange}
              onDelete={handleDeleteStep}
            />
          </div>
        </div>
      </div>
    </div>
  ) : (
    <div className="p-6">
      <div className="rounded-lg border border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-500">Loading blueprint…</div>
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
                onClick={fetchAutomation}
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
      <div className="flex-1 overflow-y-auto">
        {activeTab === "Blueprint" ? (
          <div className="w-full space-y-4">
            <div className="px-6 pt-6">{errorBanner}</div>
            {blueprintContent}
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
              />
            ) : activeTab === "Test" ? (
              <TestTab />
            ) : activeTab === "Activity" ? (
              <ActivityTab onNavigateToBlueprint={() => setActiveTab("Blueprint")} />
            ) : activeTab === "Contributors" ? (
              <ContributorsTab onInvite={() => toast({ title: "Invite teammates", description: "Coming soon." })} />
            ) : activeTab === "Settings" ? (
              <SettingsTab
                onInviteUser={() => toast({ title: "Invite teammates", description: "Coming soon." })}
                onAddSystem={() => handleMockAction("Add system")}
                onNewVersion={handleCreateVersion}
                onManageCredentials={(system) => handleMockAction(`Manage ${system}`)}
                onNavigateToTab={(tab) => handleMockAction(`Navigate to ${tab}`)}
                onNavigateToSettings={() => handleMockAction("Workspace settings")}
              />
            ) : null}
          </div>
        )}
      </div>
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


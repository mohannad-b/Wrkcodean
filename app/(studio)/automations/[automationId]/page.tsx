"use client";

import { useCallback, useEffect, useMemo, useState, FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  Loader2,
  RefreshCw,
  Send,
  StickyNote,
  Plus,
  Activity,
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
} from "lucide-react";
import { useNodesState, useEdgesState, addEdge, Connection, Node } from "reactflow";
import { StudioChat } from "@/components/automations/StudioChat";
import { StudioInspector } from "@/components/automations/StudioInspector";
import { nodesV1_1, edgesV1_1 } from "@/lib/mock-blueprint";
import { ExceptionModal } from "@/components/modals/ExceptionModal";
import { ActivityTab } from "@/components/automations/ActivityTab";
import { BuildStatusTab } from "@/components/automations/BuildStatusTab";
import { ContributorsTab } from "@/components/automations/ContributorsTab";
import { SettingsTab } from "@/components/automations/SettingsTab";
import { TestTab } from "@/components/automations/TestTab";
import { BlueprintSummary } from "@/components/automations/BlueprintSummary";
import { BlueprintEditorPanel } from "@/components/automations/BlueprintEditorPanel";
import { createEmptyBlueprint } from "@/lib/blueprint/factory";
import type { Blueprint } from "@/lib/blueprint/types";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import type { AutomationLifecycleStatus } from "@/lib/automations/status";
import { VersionSelector, type VersionOption } from "@/components/ui/VersionSelector";
import { Badge } from "@/components/ui/badge";

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

const BLUEPRINT_CHECKLIST = [
  { id: "overview", label: "Overview", completed: true },
  { id: "reqs", label: "Business Requirements", completed: true },
  { id: "objs", label: "Business Objectives", completed: true },
  { id: "criteria", label: "Success Criteria", completed: true },
  { id: "systems", label: "Systems", completed: true },
  { id: "data", label: "Data Needs", completed: true },
  { id: "exceptions", label: "Exceptions", completed: true },
  { id: "human", label: "Human Touchpoints", completed: true },
  { id: "flow", label: "Flow Complete", completed: true },
] as const;

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
  const [blueprintDraft, setBlueprintDraft] = useState<Blueprint | null>(null);
  const [initialBlueprint, setInitialBlueprint] = useState<Blueprint | null>(null);
  const [blueprintError, setBlueprintError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingNotes, setSavingNotes] = useState(false);
  const [savingBlueprint, setSavingBlueprint] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [creatingVersion, setCreatingVersion] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AutomationTab>("Overview");
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [isContributorMode, setIsContributorMode] = useState(false);
  const [isSynthesizing] = useState(false);
  const [nodes, setNodes, onNodesChange] = useNodesState(nodesV1_1);
  const [edges, setEdges, onEdgesChange] = useEdgesState(edgesV1_1);
  const [stepExceptions, setStepExceptions] = useState<Record<string, { condition: string; outcome: string }[]>>({});
  const [showExceptionModal, setShowExceptionModal] = useState(false);

  const hasBlueprintChanges = useMemo(() => {
    if (!blueprintDraft && !initialBlueprint) {
      return false;
    }
    return JSON.stringify(blueprintDraft) !== JSON.stringify(initialBlueprint);
  }, [blueprintDraft, initialBlueprint]);

  const confirmDiscardBlueprintChanges = useCallback(() => {
    if (!hasBlueprintChanges) {
      return true;
    }
    return window.confirm("You have unsaved blueprint changes. Discard them?");
  }, [hasBlueprintChanges]);

  useEffect(() => {
    if (!hasBlueprintChanges) {
      return;
    }
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasBlueprintChanges]);

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
      const blueprint = version?.blueprintJson ? cloneBlueprint(version.blueprintJson) : null;
      setBlueprintDraft(blueprint);
      setInitialBlueprint(blueprint);
      setBlueprintError(null);
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
      const blueprint = selectedVersion.blueprintJson ? cloneBlueprint(selectedVersion.blueprintJson) : null;
      setBlueprintDraft(blueprint);
      setInitialBlueprint(blueprint);
      setBlueprintError(null);
    }
  }, [selectedVersion?.id, selectedVersion?.blueprintJson?.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleVersionChange = (versionId: string) => {
    if (!confirmDiscardBlueprintChanges()) {
      return;
    }
    setSelectedVersionId(versionId);
    const version = automation?.versions.find((v) => v.id === versionId);
    setNotes(version?.intakeNotes ?? "");
    const blueprint = version?.blueprintJson ? cloneBlueprint(version.blueprintJson) : null;
    setBlueprintDraft(blueprint);
    setInitialBlueprint(blueprint);
    setBlueprintError(null);
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

  const handleSaveBlueprint = async () => {
    if (!selectedVersion || !blueprintDraft) {
      setBlueprintError("Create a blueprint before saving.");
      return;
    }
    setSavingBlueprint(true);
    setBlueprintError(null);
    const payload = { ...blueprintDraft, updatedAt: new Date().toISOString() };
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
      setBlueprintDraft(cloneBlueprint(payload));
      setInitialBlueprint(cloneBlueprint(payload));
      await fetchAutomation();
      toast({ title: "Blueprint saved", description: "Metadata updated successfully.", variant: "success" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to save blueprint";
      setBlueprintError(message);
      toast({ title: "Unable to save blueprint", description: message, variant: "error" });
    } finally {
      setSavingBlueprint(false);
    }
  };

  const handleInitializeBlueprint = () => {
    if (!selectedVersion) return;
    const blueprint = createEmptyBlueprint();
    setBlueprintDraft(blueprint);
    setInitialBlueprint(cloneBlueprint(blueprint));
    setBlueprintError(null);
  };

  const handleBlueprintChange = (next: Blueprint | null) => {
    setBlueprintDraft(next ? cloneBlueprint(next) : null);
  };

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

  const handleEdgeLabelChange = useCallback(
    (
      id: string,
      newLabel: string,
      newData: { operator: string; value: string | number; unit: string }
    ) => {
      setEdges((current) =>
        current.map((edge) => {
          if (edge.id !== id) return edge;
          return {
            ...edge,
            data: {
              ...edge.data,
              ...newData,
              label: newLabel,
              onLabelChange: handleEdgeLabelChange,
            },
          };
        })
      );
    },
    [setEdges]
  );

  useEffect(() => {
    setEdges((current) =>
      current.map((edge) => ({
        ...edge,
        data: {
          ...edge.data,
          onLabelChange: handleEdgeLabelChange,
        },
      }))
    );
  }, [handleEdgeLabelChange, setEdges]);

  const handleConnectNodes = useCallback(
    (connection: Connection) => {
      setEdges((eds) => addEdge({ ...connection, type: "default" }, eds));
    },
    [setEdges]
  );

  const handleNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    setSelectedStepId(node.id);
  }, []);

  const handleAddExceptionRule = useCallback(
    (rule: { condition: string; outcome: string }) => {
      if (!selectedStepId) {
        toast({
          title: "Select a step first",
          description: "Pick a block in the canvas before adding an exception.",
          variant: "error",
        });
        return;
      }
      setStepExceptions((prev) => ({
        ...prev,
        [selectedStepId]: [...(prev[selectedStepId] ?? []), rule],
      }));
      setNodes((nodesState) =>
        nodesState.map((node) =>
          node.id === selectedStepId
            ? {
                ...node,
                data: {
                  ...node.data,
                  exceptions: [...(node.data.exceptions ?? []), rule],
                },
              }
            : node
        )
      );
    },
    [selectedStepId, setNodes, toast]
  );

  const handleAiCommand = useCallback(
    (command: string) => {
      if (command.toLowerCase().includes("10,000") || command.toLowerCase().includes("10k")) {
        setEdges((current) =>
          current.map((edge) => {
            if (edge.id === "e3-4") {
              return {
                ...edge,
                selected: true,
                data: {
                  ...edge.data,
                  value: 10000,
                  label: "> $10k",
                  onLabelChange: handleEdgeLabelChange,
                },
              };
            }
            if (edge.id === "e3-5") {
              return {
                ...edge,
                data: {
                  ...edge.data,
                  value: 10000,
                  label: "< $10k",
                  onLabelChange: handleEdgeLabelChange,
                },
              };
            }
            return edge;
          })
        );

        setTimeout(() => {
          setEdges((eds) => eds.map((edge) => ({ ...edge, selected: false })));
        }, 2000);
      }
    },
    [handleEdgeLabelChange, setEdges]
  );

  const selectedNode = nodes.find((node) => node.id === selectedStepId);
  const selectedStepData = selectedNode
    ? {
        id: selectedNode.id,
        title: selectedNode.data.title || "",
        description: selectedNode.data.description || "",
        type: selectedNode.data.type || "action",
        status: selectedNode.data.status || "complete",
        inputs: [],
        outputs: [],
        exceptions: stepExceptions[selectedNode.id] ?? selectedNode.data.exceptions ?? [],
      }
    : null;

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
      <section className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center flex-wrap gap-3">
            <h1 className="text-2xl font-bold text-[#0A0A0A] leading-tight">{automation.name}</h1>
            {selectedVersion ? <StatusBadge status={selectedVersion.status} /> : null}
            {latestQuote ? <StatusBadge status={latestQuote.status} /> : null}
          </div>
          <p className="text-gray-500 max-w-2xl leading-relaxed text-sm">
            {automation.description ?? "No description provided yet. Capture the goal of this automation so stakeholders stay aligned."}
          </p>
          <div className="flex items-center gap-4 text-xs text-gray-400 pt-1 flex-wrap">
            <span className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              {selectedVersion?.versionLabel ?? "Draft"} (Current)
            </span>
            <span className="w-1 h-1 rounded-full bg-gray-300" />
            <span className="flex items-center gap-1.5">
              <Calendar size={12} />
              Last updated {formatDateTime(selectedVersion?.updatedAt)} by <span className="text-gray-600 font-medium">Wrk Ops</span>
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0 flex-wrap">
          <Button
            onClick={handleInviteTeam}
            variant="outline"
            className="h-9 text-xs font-medium bg-white hover:bg-gray-50 text-gray-700 border-gray-200"
          >
            <Users size={14} className="mr-2" />
            Invite Team
          </Button>
          <Button
            variant="outline"
            className="h-9 text-xs font-medium bg-white hover:bg-gray-50 text-gray-700 border-gray-200"
            onClick={handleRunTest}
          >
            <Play size={14} className="mr-2" />
            Run Test
          </Button>
          <Button
            onClick={() => setActiveTab("Blueprint")}
            className="h-9 text-xs font-bold bg-[#0A0A0A] hover:bg-gray-900 text-white shadow-lg shadow-gray-900/10 transition-all hover:-translate-y-0.5"
          >
            <Edit3 size={14} className="mr-2" />
            Edit Blueprint
          </Button>
        </div>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiStats.map((kpi) => (
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
                {kpi.trendPositive ? (
                  <ArrowUpRight size={10} />
                ) : (
                  <ArrowRight size={10} className="rotate-45" />
                )}
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

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
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
                <Button type="button" onClick={handleSendForPricing} disabled={transitioning}>
                  {transitioning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                  Request pricing
                </Button>
              ) : awaitingApproval ? (
                <div className="rounded-md border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  Quote sent—awaiting approval.
                </div>
              ) : buildUnderway ? (
                <div className="rounded-md border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  Signed – Build underway.
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="shadow-sm border-gray-100">
            <CardHeader className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-[#0A0A0A]">
                <History size={16} className="text-gray-400" />
                Recent activity
              </div>
              <Button variant="ghost" size="sm" className="h-auto p-0 text-xs text-gray-400 hover:text-[#E43632]">
                View all
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-8 relative before:absolute before:left-2.5 before:top-2 before:h-full before:w-px before:bg-gray-100">
                {activityEntries.map((entry) => (
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

          <div className="bg-amber-50/60 rounded-xl border border-amber-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 flex items-center gap-2 border-b border-amber-100/50">
              <AlertTriangle size={16} className="text-amber-600" />
              <span className="text-sm font-bold text-amber-900">Needs attention</span>
            </div>
            <div className="p-5 space-y-3">
              {MOCK_ATTENTION_ITEMS.map((item) => (
                <div key={item.id} className="rounded-lg bg-white/80 border border-amber-100 p-3 space-y-2">
                  <p className="text-xs font-bold text-amber-900">{item.title}</p>
                  <p className="text-xs text-amber-800">{item.description}</p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full border border-amber-200 text-amber-700 hover:bg-amber-50 hover:text-amber-800 hover:border-amber-300 shadow-sm h-8 text-xs font-bold"
                    onClick={() => handleMockAction(item.title)}
                  >
                    {item.actionLabel}
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <Card className="shadow-sm border-gray-100">
            <CardHeader className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-[#E43632]" />
                <span className="text-sm font-bold text-[#0A0A0A]">Copilot suggestions</span>
              </div>
              <Badge variant="secondary" className="bg-gray-100 text-gray-600 text-[10px]">
                2 New
              </Badge>
            </CardHeader>
            <CardContent className="divide-y divide-gray-50 p-0">
              {MOCK_SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion.title}
                  type="button"
                  className="w-full text-left p-4 hover:bg-gray-50 transition-colors cursor-pointer group"
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
              <Button
                variant="ghost"
                className="w-full text-xs text-gray-500 hover:text-[#E43632] h-auto py-1"
                onClick={() => handleMockAction("Ask Copilot")}
              >
                Ask Copilot for more...
              </Button>
            </div>
          </Card>
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

  const blueprintBuilder = (
    <div className="rounded-3xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="h-14 border-b border-gray-100 bg-white flex items-center px-6 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-6 min-w-max">
          {BLUEPRINT_CHECKLIST.map((item) => (
            <div key={item.id} className="flex items-center gap-2">
              <div
                className={cn(
                  "w-5 h-5 rounded-full border flex items-center justify-center text-[10px] font-bold transition-colors",
                  item.completed ? "bg-[#E43632] border-[#E43632] text-white" : "border-gray-300 text-gray-400 bg-white"
                )}
              >
                {item.completed ? <CheckCircle2 size={12} /> : item.id.charAt(0).toUpperCase()}
              </div>
              <span
                className={cn(
                  "text-xs font-semibold tracking-wide",
                  item.completed ? "text-[#0A0A0A]" : "text-gray-400"
                )}
              >
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="flex h-[640px] bg-gray-50">
        <div className="w-[320px] shrink-0 border-r border-gray-200 bg-[#F9FAFB]">
          <StudioChat isContributorMode={isContributorMode} onAiCommand={handleAiCommand} />
        </div>
        <div className="flex-1 relative h-full">
          <StudioCanvas
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={handleConnectNodes}
            onNodeClick={handleNodeClick}
            isSynthesizing={isSynthesizing}
          />
          <div className="absolute bottom-4 left-4 z-30">
            <button
              onClick={() => setIsContributorMode((prev) => !prev)}
              className="text-[10px] text-gray-500 hover:text-[#E43632] bg-white/70 backdrop-blur px-3 py-1.5 rounded-full border border-gray-200 shadow-sm transition-colors"
            >
              {isContributorMode ? "Switch to builder view" : "Toggle contributor view"}
            </button>
          </div>
        </div>
        <div
          className={cn(
            "h-full bg-white border-l border-gray-200 shadow-xl shadow-gray-200/40 transition-all duration-300 ease-out",
            selectedStepId ? "w-[360px] opacity-100" : "w-0 opacity-0 pointer-events-none"
          )}
        >
          <StudioInspector
            selectedStep={selectedStepData}
            onClose={() => setSelectedStepId(null)}
            onConnect={() =>
              toast({ title: "Connect a system", description: "System picker will plug in here soon." })
            }
            onAddException={() => setShowExceptionModal(true)}
          />
        </div>
      </div>
    </div>
  );

  const blueprintContent = (
    <div className="space-y-6">
      {blueprintBuilder}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="shadow-sm border-gray-100">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Blueprint overview
            </CardTitle>
            <CardDescription>Share the current plan with stakeholders.</CardDescription>
          </CardHeader>
          <CardContent>
            <BlueprintSummary
              blueprint={blueprintDraft ?? initialBlueprint}
              onCreate={selectedVersion ? handleInitializeBlueprint : undefined}
              disableCreate={!selectedVersion}
            />
          </CardContent>
        </Card>
        <Card className="shadow-sm border-gray-100">
          <CardHeader>
            <CardTitle>Blueprint editor</CardTitle>
            <CardDescription>Update status, sections, and canvas steps in one place.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {blueprintError ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{blueprintError}</div>
            ) : null}
            <BlueprintEditorPanel
              blueprint={blueprintDraft}
              onBlueprintChange={handleBlueprintChange}
              onCreateBlueprint={handleInitializeBlueprint}
              onSave={handleSaveBlueprint}
              saving={savingBlueprint}
              canSave={hasBlueprintChanges}
              disabled={!selectedVersion}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );

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
        <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
          {error ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
          ) : null}
          {activeTab === "Overview" ? (
            overviewContent
          ) : activeTab === "Build Status" ? (
            <BuildStatusTab
              status={selectedVersion?.status}
              latestQuote={selectedVersion?.latestQuote}
              lastUpdated={selectedVersion?.updatedAt ?? null}
              versionLabel={selectedVersion?.versionLabel ?? ""}
            />
          ) : activeTab === "Blueprint" ? (
            blueprintContent
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
      </div>
      <ExceptionModal
        isOpen={showExceptionModal}
        onClose={() => setShowExceptionModal(false)}
        onAdd={(rule) => {
          handleAddExceptionRule(rule);
          setShowExceptionModal(false);
        }}
      />
    </div>
  );
}

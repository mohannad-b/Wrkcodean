"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  GitBranch,
  Loader2,
  Send,
  FileText,
  ShieldAlert,
  Signature,
} from "lucide-react";
// import { mockSubmissionMessages } from "@/lib/admin-mock";
import type { AdminSubmission, PricingStatus, ProjectStatus } from "@/lib/types";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { PricingOverridePanel } from "@/components/admin/PricingOverridePanel";
// import { ConversationThread } from "@/components/admin/ConversationThread";
import { WorkflowChatView } from "@/components/workflow-chat/WorkflowChatView";
import dynamic from "next/dynamic";
import { useNodesState, useEdgesState, type Edge } from "reactflow";
import type { StudioCanvasProps } from "@/components/StudioCanvas";
import type { CanvasNodeData } from "@/lib/blueprint/canvas-utils";
import { blueprintToEdges, blueprintToNodes } from "@/lib/blueprint/canvas-utils";
import { createEmptyBlueprint } from "@/lib/blueprint/factory";
import { getBlueprintCompletionState } from "@/lib/blueprint/completion";
import { BLUEPRINT_SECTION_KEYS, BLUEPRINT_SECTION_TITLES, type Blueprint } from "@/lib/blueprint/types";
import { getStatusLabel, resolveStatus } from "@/lib/submissions/lifecycle";

// Dynamically import StudioCanvas to reduce initial bundle size
// ReactFlow is heavy (~200KB), so we only load it when the Blueprint tab is active
const StudioCanvas = dynamic<StudioCanvasProps>(() => import("@/components/StudioCanvas").then((m) => m.StudioCanvas), {
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-[#F9FAFB]">
      <div className="text-sm text-gray-500">Loading canvas...</div>
    </div>
  ),
  ssr: false, // ReactFlow requires client-side only
});
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import type { AutomationLifecycleStatus } from "@/lib/automations/status";

// TODO: replace with real pricing analytics once backend exposes per-run cost metrics.
const ANALYSIS_STATS = [
  { label: "API Cost / Run", value: "$0.012" },
  { label: "Human Time / Run", value: "$1.333" },
  { label: "Total Cost / Run", value: "$1.345" },
  { label: "Est. Monthly Cost (5k runs)", value: "$6726.67" },
];

// TODO: replace with AI suggestions sourced from pricing service tiers.
const AI_SUGGESTIONS = [
  { tier: "0 - 5,000", discount: "0%", price: "$0.0450" },
  { tier: "5,000 - 20,000", discount: "10%", price: "$0.0405" },
  { tier: "20,000 - ∞", discount: "20%", price: "$0.0360" },
];

type Quote = {
  id: string;
  status: string;
  setupFee: string;
  unitPrice: string;
  estimatedVolume: number | null;
  clientMessage: string | null;
};

type SubmissionDetail = {
  id: string;
  name: string;
  status: AutomationLifecycleStatus | string;
  owner?: { name?: string | null } | null;
  automation: {
    id: string;
    name: string;
    description: string | null;
  } | null;
  version: {
    id: string;
    versionLabel: string;
    status: AutomationLifecycleStatus | string;
    intakeNotes: string | null;
    requirementsText: string | null;
    intakeProgress?: number | null;
    workflow?: Blueprint | null;
  } | null;
  quotes: Quote[];
  tasks?: ProjectTask[];
  createdAt?: string;
  updatedAt?: string;
};

type PricingTabProps = {
  project: AdminSubmission;
  latestQuote: Quote | null;
  onPricingSave: (payload: { setupFee: number; unitPrice: number }) => void;
  savingQuote: boolean;
  onQuoteStatus: (status: "SENT" | "SIGNED") => void;
  updatingQuote: "SENT" | "SIGNED" | null;
};

type QuoteStatusCardProps = {
  latestQuote: Quote | null;
  onQuoteStatus: (status: "SENT" | "SIGNED") => void;
  updatingQuote: "SENT" | "SIGNED" | null;
};

type ChecklistItem = {
  key: string;
  title: string;
  progress: number;
  complete: boolean;
};

type ProjectTask = {
  id: string;
  title: string;
  status: "pending" | "in_progress" | "complete";
  priority?: string | null;
  dueDate?: string | null;
  assignee?: {
    id?: string | null;
    name?: string | null;
    avatarUrl?: string | null;
    title?: string | null;
  } | null;
};

const mapLifecycleToSubmissionStatus = (status?: AutomationLifecycleStatus | string | null): ProjectStatus => {
  const resolved = resolveStatus(status ?? "");
  if (resolved === "ReadyForBuild") {
    return "Ready to Launch";
  }
  return getStatusLabel(resolved ?? "IntakeInProgress") as ProjectStatus;
};

const mapQuoteStatusToPricing = (status?: string | null): PricingStatus => {
  switch (status) {
    case "DRAFT":
      return "Draft";
    case "SENT":
      return "Sent";
    case "SIGNED":
      return "Signed";
    default:
      return "Not Generated";
  }
};

interface SubmissionDetailPageProps {
  params: {
    submissionId?: string;
    projectId?: string; // legacy alias
  };
}

// Overview Tab Component
function OverviewTab({ project, checklistItems }: { project: AdminSubmission; checklistItems: ChecklistItem[] }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6 h-full overflow-y-auto">
      {/* Summary Card */}
      <Card className="lg:col-span-2 p-6 space-y-6">
        <div className="flex justify-between items-start">
          <h3 className="font-bold text-lg text-[#0A0A0A]">Version Summary</h3>
          {project.type === "Revision" && (
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
              <GitBranch size={12} className="mr-1" /> Revision
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <p className="text-xs text-gray-500 uppercase font-bold">Description</p>
            <p className="text-sm text-gray-700 leading-relaxed">
              {project.description || "No description provided"}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-gray-500 uppercase font-bold">Systems Involved</p>
            <div className="flex flex-wrap gap-2">
              {project.systems && project.systems.length > 0 ? (
                project.systems.map((s) => (
                  <Badge key={s} variant="secondary" className="bg-gray-100 text-gray-600">
                    {s}
                  </Badge>
                ))
              ) : (
                <span className="text-xs text-gray-400">No systems defined</span>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 pt-4 border-t border-gray-100">
          <div>
            <p className="text-xs text-gray-500 uppercase font-bold mb-1">Risk Level</p>
            {(() => {
              const riskLevel = project.risk ?? "Unknown";
              const riskClass =
                project.risk === "Low"
                  ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                  : project.risk === "Medium"
                  ? "bg-amber-100 text-amber-700 hover:bg-amber-100"
                  : project.risk === "High"
                  ? "bg-red-100 text-red-700 hover:bg-red-100"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-100";
              return (
                <Badge className={cn("border-none", riskClass)}>
                  {riskLevel === "Unknown" ? "Risk TBD" : `${riskLevel} Risk`}
                </Badge>
              );
            })()}
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase font-bold mb-1">Complexity</p>
            <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-none">
              Medium
            </Badge>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase font-bold mb-1">Est. Build Time</p>
            <p className="text-sm font-bold text-gray-700">3 Days</p>
          </div>
        </div>
      </Card>

      {/* Checklist Card */}
      <Card className="lg:col-span-1 p-6 flex flex-col h-full">
        <h3 className="font-bold text-lg text-[#0A0A0A] mb-4">Requirements Checklist</h3>

        {project.checklistProgress < 100 && (
          <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 mb-4 flex items-start gap-2">
            <AlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-bold text-amber-800">In Progress</p>
              <p className="text-[10px] text-amber-700">
                {100 - project.checklistProgress}% remaining
              </p>
            </div>
          </div>
        )}

        <div className="space-y-3 flex-1">
          {checklistItems.map((item) => {
            const isComplete = item.complete || item.progress >= 1;
            return (
              <div key={item.key} className="flex items-center justify-between text-sm">
                <span className={cn("text-gray-600", !isComplete && "text-amber-600 font-medium")}>
                  {item.title}
                </span>
                {isComplete ? (
                  <CheckCircle2 size={16} className="text-emerald-500" />
                ) : (
                  <div className="flex items-center gap-1 text-amber-600 text-xs">
                    <AlertTriangle size={16} className="text-amber-500" />
                    <span className="text-[11px]">{Math.round(item.progress * 100)}%</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <Button variant="outline" className="mt-4 w-full border-gray-200 text-gray-600 hover:text-[#0A0A0A]">
          View Full Requirements
        </Button>
      </Card>
    </div>
  );
}

interface SubmissionHeaderProps {
  displayProject: AdminSubmission;
  projectName: string;
  canMarkLive: boolean;
  markingLive: boolean;
  onMarkLive: () => void;
  latestQuote: Quote | null;
  onMarkQuoteSigned: () => void;
  updatingQuote: "SENT" | "SIGNED" | null;
}

function SubmissionHeader({
  displayProject,
  projectName,
  canMarkLive,
  markingLive,
  onMarkLive,
  latestQuote,
  onMarkQuoteSigned,
  updatingQuote,
}: SubmissionHeaderProps) {
  return (
    <header className="bg-white border-b border-gray-200 px-6 py-4 shrink-0 z-20 shadow-sm">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Link href="/admin/submissions" className="hover:text-[#0A0A0A] flex items-center gap-1 transition-colors">
            <ArrowLeft size={12} /> Submissions
          </Link>
          <span>/</span>
          <span className="font-bold text-[#0A0A0A]">{displayProject.clientName}</span>
          <span>/</span>
          <span className="font-bold text-[#0A0A0A]">{projectName}</span>
        </div>

        <div className="flex items-center justify-between gap-4 flex-wrap">
          <CommercialSummary displayProject={displayProject} projectName={projectName} />
          <AdminActions
            canMarkLive={canMarkLive}
            markingLive={markingLive}
            onMarkLive={onMarkLive}
            canMarkSigned={latestQuote?.status === "SENT"}
            onMarkSigned={onMarkQuoteSigned}
            updatingQuote={updatingQuote}
          />
        </div>
      </div>
    </header>
  );
}

interface CommercialSummaryProps {
  displayProject: AdminSubmission;
  projectName: string;
}

function CommercialSummary({ displayProject, projectName }: CommercialSummaryProps) {
  return (
    <div className="flex items-center gap-4">
      <Link
        href={`/admin/clients/${displayProject.clientId}`}
        className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center border border-gray-200 text-gray-500 font-bold text-lg hover:bg-gray-200 transition-colors"
        title={`View ${displayProject.clientName} client details`}
      >
        {displayProject.clientName.charAt(0)}
      </Link>
      <div>
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold text-[#0A0A0A] leading-none">{projectName}</h1>
          <Badge variant="outline" className="text-sm bg-blue-50 text-blue-700 border-blue-200 font-mono">
            {displayProject.version}
          </Badge>
          <StatusBadge status={displayProject.status} className="text-sm" />
        </div>
        <p className="text-xs text-gray-500 flex items-center gap-2 flex-wrap">
          <Link href={`/admin/clients/${displayProject.clientId}`} className="hover:text-[#0A0A0A] hover:underline transition-colors">
            Client: <span className="font-bold">{displayProject.clientName}</span>
          </Link>
          <span className="w-1 h-1 bg-gray-300 rounded-full" />
          <span>
            ETA: <span className="font-bold">{displayProject.eta}</span>
          </span>
          <span className="w-1 h-1 bg-gray-300 rounded-full" />
          <span>
            Owner: <span className="font-bold">{displayProject.owner.name}</span>
          </span>
        </p>
      </div>
    </div>
  );
}

interface AdminActionsProps {
  canMarkLive: boolean;
  markingLive: boolean;
  onMarkLive: () => void;
  canMarkSigned: boolean;
  onMarkSigned: () => void;
  updatingQuote: "SENT" | "SIGNED" | null;
}

function AdminActions({ canMarkLive, markingLive, onMarkLive, canMarkSigned, onMarkSigned, updatingQuote }: AdminActionsProps) {
  return (
    <div className="flex gap-2 flex-wrap">
      <Button variant="outline" asChild>
        <Link href="/admin/submissions">Back to submissions</Link>
      </Button>
      {canMarkLive ? (
        <Button onClick={onMarkLive} disabled={markingLive}>
          {markingLive ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
          Mark Live
        </Button>
      ) : null}
      {canMarkSigned ? (
        <Button onClick={onMarkSigned} disabled={updatingQuote === "SIGNED"}>
          {updatingQuote === "SIGNED" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Signature className="mr-2 h-4 w-4" />}
          Mark Signed
        </Button>
      ) : null}
      <Button className="bg-[#0A0A0A] text-white hover:bg-gray-800">Save Changes</Button>
    </div>
  );
}

// Blueprint Tab Component
function BlueprintTab({ requirementsText, workflow }: { requirementsText?: string | null; workflow?: Blueprint | null }) {
  const blueprint = useMemo(() => workflow ?? createEmptyBlueprint(), [workflow]);
  const initialNodes = useMemo(() => blueprintToNodes(blueprint), [blueprint]);
  const initialEdges = useMemo(() => blueprintToEdges(blueprint), [blueprint]);

  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNodeData>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initialEdges);

  useEffect(() => {
    setNodes(blueprintToNodes(blueprint));
    setEdges(blueprintToEdges(blueprint));
  }, [blueprint, setEdges, setNodes]);

  const hasSteps = blueprint.steps.length > 0;
  return (
    <div className="flex h-full border-t border-gray-200">
      {/* Left: Requirements */}
      <div className="w-80 border-r border-gray-200 bg-white flex flex-col">
        <div className="p-4 border-b border-gray-100 font-bold text-sm text-gray-700">Requirements</div>
        <ScrollArea className="flex-1 p-4">
          {requirementsText?.trim() ? (
            <p className="text-xs text-gray-800 whitespace-pre-wrap leading-relaxed">{requirementsText}</p>
          ) : (
            <p className="text-xs text-gray-400">No requirements captured yet.</p>
          )}
        </ScrollArea>
      </div>

      {/* Center: Canvas */}
      <div className="flex-1 bg-gray-50 relative">
        {hasSteps ? (
          <>
            <StudioCanvas
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={() => {}}
              onNodeClick={() => {}}
              isSynthesizing={false}
            />
            <div className="absolute top-4 right-4 bg-white/90 backdrop-blur p-2 rounded-lg shadow-sm border border-gray-200 text-xs text-gray-500">
              Ops Edit Mode
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-gray-500">No steps defined yet.</div>
        )}
      </div>

      {/* Right: Internal Notes */}
      <div className="w-80 border-l border-gray-200 bg-white flex flex-col">
        <div className="p-4 border-b border-gray-100 flex justify-between items-center">
          <span className="font-bold text-sm text-gray-700">Internal Notes</span>
          <Button size="sm" variant="ghost" className="h-6 px-2">
            <span className="text-lg">+</span>
          </Button>
        </div>
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4">
            <div className="p-3 border border-amber-100 bg-amber-50 rounded-lg">
              <div className="flex items-center gap-2 text-amber-700 font-bold text-xs mb-1">
                <ShieldAlert size={12} /> Compliance Check
              </div>
              <p className="text-xs text-amber-900">
                Needs verification of the Sanctions API rate limits. We might need to cache results.
              </p>
            </div>
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

// Tasks Tab Component
function TasksTab({ tasks }: { tasks: ProjectTask[] }) {
  const grouped = useMemo(
    () => ({
      backlog: tasks.filter((task) => task.status === "pending"),
      in_progress: tasks.filter((task) => task.status === "in_progress"),
      qa: [] as ProjectTask[],
      done: tasks.filter((task) => task.status === "complete"),
    }),
    [tasks]
  );

  const columns = [
    { id: "backlog", label: "Backlog", items: grouped.backlog, color: "bg-gray-200" },
    { id: "in_progress", label: "In Progress", items: grouped.in_progress, color: "bg-blue-500" },
    { id: "qa", label: "QA", items: grouped.qa, color: "bg-pink-500" },
    { id: "done", label: "Done", items: grouped.done, color: "bg-emerald-500" },
  ];

  const renderDueDate = (value?: string | null) => {
    if (!value) return "No due date";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "No due date";
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };

  if (!tasks || tasks.length === 0) {
    return (
      <div className="p-6 h-full overflow-x-auto bg-gray-50">
        <div className="flex h-full items-center justify-center text-sm text-gray-500 border border-dashed border-gray-200 rounded-xl bg-white">
          No build tasks yet for this version.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 h-full overflow-x-auto bg-gray-50">
      <div className="flex gap-6 h-full min-w-[1000px]">
        {columns.map((col) => (
          <div key={col.id} className="w-[300px] flex flex-col h-full">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className={cn("w-2 h-2 rounded-full", col.color)} />
                <h3 className="font-bold text-sm text-gray-700">{col.label}</h3>
                <span className="text-xs text-gray-400 bg-white px-2 py-0.5 rounded-full border border-gray-200">
                  {col.items.length}
                </span>
              </div>
            </div>

            <div className="flex-1 bg-gray-200/50 rounded-xl p-2 space-y-3 overflow-y-auto">
              {col.items.map((task) => (
                <Card key={task.id} className="p-3 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex justify-between items-start mb-2">
                    <p className="text-sm font-bold text-[#0A0A0A] leading-tight">{task.title}</p>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] border",
                        task.priority === "blocker"
                          ? "border-red-200 bg-red-50 text-red-700"
                          : task.priority === "important"
                          ? "border-amber-200 bg-amber-50 text-amber-700"
                          : "border-gray-200 bg-white text-gray-500"
                      )}
                    >
                      {task.priority ?? "optional"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-50">
                    <div className="flex items-center gap-1.5">
                      <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-[9px] font-bold text-gray-600">
                        {(task.assignee?.name ?? "Unassigned").charAt(0)}
                      </div>
                      <span className="text-[10px] text-gray-500">{task.assignee?.name ?? "Unassigned"}</span>
                    </div>
                    <div className="text-[10px] px-1.5 py-0.5 rounded bg-gray-50 text-gray-500">
                      {renderDueDate(task.dueDate)}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Activity Tab Component
function ActivityTab({ automationVersionId: _automationVersionId }: { automationVersionId?: string }) {
  const activityLog = [
    { id: 1, type: "internal", text: "Pricing draft generated by Mike Ross", time: "2h ago" },
    { id: 2, type: "client", text: "Client uploaded 'Updated_SOP_v2.docx'", time: "4h ago" },
    { id: 3, type: "system", text: "Blueprint v1.1 created from v1.0", time: "1d ago" },
  ];

  return (
    <div className="max-w-3xl mx-auto p-8 space-y-8">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-lg text-[#0A0A0A]">Submission Timeline</h3>
        <Button variant="outline" size="sm">
          <FileText size={14} className="mr-2" /> Export Log
        </Button>
      </div>

      <div className="relative border-l border-gray-200 ml-4 space-y-8">
        {activityLog.map((log) => (
          <div key={log.id} className="relative pl-8">
            <div
              className={cn(
                "absolute -left-[9px] top-0 w-4 h-4 rounded-full border-2 border-white shadow-sm",
                log.type === "client"
                  ? "bg-blue-500"
                  : log.type === "internal"
                  ? "bg-gray-500"
                  : "bg-purple-500"
              )}
            />
            <div className="flex flex-col">
              <span className="text-sm font-medium text-gray-800">{log.text}</span>
              <span className="text-xs text-gray-400 mt-1">{log.time}</span>
            </div>
          </div>
        ))}
        <div className="relative pl-8">
          <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full border-2 border-white bg-gray-200 shadow-sm" />
          <span className="text-sm text-gray-400 italic">Submission Created (Oct 20)</span>
        </div>
      </div>
    </div>
  );
}

function PricingTab({ project, latestQuote, onPricingSave, savingQuote, onQuoteStatus, updatingQuote }: PricingTabProps) {
  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <div className="grid gap-6 lg:grid-cols-[320px,_1fr]">
          <div className="space-y-4">
            <Card className="p-6 space-y-4">
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase">Internal & AI Analysis</p>
                <p className="text-sm text-gray-500">Estimated costs per run</p>
              </div>
              <div className="grid grid-cols-1 gap-4">
                {ANALYSIS_STATS.map((stat) => (
                  <div key={stat.label} className="rounded-lg border border-gray-100 bg-white/70 p-3">
                    <p className="text-[10px] font-bold text-gray-400 uppercase">{stat.label}</p>
                    <p className="text-lg font-mono font-bold text-[#0A0A0A]">{stat.value}</p>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <div className="p-6">
                <p className="text-xs font-bold text-gray-500 uppercase">AI Suggestions</p>
                <p className="text-sm text-gray-500">Recommended build fee and tiers</p>
              </div>
              <div className="border-t border-gray-100">
                <div className="grid grid-cols-3 text-[11px] font-bold text-gray-400 uppercase px-6 py-2">
                  <span>Volume</span>
                  <span>Discount</span>
                  <span className="text-right">Final Price</span>
                </div>
                <div className="divide-y divide-gray-100">
                  {AI_SUGGESTIONS.map((tier) => (
                    <div key={tier.tier} className="grid grid-cols-3 px-6 py-3 text-sm text-gray-700">
                      <span>{tier.tier}</span>
                      <span>{tier.discount}</span>
                      <span className="text-right font-mono font-semibold">{tier.price}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </div>

          <div className="space-y-4">
            <QuoteStatusCard latestQuote={latestQuote} onQuoteStatus={onQuoteStatus} updatingQuote={updatingQuote} />
            <div className="relative">
              <PricingOverridePanel
                project={project}
                onSave={(payload) => onPricingSave({ setupFee: payload.setupFee, unitPrice: payload.unitPrice })}
              />
              {savingQuote ? (
                <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-white/70 backdrop-blur-sm">
                  <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function QuoteStatusCard({ latestQuote, onQuoteStatus, updatingQuote }: QuoteStatusCardProps) {
  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-[#0A0A0A]">Quote Status</h3>
          <p className="text-sm text-gray-500">
            {latestQuote ? "Tracking the most recent pricing draft" : "No quote drafted yet. Use the panel below."}
          </p>
        </div>
        {latestQuote ? (
          <Badge variant="outline" className="font-mono text-xs bg-gray-50 border-gray-200">
            {latestQuote.status}
          </Badge>
        ) : null}
      </div>

      {latestQuote ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
              <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Setup Fee</p>
              <p className="font-mono text-lg font-bold text-[#0A0A0A]">${Number(latestQuote.setupFee).toLocaleString()}</p>
            </div>
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
              <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Unit Price</p>
              <p className="font-mono text-lg font-bold text-[#0A0A0A]">${Number(latestQuote.unitPrice)}</p>
            </div>
          </div>
          {latestQuote.clientMessage ? (
            <p className="text-xs text-gray-500 border border-gray-100 rounded-lg p-3 bg-gray-50">
              {latestQuote.clientMessage}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {latestQuote.status === "DRAFT" ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onQuoteStatus("SENT")}
                disabled={updatingQuote !== null}
              >
                {updatingQuote === "SENT" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                Mark Sent
              </Button>
            ) : null}
            {latestQuote.status === "SENT" ? (
              <Button size="sm" onClick={() => onQuoteStatus("SIGNED")} disabled={updatingQuote === "SIGNED"}>
                {updatingQuote === "SIGNED" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Signature className="mr-2 h-4 w-4" />
                )}
                Mark Signed
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
          No quote drafted yet.
        </div>
      )}
    </Card>
  );
}

export default function SubmissionDetailPage({ params }: SubmissionDetailPageProps) {
  const submissionId = params.submissionId ?? params.projectId;
  const [project, setProject] = useState<SubmissionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [updatingQuote, setUpdatingQuote] = useState<"SENT" | "SIGNED" | null>(null);
  const [markingLive, setMarkingLive] = useState(false);
  const [savingQuote, setSavingQuote] = useState(false);
  const [recipientName, setRecipientName] = useState("Sarah Chen");
  const [recipientEmail, setRecipientEmail] = useState("test@example.com");
  const emailTypes = useMemo(
    () => [
      {
        id: "marketing.welcome",
        label: "Marketing • Welcome",
        defaults: (user: { name: string; email: string }) => ({
          firstName: user.name.split(" ")[0] ?? "there",
          logoUrl: "https://framerusercontent.com/images/6JnCZVCcfPnCQ8H5xwNdICaCSI.png",
          ctaLink: "https://app.wrkcopilot.com",
          documentationLink: "https://wrkcopilot.com/docs",
          unsubscribeLink: "https://wrkcopilot.com/unsubscribe",
          privacyLink: "https://wrkcopilot.com/privacy",
          helpLink: "https://wrkcopilot.com/help",
          physicalAddress: "1250 Rene-Levesque West, Montreal, Quebec, Canada",
          year: "2026",
        }),
      },
      {
        id: "transactional.user-invite",
        label: "Transactional • User Invite",
        defaults: (user: { name: string; email: string }) => ({
          inviterName: "Michael Scott",
          workspaceName: project?.name ?? "Workspace",
          inviteeEmail: user.email,
          inviteLink: "https://app.wrkcopilot.com/invite/accept",
          unsubscribeLink: "https://wrkcopilot.com/unsubscribe",
          privacyLink: "https://wrkcopilot.com/privacy",
          helpLink: "https://wrkcopilot.com/help",
          physicalAddress: "1250 Rene-Levesque West, Montreal, Quebec, Canada",
          year: "2026",
        }),
      },
      {
        id: "notification.automation-deployed",
        label: "Notification • Automation Deployed",
        defaults: (_user: { name: string; email: string }) => ({
          automationName: project?.name ?? "Automation",
          environment: "Production",
          deployedBy: project?.owner?.name ?? "Ops Team",
          deployedTime: "Oct 24, 2:30 PM EST",
          ctaLink: "https://app.wrkcopilot.com/automations/123",
          unsubscribeLink: "https://wrkcopilot.com/unsubscribe",
          privacyLink: "https://wrkcopilot.com/privacy",
          helpLink: "https://wrkcopilot.com/help",
          physicalAddress: "1250 Rene-Levesque West, Montreal, Quebec, Canada",
          year: "2026",
        }),
      },
      {
        id: "transactional.invoice-receipt",
        label: "Transactional • Invoice Receipt",
        defaults: (_user: { name: string; email: string }) => ({
          planName: "Pro Plan",
          invoiceNumber: "INV-2024-001",
          invoiceDate: "Oct 24, 2024",
          invoiceItem: "Pro Plan (Monthly)",
          invoiceAmount: "$49.00",
          invoiceTotal: "$49.00",
          downloadLink: "https://app.wrkcopilot.com/invoices/123.pdf",
          billingSupportLink: "https://wrkcopilot.com/billing-support",
          unsubscribeLink: "https://wrkcopilot.com/unsubscribe",
          privacyLink: "https://wrkcopilot.com/privacy",
          helpLink: "https://wrkcopilot.com/help",
          physicalAddress: "1250 Rene-Levesque West, Montreal, Quebec, Canada",
          year: "2026",
        }),
      },
    ],
    [project?.name, project?.owner?.name]
  );
  const [selectedEmailType, setSelectedEmailType] = useState(emailTypes[0].id);
  const [emailVariablesText, setEmailVariablesText] = useState(
    JSON.stringify(emailTypes[0].defaults({ name: recipientName, email: recipientEmail }), null, 2)
  );
  const [emailSendStatus, setEmailSendStatus] = useState<string | null>(null);

  useEffect(() => {
    if (params.projectId && !params.submissionId) {
      console.warn("[DEPRECATION] /admin/projects/[id] is deprecated; use /admin/submissions/[id].");
    }
  }, [params.projectId, params.submissionId]);

  const fetchProject = useCallback(async () => {
    setLoading(true);
    setError(null);
    if (!submissionId) {
      setError("Missing submission id");
      setLoading(false);
      return;
    }
    try {
      const response = await fetch(`/api/admin/submissions/${submissionId}`, { cache: "no-store" });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "Failed to load submission");
      }
      const data = (await response.json()) as { submission: SubmissionDetail };
      setProject(data.submission);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
      setProject(null);
    } finally {
      setLoading(false);
    }
  }, [params.projectId]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  useEffect(() => {
    const type = emailTypes.find((t) => t.id === selectedEmailType) ?? emailTypes[0];
    setEmailVariablesText(JSON.stringify(type.defaults({ name: recipientName, email: recipientEmail }), null, 2));
  }, [selectedEmailType, recipientName, recipientEmail, emailTypes]);

  const latestQuote = useMemo(() => project?.quotes[0] ?? null, [project]);
  const blueprint = useMemo(() => project?.version?.workflow ?? null, [project]);
  const completionState = useMemo(() => getBlueprintCompletionState(blueprint), [blueprint]);
  const completionPercent = useMemo(
    () => Math.max(Math.round(completionState.score * 100), project?.version?.intakeProgress ?? 0),
    [completionState.score, project?.version?.intakeProgress]
  );
  const checklistItems = useMemo<ChecklistItem[]>(
    () =>
      BLUEPRINT_SECTION_KEYS.map((key) => {
        const section = completionState.sections.find((item) => item.key === key);
        return {
          key,
          title: BLUEPRINT_SECTION_TITLES[key],
          progress: section?.progress ?? 0,
          complete: section?.complete ?? false,
        };
      }),
    [completionState.sections]
  );
  const derivedSystems = useMemo(() => {
    const systems = new Set<string>();
    if (blueprint) {
      blueprint.sections
        .filter((section) => section.key === "systems")
        .forEach((section) => {
          section.content
            .split(/[\n,]/)
            .map((item) => item.trim())
            .filter(Boolean)
            .forEach((item) => systems.add(item));
        });
      blueprint.steps.forEach((step) => {
        step.systemsInvolved.forEach((system) => {
          const trimmed = system.trim();
          if (trimmed) systems.add(trimmed);
        });
      });
    }
    return Array.from(systems);
  }, [blueprint]);

  if (loading && !project) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-50">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-10 space-y-3">
        <p className="text-sm text-gray-600">Submission not found.</p>
        <Button variant="link" className="px-0" asChild>
          <Link href="/admin/submissions">Back to submissions</Link>
        </Button>
      </div>
    );
  }

  const formatRelativeTime = (value?: string) => {
    if (!value) return "—";
    const date = new Date(value);
    const diff = Date.now() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const displayProject: AdminSubmission = {
    id: project.id,
    clientId: project.automation?.id ?? project.id,
    clientName: project.automation?.name ?? "Client",
    name: project.name ?? project.automation?.name ?? "Automation",
    version: project.version?.versionLabel ?? "v1.0",
    type: project.version?.versionLabel?.toLowerCase().includes("v1.") ? "New Automation" : "Revision",
    status: mapLifecycleToSubmissionStatus(project.status),
    pricingStatus: latestQuote ? mapQuoteStatusToPricing(latestQuote.status) : "Not Generated",
    checklistProgress: completionPercent,
    systems: derivedSystems,
    owner: { name: "Unassigned", avatar: "", role: "" },
    eta: "TBD",
    lastUpdated: project.updatedAt ?? project.createdAt ?? new Date().toISOString(),
    lastUpdatedRelative: formatRelativeTime(project.updatedAt ?? project.createdAt ?? undefined),
    description: project.automation?.description ?? project.automation?.name ?? "",
    risk: undefined,
    estimatedVolume: latestQuote?.estimatedVolume ?? undefined,
    setupFee: latestQuote ? Number(latestQuote.setupFee) : undefined,
    unitPrice: latestQuote ? Number(latestQuote.unitPrice) : undefined,
    effectiveUnitPrice: latestQuote ? Number(latestQuote.unitPrice) : undefined,
  };

  const handleQuoteStatus = async (nextStatus: "SENT" | "SIGNED") => {
    if (!latestQuote) return;
    setUpdatingQuote(nextStatus);
    setError(null);
    try {
      const response = await fetch(`/api/quotes/${latestQuote.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "Failed to update quote");
      }
      await fetchProject();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update quote status");
    } finally {
      setUpdatingQuote(null);
    }
  };

  const handleMarkLive = async () => {
    if (!project.version) return;
    setMarkingLive(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/automation-versions/${project.version.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Live" }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "Failed to mark live");
      }
      await fetchProject();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to mark live");
    } finally {
      setMarkingLive(false);
    }
  };

  const handlePricingSave = async ({ setupFee, unitPrice }: { setupFee: number; unitPrice: number }) => {
    if (!project.version || savingQuote || !submissionId) {
      return;
    }
    setSavingQuote(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/submissions/${submissionId}/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setupFee, unitPrice }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "Failed to draft quote");
      }
      await fetchProject();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to draft quote");
    } finally {
      setSavingQuote(false);
    }
  };

  const handleSendEmail = async () => {
    try {
      const parsed = JSON.parse(emailVariablesText);
      setEmailSendStatus("Sending...");
      const res = await fetch("/api/admin/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: recipientEmail,
          templateId: selectedEmailType,
          variables: parsed,
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error ?? "Failed to send email");
      }
      setEmailSendStatus(`Sent ${selectedEmailType} to ${recipientEmail}`);
    } catch (err) {
      setEmailSendStatus(err instanceof Error ? err.message : "Invalid variables JSON");
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 text-[#1A1A1A] font-sans">
      <SubmissionHeader
        displayProject={displayProject}
        projectName={project.name}
        canMarkLive={project.version?.status === "BuildInProgress"}
        markingLive={markingLive}
        onMarkLive={handleMarkLive}
        latestQuote={latestQuote}
        onMarkQuoteSigned={() => handleQuoteStatus("SIGNED")}
        updatingQuote={updatingQuote}
      />

      {error ? (
        <div className="bg-red-50 border-b border-red-200 px-6 py-2 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
            <div className="px-6 border-b border-gray-200 bg-white shrink-0">
              <TabsList className="h-12 bg-transparent p-0 gap-8">
                {["Overview", "Requirements & Blueprint", "Pricing & Quote", "Build Tasks", "Activity", "Emails", "Chat"].map((tab) => {
                  const value = tab.toLowerCase().replace(/ & /g, "-").replace(/ /g, "-");
                  return (
                    <TabsTrigger
                      key={value}
                      value={value}
                      className={cn(
                        "h-full rounded-none border-b-2 bg-transparent px-0 text-sm font-medium text-gray-500 shadow-none transition-none data-[state=active]:border-[#E43632] data-[state=active]:text-[#E43632] data-[state=active]:shadow-none hover:text-gray-900"
                      )}
                    >
                      {tab}
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </div>

            <div className="flex-1 bg-gray-50 overflow-hidden relative">
              <TabsContent value="overview" className="h-full m-0 data-[state=inactive]:hidden">
                <OverviewTab project={displayProject} checklistItems={checklistItems} />
              </TabsContent>
              <TabsContent value="requirements-blueprint" className="h-full m-0 data-[state=inactive]:hidden">
                <BlueprintTab requirementsText={project.version?.requirementsText} workflow={blueprint} />
              </TabsContent>
              <TabsContent value="pricing-quote" className="h-full m-0 data-[state=inactive]:hidden">
                <PricingTab
                  project={displayProject}
                  latestQuote={latestQuote}
                  onPricingSave={handlePricingSave}
                  savingQuote={savingQuote}
                  onQuoteStatus={handleQuoteStatus}
                  updatingQuote={updatingQuote}
                />
              </TabsContent>
              <TabsContent value="build-tasks" className="h-full m-0 data-[state=inactive]:hidden">
                <TasksTab tasks={project.tasks ?? []} />
              </TabsContent>
              <TabsContent value="activity" className="h-full m-0 data-[state=inactive]:hidden">
                <ActivityTab automationVersionId={project.version?.id ?? ""} />
              </TabsContent>
              <TabsContent value="emails" className="h-full m-0 data-[state=inactive]:hidden">
                <div className="p-6 space-y-4 overflow-auto h-full">
                  <h3 className="text-lg font-bold text-[#0A0A0A]">Send Email</h3>
                  <Card className="p-4 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-gray-600">Recipient email</label>
                        <input
                          className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
                          value={recipientEmail}
                          onChange={(e) => setRecipientEmail(e.target.value)}
                          placeholder="user@example.com"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-gray-600">Recipient name</label>
                        <input
                          className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
                          value={recipientName}
                          onChange={(e) => setRecipientName(e.target.value)}
                          placeholder="First Last"
                        />
                      </div>
                      <div className="space-y-2 md:col-span-1">
                        <label className="text-xs font-semibold text-gray-600">Template</label>
                        <select
                          className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
                          value={selectedEmailType}
                          onChange={(e) => setSelectedEmailType(e.target.value)}
                        >
                          {emailTypes.map((type) => (
                            <option key={type.id} value={type.id}>
                              {type.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-gray-600 flex items-center justify-between">
                        Variables (JSON)
                        <span className="text-[10px] text-gray-400">Edit as needed before sending</span>
                      </label>
                      <textarea
                        className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-mono"
                        rows={12}
                        value={emailVariablesText}
                        onChange={(e) => setEmailVariablesText(e.target.value)}
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <Button onClick={handleSendEmail}>
                        <Send className="mr-2 h-4 w-4" />
                        Send Email
                      </Button>
                      {emailSendStatus ? <span className="text-sm text-gray-600">{emailSendStatus}</span> : null}
                      <span className="text-xs text-gray-400">(stub only; wire to backend send endpoint)</span>
                    </div>
                  </Card>
                </div>
              </TabsContent>
              <TabsContent value="chat" className="h-full m-0 data-[state=inactive]:hidden">
                {project.version?.id ? (
                  <WorkflowChatView 
                    workflowId={project.version.id} 
                    workflowName={project.name || project.automation?.name}
                  />
                ) : (
                  <div className="h-full flex items-center justify-center text-gray-500">
                    <div className="text-center">
                      <p className="text-sm">No automation version found for this submission.</p>
                      <p className="text-xs text-gray-400 mt-2">Chat is only available for submissions with an automation version.</p>
                    </div>
                  </div>
                )}
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Loader2,
  ArrowLeft,
  DollarSign,
  Send,
  Signature,
  CheckCircle2,
  Activity,
  TrendingUp,
  PiggyBank,
  AlertCircle,
} from "lucide-react";

type Quote = {
  id: string;
  status: string;
  setupFee: string;
  unitPrice: string;
  estimatedVolume: number | null;
  clientMessage: string | null;
};

type ProjectDetail = {
  id: string;
  name: string;
  status: string;
  automation: {
    id: string;
    name: string;
    description: string | null;
  } | null;
  version: {
    id: string;
    versionLabel: string;
    status: string;
    intakeNotes: string | null;
  } | null;
  quotes: Quote[];
};

interface ProjectPageProps {
  params: {
    projectId: string;
  };
}

const MOCK_BILLING_SNAPSHOT = {
  committedMonthlySpend: 12500,
  currentMonthSpend: 4200,
  setupFeesCollected: 8000,
  utilizationPercent: 78,
};
// TODO: replace billing snapshot mock with real spend data once finance pipeline is ready.

const MOCK_RUN_METRICS = {
  runsThisWeek: 32,
  successRate: 0.97,
  avgHandleTime: "3m 12s",
};
// TODO: replace run metrics mock with Wrk engine telemetry.

const MOCK_ACTIVITY_LOG = [
  { title: "Pricing draft generated", time: "2h ago", actor: "Mike Ross", detail: "Setup fee updated to $6,000" },
  { title: "Client uploaded doc", time: "4h ago", actor: "Client", detail: "Added Updated_SOW_v3.pdf" },
  { title: "Automation moved to Ready", time: "1d ago", actor: "Ops Bot", detail: "Version v1.2 moved to Ready to Build" },
];
// TODO: replace activity log mock with project audit trail.

const MOCK_SYSTEMS = ["Salesforce", "Xero", "Slack"];
// TODO: replace mock systems with real integrations.

const MOCK_CHECKLIST_ITEMS = [
  { id: "overview", label: "Overview" },
  { id: "requirements", label: "Business Requirements" },
  { id: "objectives", label: "Business Objectives" },
  { id: "criteria", label: "Success Criteria" },
  { id: "systems", label: "Systems" },
  { id: "data", label: "Data Needs" },
  { id: "exceptions", label: "Exceptions" },
  { id: "human", label: "Human Touchpoints" },
  { id: "flow", label: "Flow Complete" },
];

export default function ProjectDetailPage({ params }: ProjectPageProps) {
  const router = useRouter();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quoteForm, setQuoteForm] = useState({
    setupFee: "",
    unitPrice: "",
    estimatedVolume: "",
    clientMessage: "",
  });
  const [creatingQuote, setCreatingQuote] = useState(false);
  const [updatingQuote, setUpdatingQuote] = useState<"SENT" | "SIGNED" | null>(null);
  const [markingLive, setMarkingLive] = useState(false);

  const fetchProject = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/projects/${params.projectId}`, { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Failed to load project");
      }
      const data = (await response.json()) as { project: ProjectDetail };
      setProject(data.project);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProject();
  }, [params.projectId]);

  const latestQuote = useMemo(() => project?.quotes[0] ?? null, [project]);

  const handleQuoteSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!quoteForm.setupFee || !quoteForm.unitPrice) {
      setError("Setup fee and unit price are required");
      return;
    }
    setCreatingQuote(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/projects/${params.projectId}/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          setupFee: Number(quoteForm.setupFee),
          unitPrice: Number(quoteForm.unitPrice),
          estimatedVolume: quoteForm.estimatedVolume ? Number(quoteForm.estimatedVolume) : undefined,
          clientMessage: quoteForm.clientMessage,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to draft quote");
      }
      setQuoteForm({ setupFee: "", unitPrice: "", estimatedVolume: "", clientMessage: "" });
      await fetchProject();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create quote");
    } finally {
      setCreatingQuote(false);
    }
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
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to update quote");
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
        body: JSON.stringify({ status: "LIVE" }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to mark live");
      }
      await fetchProject();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to mark live");
    } finally {
      setMarkingLive(false);
    }
  };

  if (loading && !project) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-10">
        <p className="text-sm text-gray-600">Project not found.</p>
        <Button variant="link" className="px-0" onClick={() => router.push("/admin/projects")}>
          Back to projects
        </Button>
      </div>
    );
  }

  const summaryDescription =
    project.automation?.description ?? project.automation?.name ?? "Automation archived";
  const checklistCompleted = project.version?.status === "LIVE" ? MOCK_CHECKLIST_ITEMS.length : Math.ceil(MOCK_CHECKLIST_ITEMS.length * 0.6);

  return (
    <div className="flex-1 flex flex-col bg-gray-50">
      <div className="bg-white border-b border-gray-200 shrink-0">
        <div className="max-w-6xl mx-auto px-6 py-4 space-y-3">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Link href="/admin/projects" className="flex items-center gap-1 hover:text-[#0A0A0A]">
              <ArrowLeft className="h-4 w-4" /> Projects
            </Link>
            <span className="text-gray-300">/</span>
            <span className="text-[#0A0A0A] font-semibold">{project.name}</span>
          </div>
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-[#0A0A0A] leading-tight">{project.name}</h1>
              <p className="text-sm text-gray-500">{summaryDescription}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <StatusBadge status={project.status} />
              {project.version ? <StatusBadge status={project.version.status} /> : null}
              {latestQuote ? <StatusBadge status={latestQuote.status} /> : <Badge variant="outline">No quote</Badge>}
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => router.push("/admin/projects")}>
              Back to projects
            </Button>
            {project.version?.status === "READY_TO_BUILD" ? (
              <Button onClick={handleMarkLive} disabled={markingLive}>
                {markingLive ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                Mark Live
              </Button>
            ) : null}
            {latestQuote?.status === "SENT" ? (
              <Button onClick={() => handleQuoteStatus("SIGNED")} disabled={updatingQuote === "SIGNED"}>
                {updatingQuote === "SIGNED" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Signature className="mr-2 h-4 w-4" />}
                Mark Signed
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
          {error ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-6">
              <Card className="shadow-sm border-gray-100">
                <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <CardTitle>Project overview</CardTitle>
                    <CardDescription>Operational context for this automation.</CardDescription>
                  </div>
                  {project.version ? (
                    <Badge variant="outline" className="bg-gray-50 text-gray-600 border-gray-200">
                      Version {project.version.versionLabel}
                    </Badge>
                  ) : null}
                </CardHeader>
                <CardContent className="space-y-5 text-sm text-gray-600">
                  <div>
                    <p className="text-xs uppercase text-gray-400 font-semibold mb-1">Description</p>
                    <p>{summaryDescription}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-gray-400 font-semibold mb-1">Systems involved</p>
                    <div className="flex flex-wrap gap-2">
                      {MOCK_SYSTEMS.map((system) => (
                        <Badge key={system} variant="secondary" className="bg-gray-100 text-gray-600 border-gray-200">
                          {system}
                        </Badge>
                      ))}
                    </div>
                    {/* TODO: replace mock systems with actual integrations */}
                  </div>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div>
                      <p className="text-xs uppercase text-gray-400 font-semibold mb-1">Deal status</p>
                      <StatusBadge status={project.status} />
                    </div>
                    <div>
                      <p className="text-xs uppercase text-gray-400 font-semibold mb-1">Version status</p>
                      {project.version ? <StatusBadge status={project.version.status} /> : <span className="text-gray-400">No version</span>}
                    </div>
                    <div>
                      <p className="text-xs uppercase text-gray-400 font-semibold mb-1">Quote status</p>
                      {latestQuote ? <StatusBadge status={latestQuote.status} /> : <Badge variant="outline">No quote</Badge>}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-sm border-gray-100">
                <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <CardTitle>Commercial status</CardTitle>
                    <CardDescription>Track pricing progress and quote state.</CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  {latestQuote ? (
                    <div className="rounded-lg border border-gray-100 bg-white p-4">
                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">
                            ${Number(latestQuote.setupFee).toLocaleString()} setup / ${Number(latestQuote.unitPrice)} unit
                          </p>
                          <p className="text-xs text-gray-500">Volume: {latestQuote.estimatedVolume ?? "n/a"}</p>
                          {latestQuote.clientMessage ? (
                            <p className="text-xs text-gray-500 mt-1">{latestQuote.clientMessage}</p>
                          ) : null}
                        </div>
                        <StatusBadge status={latestQuote.status} />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {latestQuote.status === "DRAFT" ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleQuoteStatus("SENT")}
                            disabled={updatingQuote !== null}
                          >
                            {updatingQuote === "SENT" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                            Mark Sent
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
                      No quote drafted yet. Use the form below to prepare pricing.
                    </div>
                  )}

                  <form className="space-y-3" onSubmit={handleQuoteSubmit}>
                    <div className="grid gap-3 md:grid-cols-3">
                      <div>
                        <label className="text-xs font-medium text-gray-600" htmlFor="setupFee">
                          Setup fee
                        </label>
                        <Input
                          id="setupFee"
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="5000"
                          value={quoteForm.setupFee}
                          onChange={(event) => setQuoteForm((prev) => ({ ...prev, setupFee: event.target.value }))}
                          required
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-600" htmlFor="unitPrice">
                          Unit price
                        </label>
                        <Input
                          id="unitPrice"
                          type="number"
                          step="0.0001"
                          min="0"
                          placeholder="0.05"
                          value={quoteForm.unitPrice}
                          onChange={(event) => setQuoteForm((prev) => ({ ...prev, unitPrice: event.target.value }))}
                          required
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-600" htmlFor="volume">
                          Estimated volume
                        </label>
                        <Input
                          id="volume"
                          type="number"
                          min="0"
                          placeholder="1000"
                          value={quoteForm.estimatedVolume}
                          onChange={(event) => setQuoteForm((prev) => ({ ...prev, estimatedVolume: event.target.value }))}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600" htmlFor="message">
                        Client message
                      </label>
                      <Textarea
                        id="message"
                        placeholder="Notes or summary for the client"
                        value={quoteForm.clientMessage}
                        onChange={(event) => setQuoteForm((prev) => ({ ...prev, clientMessage: event.target.value }))}
                        rows={3}
                      />
                    </div>
                    <Button type="submit" disabled={creatingQuote}>
                      {creatingQuote ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <DollarSign className="mr-2 h-4 w-4" />}
                      Draft quote
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card className="shadow-sm border-gray-100">
                <CardHeader>
                  <CardTitle>Requirements checklist</CardTitle>
                  <CardDescription>Progress across intake gates.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {MOCK_CHECKLIST_ITEMS.map((item, index) => {
                    const isComplete = index < checklistCompleted;
                    return (
                      <div key={item.id} className="flex items-center justify-between">
                        <span className={cn("text-gray-600", !isComplete && "text-amber-600 font-semibold")}>{item.label}</span>
                        {isComplete ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-amber-500" />
                        )}
                      </div>
                    );
                  })}
                  {/* TODO: drive checklist from real project data */}
                </CardContent>
              </Card>

              <Card className="shadow-sm border-gray-100">
                <CardHeader className="flex items-center gap-2">
                  <PiggyBank className="h-4 w-4 text-[#E43632]" />
                  <div>
                    <CardTitle>Billing snapshot</CardTitle>
                    <CardDescription>High-level view of spend and utilization.</CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Committed monthly spend</span>
                    <span className="font-semibold text-[#0A0A0A]">
                      ${MOCK_BILLING_SNAPSHOT.committedMonthlySpend.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Current month spend</span>
                    <span className="font-semibold text-[#0A0A0A]">
                      ${MOCK_BILLING_SNAPSHOT.currentMonthSpend.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Setup fees collected</span>
                    <span className="font-semibold text-[#0A0A0A]">
                      ${MOCK_BILLING_SNAPSHOT.setupFeesCollected.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Utilization</span>
                    <span className="font-semibold text-[#0A0A0A]">
                      {MOCK_BILLING_SNAPSHOT.utilizationPercent}%
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-sm border-gray-100">
                <CardHeader className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-[#0A0A0A]" />
                  <div>
                    <CardTitle>Run metrics</CardTitle>
                    <CardDescription>Recent automation performance.</CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Runs this week</span>
                    <span className="font-semibold text-[#0A0A0A]">{MOCK_RUN_METRICS.runsThisWeek}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Success rate</span>
                    <span className="font-semibold text-[#0A0A0A]">{(MOCK_RUN_METRICS.successRate * 100).toFixed(1)}%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Avg. handle time</span>
                    <span className="font-semibold text-[#0A0A0A]">{MOCK_RUN_METRICS.avgHandleTime}</span>
                  </div>
                  {/* TODO: hook into Wrk execution telemetry */}
                </CardContent>
              </Card>

              <Card className="shadow-sm border-gray-100">
                <CardHeader className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-[#E43632]" />
                  <div>
                    <CardTitle>Activity timeline</CardTitle>
                    <CardDescription>Latest project events.</CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  {MOCK_ACTIVITY_LOG.map((entry) => (
                    <div key={entry.title} className="border-l border-gray-200 pl-4">
                      <p className="font-semibold text-gray-900">{entry.title}</p>
                      <p className="text-gray-500">{entry.detail}</p>
                      <span className="text-xs text-gray-400">{entry.time}</span>
                    </div>
                  ))}
                  {/* TODO: wire this timeline to admin audit events */}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}



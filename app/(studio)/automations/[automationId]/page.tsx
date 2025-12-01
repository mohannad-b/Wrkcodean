"use client";

import "reactflow/dist/style.css";
import { useCallback, useEffect, useMemo, useState, FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ReactFlow, { Background, BackgroundVariant, Node, Edge } from "reactflow";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Loader2, RefreshCw, Send, StickyNote, Plus, FileText, Activity } from "lucide-react";

type QuoteSummary = {
  id: string;
  status: string;
  setupFee: string | null;
  unitPrice: string | null;
  estimatedVolume: number | null;
};

type BlueprintJson = {
  nodes: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
};

type AutomationVersion = {
  id: string;
  versionLabel: string;
  status: string;
  intakeNotes: string | null;
  blueprintJson: BlueprintJson | null;
  summary: string | null;
  latestQuote: QuoteSummary | null;
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

function BlueprintViewer({ blueprint }: { blueprint: BlueprintJson }) {
  const nodes = useMemo(() => blueprint.nodes as Node[], [blueprint]);
  const edges = useMemo(() => blueprint.edges as Edge[], [blueprint]);

  if (nodes.length === 0) {
    return <p className="text-sm text-gray-500">No blueprint defined yet.</p>;
  }

  return (
    <div className="h-64 w-full rounded-lg border border-gray-200 bg-white overflow-hidden">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnScroll={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        className="bg-gray-50"
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1.5} color="#E5E7EB" />
      </ReactFlow>
    </div>
  );
}

export default function AutomationDetailPage({ params }: AutomationDetailPageProps) {
  const router = useRouter();
  const [automation, setAutomation] = useState<AutomationDetail | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [blueprintDraft, setBlueprintDraft] = useState("");
  const [blueprintError, setBlueprintError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingNotes, setSavingNotes] = useState(false);
  const [savingBlueprint, setSavingBlueprint] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [creatingVersion, setCreatingVersion] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setBlueprintDraft(version?.blueprintJson ? JSON.stringify(version.blueprintJson, null, 2) : "");
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
      setBlueprintDraft(selectedVersion.blueprintJson ? JSON.stringify(selectedVersion.blueprintJson, null, 2) : "");
      setBlueprintError(null);
    }
  }, [selectedVersion?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleVersionChange = (versionId: string) => {
    setSelectedVersionId(versionId);
    const version = automation?.versions.find((v) => v.id === versionId);
    setNotes(version?.intakeNotes ?? "");
    setBlueprintDraft(version?.blueprintJson ? JSON.stringify(version.blueprintJson, null, 2) : "");
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save notes");
    } finally {
      setSavingNotes(false);
    }
  };

  const handleSaveBlueprint = async () => {
    if (!selectedVersion) return;
    setSavingBlueprint(true);
    setBlueprintError(null);
    try {
      const trimmed = blueprintDraft.trim();
      const blueprintPayload = trimmed.length === 0 ? null : JSON.parse(trimmed);
      const response = await fetch(`/api/automation-versions/${selectedVersion.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blueprintJson: blueprintPayload }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to save blueprint");
      }
      await fetchAutomation();
    } catch (err) {
      setBlueprintError(err instanceof Error ? err.message : "Unable to save blueprint");
    } finally {
      setSavingBlueprint(false);
    }
  };

  const handleSendForPricing = async () => {
    if (!selectedVersion) return;
    setTransitioning(true);
    setError(null);
    try {
      const response = await fetch(`/api/automation-versions/${selectedVersion.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "NEEDS_PRICING" }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to update status");
      }
      await fetchAutomation();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send for pricing");
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create version");
    } finally {
      setCreatingVersion(false);
    }
  };

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
    (selectedVersion.status === "DRAFT" || selectedVersion.status === "NEEDS_PRICING") &&
    !latestQuote;
  const awaitingApproval = latestQuote?.status === "SENT";
  const signedReady =
    latestQuote?.status === "SIGNED" && selectedVersion?.status === "READY_TO_BUILD";

  return (
    <div className="flex-1 bg-gray-50">
      <div className="mx-auto max-w-4xl px-6 py-10 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-gray-500">
              <Link href="/automations" className="text-gray-500 hover:text-gray-900">
                Automations
              </Link>{" "}
              / <span className="text-gray-900">{automation.name}</span>
            </div>
            <h1 className="mt-1 text-3xl font-semibold text-gray-900">{automation.name}</h1>
            {automation.description ? (
              <p className="text-sm text-gray-600">{automation.description}</p>
            ) : null}
          </div>
          <Button variant="outline" onClick={fetchAutomation}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>

        {error ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
        ) : null}

        <Card>
          <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Commercial status</CardTitle>
              <CardDescription>Track pricing progress and quote state.</CardDescription>
            </div>
            {selectedVersion ? <StatusBadge status={selectedVersion.status} /> : null}
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
                    <p className="font-medium text-gray-900">
                      {latestQuote.estimatedVolume ?? "—"}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500">No quote generated yet.</p>
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
            ) : signedReady ? (
              <div className="rounded-md border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                Signed – Ready to Build.
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Requirements / Intake</CardTitle>
              <CardDescription>Capture notes for this version.</CardDescription>
            </div>
            <div className="flex items-center gap-3">
              <Select value={selectedVersion?.id} onValueChange={handleVersionChange}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Select version" />
                </SelectTrigger>
                <SelectContent>
                  {automation.versions.map((version) => (
                    <SelectItem key={version.id} value={version.id}>
                      {version.versionLabel}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCreateVersion}
                  disabled={creatingVersion || !selectedVersion}
                >
                  {creatingVersion ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                  New version
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Blueprint
            </CardTitle>
            <CardDescription>Basic process map (read-only for now).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedVersion?.blueprintJson ? (
              <BlueprintViewer blueprint={selectedVersion.blueprintJson} />
            ) : (
              <p className="text-sm text-gray-500">No blueprint defined yet.</p>
            )}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Blueprint JSON
              </label>
              <Textarea
                value={blueprintDraft}
                onChange={(event) => setBlueprintDraft(event.target.value)}
                rows={8}
                placeholder='{"nodes":[...],"edges":[...]}'
              />
              {blueprintError ? (
                <p className="text-sm text-red-600">{blueprintError}</p>
              ) : (
                <p className="text-xs text-gray-500">
                  Provide React Flow–compatible nodes and edges. Leave empty to clear.
                </p>
              )}
            </div>
            <Button type="button" onClick={handleSaveBlueprint} disabled={savingBlueprint || !selectedVersion}>
              {savingBlueprint ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save blueprint
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Version history</CardTitle>
            <CardDescription>Track the lifecycle of this automation.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {automation.versions.map((version) => (
                <div
                  key={version.id}
                  className="flex flex-col gap-2 rounded-md border border-gray-100 bg-white p-4 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">{version.versionLabel}</p>
                    <p className="text-xs text-gray-500">
                      {version.intakeNotes ? version.intakeNotes.slice(0, 160) : "No notes yet."}
                    </p>
                  </div>
                  <StatusBadge status={version.status} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

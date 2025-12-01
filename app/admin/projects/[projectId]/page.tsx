"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Loader2, ArrowLeft, DollarSign, Send, Signature, CheckCircle2 } from "lucide-react";

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

  return (
    <div className="flex-1 bg-gray-50">
      <div className="mx-auto max-w-4xl px-6 py-10 space-y-6">
        <div className="flex items-center gap-3 text-sm text-gray-500">
          <Link href="/admin/projects" className="flex items-center gap-1 hover:text-gray-900">
            <ArrowLeft className="h-4 w-4" /> Projects
          </Link>
          / <span className="text-gray-900">{project.name}</span>
        </div>

        {error ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
        ) : null}

        <Card>
          <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>{project.name}</CardTitle>
              <CardDescription>
                {project.automation ? project.automation.description ?? project.automation.name : "Automation archived"}
              </CardDescription>
            </div>
            <StatusBadge status={project.status} />
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-gray-600">
            {project.version ? (
              <>
                <p className="font-medium text-gray-900">Version {project.version.versionLabel}</p>
                <p>Status: {project.version.status}</p>
                {project.version.intakeNotes ? <p className="text-gray-500">{project.version.intakeNotes}</p> : null}
                {project.version.status === "READY_TO_BUILD" ? (
                  <Button className="mt-3" onClick={handleMarkLive} disabled={markingLive}>
                    {markingLive ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                    )}
                    Mark Live
                  </Button>
                ) : project.version.status === "LIVE" ? (
                  <p className="mt-3 text-sm text-emerald-700">Automation is live.</p>
                ) : null}
              </>
            ) : (
              <p>No automation version linked.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quote</CardTitle>
            <CardDescription>
              Draft pricing for this project, then move it to Sent or Signed once the client approves.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {latestQuote ? (
              <div className="rounded-md border border-gray-100 bg-white p-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      ${Number(latestQuote.setupFee).toLocaleString()} setup / ${Number(latestQuote.unitPrice)} unit
                    </p>
                    <p className="text-xs text-gray-500">
                      Volume: {latestQuote.estimatedVolume ?? "n/a"}
                    </p>
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
                      {updatingQuote === "SENT" ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="mr-2 h-4 w-4" />
                      )}
                      Mark Sent
                    </Button>
                  ) : null}
                  {latestQuote.status === "SENT" ? (
                    <Button size="sm" onClick={() => handleQuoteStatus("SIGNED")} disabled={updatingQuote !== null}>
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
              <p className="text-sm text-gray-500">No quotes drafted yet.</p>
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
                {creatingQuote ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <DollarSign className="mr-2 h-4 w-4" />
                )}
                Draft quote
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}



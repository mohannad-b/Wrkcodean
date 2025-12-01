"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCw, Plus, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";

type AutomationSummary = {
  id: string;
  name: string;
  description: string | null;
  latestVersion: {
    id: string;
    versionLabel: string;
    status: string;
    intakeNotes: string | null;
    updatedAt: string | null;
  } | null;
};

export default function AutomationsPage() {
  const [automations, setAutomations] = useState<AutomationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAutomations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/automations", { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Failed to load automations");
      }
      const data = (await response.json()) as { automations: AutomationSummary[] };
      setAutomations(data.automations);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAutomations();
  }, [fetchAutomations]);

  return (
    <div className="flex-1 h-full overflow-y-auto bg-gray-50">
      <div className="max-w-5xl mx-auto px-6 py-10 space-y-6">
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-gray-900">Automations</h1>
            <p className="text-sm text-gray-500">Create automations, capture intake notes, and track status.</p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={fetchAutomations} disabled={loading}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Link href="/automations/new">
              <Button className="bg-[#E43632] hover:bg-[#c12e2a] text-white">
                <Plus className="mr-2 h-4 w-4" />
                New Automation
              </Button>
            </Link>
          </div>
        </header>

        {error ? (
          <div className="flex items-center gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4" />
            <span>{error}</span>
          </div>
        ) : null}

        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, idx) => (
              <Skeleton key={idx} className="h-24 w-full rounded-xl bg-white" />
            ))}
          </div>
        ) : automations.length === 0 ? (
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle>No automations yet</CardTitle>
              <CardDescription>Get started by creating your first automation.</CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/automations/new">
                <Button>Create Automation</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {automations.map((automation) => (
              <Card key={automation.id} className="hover:border-gray-300 transition-colors">
                <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <CardTitle className="text-xl text-gray-900">{automation.name}</CardTitle>
                    {automation.description ? (
                      <CardDescription className="text-sm text-gray-600">{automation.description}</CardDescription>
                    ) : null}
                  </div>
                  {automation.latestVersion ? (
                    <StatusBadge status={automation.latestVersion.status} />
                  ) : (
                    <StatusBadge status="DRAFT" />
                  )}
                </CardHeader>
                <CardContent className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div className="text-sm text-gray-600">
                    {automation.latestVersion ? (
                      <>
                        <p>
                          Version <span className="font-medium">{automation.latestVersion.versionLabel}</span>
                        </p>
                        {automation.latestVersion.intakeNotes ? (
                          <p className="mt-1 line-clamp-2 text-gray-500">{automation.latestVersion.intakeNotes}</p>
                        ) : (
                          <p className="mt-1 text-gray-400">No intake notes yet.</p>
                        )}
                      </>
                    ) : (
                      <p>No versions created yet.</p>
                    )}
                  </div>
                  <Link href={`/automations/${automation.id}`}>
                    <Button variant="outline">Open</Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


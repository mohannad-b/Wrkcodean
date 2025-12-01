"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Loader2, RefreshCw } from "lucide-react";

type ProjectListItem = {
  id: string;
  name: string;
  status: string;
  automation: { id: string; name: string } | null;
  version: { id: string; versionLabel: string; status: string } | null;
  latestQuote: { id: string; status: string } | null;
};

export default function AdminProjectsPage() {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProjects = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/projects", { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Failed to load projects");
      }
      const data = (await response.json()) as { projects: ProjectListItem[] };
      setProjects(data.projects);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  return (
    <div className="flex-1 bg-gray-50">
      <div className="mx-auto max-w-5xl px-6 py-10 space-y-6">
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-gray-900">Projects</h1>
            <p className="text-sm text-gray-500">Monitor every automation version that needs ops attention.</p>
          </div>
          <Button variant="outline" onClick={fetchProjects} disabled={loading}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </header>

        {error ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
        ) : null}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : projects.length === 0 ? (
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle>No projects yet</CardTitle>
              <CardDescription>Send an automation to pricing to create its project tracker.</CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div className="space-y-4">
            {projects.map((project) => (
              <Card key={project.id}>
                <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <CardTitle>{project.name}</CardTitle>
                    <CardDescription>
                      {project.automation ? `Automation: ${project.automation.name}` : "Automation archived"}
                    </CardDescription>
                  </div>
                  <StatusBadge status={project.status} />
                </CardHeader>
                <CardContent className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="text-sm text-gray-600">
                    {project.version ? (
                      <>
                        <p className="font-medium text-gray-900">{project.version.versionLabel}</p>
                        <p>Version status: {project.version.status}</p>
                      </>
                    ) : (
                      <p>Version not linked</p>
                    )}
                    {project.latestQuote ? (
                      <p className="mt-1 text-gray-500">Quote: {project.latestQuote.status}</p>
                    ) : (
                      <p className="mt-1 text-gray-400">No quote drafted</p>
                    )}
                  </div>
                  <Link href={`/admin/projects/${project.id}`}>
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



"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Loader2, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { cn } from "@/lib/utils";
import { getStatusLabel, resolveStatus } from "@/lib/submissions/lifecycle";
import { wrkAdminRoutes } from "@/lib/admin/routes";
import { fetchAdminSubmissions } from "@/features/admin/services/adminSubmissionsApi";

type SubmissionRow = {
  id: string;
  name: string;
  status: string;
  updatedAt?: string;
  automation: { id: string; name: string } | null;
  version: { id: string; versionLabel: string; status: string } | null;
  latestQuote:
    | {
        id: string;
        status: string;
      }
    | null;
};

type ApiPayload = {
  submissions: SubmissionRow[];
};

function mapStatus(status?: string) {
  const resolved = resolveStatus(status ?? "");
  return getStatusLabel(resolved ?? "IntakeInProgress");
}

export function SubmissionsPage() {
  const [data, setData] = useState<SubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAdminSubmissions();
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error ?? "Failed to load submissions");
      }
      const payload = (await res.json()) as ApiPayload;
      setData(payload.submissions ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load submissions");
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, []);

  const rows = useMemo(
    () =>
      data.map((item) => ({
        ...item,
        friendlyStatus: mapStatus(item.status),
      })),
    [data]
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase">Admin</p>
          <h1 className="text-2xl font-bold text-[#0A0A0A]">Submissions</h1>
          <p className="text-sm text-gray-500">Workflow submissions awaiting pricing, approval, and build.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Refresh
          </Button>
        </div>
      </div>

      <Card className="border border-gray-200 shadow-sm overflow-hidden">
        {error ? (
          <div className="p-4 text-sm text-red-700 bg-red-50 border-b border-red-100">{error}</div>
        ) : null}
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm text-left">
            <thead className="bg-gray-50 text-xs uppercase font-bold text-gray-500 border-b border-gray-100">
              <tr>
                <th className="px-4 py-3">Submission</th>
                <th className="px-4 py-3">Automation</th>
                <th className="px-4 py-3">Version</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Quote</th>
                <th className="px-4 py-3 text-right">Updated</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-gray-500">
                    <Loader2 className="inline h-4 w-4 animate-spin mr-2" />
                    Loading submissions…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-gray-500">
                    No submissions yet.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <Link href={wrkAdminRoutes.submissionDetail(row.id)} className="font-semibold text-[#0A0A0A] hover:underline">
                          {row.name}
                        </Link>
                        <span className="text-xs text-gray-400">ID: {row.id}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {row.automation ? (
                        <div className="flex flex-col text-sm text-gray-700">
                          <span className="font-medium">{row.automation.name}</span>
                          <span className="text-xs text-gray-400">{row.automation.id}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {row.version ? (
                        <Badge variant="outline" className="text-xs bg-gray-50 border-gray-200">
                          {row.version.versionLabel}
                        </Badge>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={row.friendlyStatus} />
                    </td>
                    <td className="px-4 py-3">
                      {row.latestQuote ? (
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] font-semibold",
                            row.latestQuote.status === "SIGNED"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : row.latestQuote.status === "SENT"
                              ? "bg-blue-50 text-blue-700 border-blue-200"
                              : "bg-gray-50 text-gray-600 border-gray-200"
                          )}
                        >
                          {row.latestQuote.status}
                        </Badge>
                      ) : (
                        <span className="text-xs text-gray-400">None</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-gray-500">
                      {row.updatedAt ? new Date(row.updatedAt).toLocaleString() : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" size="sm" asChild className="text-xs text-[#0A0A0A]">
                        <Link href={wrkAdminRoutes.submissionDetail(row.id)}>
                          View <ArrowRight className="inline h-3 w-3 ml-1" />
                        </Link>
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

export default SubmissionsPage;


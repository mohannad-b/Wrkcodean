"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/use-toast";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Table,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { WorkspaceRow } from "./page";
import { cn } from "@/components/ui/utils";
import type { WrkStaffRole } from "@/db/schema";
import { wrkAdminRoutes } from "@/lib/admin/routes";

export default function ClientsTable({ rows, staffRole }: { rows: WorkspaceRow[]; staffRole: WrkStaffRole }) {
  const [query, setQuery] = useState("");
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const router = useRouter();
  const toast = useToast();
  const canManage = staffRole === "wrk_admin" || staffRole === "wrk_master_admin";

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return rows;
    return rows.filter(
      (row) =>
        row.name.toLowerCase().includes(q) ||
        row.slug?.toLowerCase().includes(q) ||
        row.ownerEmail?.toLowerCase().includes(q) ||
        row.ownerName?.toLowerCase().includes(q)
    );
  }, [query, rows]);

  async function toggleWorkspace(row: WorkspaceRow) {
    if (!canManage) return;
    const action = row.status === "suspended" ? "restore" : "suspend";
    setLoadingId(row.id);
    try {
      const res = await fetch(`/api/platform/workspaces/${row.id}/${action}`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed to ${action} workspace`);
      }
      toast({ title: `Workspace ${action === "suspend" ? "suspended" : "restored"}`, variant: "success" });
      router.refresh();
    } catch (error) {
      toast({ title: "Action failed", description: (error as Error).message, variant: "error" });
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search clients..."
          className="w-64"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Badge variant="secondary">Total: {filtered.length}</Badge>
      </div>
      <div className="border rounded-md">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead>Client / Workspace</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Members</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((row) => (
              <TableRow key={row.id} className="hover:bg-slate-50">
                <TableCell>
                  <div className="font-medium text-slate-900">{row.name}</div>
                  <div className="text-xs text-muted-foreground">{row.slug ?? "—"}</div>
                </TableCell>
                <TableCell>
                  <Badge
                    className={cn(
                      row.status === "suspended"
                        ? "bg-red-50 text-red-700 border-red-200"
                        : "bg-emerald-50 text-emerald-700 border-emerald-200"
                    )}
                    variant="outline"
                  >
                    {row.status === "suspended" ? "Suspended" : "Active"}
                  </Badge>
                </TableCell>
                <TableCell>{row.ownerName ?? row.ownerEmail ?? "—"}</TableCell>
                <TableCell>{row.memberCount}</TableCell>
                <TableCell>{row.createdAt}</TableCell>
                <TableCell className="text-right space-x-2">
                  <Button asChild variant="ghost" size="sm">
                    <Link href={wrkAdminRoutes.workspaceDetail(row.id)}>Open</Link>
                  </Button>
                  <Button
                    variant={row.status === "suspended" ? "secondary" : "destructive"}
                    size="sm"
                    onClick={() => toggleWorkspace(row)}
                    disabled={loadingId === row.id || !canManage}
                  >
                    {row.status === "suspended" ? "Restore" : "Suspend"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                  No clients match your search.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}


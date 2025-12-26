"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import type { WrkStaffRole } from "@/db/schema";
import type { StaffRow } from "./page";

const roleLabels: Record<WrkStaffRole, string> = {
  wrk_master_admin: "Master Admin",
  wrk_admin: "Admin",
  wrk_operator: "Operator",
  wrk_viewer: "Viewer",
};

export default function StaffTable({ staff, staffRole }: { staff: StaffRow[]; staffRole: WrkStaffRole }) {
  const router = useRouter();
  const toast = useToast();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const canManage = staffRole === "wrk_master_admin";

  async function updateRole(userId: string, role: WrkStaffRole) {
    setLoadingId(userId);
    try {
      const res = await fetch(`/api/platform/staff/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to update role");
      }
      toast({ title: "Staff role updated", variant: "success" });
      router.refresh();
    } catch (error) {
      toast({ title: "Action failed", description: (error as Error).message, variant: "error" });
    } finally {
      setLoadingId(null);
    }
  }

  async function revoke(userId: string) {
    setLoadingId(userId);
    try {
      const res = await fetch(`/api/platform/staff/${userId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to revoke access");
      }
      toast({ title: "Staff access revoked", variant: "success" });
      router.refresh();
    } catch (error) {
      toast({ title: "Action failed", description: (error as Error).message, variant: "error" });
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <>
      {staff.map((row) => (
        <tr key={row.userId} className="hover:bg-slate-50">
          <td className="px-4 py-3">
            <div className="font-medium text-slate-900">{row.name ?? row.email ?? "—"}</div>
            <div className="text-xs text-muted-foreground">{row.userId}</div>
          </td>
          <td className="px-4 py-3">{row.email}</td>
          <td className="px-4 py-3">
            <Badge variant="secondary">{roleLabels[row.role]}</Badge>
          </td>
          <td className="px-4 py-3 text-sm text-muted-foreground">
            {row.createdAt?.toISOString().slice(0, 10) ?? "—"}
          </td>
          <td className="px-4 py-3 text-sm text-muted-foreground">
            {row.updatedAt?.toISOString().slice(0, 10) ?? "—"}
          </td>
          <td className="px-4 py-3 text-right space-x-2">
      <Select
              defaultValue={row.role}
              onValueChange={(value) => updateRole(row.userId, value as WrkStaffRole)}
              disabled={loadingId === row.userId || !canManage}
            >
              <SelectTrigger className="w-[140px] inline-flex">
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="wrk_master_admin">Master Admin</SelectItem>
                <SelectItem value="wrk_admin">Admin</SelectItem>
                <SelectItem value="wrk_operator">Operator</SelectItem>
                <SelectItem value="wrk_viewer">Viewer</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="sm"
              className="text-red-600"
              onClick={() => revoke(row.userId)}
              disabled={loadingId === row.userId || !canManage}
            >
              Revoke
            </Button>
          </td>
        </tr>
      ))}
      {staff.length === 0 && (
        <tr>
          <td colSpan={6} className="text-center text-sm text-muted-foreground py-6">
            No staff members found.
          </td>
        </tr>
      )}
    </>
  );
}


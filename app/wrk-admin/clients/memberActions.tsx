"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import type { MembershipRole, WrkStaffRole } from "@/db/schema";

type Props = {
  membershipId: string;
  userId: string;
  currentRole: MembershipRole;
  userStatus: string;
  staffRole: WrkStaffRole;
};

export default function MemberActions({ membershipId, userId, currentRole, userStatus, staffRole }: Props) {
  const toast = useToast();
  const router = useRouter();
  const [role, setRole] = useState<MembershipRole>(currentRole);
  const [isSaving, setIsSaving] = useState(false);
  const [isSuspending, setIsSuspending] = useState(false);
  const canManage = staffRole === "wrk_admin" || staffRole === "wrk_master_admin";

  async function updateRole(nextRole: MembershipRole) {
    setRole(nextRole);
    setIsSaving(true);
    try {
      const res = await fetch(`/api/platform/memberships/${membershipId}/role`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: nextRole }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to update role");
      }
      toast({ title: "Role updated", variant: "success" });
      router.refresh();
    } catch (error) {
      toast({ title: "Update failed", description: (error as Error).message, variant: "error" });
      setRole(currentRole);
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleUserStatus() {
    const action = userStatus === "suspended" ? "restore" : "suspend";
    setIsSuspending(true);
    try {
      const res = await fetch(`/api/platform/users/${userId}/${action}`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed to ${action} user`);
      }
      toast({ title: `User ${action === "suspend" ? "suspended" : "restored"}`, variant: "success" });
      router.refresh();
    } catch (error) {
      toast({ title: "Action failed", description: (error as Error).message, variant: "error" });
    } finally {
      setIsSuspending(false);
    }
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <Select
        value={role}
        onValueChange={(val) => updateRole(val as MembershipRole)}
        disabled={isSaving || !canManage}
      >
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="Role" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="owner">Owner</SelectItem>
          <SelectItem value="admin">Admin</SelectItem>
          <SelectItem value="editor">Editor</SelectItem>
          <SelectItem value="viewer">Viewer</SelectItem>
          <SelectItem value="billing">Billing</SelectItem>
        </SelectContent>
      </Select>
      <Button
        variant={userStatus === "suspended" ? "secondary" : "destructive"}
        size="sm"
        onClick={toggleUserStatus}
        disabled={isSuspending || !canManage}
      >
        {userStatus === "suspended" ? "Restore User" : "Suspend User"}
      </Button>
    </div>
  );
}


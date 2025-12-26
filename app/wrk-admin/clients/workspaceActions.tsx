"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import type { WrkStaffRole } from "@/db/schema";

type WorkspaceActionsProps = {
  tenantId: string;
  status: string;
  staffRole: WrkStaffRole;
};

function WorkspaceActions({ tenantId, status, staffRole }: WorkspaceActionsProps) {
  const toast = useToast();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const canManage = staffRole === "wrk_admin" || staffRole === "wrk_master_admin";

  const isSuspended = status === "suspended";

  async function toggle() {
    const action = isSuspended ? "restore" : "suspend";
    setIsLoading(true);
    try {
      const res = await fetch(`/api/platform/workspaces/${tenantId}/${action}`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed to ${action} workspace`);
      }
      toast({ title: `Workspace ${isSuspended ? "restored" : "suspended"}`, variant: "success" });
      router.refresh();
    } catch (error) {
      toast({ title: "Action failed", description: (error as Error).message, variant: "error" });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant={isSuspended ? "secondary" : "destructive"}
        onClick={toggle}
        disabled={isLoading || !canManage}
      >
        {isSuspended ? "Restore Workspace" : "Suspend Workspace"}
      </Button>
    </div>
  );
}

export function ResendInviteButton({ inviteId, staffRole }: { inviteId: string; staffRole: WrkStaffRole }) {
  const toast = useToast();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const canManage = staffRole === "wrk_admin" || staffRole === "wrk_master_admin";

  async function resend() {
    setLoading(true);
    try {
      const res = await fetch(`/api/platform/invites/${inviteId}/resend`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to resend invite");
      }
      toast({ title: "Invite resent", variant: "success" });
      router.refresh();
    } catch (error) {
      toast({ title: "Action failed", description: (error as Error).message, variant: "error" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button size="sm" variant="outline" onClick={resend} disabled={loading || !canManage}>
      Resend
    </Button>
  );
}

export function RevokeInviteButton({ inviteId, staffRole }: { inviteId: string; staffRole: WrkStaffRole }) {
  const toast = useToast();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const canManage = staffRole === "wrk_admin" || staffRole === "wrk_master_admin";

  async function revoke() {
    setLoading(true);
    try {
      const res = await fetch(`/api/platform/invites/${inviteId}/revoke`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to revoke invite");
      }
      toast({ title: "Invite revoked", variant: "success" });
      router.refresh();
    } catch (error) {
      toast({ title: "Action failed", description: (error as Error).message, variant: "error" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button size="sm" variant="ghost" className="text-red-600" onClick={revoke} disabled={loading || !canManage}>
      Revoke
    </Button>
  );
}

export default WorkspaceActions;


"use client";

import { useEffect, useMemo, useState } from "react";
import { UserPlus, ShieldCheck, Shield, Users as UsersIcon, Trash2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

type Member = {
  membershipId: string;
  userId: string;
  role: string;
  status: string;
  name: string;
  email: string;
  title: string | null;
  lastActiveAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type Invite = {
  id: string;
  email: string;
  role: string;
  status: string;
  token: string;
  invitedBy: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
};

type TeamsResponse = {
  currentRole: string;
  canManage: boolean;
  availableRoles: string[];
  members: Member[];
  invites: Invite[];
};

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer",
  billing: "Billing",
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700 border-emerald-100",
  invited: "bg-amber-50 text-amber-700 border-amber-100",
  removed: "bg-gray-50 text-gray-600 border-gray-200",
};

function RoleBadge({ role }: { role: string }) {
  return <Badge variant="outline">{ROLE_LABELS[role] ?? role}</Badge>;
}

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? "bg-gray-50 text-gray-700 border-gray-200";
  return (
    <Badge variant="outline" className={color}>
      {status}
    </Badge>
  );
}

export function TeamsPanel() {
  const [data, setData] = useState<TeamsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("viewer");
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [transferTarget, setTransferTarget] = useState<string>("");
  const canManage = data?.canManage ?? false;

  const eligibleTransferMembers = useMemo(
    () => data?.members.filter((m) => m.status === "active" && m.role !== "owner") ?? [],
    [data]
  );

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/workspaces/members", { cache: "no-store" });
      const json = (await res.json()) as TeamsResponse;
      if (!res.ok) {
        throw new Error(json?.error ?? "Failed to load team");
      }
      setData(json);
      setInviteRole(json.availableRoles.includes("viewer") ? "viewer" : json.availableRoles[0] ?? "viewer");
    } catch (err) {
      console.error(err);
      toast.error("Unable to load team data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch(() => null);
  }, []);

  const onInvite = async () => {
    if (!inviteEmail.trim()) {
      toast.error("Email is required");
      return;
    }
    setInviteSubmitting(true);
    try {
      const res = await fetch("/api/workspaces/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error ?? "Unable to send invite");
      }
      toast.success("Invite sent");
      setInviteEmail("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to send invite");
    } finally {
      setInviteSubmitting(false);
    }
  };

  const onChangeRole = async (membershipId: string, role: string) => {
    try {
      const res = await fetch(`/api/workspaces/members/${membershipId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error ?? "Unable to update role");
      }
      toast.success("Role updated");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to update role");
    }
  };

  const onRemove = async (membershipId: string) => {
    if (!confirm("Remove this member from the workspace?")) return;
    try {
      const res = await fetch(`/api/workspaces/members/${membershipId}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error ?? "Unable to remove member");
      }
      toast.success("Member removed");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to remove member");
    }
  };

  const onResend = async (inviteId: string) => {
    try {
      const res = await fetch(`/api/workspaces/invites/${inviteId}/resend`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error ?? "Unable to resend invite");
      }
      toast.success("Invite resent");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to resend invite");
    }
  };

  const onCancelInvite = async (inviteId: string) => {
    try {
      const res = await fetch(`/api/workspaces/invites/${inviteId}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error ?? "Unable to cancel invite");
      }
      toast.success("Invite cancelled");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to cancel invite");
    }
  };

  const onTransfer = async () => {
    if (!transferTarget) {
      toast.error("Select a teammate to transfer ownership to.");
      return;
    }
    if (!confirm("Transfer ownership? You will become an Admin.")) return;
    try {
      const res = await fetch("/api/workspaces/ownership", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ membershipId: transferTarget }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error ?? "Unable to transfer ownership");
      }
      toast.success("Ownership transferred");
      setTransferTarget("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to transfer ownership");
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-gray-500">Loading team…</CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-gray-500">Unable to load team data.</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <UsersIcon className="h-4 w-4" /> Workspace Team
            </CardTitle>
            <p className="text-sm text-gray-500">
              Roles govern access across Workflows, Copilot, runs, integrations, and billing.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => load()} disabled={loading}>
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                placeholder="name@company.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                disabled={!canManage}
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={inviteRole} onValueChange={setInviteRole} disabled={!canManage}>
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  {data.availableRoles
                    .filter((role) => role !== "owner")
                    .map((role) => (
                      <SelectItem key={role} value={role}>
                        {ROLE_LABELS[role] ?? role}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                className="w-full"
                disabled={!canManage || inviteSubmitting}
                onClick={onInvite}
              >
                <UserPlus className="h-4 w-4 mr-2" />
                {inviteSubmitting ? "Sending…" : "Send Invite"}
              </Button>
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800">Members</h3>
              <span className="text-xs text-gray-500">{data.members.length} total</span>
            </div>
            <div className="border border-gray-200 rounded-lg divide-y">
              {data.members.map((member) => (
                <div key={member.membershipId} className="p-4 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{member.name || member.email}</p>
                    <p className="text-xs text-gray-500 truncate">{member.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={member.status} />
                    <RoleBadge role={member.role} />
                  </div>
                  <div className="w-40">
                    <Select
                      value={member.role}
                      onValueChange={(value) => onChangeRole(member.membershipId, value)}
                      disabled={
                        !canManage ||
                        (member.role === "owner" && data.currentRole !== "owner") ||
                        member.status !== "active"
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {data.availableRoles.map((role) => (
                          <SelectItem key={role} value={role} disabled={role === "owner" && data.currentRole !== "owner"}>
                            {ROLE_LABELS[role] ?? role}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-28 flex justify-end">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-gray-500 hover:text-red-600"
                      disabled={
                        !canManage || member.status !== "active" || (member.role === "owner" && data.currentRole !== "owner")
                      }
                      onClick={() => onRemove(member.membershipId)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
              {data.members.length === 0 && (
                <div className="p-4 text-sm text-gray-500">No members yet.</div>
              )}
            </div>
          </div>

          {data.invites.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-gray-500" />
                <h3 className="text-sm font-semibold text-gray-800">Pending Invites</h3>
              </div>
              <div className="border border-gray-200 rounded-lg divide-y">
                {data.invites.map((invite) => (
                  <div key={invite.id} className="p-4 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{invite.email}</p>
                      <p className="text-xs text-gray-500">Expires {invite.expiresAt ? new Date(invite.expiresAt).toLocaleDateString() : "soon"}</p>
                    </div>
                    <RoleBadge role={invite.role} />
                    <StatusBadge status={invite.status} />
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" disabled={!canManage} onClick={() => onResend(invite.id)}>
                        Resend
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600"
                        disabled={!canManage}
                        onClick={() => onCancelInvite(invite.id)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {data.currentRole === "owner" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" /> Transfer Ownership
            </CardTitle>
            <p className="text-sm text-gray-500">
              Ownership moves all workspace controls. After transfer you become an Admin.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>New Owner</Label>
                <Select value={transferTarget} onValueChange={setTransferTarget}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select member" />
                  </SelectTrigger>
                  <SelectContent>
                    {eligibleTransferMembers.map((member) => (
                      <SelectItem key={member.membershipId} value={member.membershipId}>
                        {member.name || member.email} — {ROLE_LABELS[member.role] ?? member.role}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button className="w-full bg-red-600 hover:bg-red-700" onClick={onTransfer}>
                  Transfer Ownership
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}



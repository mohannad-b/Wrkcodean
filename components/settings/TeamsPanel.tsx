"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Search, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { logger } from "@/lib/logger";

type Member = {
  membershipId: string;
  userId: string;
  role: string;
  status: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  avatarUrl: string | null;
  title: string | null;
  automationsCount: number;
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

type DisplayRow = {
  kind: "member" | "invite";
  id: string;
  membershipId?: string;
  name: string;
  email: string;
  role: string;
  status: string;
  lastActiveAt: string | null;
  automationsCount: number;
  avatarUrl: string | null;
};

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer",
  billing: "Billing",
};

function formatName(member: Member) {
  if (member.firstName || member.lastName) {
    return `${member.firstName ?? ""} ${member.lastName ?? ""}`.trim();
  }
  return member.name || member.email;
}

function formatLastActive(value: string | null) {
  if (!value) return "—";
  const ts = new Date(value).getTime();
  if (Number.isNaN(ts)) return "—";
  const diffMs = Date.now() - ts;
  const minutes = Math.floor(diffMs / (1000 * 60));
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 2) return "Just now";
  if (minutes < 60) return `${minutes} mins ago`;
  if (hours < 24) return `${hours} hours ago`;
  if (days === 1) return "Yesterday";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function activityDotColor(status: string, lastActiveAt: string | null) {
  if (status !== "active") return "bg-gray-300";
  if (!lastActiveAt) return "bg-gray-300";
  const diffMs = Date.now() - new Date(lastActiveAt).getTime();
  const minutes = Math.floor(diffMs / (1000 * 60));
  return minutes <= 10 ? "bg-emerald-500" : "bg-gray-300";
}

function initials(name: string, email: string) {
  const trimmed = name.trim();
  if (trimmed) return trimmed.charAt(0).toUpperCase();
  return (email.charAt(0) || "?").toUpperCase();
}

export function TeamsPanel() {
  const [data, setData] = useState<TeamsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("viewer");
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [search, setSearch] = useState("");

  const canManage = data?.canManage ?? false;

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/workspaces/members", { cache: "no-store" });
      const json = (await res.json()) as TeamsResponse;
      if (!res.ok) {
        const message = (json as any)?.error ?? "Failed to load team";
        throw new Error(message);
      }
      setData(json);
      setInviteRole(json.availableRoles.includes("viewer") ? "viewer" : json.availableRoles[0] ?? "viewer");
    } catch (err) {
      logger.error(err);
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
      setInviteDialogOpen(false);
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

  const rows: DisplayRow[] = useMemo(() => {
    if (!data) return [];
    const memberRows =
      data.members?.map((member) => ({
        kind: "member" as const,
        id: member.membershipId,
        membershipId: member.membershipId,
        name: formatName(member),
        email: member.email,
        role: member.role,
        status: member.status,
        lastActiveAt: member.lastActiveAt,
        automationsCount: member.automationsCount ?? 0,
        avatarUrl: member.avatarUrl,
      })) ?? [];

    const inviteRows =
      data.invites?.map((invite) => ({
        kind: "invite" as const,
        id: invite.id,
        name: invite.email,
        email: invite.email,
        role: invite.role,
        status: invite.status || "invited",
        lastActiveAt: invite.createdAt,
        automationsCount: 0,
        avatarUrl: null,
      })) ?? [];

    return [...memberRows, ...inviteRows];
  }, [data]);

  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows;
    const term = search.toLowerCase();
    return rows.filter(
      (row) => row.name.toLowerCase().includes(term) || row.email.toLowerCase().includes(term)
    );
  }, [rows, search]);

  const header = (
    <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,1.4fr)_minmax(0,1.4fr)_minmax(0,1fr)] px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
      <span>User</span>
      <span>Role</span>
      <span>Last Active</span>
      <span className="text-right">Automations</span>
    </div>
  );

  const renderSkeleton = () =>
    Array.from({ length: 4 }).map((_, idx) => (
      <div
        key={`skeleton-${idx}`}
        className="grid grid-cols-[minmax(0,3fr)_minmax(0,1.4fr)_minmax(0,1.4fr)_minmax(0,1fr)] items-center px-6 py-4 gap-4"
      >
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-gray-100" />
          <div className="space-y-2 w-40">
            <div className="h-3 rounded bg-gray-100" />
            <div className="h-3 rounded bg-gray-100 w-3/4" />
          </div>
        </div>
        <div className="h-9 rounded-lg bg-gray-100" />
        <div className="h-4 rounded bg-gray-100 w-24" />
        <div className="h-4 rounded bg-gray-100 w-12 ml-auto" />
      </div>
    ));

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold text-[#0A0A0A]">Team Members</h2>
        <p className="text-sm text-gray-500">Manage access and roles for your workspace.</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="flex flex-col gap-4 p-6 border-b border-gray-100">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="relative w-full md:max-w-md">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or email..."
                className="pl-9 pr-12 h-11 rounded-xl bg-gray-50 border-gray-200 focus:border-[#E43632] focus:ring-[#E43632]/30"
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
                aria-label="Filter"
              >
                <SlidersHorizontal size={16} />
              </button>
            </div>
            {canManage ? (
              <Button
                className="h-11 rounded-xl bg-[#E43632] hover:bg-[#c12e2a] text-white shadow-sm"
                onClick={() => setInviteDialogOpen(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Invite Member
              </Button>
            ) : null}
          </div>
        </div>

        <div className="min-w-full">
          {header}
          <div className="divide-y divide-gray-100">
            {loading && renderSkeleton()}
            {!loading &&
              filteredRows.map((row) => {
                const canEditRole =
                  row.kind === "member" &&
                  canManage &&
                  row.status === "active" &&
                  (row.role !== "owner" || data?.currentRole === "owner");
                return (
                  <div
                    key={row.id}
                    className="grid grid-cols-[minmax(0,3fr)_minmax(0,1.4fr)_minmax(0,1.4fr)_minmax(0,1fr)] items-center px-6 py-5 gap-4"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar className="h-10 w-10 border border-gray-100">
                        <AvatarImage src={row.avatarUrl ?? undefined} />
                        <AvatarFallback className="bg-gray-100 text-gray-600">
                          {initials(row.name, row.email)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{row.name}</p>
                        <p className="text-xs text-gray-500 truncate">{row.email}</p>
                      </div>
                    </div>

                    <div className="w-full max-w-xs">
                      <Select
                        value={row.role}
                        onValueChange={(value) => row.membershipId && onChangeRole(row.membershipId, value)}
                        disabled={!canEditRole || row.kind === "invite"}
                      >
                        <SelectTrigger className="h-10 rounded-lg border-gray-200">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {data?.availableRoles
                            ?.filter((role) => !(role === "owner" && data.currentRole !== "owner"))
                            .map((role) => (
                              <SelectItem key={role} value={role} disabled={row.kind === "invite"}>
                                {ROLE_LABELS[role] ?? role}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-center gap-2 text-sm text-gray-700">
                      <span
                        className={cn(
                          "h-2.5 w-2.5 rounded-full",
                          row.kind === "invite" ? "bg-amber-500" : activityDotColor(row.status, row.lastActiveAt)
                        )}
                      />
                      <span>
                        {row.kind === "invite" ? "Invitation sent" : formatLastActive(row.lastActiveAt)}
                      </span>
                    </div>

                    <div className="text-right text-sm font-semibold text-gray-900">
                      {row.automationsCount?.toLocaleString() ?? "0"}
                    </div>
                  </div>
                );
              })}
            {!loading && filteredRows.length === 0 && (
              <div className="px-6 py-6 text-sm text-gray-500">No team members found.</div>
            )}
          </div>
        </div>
      </div>

      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent className="sm:max-w-[460px] bg-white">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-lg font-semibold">Invite member</DialogTitle>
            <DialogDescription>Send an invitation to join this workspace.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-800">Email</label>
              <Input
                placeholder="name@company.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-800">Role</label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {data?.availableRoles
                    ?.filter((role) => role !== "owner")
                    .map((role) => (
                      <SelectItem key={role} value={role}>
                        {ROLE_LABELS[role] ?? role}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setInviteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={onInvite}
              disabled={inviteSubmitting || !inviteEmail.trim()}
              className="bg-[#E43632] hover:bg-[#c12e2a]"
            >
              {inviteSubmitting ? "Sending..." : "Send invite"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

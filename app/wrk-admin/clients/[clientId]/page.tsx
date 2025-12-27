import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AlertTriangle, CheckCircle2, Mail, MessageSquare, Users } from "lucide-react";
import { and, eq } from "drizzle-orm";
import { requireWrkStaffSession } from "@/lib/api/context";
import { db } from "@/db";
import { tenants, memberships, users, workspaceInvites, type MembershipRole } from "@/db/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { getClientSpendSummary, mockAdminProjects } from "@/lib/admin-mock";
import { mockClients } from "@/lib/mock-clients";
import MemberActions from "../memberActions";
import WorkspaceActions, { ResendInviteButton, RevokeInviteButton } from "../workspaceActions";
import { wrkAdminRoutes } from "@/lib/admin/routes";

export default async function WrkAdminWorkspaceDetail({ params }: { params: { clientId: string } }) {
  const session = await requireWrkStaffSession();

  if (params.clientId === "new") {
    redirect(wrkAdminRoutes.workspaces);
  }

  const workspace = await db.query.tenants.findFirst({
    where: eq(tenants.id, params.clientId),
  });

  if (!workspace) {
    notFound();
  }

  const members = await db
    .select({
      membershipId: memberships.id,
      userId: users.id,
      name: users.name,
      email: users.email,
      role: memberships.role,
      userStatus: users.status,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.tenantId, params.clientId), eq(memberships.status, "active")));

  const invites = await db
    .select({
      id: workspaceInvites.id,
      email: workspaceInvites.email,
      role: workspaceInvites.role,
      createdAt: workspaceInvites.createdAt,
      expiresAt: workspaceInvites.expiresAt,
    })
    .from(workspaceInvites)
    .where(eq(workspaceInvites.tenantId, params.clientId));

  const matchingClient = workspace
    ? mockClients.find((client) => client.name.toLowerCase() === workspace.name.toLowerCase())
    : undefined;

  const spendSummary = matchingClient ? getClientSpendSummary(matchingClient) : null;
  const utilization =
    spendSummary && spendSummary.committedMonthlySpend > 0
      ? Math.round((spendSummary.currentMonthSpend / spendSummary.committedMonthlySpend) * 100)
      : null;
  const projects = workspace
    ? mockAdminProjects.filter((project) => project.clientName.toLowerCase() === workspace.name.toLowerCase())
    : [];
  const owner = members.find((member) => member.role === "owner");

  const healthVariant = matchingClient?.health ?? "Unknown";
  const activeProjects = matchingClient?.activeProjects ?? projects.length ?? 0;

  const healthStyles: Record<string, string> = {
    Good: "bg-emerald-50 text-emerald-700 border-emerald-100",
    "At Risk": "bg-amber-50 text-amber-700 border-amber-100",
    "Churn Risk": "bg-red-50 text-red-700 border-red-100",
    Unknown: "bg-slate-100 text-slate-700 border-slate-200",
  };

  const HealthIcon =
    healthVariant === "Good" ? CheckCircle2 : healthVariant === "At Risk" || healthVariant === "Churn Risk" ? AlertTriangle : Users;
  const perProjectSpend =
    matchingClient && projects.length > 0 ? Math.round(matchingClient.activeSpend / projects.length) : null;
  const perProjectCommit =
    matchingClient && projects.length > 0 ? Math.round(matchingClient.committedSpend / projects.length) : null;
  const liveProjects = projects.filter((p) => p.status === "Live").length;
  const inBuildProjects = projects.length - liveProjects;

  const tabs = [
    { label: "Overview", active: true },
    { label: "Projects", active: false },
    { label: "Billing & Quotes", active: false },
    { label: "Contacts", active: false },
  ];

  return (
    <div className="min-h-screen bg-[#f9fafb]">
      <div className="border-b bg-white">
        <div className="px-10 py-6 space-y-6">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Link href={wrkAdminRoutes.workspaces} className="hover:text-slate-800">
              Workspaces
            </Link>
            <span>/</span>
            <span className="font-semibold text-slate-900">{workspace.name}</span>
          </div>

          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 rounded-xl bg-[#f3f4f6] flex items-center justify-center text-lg font-bold text-slate-600">
                {workspace.name.charAt(0).toUpperCase()}
              </div>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-2xl font-semibold text-slate-900">{workspace.name}</h1>
                  <Badge
                    variant="outline"
                    className={cn("border text-xs font-medium bg-[#d0fae5] text-[#007a55] border-transparent", healthStyles[healthVariant] ?? healthStyles.Unknown)}
                  >
                    {healthVariant}
                  </Badge>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
                  {matchingClient?.industry && <span>{matchingClient.industry}</span>}
                  <span className="hidden sm:inline-block">•</span>
                  {owner ? (
                    <span className="flex items-center gap-2">
                      Managed by <span className="font-semibold text-slate-800">{owner.name ?? "Owner"}</span>
                    </span>
                  ) : (
                    <span className="text-slate-500">No owner assigned</span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm">
                Edit Client
              </Button>
              <Button size="sm" className="bg-black text-white hover:bg-black/90">
                New Project
              </Button>
              <WorkspaceActions tenantId={workspace.id} status={workspace.status} staffRole={session.wrkStaffRole} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card className="shadow-sm border-slate-200 rounded-2xl">
              <CardContent className="p-5 space-y-2">
                <p className="text-[11px] font-bold uppercase text-slate-500">Active Monthly Spend</p>
                <div className="flex items-center gap-2">
                  <p className="text-2xl font-semibold text-slate-900">
                    {spendSummary ? `$${spendSummary.currentMonthSpend.toLocaleString()}` : "—"}
                  </p>
                </div>
                <p className="text-xs text-slate-500">Monthly recurring</p>
              </CardContent>
            </Card>

            <Card className="shadow-sm border-slate-200 rounded-2xl">
              <CardContent className="p-5 space-y-2">
                <p className="text-[11px] font-bold uppercase text-slate-500">Committed Spend</p>
                <p className="text-2xl font-semibold text-slate-900">
                  {spendSummary ? `$${spendSummary.committedMonthlySpend.toLocaleString()}` : "—"}
                </p>
                <p className="text-xs text-slate-500">Contracted minimums</p>
              </CardContent>
            </Card>

            <Card className="shadow-sm border-slate-200 rounded-2xl">
              <CardContent className="p-5 space-y-2">
                <p className="text-[11px] font-bold uppercase text-slate-500">Utilization</p>
                <p
                  className={cn(
                    "text-2xl font-semibold",
                    utilization !== null && utilization > 100 ? "text-red-600" : "text-emerald-600"
                  )}
                >
                  {utilization !== null ? `${utilization}%` : "—"}
                </p>
                <p className="text-xs text-slate-500">Active / Committed</p>
              </CardContent>
            </Card>

            <Card className="shadow-sm border-slate-200 rounded-2xl">
              <CardContent className="p-5 space-y-2">
                <p className="text-[11px] font-bold uppercase text-slate-500">Active Projects</p>
                <p className="text-2xl font-semibold text-slate-900">{activeProjects}</p>
                <p className="text-xs text-slate-500">
                  {projects.length > 0 ? `${liveProjects} Live, ${inBuildProjects} In Build` : "Projects on platform"}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <div className="px-10 py-8 space-y-6">
        <div className="border-b border-slate-200">
          <div className="flex items-center gap-8">
            {tabs.map((tab) => (
              <button
                key={tab.label}
                className={cn(
                  "relative pb-3 text-sm font-medium text-slate-600",
                  tab.active && "text-[#e43632]"
                )}
              >
                {tab.label}
                {tab.active && <span className="absolute left-0 right-0 -bottom-px h-[2px] bg-[#e43632]" />}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
          <Card className="shadow-none border-slate-200">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base font-semibold text-slate-900">Spend by Project</CardTitle>
              <Button variant="ghost" size="sm" className="text-xs text-slate-600 hover:text-slate-900">
                View All
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="w-[45%] text-xs uppercase text-slate-500">Project</TableHead>
                    <TableHead className="w-[20%] text-xs uppercase text-slate-500">Status</TableHead>
                    <TableHead className="w-[25%] text-xs uppercase text-slate-500">Spend / Commit</TableHead>
                    <TableHead className="text-right w-[10%] text-xs uppercase text-slate-500">Util %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projects.map((project) => {
                    const utilizationPct =
                      perProjectSpend !== null && perProjectCommit !== null && perProjectCommit > 0
                        ? Math.round(Math.min(200, Math.max(0, (perProjectSpend / perProjectCommit) * 100)))
                        : null;

                    return (
                      <TableRow key={project.id}>
                        <TableCell className="align-top">
                          <div className="text-sm font-semibold text-slate-900">{project.name}</div>
                          <div className="text-[11px] text-slate-500">v{project.version} • Owner: {project.owner?.name ?? "—"}</div>
                        </TableCell>
                        <TableCell className="align-top">
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-xs font-medium",
                              project.status === "Live"
                                ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                                : project.status?.toLowerCase().includes("build")
                                ? "bg-blue-50 text-blue-700 border-blue-100"
                                : "bg-slate-100 text-slate-700 border-slate-200"
                            )}
                          >
                            {project.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="align-top text-sm text-slate-700">
                          {perProjectSpend !== null ? `$${perProjectSpend.toLocaleString()}` : "—"}{" "}
                          <span className="text-slate-400">/</span>{" "}
                          {perProjectCommit !== null ? `$${perProjectCommit.toLocaleString()}` : "—"}
                        </TableCell>
                        <TableCell className="align-top text-right text-sm font-semibold text-emerald-600">
                          {utilizationPct !== null ? `${utilizationPct}%` : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {projects.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-6">
                        No projects available for this client yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="shadow-none border-slate-200 h-full">
            <CardContent className="p-6 space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Account Health</h3>
                <div className="mt-3 inline-flex items-center gap-2 rounded-lg border px-3 py-1 text-sm font-medium">
                  {HealthIcon && <HealthIcon className="h-4 w-4" />}
                  <span>{healthVariant}</span>
                </div>
                <p className="mt-2 text-sm text-slate-600">
                  {matchingClient
                    ? "Last check-in: 2 days ago. Client is happy with the latest update."
                    : "Health signals will appear once projects and spend are tracked."}
                </p>
              </div>

              <div className="border-t pt-4">
                <h3 className="text-lg font-semibold text-slate-900">Account Owner</h3>
                <div className="mt-3 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full border border-slate-200 bg-slate-100 flex items-center justify-center text-sm font-semibold text-slate-700">
                    {(owner?.name ?? matchingClient?.owner?.name ?? "U").charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{owner?.name ?? matchingClient?.owner?.name ?? "Unassigned"}</p>
                    <p className="text-xs text-slate-500">{owner ? owner.email : "Owner not set"}</p>
                  </div>
                </div>
                {owner?.email && (
                  <div className="mt-4 flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1" asChild>
                      <a href={`mailto:${owner.email}`} target="_blank" rel="noreferrer">
                        <Mail className="h-4 w-4 mr-2" />
                        Email
                      </a>
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1">
                      <MessageSquare className="h-4 w-4 mr-2" />
                      Chat
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Members</CardTitle>
              <Badge variant="secondary">{members.length} active</Badge>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((member) => (
                    <TableRow key={member.membershipId}>
                      <TableCell className="font-medium">{member.name ?? "—"}</TableCell>
                      <TableCell>{member.email}</TableCell>
                      <TableCell className="capitalize">{member.role}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            member.userStatus === "suspended"
                              ? "bg-red-50 text-red-700 border-red-200"
                              : "bg-emerald-50 text-emerald-700 border-emerald-200"
                          }
                        >
                          {member.userStatus}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <MemberActions
                          membershipId={member.membershipId}
                          userId={member.userId}
                          currentRole={member.role as MembershipRole}
                          userStatus={member.userStatus}
                          staffRole={session.wrkStaffRole}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                  {members.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">
                        No active members.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Pending Invites</CardTitle>
              <Badge variant="secondary">{invites.length}</Badge>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invites.map((invite) => (
                    <TableRow key={invite.id}>
                      <TableCell>{invite.email}</TableCell>
                      <TableCell className="capitalize">{invite.role}</TableCell>
                      <TableCell>{invite.createdAt?.toISOString().slice(0, 10) ?? "—"}</TableCell>
                      <TableCell>{invite.expiresAt?.toISOString().slice(0, 10) ?? "—"}</TableCell>
                      <TableCell className="text-right space-x-2">
                        <ResendInviteButton inviteId={invite.id} staffRole={session.wrkStaffRole} />
                        <RevokeInviteButton inviteId={invite.id} staffRole={session.wrkStaffRole} />
                      </TableCell>
                    </TableRow>
                  ))}
                  {invites.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">
                        No pending invites.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4">
          {["Projects", "Billing & Quotes", "Contacts"].map((section) => (
            <Card key={section} className="shadow-none border-slate-200">
              <CardHeader>
                <CardTitle className="text-base font-semibold text-slate-900">{section}</CardTitle>
              </CardHeader>
              <CardContent className="h-[180px] flex items-center justify-center text-sm text-slate-500">
                Empty state
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}


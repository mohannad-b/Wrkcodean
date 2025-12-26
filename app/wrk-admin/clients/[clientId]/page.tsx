import { notFound } from "next/navigation";
import { requireWrkStaffSession } from "@/lib/api/context";
import { db } from "@/db";
import { tenants, memberships, users, workspaceInvites, type MembershipRole } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import MemberActions from "../memberActions";
import WorkspaceActions, { ResendInviteButton, RevokeInviteButton } from "../workspaceActions";

export default async function WrkAdminWorkspaceDetail({ params }: { params: { clientId: string } }) {
  const session = await requireWrkStaffSession();

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

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{workspace.name}</h1>
          <p className="text-sm text-muted-foreground">Workspace ID: {workspace.id}</p>
        </div>
        <WorkspaceActions tenantId={workspace.id} status={workspace.status} staffRole={session.wrkStaffRole} />
      </div>

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
  );
}


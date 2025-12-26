import { notFound } from "next/navigation";
import { requireWrkStaffSession } from "@/lib/api/context";
import { db } from "@/db";
import { tenants, memberships, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export default async function WrkAdminWorkspaceDetail({ params }: { params: { clientId: string } }) {
  await requireWrkStaffSession();

  const workspace = await db.query.tenants.findFirst({
    where: eq(tenants.id, params.clientId),
  });

  if (!workspace) {
    notFound();
  }

  const members = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: memberships.role,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.tenantId, params.clientId), eq(memberships.status, "active")));

  return (
    <div className="p-8 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">{workspace.name}</h1>
        <p className="text-sm text-muted-foreground">Workspace ID: {workspace.id}</p>
      </div>
      <div className="rounded border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3 font-semibold">Members</div>
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-600">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2">Role</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {members.map((member) => (
              <tr key={member.id} className="hover:bg-slate-50">
                <td className="px-4 py-2">{member.name ?? "—"}</td>
                <td className="px-4 py-2">{member.email}</td>
                <td className="px-4 py-2 capitalize">{member.role}</td>
              </tr>
            ))}
            {members.length === 0 && (
              <tr>
                <td className="px-4 py-4 text-center text-slate-500" colSpan={3}>
                  No active members.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">
        TODO: Add controls for role changes, invites, ownership transfer, and suspension with audit logging.
      </p>
    </div>
  );
}


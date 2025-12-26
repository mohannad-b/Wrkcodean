import { requireWrkStaffSession } from "@/lib/api/context";
import { db } from "@/db";
import { tenants, memberships, users } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export default async function WrkAdminWorkspacesPage() {
  await requireWrkStaffSession();

  const rows = await db
    .select({
      id: tenants.id,
      name: tenants.name,
      slug: tenants.slug,
      createdAt: tenants.createdAt,
      ownerId: memberships.userId,
      ownerName: users.name,
      ownerEmail: users.email,
    })
    .from(tenants)
    .leftJoin(memberships, and(eq(memberships.tenantId, tenants.id), eq(memberships.role, "owner")))
    .leftJoin(users, eq(users.id, memberships.userId));

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Workspaces</h1>
        <p className="text-sm text-muted-foreground">All client workspaces across the platform.</p>
      </div>
      <div className="overflow-auto rounded border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-600">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Slug</th>
              <th className="px-4 py-3">Owner</th>
              <th className="px-4 py-3">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">{row.name}</td>
                <td className="px-4 py-3 text-slate-600">{row.slug}</td>
                <td className="px-4 py-3 text-slate-700">
                  {row.ownerName ?? row.ownerEmail ?? "—"}
                </td>
                <td className="px-4 py-3 text-slate-500">{row.createdAt.toISOString().slice(0, 10)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-slate-500" colSpan={4}>
                  No workspaces found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">
        NOTE: Legacy mock admin UI has been removed. Wire additional controls (suspend, role changes, invites) to real
        APIs in this surface.
      </p>
    </div>
  );
}


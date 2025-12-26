import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { memberships, tenants } from "@/db/schema";
import { getOrCreateUserFromAuth0Session } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { and, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function WorkspacePickerPage({ searchParams }: { searchParams: { returnTo?: string } }) {
  const returnTo = searchParams?.returnTo ?? "/dashboard";
  const cookieStore = cookies();
  const { userRecord } = await getOrCreateUserFromAuth0Session();

  const rows = await db
    .select({
      id: tenants.id,
      name: tenants.name,
      createdAt: tenants.createdAt,
      role: memberships.role,
    })
    .from(memberships)
    .innerJoin(tenants, eq(tenants.id, memberships.tenantId))
    .where(and(eq(memberships.userId, userRecord.id), eq(memberships.status, "active")));

  if (rows.length === 1) {
    cookieStore.set("activeWorkspaceId", rows[0].id, { path: "/", httpOnly: false, sameSite: "lax" });
    redirect(returnTo);
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <Card className="w-full max-w-3xl p-6 space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Choose a workspace</h1>
          <p className="text-sm text-muted-foreground">Select a workspace to continue.</p>
        </div>
        <div className="overflow-hidden rounded border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-600">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((workspace) => (
                <tr key={workspace.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{workspace.name}</td>
                  <td className="px-4 py-3 text-slate-700 capitalize">
                    <Badge variant="secondary">{workspace.role}</Badge>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{workspace.createdAt.toISOString().slice(0, 10)}</td>
                  <td className="px-4 py-3 text-right">
                    <form action={`/api/me/active-workspace`} method="post">
                      <input type="hidden" name="workspaceId" value={workspace.id} />
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                          cookieStore.set("activeWorkspaceId", workspace.id, { path: "/", httpOnly: false, sameSite: "lax" });
                          redirect(returnTo);
                        }}
                      >
                        Select
                      </Button>
                    </form>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td className="px-4 py-6 text-center text-slate-500" colSpan={4}>
                    No workspaces found. <Link href="/workspace-setup" className="text-blue-600 underline">Create one</Link>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex justify-between items-center">
          <Link href="/workspace-setup" className="text-sm text-blue-600 underline">
            Create new workspace
          </Link>
          <Link href={returnTo} className="text-sm text-muted-foreground">
            Cancel
          </Link>
        </div>
      </Card>
    </div>
  );
}


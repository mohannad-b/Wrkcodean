import Link from "next/link";
import { requireWrkStaffSession } from "@/lib/api/context";
import { db } from "@/db";
import { tenants, memberships, users } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import ClientsTable from "./clientsTable";
import { wrkAdminRoutes } from "@/lib/admin/routes";

export type WorkspaceRow = {
  id: string;
  name: string;
  slug: string | null;
  status: string;
  ownerName: string | null;
  ownerEmail: string | null;
  createdAt: string;
  memberCount: number;
  submissionCount: number;
};

export default async function WrkAdminWorkspacesPage() {
  const session = await requireWrkStaffSession();

  const rows = await db
    .select({
      id: tenants.id,
      name: tenants.name,
      slug: tenants.slug,
      status: tenants.status,
      createdAt: tenants.createdAt,
      ownerName: users.name,
      ownerEmail: users.email,
      memberCount: sql<number>`count(distinct ${memberships.id})`,
    })
    .from(tenants)
    .leftJoin(memberships, eq(memberships.tenantId, tenants.id))
    .leftJoin(
      users,
      and(eq(users.id, memberships.userId), eq(memberships.role, "owner"))
    )
    .groupBy(tenants.id, users.id);

  const workspaceRows: WorkspaceRow[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    ownerName: row.ownerName,
    ownerEmail: row.ownerEmail,
    createdAt: format(row.createdAt, "yyyy-MM-dd"),
    memberCount: row.memberCount ?? 0,
    submissionCount: 0,
  }));

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Workspaces</h1>
          <p className="text-sm text-muted-foreground">Managing all workspaces on the platform.</p>
        </div>
        {(session.wrkStaffRole === "wrk_admin" || session.wrkStaffRole === "wrk_master_admin") && (
          <Button asChild>
            <Link href={wrkAdminRoutes.workspaceDetail("new")}>New Workspace</Link>
          </Button>
        )}
      </div>

      <Card className="p-4">
        <ClientsTable rows={workspaceRows} staffRole={session.wrkStaffRole} />
      </Card>
    </div>
  );
}


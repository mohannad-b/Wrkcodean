import { ReactNode } from "react";
import { requireTenantSession } from "@/lib/api/context";
import { authorize } from "@/lib/auth/rbac";

export default async function WorkspaceAdminLayout({ children }: { children: ReactNode }) {
  const session = await requireTenantSession();
  authorize("workspace:update", { type: "workspace", tenantId: session.tenantId }, session);
  return <div className="min-h-screen bg-gray-50">{children}</div>;
}


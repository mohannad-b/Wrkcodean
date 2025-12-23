import { ReactNode } from "react";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { resolvePrimaryRole } from "@/lib/services/workspace-members";

export default async function StudioLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  const primaryRole = resolvePrimaryRole(session.roles);

  if (primaryRole === "billing") {
    redirect("/workspace-settings?tab=billing");
  }

  return <>{children}</>;
}



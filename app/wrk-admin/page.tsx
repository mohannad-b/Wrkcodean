import { redirect } from "next/navigation";
import { wrkAdminRoutes } from "@/lib/admin/routes";

export const dynamic = "force-dynamic";

export default function WrkAdminHome() {
  redirect(wrkAdminRoutes.workspaces);
}


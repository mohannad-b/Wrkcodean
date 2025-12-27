import { redirect } from "next/navigation";
import { wrkAdminRoutes } from "@/lib/admin/routes";

export default function WrkAdminHome() {
  redirect(wrkAdminRoutes.workspaces);
}


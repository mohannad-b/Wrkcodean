import { permanentRedirect } from "next/navigation";
import { wrkAdminRoutes } from "@/lib/admin/routes";

export default function AdminClientsRedirect() {
  permanentRedirect(wrkAdminRoutes.workspaces);
}


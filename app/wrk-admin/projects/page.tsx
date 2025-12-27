import { permanentRedirect } from "next/navigation";
import { wrkAdminRoutes } from "@/lib/admin/routes";

export const dynamic = "force-dynamic";

export default function WrkAdminProjectsRedirect() {
  permanentRedirect(wrkAdminRoutes.submissions);
}


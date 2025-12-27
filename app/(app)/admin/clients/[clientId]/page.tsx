import { permanentRedirect } from "next/navigation";
import { wrkAdminRoutes } from "@/lib/admin/routes";

export default function AdminClientRedirect({ params }: { params: { clientId: string } }) {
  permanentRedirect(wrkAdminRoutes.workspaceDetail(params.clientId));
}


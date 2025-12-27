import { permanentRedirect } from "next/navigation";
import { wrkAdminRoutes } from "@/lib/admin/routes";

export default function AdminProjectRedirect({ params }: { params: { projectId: string } }) {
  permanentRedirect(wrkAdminRoutes.submissionDetail(params.projectId));
}


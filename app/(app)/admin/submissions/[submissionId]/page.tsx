import { permanentRedirect } from "next/navigation";
import { wrkAdminRoutes } from "@/lib/admin/routes";

export default function SubmissionDetailRedirect({ params }: { params: { submissionId: string } }) {
  permanentRedirect(wrkAdminRoutes.submissionDetail(params.submissionId));
}


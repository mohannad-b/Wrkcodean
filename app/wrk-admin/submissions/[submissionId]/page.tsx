import { redirect } from "next/navigation";

export default function WrkAdminSubmissionDetailRedirect({ params }: { params: { submissionId: string } }) {
  redirect(`/wrk-admin/clients/${params.submissionId}`);
}


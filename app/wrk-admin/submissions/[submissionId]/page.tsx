import SubmissionDetailPage from "@/components/wrk-admin/SubmissionDetailPage";

export default function WrkAdminSubmissionDetail({ params }: { params: { submissionId: string } }) {
  return <SubmissionDetailPage params={params} />;
}


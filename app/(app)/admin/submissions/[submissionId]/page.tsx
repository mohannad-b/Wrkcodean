import ProjectDetailPage from "@/app/(app)/admin/projects/[projectId]/page";

export default function SubmissionDetailPage({ params }: { params: { submissionId: string } }) {
  return <ProjectDetailPage params={{ submissionId: params.submissionId }} />;
}


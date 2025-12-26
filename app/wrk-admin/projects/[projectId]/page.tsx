import { redirect } from "next/navigation";

export default function WrkAdminProjectDetailRedirect({ params }: { params: { projectId: string } }) {
  redirect(`/wrk-admin/clients/${params.projectId}`);
}


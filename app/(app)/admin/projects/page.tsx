import { redirect } from "next/navigation";

// Legacy /admin/projects surface is deprecated. Send users to the Wrk control plane.
export default function AdminProjectsPage() {
  console.warn("[DEPRECATION] /admin/projects is deprecated. Redirecting to /wrk-admin/clients.");
  redirect("/wrk-admin/clients");
}


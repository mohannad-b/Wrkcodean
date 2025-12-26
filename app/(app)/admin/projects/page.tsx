import { redirect } from "next/navigation";

// Legacy /admin/projects surface now redirects to submissions.
export default function AdminProjectsPage() {
  console.warn("[DEPRECATION] /admin/projects is deprecated. Redirecting to /admin/submissions.");
  redirect("/admin/submissions");
}


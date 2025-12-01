import { redirect } from "next/navigation";

// Admin console defaults to Clients view (matches the documented UX spec)
export default function AdminPage() {
  redirect("/admin/clients");
}


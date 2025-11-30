import { redirect } from "next/navigation";

// Admin console defaults to Clients view (matching Figma design)
export default function AdminPage() {
  redirect("/admin/clients");
}


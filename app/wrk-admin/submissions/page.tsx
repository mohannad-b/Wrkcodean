import { redirect } from "next/navigation";

// Submissions surface currently reuses client view.
export default function WrkAdminSubmissionsRedirect() {
  redirect("/wrk-admin/clients");
}


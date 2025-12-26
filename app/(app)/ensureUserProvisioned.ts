import { redirect } from "next/navigation";
import { getSession, NoActiveWorkspaceError, NoTenantMembershipError } from "@/lib/auth/session";

export async function ensureUserProvisioned() {
  try {
    await getSession();
  } catch (error) {
    if (error instanceof Error && error.message.includes("not authenticated")) {
      redirect("/auth/login");
      return;
    }
    if (error instanceof NoTenantMembershipError || (error as any)?.name === "NoTenantMembershipError") {
      // User is authenticated but has no tenant yet; allow workspace-setup flow to proceed.
      return;
    }
    if (error instanceof NoActiveWorkspaceError || (error as any)?.name === "NoActiveWorkspaceError") {
      redirect("/workspace-picker");
      return;
    }
    throw error;
  }
}


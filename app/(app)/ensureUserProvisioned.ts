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
      // #region agent log
      fetch("http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "debug-session",
          runId: "tenant-check",
          hypothesisId: "T5",
          location: "app/(app)/ensureUserProvisioned.ts",
          message: "No tenant membership; redirecting to workspace setup",
          data: {},
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      redirect("/workspace-setup");
      return;
    }
    if (error instanceof NoActiveWorkspaceError || (error as any)?.name === "NoActiveWorkspaceError") {
      redirect("/workspace-picker");
      return;
    }
    throw error;
  }
}


import { redirect } from "next/navigation";
import { getSession, NoActiveWorkspaceError, NoTenantMembershipError } from "@/lib/auth/session";
import { sendDevAgentLog } from "@/lib/dev/agent-log";

const devLog = (payload: Record<string, unknown>) => {
  if (process.env.NODE_ENV !== "development") return;
  sendDevAgentLog(payload, { dedupeKey: payload.location as string });
};

export async function ensureUserProvisioned() {
  try {
    await getSession();
  } catch (error) {
    if (error instanceof Error && error.message.includes("not authenticated")) {
      redirect("/auth/login");
      return;
    }
    if (error instanceof NoTenantMembershipError || (error as any)?.name === "NoTenantMembershipError") {
      devLog({
        sessionId: "debug-session",
        runId: "tenant-check",
        hypothesisId: "T5",
        location: "app/(app)/ensureUserProvisioned.ts",
        message: "No tenant membership; skipping redirect",
        data: {},
      });
      return;
    }
    if (error instanceof NoActiveWorkspaceError || (error as any)?.name === "NoActiveWorkspaceError") {
      redirect("/workspace-picker");
      return;
    }
    throw error;
  }
}


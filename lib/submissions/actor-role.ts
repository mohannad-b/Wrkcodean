import type { LifecycleRole } from "@/lib/submissions/lifecycle";
import type { StaffSession, TenantSession, TenantOrStaffSession } from "@/lib/auth/session";

const TENANT_ROLE_MAP: Record<string, LifecycleRole> = {
  owner: "tenant_owner",
  admin: "tenant_admin",
  editor: "tenant_editor",
  billing: "tenant_billing",
  viewer: "tenant_viewer",
};

function deriveTenantRole(session: TenantSession): LifecycleRole {
  const primary = session.roles.find((role) => TENANT_ROLE_MAP[role]);
  if (primary) {
    return TENANT_ROLE_MAP[primary];
  }
  throw new Error("actorRole is required and could not be derived from tenant session roles");
}

function deriveStaffRole(session: StaffSession): LifecycleRole {
  if (!session.wrkStaffRole) {
    throw new Error("actorRole is required and could not be derived from staff session");
  }
  if (session.wrkStaffRole === "wrk_viewer") {
    throw new Error("actorRole 'wrk_viewer' cannot perform lifecycle transitions");
  }
  return session.wrkStaffRole;
}

export function deriveLifecycleActorRole(session: TenantOrStaffSession): LifecycleRole {
  if (session.kind === "staff") {
    return deriveStaffRole(session);
  }
  return deriveTenantRole(session);
}



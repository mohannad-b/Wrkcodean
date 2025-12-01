type TenantScopedResourceType = "automation" | "automation_version";
type AdminResourceType = "admin:projects" | "admin:clients";

export type RbacAction =
  | "automation:create"
  | "automation:read"
  | "automation:update"
  | "admin:projects:access"
  | "admin:clients:access";

export type RbacResource =
  | {
      type: TenantScopedResourceType;
      tenantId: string;
    }
  | {
      type: AdminResourceType;
    };

export type RbacSubject = {
  userId: string;
  tenantId: string | null;
  roles: string[];
};

const ROLE_ALIASES: Record<string, string> = {
  member: "client_member",
  workspace_admin: "client_admin",
};

const AUTOMATION_MANAGE_ROLES = new Set(["client_admin", "ops_admin", "admin"]);
const AUTOMATION_READ_ROLES = new Set([
  "client_admin",
  "client_member",
  "ops_admin",
  "admin",
]);
const ADMIN_SURFACE_ROLES = new Set(["ops_admin", "admin"]);

function normalizeRoles(roles: string[]): string[] {
  return roles.map((role) => ROLE_ALIASES[role] ?? role);
}

function hasRole(roles: string[], allowed: Set<string>): boolean {
  return roles.some((role) => allowed.has(role));
}

export function can(user: RbacSubject | null | undefined, action: RbacAction, resource: RbacResource): boolean {
  if (!user) {
    return false;
  }

  const roles = normalizeRoles(user.roles ?? []);

  if (resource.type === "automation" || resource.type === "automation_version") {
    if (!user.tenantId || user.tenantId !== resource.tenantId) {
      return false;
    }

    if (action === "automation:read") {
      return hasRole(roles, AUTOMATION_READ_ROLES);
    }

    if (action === "automation:create" || action === "automation:update") {
      return hasRole(roles, AUTOMATION_MANAGE_ROLES);
    }

    return false;
  }

  if (resource.type === "admin:projects" || resource.type === "admin:clients") {
    if (action === "admin:projects:access" || action === "admin:clients:access") {
      return hasRole(roles, ADMIN_SURFACE_ROLES);
    }
    return false;
  }

  return false;
}



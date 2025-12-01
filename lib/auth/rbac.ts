type TenantResourceType = "automation" | "automation_version" | "project" | "quote";

export type RbacAction =
  | "automation:read"
  | "automation:create"
  | "automation:update"
  | "automation:metadata:update"
  | "automation:version:create"
  | "automation:version:transition"
  | "admin:project:read"
  | "admin:project:write"
  | "admin:quote:create"
  | "admin:quote:update";

export type RbacResource =
  | {
      type: TenantResourceType;
      tenantId: string;
    }
  | {
      type: "admin";
      scope: "projects" | "quotes";
    };

export type RbacSubject = {
  userId: string;
  tenantId: string | null;
  roles: string[];
};

const ROLE_ALIASES: Record<string, string> = {
  member: "workspace_member",
  client_member: "workspace_member",
  client_admin: "workspace_admin",
  workspace_admin: "workspace_admin",
  admin: "ops_admin",
};

const WORKSPACE_ROLES = new Set(["workspace_member", "workspace_admin", "ops_admin"]);
const WORKSPACE_WRITE_ROLES = new Set(["workspace_admin", "ops_admin"]);
const ADMIN_ROLES = new Set(["ops_admin"]);

function normalizeRoles(roles: string[]): string[] {
  return roles.map((role) => ROLE_ALIASES[role] ?? role);
}

function hasRole(roles: string[], allowed: Set<string>): boolean {
  return roles.some((role) => allowed.has(role));
}

export function can(user: RbacSubject | null | undefined, action: RbacAction, resource?: RbacResource): boolean {
  if (!user) {
    return false;
  }

  const normalizedRoles = normalizeRoles(user.roles ?? []);

  if (resource && "tenantId" in resource) {
    if (!user.tenantId || user.tenantId !== resource.tenantId) {
      return false;
    }
  }

  switch (action) {
    case "automation:read":
      return hasRole(normalizedRoles, WORKSPACE_ROLES);
    case "automation:create":
    case "automation:update":
    case "automation:version:create":
    case "automation:version:transition":
      return hasRole(normalizedRoles, WORKSPACE_WRITE_ROLES);
    case "automation:metadata:update":
      return hasRole(normalizedRoles, WORKSPACE_ROLES);
    case "admin:project:read":
    case "admin:project:write":
    case "admin:quote:create":
    case "admin:quote:update":
      return hasRole(normalizedRoles, ADMIN_ROLES);
    default:
      return false;
  }
}



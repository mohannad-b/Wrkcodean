type TenantResourceType =
  | "automation"
  | "automation_version"
  | "project"
  | "quote"
  | "task"
  | "workspace";

export type RbacAction =
  | "automation:read"
  | "automation:create"
  | "automation:update"
  | "automation:metadata:update"
  | "automation:version:create"
  | "automation:version:transition"
  | "automation:delete"
  | "automation:run"
  | "automation:run:production"
  | "automation:deploy"
  | "automation:pause"
  | "copilot:read"
  | "copilot:write"
  | "observability:view"
  | "integrations:manage"
  | "billing:view"
  | "billing:manage"
  | "workspace:members:view"
  | "workspace:members:invite"
  | "workspace:members:update_role"
  | "workspace:members:remove"
  | "workspace:ownership:transfer"
  | "workspace:update"
  | "admin:project:read"
  | "admin:project:write"
  | "admin:quote:create"
  | "admin:quote:update"
  | "workflow:chat:read"
  | "workflow:chat:write"
  | "workflow:chat:edit"
  | "workflow:chat:delete"
  | "wrk:chat:read"
  | "wrk:chat:write"
  | "wrk:chat:edit"
  | "wrk:chat:delete"
  | "wrk:inbox:view";

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
  wrkStaffRole?: string | null; // wrk_admin, wrk_operator, wrk_viewer, or null
};

const ROLE_ALIASES: Record<string, string> = {
  member: "viewer",
  client_member: "viewer",
  client_admin: "owner",
  workspace_admin: "admin",
  admin: "admin",
  ops_admin: "admin",
};

const STUDIO_READ_ROLES = new Set(["owner", "admin", "editor", "viewer"]);
const STUDIO_WRITE_ROLES = new Set(["owner", "admin", "editor"]);
const ADMIN_ROLES = new Set(["owner", "admin"]);
const OWNER_ONLY = new Set(["owner"]);
const BILLING_ROLES = new Set(["owner", "billing"]);
const CHAT_READ_ROLES = new Set(["owner", "admin", "editor"]); // viewer and billing cannot access chat
const CHAT_WRITE_ROLES = new Set(["owner", "admin", "editor"]);
const WRK_STAFF_READ_ROLES = new Set(["wrk_admin", "wrk_operator", "wrk_viewer"]);
const WRK_STAFF_WRITE_ROLES = new Set(["wrk_admin", "wrk_operator"]);
const WRK_STAFF_ADMIN_ROLES = new Set(["wrk_admin"]);

function normalizeRoles(roles: string[]): string[] {
  return roles.map((role) => ROLE_ALIASES[role] ?? role).map((role) => role.toLowerCase());
}

function hasRole(roles: string[], allowed: Set<string>): boolean {
  return roles.some((role) => allowed.has(role));
}

export function can(user: RbacSubject | null | undefined, action: RbacAction, resource?: RbacResource): boolean {
  if (!user) {
    return false;
  }

  const normalizedRoles = normalizeRoles(user.roles ?? []);
  const wrkStaffRole = user.wrkStaffRole?.toLowerCase();

  // Wrk staff can access all chats across all workspaces (bypass tenant check for wrk actions)
  const isWrkStaffAction = action.startsWith("wrk:");
  if (isWrkStaffAction) {
    switch (action) {
      case "wrk:chat:read":
        return hasRole([wrkStaffRole].filter(Boolean), WRK_STAFF_READ_ROLES);
      case "wrk:chat:write":
      case "wrk:chat:edit":
      case "wrk:chat:delete":
        return hasRole([wrkStaffRole].filter(Boolean), WRK_STAFF_WRITE_ROLES);
      case "wrk:inbox:view":
        return hasRole([wrkStaffRole].filter(Boolean), WRK_STAFF_READ_ROLES);
      default:
        return false;
    }
  }

  // For workflow chat, check both workspace roles and Wrk staff status
  if (action.startsWith("workflow:chat:")) {
    // Wrk staff can read/write all workflow chats
    if (wrkStaffRole && hasRole([wrkStaffRole], WRK_STAFF_READ_ROLES)) {
      if (action === "workflow:chat:read" || action === "workflow:chat:write") {
        return true;
      }
      if ((action === "workflow:chat:edit" || action === "workflow:chat:delete") && hasRole([wrkStaffRole], WRK_STAFF_WRITE_ROLES)) {
        return true;
      }
    }

    // Tenant isolation check for non-Wrk staff
    if (resource && "tenantId" in resource) {
      if (!user.tenantId || user.tenantId !== resource.tenantId) {
        return false;
      }
    }

    switch (action) {
      case "workflow:chat:read":
        return hasRole(normalizedRoles, CHAT_READ_ROLES);
      case "workflow:chat:write":
        return hasRole(normalizedRoles, CHAT_WRITE_ROLES);
      case "workflow:chat:edit":
      case "workflow:chat:delete":
        // Clients can only edit/delete their own messages (checked in service layer)
        // Wrk staff can edit/delete any message (checked above)
        return hasRole(normalizedRoles, CHAT_WRITE_ROLES);
      default:
        return false;
    }
  }

  // Standard tenant-scoped actions
  if (resource && "tenantId" in resource) {
    if (!user.tenantId || user.tenantId !== resource.tenantId) {
      return false;
    }
  }

  switch (action) {
    case "automation:read":
    case "observability:view":
    case "copilot:read":
      return hasRole(normalizedRoles, STUDIO_READ_ROLES);
    case "automation:create":
    case "automation:update":
    case "automation:metadata:update":
    case "automation:version:create":
    case "automation:version:transition":
    case "automation:run":
    case "copilot:write":
      return hasRole(normalizedRoles, STUDIO_WRITE_ROLES);
    case "automation:run:production":
    case "automation:deploy":
    case "automation:pause":
    case "automation:delete":
    case "integrations:manage":
    case "workspace:members:invite":
    case "workspace:members:update_role":
    case "workspace:members:remove":
    case "workspace:update":
      return hasRole(normalizedRoles, ADMIN_ROLES);
    case "workspace:ownership:transfer":
      return hasRole(normalizedRoles, OWNER_ONLY);
    case "workspace:members:view":
      return hasRole(normalizedRoles, STUDIO_READ_ROLES) || hasRole(normalizedRoles, ADMIN_ROLES);
    case "billing:view":
      return hasRole(normalizedRoles, BILLING_ROLES);
    case "billing:manage":
      return hasRole(normalizedRoles, OWNER_ONLY);
    case "admin:project:read":
    case "admin:project:write":
    case "admin:quote:create":
    case "admin:quote:update":
      return hasRole(normalizedRoles, ADMIN_ROLES);
    default:
      return false;
  }
}

/**
 * Check if a user is Wrk staff
 */
export function isWrkStaff(user: RbacSubject | null | undefined): boolean {
  if (!user || !user.wrkStaffRole) {
    return false;
  }
  return hasRole([user.wrkStaffRole.toLowerCase()], WRK_STAFF_READ_ROLES);
}


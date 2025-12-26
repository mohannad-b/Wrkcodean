import type { TenantSession, StaffSession, TenantOrStaffSession } from "@/lib/auth/session";
import type { WrkStaffRole } from "@/db/schema";

// --------------------------
// Action definitions
// --------------------------
export type WorkspaceAction =
  | "workspace:read"
  | "workspace:update"
  | "workspace:members:read"
  | "workspace:members:invite"
  | "workspace:members:update_role"
  | "workspace:members:remove"
  | "workspace:ownership:transfer"
  | "workspace:billing:view"
  | "workspace:billing:manage"
  | "workspace:suspend";

export type WorkflowAction =
  | "workflow:read"
  | "workflow:write"
  | "workflow:status:update"
  | "workflow:chat:read"
  | "workflow:chat:write"
  | "workflow:chat:edit"
  | "workflow:chat:delete"
  | "workflow:version:read"
  | "workflow:version:write";

export type PlatformAction =
  | "platform:user:read"
  | "platform:user:write"
  | "platform:user:suspend"
  | "platform:workspace:read"
  | "platform:workspace:write"
  | "platform:workspace:suspend"
  | "platform:membership:read"
  | "platform:membership:write"
  | "platform:wrk_staff:read"
  | "platform:wrk_staff:write"
  | "platform:workflow:read"
  | "platform:workflow:write"
  | "platform:workflow_version:read"
  | "platform:workflow_version:write"
  | "platform:chat:read"
  | "platform:chat:write"
  | "platform:billing:read"
  | "platform:billing:write"
  | "platform:auditlog:read";

// Legacy action aliases to keep code working while we migrate naming.
export type LegacyAction =
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
  | "admin:submission:read"
  | "admin:submission:write"
  | "admin:quote:create"
  | "admin:quote:update"
  | "wrk:chat:read"
  | "wrk:chat:write"
  | "wrk:inbox:view";

export type AuthorizationAction = WorkspaceAction | WorkflowAction | PlatformAction | LegacyAction;

export type AuthorizationContext =
  | { type: "workspace"; tenantId: string }
  | { type: "workflow"; tenantId: string; workflowId: string }
  | { type: "platform" };

// --------------------------
// Errors
// --------------------------
export class AuthorizationError extends Error {
  status: number;
  code: "FORBIDDEN" | "UNAUTHORIZED" | "CONTEXT_REQUIRED";
  action: AuthorizationAction;
  context: AuthorizationContext | undefined;
  subject: { userId: string; tenantId: string | null; wrkStaffRole?: string | null };

  constructor(params: {
    message: string;
    status?: number;
    code?: AuthorizationError["code"];
    action: AuthorizationAction;
    context?: AuthorizationContext;
    subject: { userId: string; tenantId: string | null; wrkStaffRole?: string | null };
  }) {
    super(params.message);
    this.status = params.status ?? 403;
    this.code = params.code ?? "FORBIDDEN";
    this.action = params.action;
    this.context = params.context;
    this.subject = params.subject;
    this.name = "AuthorizationError";
  }
}

// --------------------------
// Role mappings
// --------------------------
const TENANT_ROLE_ALIASES: Record<string, string> = {
  member: "viewer",
  client_member: "viewer",
  client_admin: "owner",
  workspace_admin: "admin",
  admin: "admin",
  ops_admin: "admin",
};

const tenantRolePermissions: Record<string, Set<WorkspaceAction | WorkflowAction>> = {
  viewer: new Set<WorkspaceAction | WorkflowAction>(["workspace:read", "workflow:read", "workflow:version:read"]),
  billing: new Set<WorkspaceAction | WorkflowAction>(["workspace:billing:view"]),
  editor: new Set<WorkspaceAction | WorkflowAction>([
    "workspace:read",
    "workflow:read",
    "workflow:write",
    "workflow:status:update",
    "workflow:chat:read",
    "workflow:chat:write",
    "workflow:chat:edit",
    "workflow:chat:delete",
    "workflow:version:read",
    "workflow:version:write",
  ]),
  admin: new Set<WorkspaceAction | WorkflowAction>([
    "workspace:read",
    "workspace:update",
    "workspace:members:read",
    "workspace:members:invite",
    "workspace:members:update_role",
    "workspace:members:remove",
    "workflow:read",
    "workflow:write",
    "workflow:status:update",
    "workflow:chat:read",
    "workflow:chat:write",
    "workflow:chat:edit",
    "workflow:chat:delete",
    "workflow:version:read",
    "workflow:version:write",
    "workspace:billing:view",
  ]),
  owner: new Set<WorkspaceAction | WorkflowAction>([
    "workspace:read",
    "workspace:update",
    "workspace:members:read",
    "workspace:members:invite",
    "workspace:members:update_role",
    "workspace:members:remove",
    "workspace:ownership:transfer",
    "workspace:billing:view",
    "workspace:billing:manage",
    "workflow:read",
    "workflow:write",
    "workflow:status:update",
    "workflow:chat:read",
    "workflow:chat:write",
    "workflow:chat:edit",
    "workflow:chat:delete",
    "workflow:version:read",
    "workflow:version:write",
  ]),
};

const staffRolePermissions: Record<WrkStaffRole, Set<PlatformAction>> = {
  wrk_viewer: new Set<PlatformAction>([
    "platform:user:read",
    "platform:workspace:read",
    "platform:membership:read",
    "platform:workflow:read",
    "platform:workflow_version:read",
    "platform:chat:read",
    "platform:billing:read",
    "platform:auditlog:read",
  ]),
  wrk_operator: new Set<PlatformAction>([
    "platform:user:read",
    "platform:workspace:read",
    "platform:membership:read",
    "platform:workflow:read",
    "platform:workflow_version:read",
    "platform:chat:read",
    "platform:workflow:write",
    "platform:workflow_version:write",
    "platform:chat:write",
    "platform:auditlog:read",
  ]),
  wrk_admin: new Set<PlatformAction>([
    "platform:user:read",
    "platform:user:write",
    "platform:workspace:read",
    "platform:workspace:write",
    "platform:workspace:suspend",
    "platform:membership:read",
    "platform:membership:write",
    "platform:workflow:read",
    "platform:workflow:write",
    "platform:workflow_version:read",
    "platform:workflow_version:write",
    "platform:chat:read",
    "platform:chat:write",
    "platform:billing:read",
    "platform:billing:write",
    "platform:auditlog:read",
    "platform:user:suspend",
  ]),
  wrk_master_admin: new Set<PlatformAction>([
    "platform:user:read",
    "platform:user:write",
    "platform:user:suspend",
    "platform:workspace:read",
    "platform:workspace:write",
    "platform:workspace:suspend",
    "platform:membership:read",
    "platform:membership:write",
    "platform:workflow:read",
    "platform:workflow:write",
    "platform:workflow_version:read",
    "platform:workflow_version:write",
    "platform:chat:read",
    "platform:chat:write",
    "platform:billing:read",
    "platform:billing:write",
    "platform:auditlog:read",
    "platform:wrk_staff:read",
    "platform:wrk_staff:write",
  ]),
};

const LEGACY_ACTION_MAP: Partial<Record<LegacyAction, WorkspaceAction | WorkflowAction | PlatformAction>> = {
  "automation:read": "workflow:read",
  "automation:create": "workflow:write",
  "automation:update": "workflow:write",
  "automation:metadata:update": "workflow:write",
  "automation:version:create": "workflow:version:write",
  "automation:version:transition": "workflow:status:update",
  "automation:delete": "workflow:write",
  "automation:run": "workflow:write",
  "automation:run:production": "workflow:status:update",
  "automation:deploy": "workflow:status:update",
  "automation:pause": "workflow:status:update",
  "copilot:read": "workflow:read",
  "copilot:write": "workflow:write",
  "observability:view": "workflow:read",
  "integrations:manage": "workflow:write",
  "billing:view": "workspace:billing:view",
  "billing:manage": "workspace:billing:manage",
  "workspace:members:view": "workspace:members:read",
  "workspace:members:invite": "workspace:members:invite",
  "workspace:members:update_role": "workspace:members:update_role",
  "workspace:members:remove": "workspace:members:remove",
  "workspace:ownership:transfer": "workspace:ownership:transfer",
  "workspace:update": "workspace:update",
  "admin:project:read": "workspace:read",
  "admin:project:write": "workspace:update",
  "admin:submission:read": "workspace:read",
  "admin:submission:write": "workspace:update",
  "admin:quote:create": "workspace:billing:manage",
  "admin:quote:update": "workspace:billing:manage",
  "wrk:chat:read": "platform:chat:read",
  "wrk:chat:write": "platform:chat:write",
  "wrk:inbox:view": "platform:chat:read",
};

const STAFF_TENANT_ACTION_BRIDGE: Partial<Record<WorkspaceAction | WorkflowAction, PlatformAction>> = {
  "workflow:chat:read": "platform:chat:read",
  "workflow:chat:write": "platform:chat:write",
  "workflow:chat:edit": "platform:chat:write",
  "workflow:chat:delete": "platform:chat:write",
  "workflow:read": "platform:workflow:read",
  "workflow:write": "platform:workflow:write",
  "workflow:status:update": "platform:workflow:write",
  "workflow:version:read": "platform:workflow_version:read",
  "workflow:version:write": "platform:workflow_version:write",
  "workspace:members:read": "platform:membership:read",
  "workspace:members:invite": "platform:membership:write",
  "workspace:members:update_role": "platform:membership:write",
  "workspace:members:remove": "platform:membership:write",
  "workspace:ownership:transfer": "platform:workspace:write",
  "workspace:update": "platform:workspace:write",
  "workspace:billing:view": "platform:billing:read",
  "workspace:billing:manage": "platform:billing:write",
};

// --------------------------
// Helpers
// --------------------------
function normalizeTenantRoles(roles: string[]): string[] {
  return roles.map((role) => TENANT_ROLE_ALIASES[role] ?? role).map((role) => role.toLowerCase());
}

function sessionToSubject(session: TenantOrStaffSession | null | undefined) {
  return {
    userId: session?.userId ?? "unknown",
    tenantId: session?.kind === "tenant" ? session.tenantId : null,
    wrkStaffRole: session?.kind === "staff" ? session.wrkStaffRole : null,
  };
}

function logAuthDenied(params: {
  action: AuthorizationAction;
  context?: AuthorizationContext;
  session: TenantOrStaffSession | null | undefined;
  reason: string;
}) {
  const subject = sessionToSubject(params.session);
  console.warn("[authz] denied", {
    action: params.action,
    context: params.context,
    reason: params.reason,
    subject,
  });
}

function canonicalizeAction(action: AuthorizationAction): WorkspaceAction | WorkflowAction | PlatformAction {
  if (action.startsWith("platform:")) return action as PlatformAction;
  const mapped = LEGACY_ACTION_MAP[action as LegacyAction];
  if (mapped) return mapped;
  return action as WorkspaceAction | WorkflowAction | PlatformAction;
}

function tenantHasPermission(session: TenantSession, action: WorkspaceAction | WorkflowAction) {
  const normalizedRoles = normalizeTenantRoles(session.roles ?? []);
  return normalizedRoles.some((role) => tenantRolePermissions[role]?.has(action));
}

function staffHasPermission(session: StaffSession, action: PlatformAction) {
  const role = session.wrkStaffRole ?? "wrk_viewer";
  return staffRolePermissions[role]?.has(action) ?? false;
}

// --------------------------
// Entry points
// --------------------------
export function authorize(
  action: AuthorizationAction,
  context: AuthorizationContext | undefined,
  session: TenantOrStaffSession | null | undefined
): true {
  const canonicalAction = canonicalizeAction(action);

  if (!session) {
    throw new AuthorizationError({
      message: "Unauthorized",
      status: 401,
      code: "UNAUTHORIZED",
      action,
      context,
      subject: sessionToSubject(session),
    });
  }

  if (canonicalAction.startsWith("platform:")) {
    if (session.kind !== "staff" || !staffHasPermission(session, canonicalAction as PlatformAction)) {
      logAuthDenied({ action, context, session, reason: "platform action not allowed for subject" });
      throw new AuthorizationError({
        message: "Forbidden",
        status: 403,
        action,
        context,
        subject: sessionToSubject(session),
      });
    }
    return true;
  }

  // Workspace/workflow actions require tenant context
  if (!context || context.type === "platform") {
    throw new AuthorizationError({
      message: "Context with tenantId is required",
      status: 400,
      code: "CONTEXT_REQUIRED",
      action,
      context,
      subject: sessionToSubject(session),
    });
  }

  const tenantId = context.tenantId;
  if (!tenantId) {
    throw new AuthorizationError({
      message: "Context with tenantId is required",
      status: 400,
      code: "CONTEXT_REQUIRED",
      action,
      context,
      subject: sessionToSubject(session),
    });
  }

  const isWorkflowAction = canonicalAction.startsWith("workflow:");
  if (isWorkflowAction && context.type === "workflow" && (!("workflowId" in context) || !context.workflowId)) {
    throw new AuthorizationError({
      message: "workflowId is required for workflow actions",
      status: 400,
      code: "CONTEXT_REQUIRED",
      action,
      context,
      subject: sessionToSubject(session),
    });
  }

  if (session.kind === "tenant") {
    if (session.tenantId !== tenantId) {
      logAuthDenied({ action, context, session, reason: "tenant mismatch" });
      throw new AuthorizationError({
        message: "Forbidden",
        status: 403,
        action,
        context,
        subject: sessionToSubject(session),
      });
    }

    if (!tenantHasPermission(session, canonicalAction as WorkspaceAction | WorkflowAction)) {
      logAuthDenied({ action, context, session, reason: "insufficient tenant role" });
      throw new AuthorizationError({
        message: "Forbidden",
        status: 403,
        action,
        context,
        subject: sessionToSubject(session),
      });
    }

    return true;
  }

  // Staff bridge for tenant actions
  const platformEquivalent = STAFF_TENANT_ACTION_BRIDGE[canonicalAction as WorkspaceAction | WorkflowAction];
  if (session.kind === "staff" && platformEquivalent && staffHasPermission(session, platformEquivalent)) {
    return true;
  }

  logAuthDenied({ action, context, session, reason: "staff lacks mapped permission" });
  throw new AuthorizationError({
    message: "Forbidden",
    status: 403,
    action,
    context,
    subject: sessionToSubject(session),
  });
}

export function can(
  session: TenantOrStaffSession | null | undefined,
  action: AuthorizationAction,
  context?: AuthorizationContext
): boolean {
  try {
    authorize(action, context, session);
    return true;
  } catch {
    return false;
  }
}


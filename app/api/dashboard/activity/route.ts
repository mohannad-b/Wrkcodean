import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, users, automationVersions, automations } from "@/db/schema";
import { can } from "@/lib/auth/rbac";
import { ApiError, handleApiError, requireTenantSession } from "@/lib/api/context";

type ActivityPayload = {
  id: string;
  action: string;
  displayText: string;
  category: string;
  user: string;
  userAvatarUrl: string | null;
  userFirstName: string | null;
  userLastName: string | null;
  timestamp: Date;
  automationName: string | null;
  versionLabel: string | null;
  metadata?: Record<string, unknown> | null;
};

export async function GET(request: Request) {
  try {
    const session = await requireTenantSession();

    if (!can(session, "automation:read", { type: "automation_version", tenantId: session.tenantId })) {
      throw new ApiError(403, "Forbidden");
    }

    const url = new URL(request.url);
    const limit = Math.min(Number.parseInt(url.searchParams.get("limit") ?? "10", 10), 50);

    // Fetch recent activity across all automation versions for this tenant
    // We join with automation_versions to ensure we only get logs for versions in this tenant
    const logs = await db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        userId: auditLogs.userId,
        userName: users.name,
        userFirstName: users.firstName,
        userLastName: users.lastName,
        userEmail: users.email,
        userAvatarUrl: users.avatarUrl,
        metadata: auditLogs.metadata,
        createdAt: auditLogs.createdAt,
        automationName: automations.name,
        versionLabel: automationVersions.versionLabel,
      })
      .from(auditLogs)
      .innerJoin(automationVersions, eq(automationVersions.id, auditLogs.resourceId))
      .leftJoin(automations, eq(automations.id, automationVersions.automationId))
      .leftJoin(users, eq(users.id, auditLogs.userId))
      .where(
        and(
          eq(auditLogs.tenantId, session.tenantId),
          eq(auditLogs.resourceType, "automation_version"),
          eq(automationVersions.tenantId, session.tenantId)
        )
      )
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit);

    const activities: ActivityPayload[] = logs.map((log) => {
      const user = log.userName || log.userEmail || "System";
      const automationName = log.automationName || "Unknown Automation";
      const versionLabel = log.versionLabel || "";
      return {
        id: log.id,
        action: log.action,
        displayText: formatActivityText(log.action, user, automationName, versionLabel, log.metadata),
        category: getActivityCategory(log.action),
        user,
        userAvatarUrl: log.userAvatarUrl ?? null,
        userFirstName: log.userFirstName ?? null,
        userLastName: log.userLastName ?? null,
        timestamp: log.createdAt,
        automationName,
        versionLabel,
        metadata: log.metadata,
      };
    });

    return NextResponse.json({ activities });
  } catch (error) {
    return handleApiError(error);
  }
}

function formatActivityText(
  action: string,
  userName: string,
  automationName: string,
  versionLabel: string,
  metadata: Record<string, unknown> | null
): string {
  const user = userName || "Someone";
  const toText = (value: unknown) => (typeof value === "string" && value.trim().length > 0 ? value : undefined);
  const statusMeta = (metadata?.status as { from?: string; to?: string }) ?? undefined;
  const stepName = toText(metadata?.stepName);
  const stepNumber = toText(metadata?.stepNumber);
  const versionText = versionLabel ? ` ${versionLabel}` : "";

  const describeWorkflowChanges = () => {
    const changes =
      (metadata?.workflowChanges as Record<string, number> | undefined) ??
      (metadata?.changes as Record<string, number> | undefined);
    const diff = metadata?.diff as {
      stepsAdded?: unknown[];
      stepsRemoved?: unknown[];
      stepsRenamed?: unknown[];
      branchesAdded?: unknown[];
      branchesRemoved?: unknown[];
    } | null;
    const sanitization = metadata?.sanitizationSummary as
      | {
          removedDuplicateEdges?: number;
          reparentedBranches?: number;
          removedCycles?: number;
          trimmedConnections?: number;
          attachedOrphans?: number;
        }
      | undefined;

    const counts = {
      stepsAdded: Number(changes?.stepsAdded ?? diff?.stepsAdded?.length ?? 0),
      stepsRemoved: Number(changes?.stepsRemoved ?? diff?.stepsRemoved?.length ?? 0),
      stepsRenamed: Number(changes?.stepsRenamed ?? diff?.stepsRenamed?.length ?? 0),
      branchesAdded: Number(changes?.branchesAdded ?? diff?.branchesAdded?.length ?? 0),
      branchesRemoved: Number(changes?.branchesRemoved ?? diff?.branchesRemoved?.length ?? 0),
    };

    const parts: string[] = [];
    if (counts.stepsAdded) parts.push(`added ${counts.stepsAdded} step${counts.stepsAdded === 1 ? "" : "s"}`);
    if (counts.stepsRemoved) parts.push(`removed ${counts.stepsRemoved} step${counts.stepsRemoved === 1 ? "" : "s"}`);
    if (counts.stepsRenamed) parts.push(`renamed ${counts.stepsRenamed} step${counts.stepsRenamed === 1 ? "" : "s"}`);
    if (counts.branchesAdded) parts.push(`created ${counts.branchesAdded} branch${counts.branchesAdded === 1 ? "" : "es"}`);
    if (counts.branchesRemoved) {
      parts.push(`removed ${counts.branchesRemoved} branch${counts.branchesRemoved === 1 ? "" : "es"}`);
    }

    const total =
      counts.stepsAdded +
      counts.stepsRemoved +
      counts.stepsRenamed +
      counts.branchesAdded +
      counts.branchesRemoved;

    if (total === 0) {
      if (sanitization) {
        const saniParts = [
          sanitization.reparentedBranches ? `${sanitization.reparentedBranches} branches reparented` : null,
          sanitization.removedDuplicateEdges ? `${sanitization.removedDuplicateEdges} duplicate edges removed` : null,
          sanitization.trimmedConnections ? `${sanitization.trimmedConnections} extra links trimmed` : null,
          sanitization.attachedOrphans ? `${sanitization.attachedOrphans} orphan steps attached` : null,
          sanitization.removedCycles ? `${sanitization.removedCycles} cycles removed` : null,
        ].filter(Boolean) as string[];
        if (saniParts.length) {
          return `${automationName}${versionText} workflow cleaned (${saniParts.slice(0, 3).join(", ")}) by ${user}`;
        }
      }
      if (Array.isArray(metadata?.summary) && metadata?.summary.length) {
        return `${automationName}${versionText}: ${metadata.summary[0]} by ${user}`;
      }
    }

    const details = parts.slice(0, 3).join(", ");
    return `${automationName}${versionText}: ${total} change${total === 1 ? "" : "s"}${details ? ` (${details})` : ""} by ${user}`;
  };

  const actionMap: Record<string, string | ((m: Record<string, unknown> | null) => string)> = {
    "automation.workflow.drafted": describeWorkflowChanges,
    "automation.workflow.step.added": () =>
      stepNumber || stepName
        ? `${automationName}${versionText}: Step ${stepNumber ? `${stepNumber} ` : ""}${stepName ?? ""} added by ${user}`.trim()
        : `${automationName}${versionText}: Step added by ${user}`,
    "automation.workflow.step.deleted": () =>
      stepNumber || stepName
        ? `${automationName}${versionText}: Step ${stepNumber ? `${stepNumber} ` : ""}${stepName ?? ""} removed by ${user}`.trim()
        : `${automationName}${versionText}: Step removed by ${user}`,
    "automation.workflow.step.moved": (m) => {
      const source = toText(m?.sourceStep) ?? stepNumber ?? "a step";
      const target = toText(m?.targetStep) ?? "another step";
      const position = toText(m?.position) ?? "after";
      return `${automationName}${versionText}: Step ${source} moved ${position} ${target} by ${user}`;
    },
    "automation.workflow.step.renamed": (m) => {
      const oldName = toText(m?.oldName) ?? stepName ?? "step";
      const newName = toText(m?.newName) ?? "new name";
      return `${automationName}${versionText}: Step "${oldName}" renamed to "${newName}" by ${user}`;
    },
    "automation.workflow.step.updated": (m) => {
      const target = toText(m?.targetStep) ?? stepNumber ?? "step";
      return `${automationName}${versionText}: Step ${target} updated by ${user}`;
    },
    "automation.workflow.optimized": describeWorkflowChanges,
    "automation.workflow.suggested": describeWorkflowChanges,
    "automation.version.created": () => {
      return `${automationName}${versionText} created by ${user}`;
    },
    "automation.version.status.changed": () => {
      const from = statusMeta?.from ?? "unknown";
      const to = statusMeta?.to ?? "unknown";
      return `${automationName}${versionText} status changed from ${from} to ${to} by ${user}`;
    },
    "automation.version.update": () => {
      return describeWorkflowChanges();
    },
    "automation.quote.generated": `${automationName}${versionText}: Quote generated by ${user}`,
    "automation.quote.sent": `${automationName}${versionText}: Quote sent to client by ${user}`,
    "automation.quote.accepted": `${automationName}${versionText}: Quote accepted`,
    "automation.quote.rejected": `${automationName}${versionText}: Quote rejected`,
    "automation.task.created": (m) => `${automationName}${versionText}: Task "${toText(m?.taskName) ?? "Untitled"}" created by ${user}`,
    "automation.task.completed": (m) => `${automationName}${versionText}: Task "${toText(m?.taskName) ?? "Untitled"}" completed by ${user}`,
    "automation.task.assigned": (m) =>
      `${automationName}${versionText}: Task "${toText(m?.taskName) ?? "Untitled"}" assigned to ${toText(m?.assignee) ?? "someone"} by ${user}`,
    "automation.build.requested": `${automationName}${versionText}: Build requested by ${user}`,
    "automation.build.started": `${automationName}${versionText}: Build started`,
    "automation.build.completed": `${automationName}${versionText}: Build completed`,
    "automation.build.failed": (m) => {
      const error = toText(m?.error);
      return `${automationName}${versionText}: Build failed${error ? ` (${error})` : ""}`;
    },
    "automation.file.uploaded": (m) => `${automationName}${versionText}: File "${toText(m?.fileName) ?? "attachment"}" uploaded by ${user}`,
    "automation.message.sent": (m) => {
      const role = (m?.role as string) ?? "system";
      const source = (m?.source as string) ?? "copilot";
      const preview = toText(m?.preview);
      if (source === "admin_note") {
        return `${automationName}${versionText}: Admin note added by ${user}`;
      }
      if (role === "assistant") {
        return preview ? `${automationName}${versionText}: Copilot replied: "${preview}"` : `${automationName}${versionText}: Copilot replied`;
      }
      if (role === "user") {
        const suffix = preview ? ` — "${preview}"` : "";
        return `${automationName}${versionText}: ${user} chatted with Copilot${suffix}`;
      }
      return `${automationName}${versionText}: Message sent by ${user}`;
    },
    default: `${automationName}${versionText}: ${action.replace(/\./g, " ")} by ${user}`,
  };

  const formatter = actionMap[action] ?? actionMap.default;
  return typeof formatter === "function" ? formatter(metadata) : formatter;
}

function getActivityCategory(action: string): string {
  if (action.includes("workflow")) return "workflow";
  if (action.includes("quote")) return "quote";
  if (action.includes("task")) return "task";
  if (action.includes("build")) return "build";
  if (action.includes("file")) return "file";
  if (action.includes("message")) return "message";
  if (action.includes("version")) return "version";
  return "other";
}


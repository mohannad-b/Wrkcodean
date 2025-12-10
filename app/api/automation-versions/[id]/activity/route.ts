import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, users } from "@/db/schema";
import { can } from "@/lib/auth/rbac";
import { ApiError, handleApiError, requireTenantSession } from "@/lib/api/context";

type RouteParams = {
  params: {
    id: string;
  };
};

type ActivityPayload = {
  id: string;
  action: string;
  displayText: string;
  category: string;
  user: string;
  timestamp: Date;
  metadata?: Record<string, unknown> | null;
};

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const session = await requireTenantSession();

    if (!can(session, "automation:read", { type: "automation_version", tenantId: session.tenantId })) {
      throw new ApiError(403, "Forbidden");
    }

    const url = new URL(request.url);
    const limit = Math.min(Number.parseInt(url.searchParams.get("limit") ?? "50", 10), 100);
    const offset = Math.max(Number.parseInt(url.searchParams.get("offset") ?? "0", 10), 0);

    const logs = await db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        userId: auditLogs.userId,
        userName: users.name,
        userEmail: users.email,
        metadata: auditLogs.metadata,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.userId))
      .where(
        and(
          eq(auditLogs.tenantId, session.tenantId),
          eq(auditLogs.resourceType, "automation_version"),
          eq(auditLogs.resourceId, params.id)
        )
      )
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .offset(offset);

    const activities: ActivityPayload[] = logs.map((log) => {
      const user = log.userName || log.userEmail || "System";
      return {
        id: log.id,
        action: log.action,
        displayText: formatActivityText(log.action, user, log.metadata),
        category: getActivityCategory(log.action),
        user,
        timestamp: log.createdAt,
        metadata: log.metadata,
      };
    });

    return NextResponse.json({ activities });
  } catch (error) {
    return handleApiError(error);
  }
}

function formatActivityText(action: string, userName: string, metadata: Record<string, unknown> | null): string {
  const user = userName || "Someone";
  const toText = (value: unknown) => (typeof value === "string" && value.trim().length > 0 ? value : undefined);
  const statusMeta = (metadata?.status as { from?: string; to?: string }) ?? undefined;
  const stepName = toText(metadata?.stepName);
  const stepNumber = toText(metadata?.stepNumber);
  const versionLabel = toText(metadata?.versionLabel);

  const describeBlueprintChanges = () => {
    const changes =
      (metadata?.blueprintChanges as Record<string, number> | undefined) ??
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
          const versionText = versionLabel ? ` in version ${versionLabel}` : "";
          return `Workflow cleaned${versionText} (${saniParts.slice(0, 3).join(", ")}) by ${user}`;
        }
      }
      if (Array.isArray(metadata?.summary) && metadata?.summary.length) {
        return `${metadata.summary[0]}${versionLabel ? ` in version ${versionLabel}` : ""} by ${user}`;
      }
    }

    const details = parts.slice(0, 3).join(", ");
    const versionText = versionLabel ? ` in version ${versionLabel}` : "";
    return `${total} change${total === 1 ? "" : "s"}${versionText}${details ? ` (${details})` : ""} by ${user}`;
  };

  const actionMap: Record<string, string | ((m: Record<string, unknown> | null) => string)> = {
    "automation.blueprint.drafted": describeBlueprintChanges,
    "automation.blueprint.step.added": () =>
      stepNumber || stepName
        ? `Step ${stepNumber ? `${stepNumber} ` : ""}${stepName ?? ""} added by ${user}`.trim()
        : `Step added by ${user}`,
    "automation.blueprint.step.deleted": () =>
      stepNumber || stepName
        ? `Step ${stepNumber ? `${stepNumber} ` : ""}${stepName ?? ""} removed by ${user}`.trim()
        : `Step removed by ${user}`,
    "automation.blueprint.step.moved": (m) => {
      const source = toText(m?.sourceStep) ?? stepNumber ?? "a step";
      const target = toText(m?.targetStep) ?? "another step";
      const position = toText(m?.position) ?? "after";
      return `Step ${source} moved ${position} ${target} by ${user}`;
    },
    "automation.blueprint.step.renamed": (m) => {
      const oldName = toText(m?.oldName) ?? stepName ?? "step";
      const newName = toText(m?.newName) ?? "new name";
      return `Step "${oldName}" renamed to "${newName}" by ${user}`;
    },
    "automation.blueprint.step.updated": (m) => {
      const target = toText(m?.targetStep) ?? stepNumber ?? "step";
      return `Step ${target} updated by ${user}`;
    },
    "automation.blueprint.optimized": describeBlueprintChanges,
    "automation.blueprint.suggested": describeBlueprintChanges,
    "automation.version.created": () => {
      const label = versionLabel ? ` ${versionLabel}` : "";
      return `Version${label} created by ${user}`;
    },
    "automation.version.status.changed": () => {
      const from = statusMeta?.from ?? "unknown";
      const to = statusMeta?.to ?? "unknown";
      const label = versionLabel ? ` ${versionLabel}` : "";
      return `Version${label} status changed from ${from} to ${to} by ${user}`;
    },
    "automation.version.update": () => {
      return describeBlueprintChanges();
    },
    "automation.quote.generated": `Quote generated by ${user}`,
    "automation.quote.sent": `Quote sent to client by ${user}`,
    "automation.quote.accepted": `Quote accepted`,
    "automation.quote.rejected": `Quote rejected`,
    "automation.task.created": (m) => `Task "${toText(m?.taskName) ?? "Untitled"}" created by ${user}`,
    "automation.task.completed": (m) => `Task "${toText(m?.taskName) ?? "Untitled"}" completed by ${user}`,
    "automation.task.assigned": (m) =>
      `Task "${toText(m?.taskName) ?? "Untitled"}" assigned to ${toText(m?.assignee) ?? "someone"} by ${user}`,
    "automation.build.requested": `Build requested by ${user}`,
    "automation.build.started": `Build started`,
    "automation.build.completed": `Build completed`,
    "automation.build.failed": (m) => {
      const error = toText(m?.error);
      return `Build failed${error ? ` (${error})` : ""}`;
    },
    "automation.file.uploaded": (m) => `File "${toText(m?.fileName) ?? "attachment"}" uploaded by ${user}`,
    "automation.message.sent": (m) => {
      const role = (m?.role as string) ?? "system";
      const source = (m?.source as string) ?? "copilot";
      const preview = toText(m?.preview);
      if (source === "admin_note") {
        return `Admin note added by ${user}`;
      }
      if (role === "assistant") {
        return preview ? `Copilot replied: “${preview}”` : "Copilot replied";
      }
      if (role === "user") {
        const suffix = preview ? ` — “${preview}”` : "";
        return `${user} chatted with Copilot${suffix}`;
      }
      return `Message sent by ${user}`;
    },
    default: `${action.replace(/\./g, " ")} by ${user}`,
  };

  const formatter = actionMap[action] ?? actionMap.default;
  return typeof formatter === "function" ? formatter(metadata) : formatter;
}

function getActivityCategory(action: string): string {
  if (action.includes("blueprint")) return "blueprint";
  if (action.includes("quote")) return "quote";
  if (action.includes("task")) return "task";
  if (action.includes("build")) return "build";
  if (action.includes("file")) return "file";
  if (action.includes("message")) return "message";
  if (action.includes("version")) return "version";
  return "other";
}



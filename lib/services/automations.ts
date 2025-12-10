import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  automations,
  automationVersions,
  projects,
  quotes,
  tasks,
  users,
  type Automation,
  type AutomationVersion,
  type AutomationVersionMetric,
  type Project,
  type Quote,
  type Task,
  type User,
} from "@/db/schema";
import {
  API_AUTOMATION_STATUSES,
  AutomationLifecycleStatus,
  canTransition,
  fromDbAutomationStatus,
  toDbAutomationStatus,
} from "@/lib/automations/status";
import type { Workflow } from "@/lib/blueprint/types";
import { createEmptyWorkflow } from "@/lib/blueprint/factory";
import { getLatestMetricForVersion, getLatestMetricsForVersions } from "@/lib/services/automation-metrics";
import { ApiError } from "@/lib/api/context";

type AutomationWithLatestVersion = Automation & {
  latestVersion: (AutomationVersion & { latestQuote: Quote | null; latestMetrics: AutomationVersionMetric | null }) | null;
  creator: User | null;
};

export async function listAutomationsForTenant(tenantId: string): Promise<AutomationWithLatestVersion[]> {
  const automationRows = await db
    .select()
    .from(automations)
    .where(eq(automations.tenantId, tenantId))
    .orderBy(desc(automations.updatedAt));

  if (automationRows.length === 0) {
    return [];
  }

  const automationIds = automationRows.map((row) => row.id);
  const creatorIds = automationRows
    .map((row) => row.createdBy)
    .filter((id): id is string => id !== null);

  // Fetch creator information
  const creatorRows = creatorIds.length
    ? await db
        .select()
        .from(users)
        .where(inArray(users.id, creatorIds))
    : [];

  const creatorMap = new Map<string, User>();
  for (const creator of creatorRows) {
    creatorMap.set(creator.id, creator);
  }

  const versionRows = await db
    .select()
    .from(automationVersions)
    .where(inArray(automationVersions.automationId, automationIds))
    .orderBy(desc(automationVersions.createdAt));

  const latestVersionMap = new Map<string, AutomationVersion>();
  for (const version of versionRows) {
    if (!latestVersionMap.has(version.automationId)) {
      latestVersionMap.set(version.automationId, version);
    }
  }

  const latestVersionIds = Array.from(latestVersionMap.values())
    .filter(Boolean)
    .map((version) => version.id);

  const latestMetricMap = await getLatestMetricsForVersions(tenantId, latestVersionIds);
  const quoteRows = latestVersionIds.length
    ? await db
        .select()
        .from(quotes)
        .where(inArray(quotes.automationVersionId, latestVersionIds))
        .orderBy(desc(quotes.createdAt))
    : [];

  const latestQuoteMap = new Map<string, Quote>();
  for (const quote of quoteRows) {
    if (!latestQuoteMap.has(quote.automationVersionId)) {
      latestQuoteMap.set(quote.automationVersionId, quote);
    }
  }

  return automationRows.map((automation) => {
    const version = latestVersionMap.get(automation.id);
    const creator = automation.createdBy ? creatorMap.get(automation.createdBy) ?? null : null;
    return {
      ...automation,
      latestVersion: version
        ? {
            ...version,
            latestQuote: latestQuoteMap.get(version.id) ?? null,
            latestMetrics: latestMetricMap.get(version.id) ?? null,
          }
        : null,
      creator,
    };
  });
}

export async function getAutomationDetail(tenantId: string, automationId: string) {
  const automationRow = await db
    .select()
    .from(automations)
    .where(and(eq(automations.id, automationId), eq(automations.tenantId, tenantId)))
    .limit(1);

  if (automationRow.length === 0) {
    return null;
  }

  const versionRows = await db
    .select()
    .from(automationVersions)
    .where(and(eq(automationVersions.automationId, automationId), eq(automationVersions.tenantId, tenantId)))
    .orderBy(desc(automationVersions.createdAt));
  const versionIds = versionRows.map((version) => version.id);

  const quoteRows = versionIds.length
    ? await db
        .select()
        .from(quotes)
        .where(inArray(quotes.automationVersionId, versionIds))
        .orderBy(desc(quotes.createdAt))
    : [];

  const latestQuoteMap = new Map<string, Quote>();
  for (const quote of quoteRows) {
    if (!latestQuoteMap.has(quote.automationVersionId)) {
      latestQuoteMap.set(quote.automationVersionId, quote);
    }
  }

  const taskRows = versionIds.length
    ? await db
        .select()
        .from(tasks)
        .where(and(eq(tasks.tenantId, tenantId), inArray(tasks.automationVersionId, versionIds)))
    : [];
  const tasksByVersion = new Map<string, Task[]>();
  for (const task of taskRows) {
    if (!tasksByVersion.has(task.automationVersionId)) {
      tasksByVersion.set(task.automationVersionId, []);
    }
    tasksByVersion.get(task.automationVersionId)!.push(task);
  }
  const metricsByVersion = await getLatestMetricsForVersions(tenantId, versionIds);

  return {
    automation: automationRow[0],
    versions: versionRows.map((version) => ({
      ...version,
      latestQuote: latestQuoteMap.get(version.id) ?? null,
      tasks: tasksByVersion.get(version.id) ?? [],
      latestMetrics: metricsByVersion.get(version.id) ?? null,
    })),
  };
}

type CreateAutomationParams = {
  tenantId: string;
  userId: string;
  name: string;
  description?: string | null;
  intakeNotes?: string | null;
  requirementsText?: string | null;
  versionLabel?: string;
};

export async function createAutomationWithInitialVersion(params: CreateAutomationParams) {
  return db.transaction(async (tx) => {
    const [automation] = await tx
      .insert(automations)
      .values({
        tenantId: params.tenantId,
        name: params.name,
        description: params.description ?? null,
        createdBy: params.userId,
      })
      .returning();

    if (!automation) {
      throw new Error("Failed to create automation");
    }

    const [version] = await tx
      .insert(automationVersions)
      .values({
        tenantId: params.tenantId,
        automationId: automation.id,
        versionLabel: params.versionLabel ?? "v1.0",
        status: toDbAutomationStatus("IntakeInProgress"),
        intakeNotes: params.intakeNotes ?? null,
        requirementsText: params.requirementsText ?? null,
        createdAt: new Date(),
      })
      .returning();

    if (!version) {
      throw new Error("Failed to create automation version");
    }

    return { automation, version };
  });
}

type CreateAutomationVersionParams = {
  tenantId: string;
  automationId: string;
  versionLabel?: string;
  summary?: string | null;
  intakeNotes?: string | null;
  copyFromVersionId?: string | null;
};

export async function createAutomationVersion(params: CreateAutomationVersionParams) {
  return db.transaction(async (tx) => {
    const automationRow = await tx
      .select()
      .from(automations)
      .where(and(eq(automations.id, params.automationId), eq(automations.tenantId, params.tenantId)))
      .limit(1);

    if (automationRow.length === 0) {
      throw new Error("Automation not found");
    }

    const label = params.versionLabel ?? (await nextVersionLabel(params.automationId, params.tenantId));

    const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

    const [sourceVersion] = params.copyFromVersionId
      ? await tx
          .select()
          .from(automationVersions)
          .where(
            and(
              eq(automationVersions.id, params.copyFromVersionId),
              eq(automationVersions.automationId, params.automationId),
              eq(automationVersions.tenantId, params.tenantId)
            )
          )
          .limit(1)
      : [];

    const workflowJson: Workflow = sourceVersion?.workflowJson
      ? clone(sourceVersion.workflowJson as Workflow)
      : createEmptyWorkflow();
    const summary = params.summary ?? sourceVersion?.summary ?? null;
    const intakeNotes = params.intakeNotes ?? sourceVersion?.intakeNotes ?? null;
    const requirementsText = sourceVersion?.requirementsText ?? null;
    const requirementsJson = sourceVersion?.requirementsJson ? clone(sourceVersion.requirementsJson) : {};
    const intakeProgress = sourceVersion?.intakeProgress ?? 0;

    const [version] = await tx
      .insert(automationVersions)
      .values({
        tenantId: params.tenantId,
        automationId: params.automationId,
        versionLabel: label,
        status: toDbAutomationStatus("IntakeInProgress"),
        summary,
        intakeNotes,
        requirementsText,
        requirementsJson,
        workflowJson,
        intakeProgress,
      })
      .returning();

    if (!version) {
      throw new Error("Unable to create version");
    }

    if (sourceVersion) {
      const sourceTasks = await tx
        .select()
        .from(tasks)
        .where(and(eq(tasks.automationVersionId, sourceVersion.id), eq(tasks.tenantId, params.tenantId)));

      if (sourceTasks.length > 0) {
        await tx.insert(tasks).values(
          sourceTasks.map((task) => ({
            tenantId: params.tenantId,
            automationVersionId: version.id,
            projectId: task.projectId,
            title: task.title,
            description: task.description,
            status: task.status,
            priority: task.priority,
            assigneeId: task.assigneeId,
            dueDate: task.dueDate,
            metadata: task.metadata ?? {},
          }))
        );
      }
    }

    return version;
  });
}

async function nextVersionLabel(automationId: string, tenantId: string) {
  const [latestVersion] = await db
    .select()
    .from(automationVersions)
    .where(and(eq(automationVersions.automationId, automationId), eq(automationVersions.tenantId, tenantId)))
    .orderBy(desc(automationVersions.createdAt))
    .limit(1);

  if (!latestVersion) {
    return "v1.0";
  }

  const match = /v(\d+)(?:\.(\d+))?/.exec(latestVersion.versionLabel);
  if (!match) {
    return `${latestVersion.versionLabel}-copy`;
  }

  const major = Number(match[1]);
  const minor = Number(match[2] ?? "0");
  return `v${major}.${minor + 1}`;
}

type UpdateMetadataParams = {
  tenantId: string;
  automationVersionId: string;
  automationName?: string;
  automationDescription?: string | null;
  businessOwner?: string | null;
  tags?: string[] | null;
  intakeNotes?: string | null;
  requirementsText?: string | null;
  workflowJson?: Workflow | null;
};

export async function updateAutomationVersionMetadata(params: UpdateMetadataParams) {
  return db.transaction(async (tx) => {
    const versionRow = await tx
      .select()
      .from(automationVersions)
      .where(and(eq(automationVersions.id, params.automationVersionId), eq(automationVersions.tenantId, params.tenantId)))
      .limit(1);

    if (versionRow.length === 0) {
      throw new Error("Automation version not found");
    }

    const automationRow = await tx
      .select()
      .from(automations)
      .where(and(eq(automations.id, versionRow[0].automationId), eq(automations.tenantId, params.tenantId)))
      .limit(1);

    if (automationRow.length === 0) {
      throw new Error("Automation not found");
    }

    const automationUpdate: Partial<typeof automations.$inferInsert> = {};
    if (params.automationName !== undefined) {
      automationUpdate.name = params.automationName;
    }
    if (params.automationDescription !== undefined) {
      automationUpdate.description = params.automationDescription;
    }
    let updatedAutomation = automationRow[0];
    if (Object.keys(automationUpdate).length > 0) {
      automationUpdate.updatedAt = new Date();
      const [patchedAutomation] = await tx
        .update(automations)
        .set(automationUpdate)
        .where(eq(automations.id, automationRow[0].id))
        .returning();
      if (patchedAutomation) {
        updatedAutomation = patchedAutomation;
      }
    }

    const updatePayload: Partial<typeof automationVersions.$inferInsert> = {};
    if (params.intakeNotes !== undefined) {
      updatePayload.intakeNotes = params.intakeNotes;
    }
    if (params.requirementsText !== undefined) {
      updatePayload.requirementsText = params.requirementsText;
    }
    if (params.workflowJson !== undefined) {
      updatePayload.workflowJson = params.workflowJson ?? undefined;
    }
    if (params.businessOwner !== undefined) {
      updatePayload.businessOwner = params.businessOwner ?? null;
    }
    if (params.tags !== undefined) {
      updatePayload.tags = params.tags ?? [];
    }

    let updatedVersion = versionRow[0];
    if (Object.keys(updatePayload).length > 0) {
      updatePayload.updatedAt = new Date();
      const [patchedVersion] = await tx
        .update(automationVersions)
        .set(updatePayload)
        .where(eq(automationVersions.id, params.automationVersionId))
        .returning();
      if (patchedVersion) {
        updatedVersion = patchedVersion;
      }
    }

    return { version: updatedVersion, automation: updatedAutomation };
  });
}

export async function getAutomationVersionDetail(tenantId: string, automationVersionId: string) {
  const versionRows = await db
    .select()
    .from(automationVersions)
    .where(and(eq(automationVersions.id, automationVersionId), eq(automationVersions.tenantId, tenantId)))
    .limit(1);

  if (versionRows.length === 0) {
    return null;
  }

  const version = versionRows[0];

  const automationRow = await db
    .select()
    .from(automations)
    .where(and(eq(automations.id, version.automationId), eq(automations.tenantId, tenantId)))
    .limit(1);

  const projectRows = await db
    .select()
    .from(projects)
    .where(and(eq(projects.automationVersionId, version.id), eq(projects.tenantId, tenantId)))
    .limit(1);

  const quoteRows = await db
    .select()
    .from(quotes)
    .where(and(eq(quotes.automationVersionId, version.id), eq(quotes.tenantId, tenantId)))
    .orderBy(desc(quotes.createdAt))
    .limit(1);

  const taskRows = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.automationVersionId, version.id), eq(tasks.tenantId, tenantId)));
  const latestMetric = await getLatestMetricForVersion(tenantId, version.id);

  return {
    version,
    automation: automationRow[0] ?? null,
    project: projectRows[0] ?? null,
    latestQuote: quoteRows[0] ?? null,
    tasks: taskRows,
    latestMetrics: latestMetric,
  };
}

type UpdateStatusParams = {
  tenantId: string;
  automationVersionId: string;
  nextStatus: AutomationLifecycleStatus;
};

type UpdateStatusResult = {
  version: AutomationVersion;
  previousStatus: AutomationLifecycleStatus;
};

export async function updateAutomationVersionStatus(params: UpdateStatusParams): Promise<UpdateStatusResult> {
  if (!API_AUTOMATION_STATUSES.includes(params.nextStatus)) {
    throw new Error("Invalid status");
  }

  const versionRow = await db
    .select()
    .from(automationVersions)
    .where(and(eq(automationVersions.id, params.automationVersionId), eq(automationVersions.tenantId, params.tenantId)))
    .limit(1);

  if (versionRow.length === 0) {
    throw new Error("Automation version not found");
  }

  const currentStatus = fromDbAutomationStatus(versionRow[0].status);

  if (!canTransition(currentStatus, params.nextStatus)) {
    throw new Error("Invalid status transition");
  }

  const [updated] = await db
    .update(automationVersions)
    .set({ status: toDbAutomationStatus(params.nextStatus) })
    .where(eq(automationVersions.id, params.automationVersionId))
    .returning();

  if (!updated) {
    throw new Error("Failed to update automation version");
  }

  if (params.nextStatus === "NeedsPricing") {
    await ensureProjectForVersion(updated);
  } else if (params.nextStatus !== "IntakeInProgress") {
    await syncProjectStatus(updated, params.nextStatus);
  }

  return { version: updated, previousStatus: currentStatus };
}

export async function deleteAutomationVersion(params: { tenantId: string; automationVersionId: string }) {
  return db.transaction(async (tx) => {
    const versionRow = await tx
      .select()
      .from(automationVersions)
      .where(and(eq(automationVersions.id, params.automationVersionId), eq(automationVersions.tenantId, params.tenantId)))
      .limit(1);

    if (versionRow.length === 0) {
      throw new ApiError(404, "Automation version not found");
    }

    const status = fromDbAutomationStatus(versionRow[0].status);
    if (status !== "IntakeInProgress") {
      throw new ApiError(400, "Only draft versions can be deleted.");
    }

    const [deleted] = await tx
      .delete(automationVersions)
      .where(and(eq(automationVersions.id, params.automationVersionId), eq(automationVersions.tenantId, params.tenantId)))
      .returning();

    return deleted;
  });
}

export async function ensureProjectForVersion(version: AutomationVersion) {
  const existing = await db
    .select()
    .from(projects)
    .where(and(eq(projects.automationVersionId, version.id), eq(projects.tenantId, version.tenantId)))
    .limit(1);

  if (existing.length > 0) {
    await syncProjectStatus(existing[0], "NeedsPricing");
    return existing[0];
  }

  const automationRow = await db
    .select()
    .from(automations)
    .where(and(eq(automations.id, version.automationId), eq(automations.tenantId, version.tenantId)))
    .limit(1);

  if (automationRow.length === 0) {
    throw new Error("Automation not found for version");
  }

  const dbStatus = toDbAutomationStatus("NeedsPricing");

  const [project] = await db
    .insert(projects)
    .values({
      tenantId: version.tenantId,
      automationId: version.automationId,
      automationVersionId: version.id,
      name: automationRow[0].name,
      status: dbStatus,
    })
    .returning();

  return project;
}

async function syncProjectStatus(projectOrVersion: Project | AutomationVersion, nextStatus: AutomationLifecycleStatus) {
  const dbStatus = toDbAutomationStatus(nextStatus);

  if (isProjectRecord(projectOrVersion)) {
    await db
      .update(projects)
      .set({ status: dbStatus })
      .where(eq(projects.id, projectOrVersion.id));
    return;
  }

  await db
    .update(projects)
    .set({ status: dbStatus })
    .where(eq(projects.automationVersionId, projectOrVersion.id));
}

function isProjectRecord(record: Project | AutomationVersion): record is Project {
  return typeof (record as Project).automationVersionId !== "undefined";
}




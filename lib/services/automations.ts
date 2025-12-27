import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  automations,
  automationVersions,
  submissions,
  quotes,
  tasks,
  users,
  type Automation,
  type AutomationVersion,
  type AutomationVersionMetric,
  type Submission,
  type Quote,
  type Task,
  type User,
} from "@/db/schema";
import {
  API_AUTOMATION_STATUSES,
  AutomationLifecycleStatus,
  applyAutomationTransition,
  fromDbAutomationStatus,
  toDbAutomationStatus,
} from "@/lib/automations/status";
import type { Workflow } from "@/lib/blueprint/types";
import { createEmptyWorkflow } from "@/lib/blueprint/factory";
import { getLatestMetricForVersion, getLatestMetricsForVersions } from "@/lib/services/automation-metrics";
import { ApiError } from "@/lib/api/context";
import { buildWorkflowViewModel, type WorkflowViewModel } from "@/lib/workflows/view-model";

type AutomationWithLatestVersion = Automation & {
  latestVersion: (AutomationVersion & { latestQuote: Quote | null; latestMetrics: AutomationVersionMetric | null }) | null;
  creator: User | null;
};

export async function listAutomationsForTenant(tenantId: string): Promise<AutomationWithLatestVersion[]> {
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/services/automations.ts:35',message:'listAutomationsForTenant entry',data:{tenantId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  const queryStart = Date.now();
  const automationRows = await db
    .select()
    .from(automations)
    .where(eq(automations.tenantId, tenantId))
    .orderBy(desc(automations.updatedAt));
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/services/automations.ts:40',message:'automations query completed',data:{automationCount:automationRows.length,queryTimeMs:Date.now()-queryStart},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
  // #endregion

  if (automationRows.length === 0) {
    return [];
  }

  const automationIds = automationRows.map((row) => row.id);
  const creatorIdsRaw = automationRows
    .map((row) => row.createdBy)
    .filter((id): id is string => id !== null);
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/services/automations.ts:49',message:'creatorIds before deduplication',data:{creatorIdsRaw,rawCount:creatorIdsRaw.length,uniqueCount:new Set(creatorIdsRaw).size,hasDuplicates:creatorIdsRaw.length!==new Set(creatorIdsRaw).size},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  const creatorIds = Array.from(new Set(creatorIdsRaw));
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/services/automations.ts:52',message:'creatorIds after deduplication',data:{creatorIds,deduplicatedCount:creatorIds.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});

  // #endregion
  // Fetch creator information
  const creatorQueryStart = Date.now();
  const creatorRows = creatorIds.length
    ? await db
        .select()
        .from(users)
        .where(inArray(users.id, creatorIds))
    : [];
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/services/automations.ts:57',message:'users query completed',data:{creatorRowsCount:creatorRows.length,queryTimeMs:Date.now()-creatorQueryStart,creatorIdsCount:creatorIds.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion

  const creatorMap = new Map<string, User>();
  for (const creator of creatorRows) {
    creatorMap.set(creator.id, creator);
  }

  const versionQueryStart = Date.now();
  const versionRows = await db
    .select()
    .from(automationVersions)
    .where(inArray(automationVersions.automationId, automationIds))
    .orderBy(desc(automationVersions.createdAt));
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/services/automations.ts:68',message:'automationVersions query completed',data:{versionRowsCount:versionRows.length,automationIdsCount:automationIds.length,queryTimeMs:Date.now()-versionQueryStart},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
  // #endregion

  const latestVersionMap = new Map<string, AutomationVersion>();
  for (const version of versionRows) {
    if (!latestVersionMap.has(version.automationId)) {
      latestVersionMap.set(version.automationId, version);
    }
  }

  const latestVersionIds = Array.from(latestVersionMap.values())
    .filter(Boolean)
    .map((version) => version.id)
    .filter((id): id is string => Boolean(id));

  const metricsQueryStart = Date.now();
  const latestMetricMap = await getLatestMetricsForVersions(tenantId, latestVersionIds);
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/services/automations.ts:81',message:'getLatestMetricsForVersions completed',data:{latestVersionIdsCount:latestVersionIds.length,metricsCount:latestMetricMap.size,queryTimeMs:Date.now()-metricsQueryStart},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
  // #endregion
  const quoteQueryStart = Date.now();
  const quoteRows = latestVersionIds.length
    ? await db
        .select()
        .from(quotes)
        .where(inArray(quotes.automationVersionId, latestVersionIds))
        .orderBy(desc(quotes.createdAt))
    : [];
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/services/automations.ts:88',message:'quotes query completed',data:{quoteRowsCount:quoteRows.length,latestVersionIdsCount:latestVersionIds.length,queryTimeMs:Date.now()-quoteQueryStart},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
  // #endregion

  const latestQuoteMap = new Map<string, Quote>();
  for (const quote of quoteRows) {
    if (!latestQuoteMap.has(quote.automationVersionId)) {
      latestQuoteMap.set(quote.automationVersionId, quote);
    }
  }

  const totalTime = Date.now() - queryStart;
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/services/automations.ts:97',message:'listAutomationsForTenant exit',data:{totalTimeMs:totalTime,automationCount:automationRows.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
  // #endregion
  return automationRows.map((automation) => {
    const version = latestVersionMap.get(automation.id);
    const creator = automation.createdBy ? creatorMap.get(automation.createdBy) ?? null : null;
    return {
      ...automation,
      latestVersion: version
        ? {
            ...version,
            id: version.id ?? "",
            latestQuote: latestQuoteMap.get(version.id ?? "") ?? null,
            latestMetrics: latestMetricMap.get(version.id ?? "") ?? null,
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
  const versionIds = versionRows
    .map((version) => version.id)
    .filter((id): id is string => Boolean(id));

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
    const taskVersionId = task.automationVersionId ?? "";
    if (!taskVersionId) continue;
    if (!tasksByVersion.has(taskVersionId)) {
      tasksByVersion.set(taskVersionId, []);
    }
    tasksByVersion.get(taskVersionId)!.push(task);
  }
  const metricsByVersion = await getLatestMetricsForVersions(tenantId, versionIds);

  return {
    automation: automationRow[0],
    versions: versionRows.map((version) => {
      const versionId = version.id ?? "";
      return {
        ...version,
        id: versionId,
        latestQuote: latestQuoteMap.get(versionId) ?? null,
        tasks: tasksByVersion.get(versionId) ?? [],
        latestMetrics: metricsByVersion.get(versionId) ?? null,
      };
    }),
  };
}

type CreateAutomationParams = {
  tenantId: string;
  userId: string;
  name: string;
  description?: string | null;
  intakeNotes?: string | null;
  requirementsText?: string;
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
            submissionId: task.submissionId,
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

export type UpdateMetadataParams = {
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

  const versionId = version.id ?? "";

  const submissionRows = await db
    .select()
    .from(submissions)
    .where(and(eq(submissions.automationVersionId, versionId), eq(submissions.tenantId, tenantId)))
    .limit(1);

  const quoteRows = await db
    .select()
    .from(quotes)
    .where(and(eq(quotes.automationVersionId, versionId), eq(quotes.tenantId, tenantId)))
    .orderBy(desc(quotes.createdAt))
    .limit(1);

  const taskRows = await db.select().from(tasks).where(and(eq(tasks.automationVersionId, versionId), eq(tasks.tenantId, tenantId)));
  const latestMetric = await getLatestMetricForVersion(tenantId, versionId);

  const workflowView: WorkflowViewModel = buildWorkflowViewModel(version.workflowJson);

  return {
    version,
    workflowView,
    automation: automationRow[0] ?? null,
    project: submissionRows[0] ?? null,
    latestQuote: quoteRows[0] ?? null,
    tasks: taskRows,
    latestMetrics: latestMetric,
  };
}

type UpdateStatusParams = {
  tenantId: string;
  automationVersionId: string;
  nextStatus: AutomationLifecycleStatus;
  actorRole: Parameters<typeof applyAutomationTransition>[0]["actorRole"];
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
  const actorRole = params.actorRole;
  if (!actorRole) {
    throw new Error("actorRole is required for lifecycle transitions");
  }
  const validatedNextStatus = applyAutomationTransition({
    from: currentStatus,
    to: params.nextStatus,
    actorRole,
    reason: "updateAutomationVersionStatus",
  });

  const [updated] = await db
    .update(automationVersions)
    .set({ status: toDbAutomationStatus(validatedNextStatus) })
    .where(eq(automationVersions.id, params.automationVersionId))
    .returning();

  if (!updated) {
    throw new Error("Failed to update automation version");
  }

  if (validatedNextStatus === "NeedsPricing") {
    await ensureSubmissionForVersion(updated, actorRole);
  } else if (validatedNextStatus !== "IntakeInProgress") {
    await syncSubmissionStatus(updated, validatedNextStatus, actorRole);
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

export async function ensureSubmissionForVersion(
  version: AutomationVersion,
  actorRole: Parameters<typeof applyAutomationTransition>[0]["actorRole"]
) {
  const existing = await db
    .select()
    .from(submissions)
    .where(and(eq(submissions.automationVersionId, version.id), eq(submissions.tenantId, version.tenantId)))
    .limit(1);

  if (existing.length > 0) {
    const currentStatus = fromDbAutomationStatus(existing[0].status);
    if (currentStatus === "IntakeInProgress") {
      const nextStatus = applyAutomationTransition({
        from: currentStatus,
        to: "NeedsPricing",
        actorRole,
        reason: "ensureSubmissionForVersion",
      });
      await syncSubmissionStatus(existing[0], nextStatus, actorRole);
    }
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

  const versionStatus = fromDbAutomationStatus(version.status);
  const targetStatus =
    versionStatus === "IntakeInProgress"
      ? applyAutomationTransition({
          from: versionStatus,
          to: "NeedsPricing",
          actorRole,
          reason: "ensureSubmissionForVersion:create",
        })
      : versionStatus;
  const dbStatus = toDbAutomationStatus(targetStatus);

  const [submission] = await db
    .insert(submissions)
    .values({
      tenantId: version.tenantId,
      automationId: version.automationId,
      automationVersionId: version.id,
      name: automationRow[0].name,
      status: dbStatus,
    })
    .returning();

  return submission;
}

export const ensureProjectForVersion = ensureSubmissionForVersion;

async function syncSubmissionStatus(
  submissionOrVersion: Submission | AutomationVersion,
  nextStatus: AutomationLifecycleStatus,
  actorRole: Parameters<typeof applyAutomationTransition>[0]["actorRole"]
) {
  const currentStatus = fromDbAutomationStatus(submissionOrVersion.status);
  const validatedStatus = applyAutomationTransition({
    from: currentStatus,
    to: nextStatus,
    actorRole,
    reason: "syncSubmissionStatus",
  });
  const dbStatus = toDbAutomationStatus(validatedStatus);

  if (isSubmissionRecord(submissionOrVersion)) {
    await db
      .update(submissions)
      .set({ status: dbStatus })
      .where(eq(submissions.id, submissionOrVersion.id));
    return;
  }

  await db
    .update(submissions)
    .set({ status: dbStatus })
    .where(eq(submissions.automationVersionId, submissionOrVersion.id));
}

function isSubmissionRecord(record: Submission | AutomationVersion): record is Submission {
  return typeof (record as Submission).automationVersionId !== "undefined";
}




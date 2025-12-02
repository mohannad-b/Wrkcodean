import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  automations,
  automationVersions,
  projects,
  quotes,
  type Automation,
  type AutomationVersion,
  type Project,
  type Quote,
} from "@/db/schema";
import {
  API_AUTOMATION_STATUSES,
  AutomationLifecycleStatus,
  canTransition,
  fromDbAutomationStatus,
  toDbAutomationStatus,
} from "@/lib/automations/status";
import type { Blueprint } from "@/lib/blueprint/types";

type AutomationWithLatestVersion = Automation & {
  latestVersion: (AutomationVersion & { latestQuote: Quote | null }) | null;
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
    return {
      ...automation,
      latestVersion: version ? { ...version, latestQuote: latestQuoteMap.get(version.id) ?? null } : null,
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

  return {
    automation: automationRow[0],
    versions: versionRows.map((version) => ({
      ...version,
      latestQuote: latestQuoteMap.get(version.id) ?? null,
    })),
  };
}

type CreateAutomationParams = {
  tenantId: string;
  userId: string;
  name: string;
  description?: string | null;
  intakeNotes?: string | null;
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
};

export async function createAutomationVersion(params: CreateAutomationVersionParams) {
  const automationRow = await db
    .select()
    .from(automations)
    .where(and(eq(automations.id, params.automationId), eq(automations.tenantId, params.tenantId)))
    .limit(1);

  if (automationRow.length === 0) {
    throw new Error("Automation not found");
  }

  const label = params.versionLabel ?? (await nextVersionLabel(params.automationId, params.tenantId));

  const [version] = await db
      .insert(automationVersions)
      .values({
        tenantId: params.tenantId,
        automationId: params.automationId,
        versionLabel: label,
        status: toDbAutomationStatus("IntakeInProgress"),
      summary: params.summary ?? null,
      intakeNotes: params.intakeNotes ?? null,
    })
    .returning();

  if (!version) {
    throw new Error("Unable to create version");
  }

  return version;
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
  intakeNotes?: string | null;
  blueprintJson?: Blueprint | null;
};

export async function updateAutomationVersionMetadata(params: UpdateMetadataParams) {
  const versionRow = await db
    .select()
    .from(automationVersions)
    .where(and(eq(automationVersions.id, params.automationVersionId), eq(automationVersions.tenantId, params.tenantId)))
    .limit(1);

  if (versionRow.length === 0) {
    throw new Error("Automation version not found");
  }

  const updatePayload: Partial<typeof automationVersions.$inferInsert> = {};
  if (params.intakeNotes !== undefined) {
    updatePayload.intakeNotes = params.intakeNotes;
  }
  if (params.blueprintJson !== undefined) {
    updatePayload.blueprintJson = params.blueprintJson ?? undefined;
  }

  if (Object.keys(updatePayload).length === 0) {
    return versionRow[0];
  }

  const [updated] = await db
    .update(automationVersions)
    .set(updatePayload)
    .where(eq(automationVersions.id, params.automationVersionId))
    .returning();

  return updated;
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

  return {
    version,
    automation: automationRow[0] ?? null,
    project: projectRows[0] ?? null,
    latestQuote: quoteRows[0] ?? null,
  };
}

type UpdateStatusParams = {
  tenantId: string;
  automationVersionId: string;
  nextStatus: AutomationLifecycleStatus;
};

export async function updateAutomationVersionStatus(params: UpdateStatusParams) {
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

  return updated;
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




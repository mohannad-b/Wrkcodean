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
import { fromDbAutomationStatus, toDbAutomationStatus, AutomationLifecycleStatus } from "@/lib/automations/status";
import { canQuoteTransition, fromDbQuoteStatus, QuoteLifecycleStatus, toDbQuoteStatus } from "@/lib/quotes/status";

export type ProjectListItem = {
  project: Project;
  automation: Automation | null;
  version: AutomationVersion | null;
  latestQuote: Quote | null;
};

export async function listProjectsForTenant(tenantId: string): Promise<ProjectListItem[]> {
  const projectRows = await db
    .select()
    .from(projects)
    .where(eq(projects.tenantId, tenantId))
    .orderBy(desc(projects.updatedAt));

  if (projectRows.length === 0) {
    return [];
  }

  const automationIds = Array.from(new Set(projectRows.map((row) => row.automationId).filter(Boolean))) as string[];
  const versionIds = Array.from(new Set(projectRows.map((row) => row.automationVersionId).filter(Boolean))) as string[];

  const automationRows = automationIds.length
    ? await db.select().from(automations).where(inArray(automations.id, automationIds))
    : [];
  const versionRows = versionIds.length
    ? await db.select().from(automationVersions).where(inArray(automationVersions.id, versionIds))
    : [];
  const quoteRows = versionIds.length
    ? await db
        .select()
        .from(quotes)
        .where(inArray(quotes.automationVersionId, versionIds))
        .orderBy(desc(quotes.createdAt))
    : [];

  const automationMap = new Map(automationRows.map((row) => [row.id, row]));
  const versionMap = new Map(versionRows.map((row) => [row.id, row]));
  const latestQuoteMap = new Map<string, Quote>();

  for (const quote of quoteRows) {
    if (!latestQuoteMap.has(quote.automationVersionId)) {
      latestQuoteMap.set(quote.automationVersionId, quote);
    }
  }

  return projectRows.map((project) => ({
    project,
    automation: project.automationId ? automationMap.get(project.automationId) ?? null : null,
    version: project.automationVersionId ? versionMap.get(project.automationVersionId) ?? null : null,
    latestQuote: project.automationVersionId ? latestQuoteMap.get(project.automationVersionId) ?? null : null,
  }));
}

export async function getProjectDetail(tenantId: string, projectId: string) {
  const projectRows = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId)))
    .limit(1);

  if (projectRows.length === 0) {
    return null;
  }

  const project = projectRows[0];

  const automationRow =
    project.automationId && (await db
      .select()
      .from(automations)
      .where(and(eq(automations.id, project.automationId), eq(automations.tenantId, tenantId)))
      .limit(1));

  const versionRow =
    project.automationVersionId && (await db
      .select()
      .from(automationVersions)
      .where(and(eq(automationVersions.id, project.automationVersionId), eq(automationVersions.tenantId, tenantId)))
      .limit(1));

  const quotesForProject = project.automationVersionId
    ? await db
        .select()
        .from(quotes)
        .where(and(eq(quotes.automationVersionId, project.automationVersionId), eq(quotes.tenantId, tenantId)))
        .orderBy(desc(quotes.createdAt))
    : [];

  return {
    project,
    automation: automationRow && automationRow[0] ? automationRow[0] : null,
    version: versionRow && versionRow[0] ? versionRow[0] : null,
    quotes: quotesForProject,
  };
}

type QuoteInput = {
  tenantId: string;
  automationVersionId: string;
  setupFee: number;
  unitPrice: number;
  estimatedVolume?: number | null;
  clientMessage?: string | null;
};

export async function createQuoteForProject(params: QuoteInput) {
  const [quote] = await db
    .insert(quotes)
    .values({
      tenantId: params.tenantId,
      automationVersionId: params.automationVersionId,
      status: toDbQuoteStatus("DRAFT"),
      setupFee: params.setupFee.toString(),
      unitPrice: params.unitPrice.toString(),
      estimatedVolume: params.estimatedVolume ?? null,
      clientMessage: params.clientMessage ?? null,
    })
    .returning();

  return quote;
}

type UpdateQuoteStatusParams = {
  tenantId: string;
  quoteId: string;
  nextStatus: QuoteLifecycleStatus;
};

export async function updateQuoteStatus(params: UpdateQuoteStatusParams) {
  const quoteRows = await db
    .select()
    .from(quotes)
    .where(and(eq(quotes.id, params.quoteId), eq(quotes.tenantId, params.tenantId)))
    .limit(1);

  if (quoteRows.length === 0) {
    throw new Error("Quote not found");
  }

  const quote = quoteRows[0];
  const currentStatus = fromDbQuoteStatus(quote.status);

  if (!canQuoteTransition(currentStatus, params.nextStatus)) {
    throw new Error("Invalid quote transition");
  }

  const [updated] = await db
    .update(quotes)
    .set({ status: toDbQuoteStatus(params.nextStatus) })
    .where(eq(quotes.id, params.quoteId))
    .returning();

  return updated;
}

type SignQuoteResult = {
  quote: Quote;
  automationVersion?: AutomationVersion | null;
  project?: Project | null;
  previousQuoteStatus: QuoteLifecycleStatus;
  previousAutomationStatus?: AutomationLifecycleStatus | null;
  previousProjectStatus?: AutomationLifecycleStatus | null;
};

export async function signQuoteAndPromote(params: { tenantId: string; quoteId: string }): Promise<SignQuoteResult> {
  return db.transaction(async (tx) => {
    const quoteRows = await tx
      .select()
      .from(quotes)
      .where(and(eq(quotes.id, params.quoteId), eq(quotes.tenantId, params.tenantId)))
      .limit(1);

    if (quoteRows.length === 0) {
      throw new Error("Quote not found");
    }

    const quote = quoteRows[0];
    const previousQuoteStatus = fromDbQuoteStatus(quote.status);

    if (previousQuoteStatus !== "SENT") {
      throw new Error("Quote must be SENT before signing");
    }

    const [updatedQuote] = await tx
      .update(quotes)
      .set({ status: toDbQuoteStatus("SIGNED") })
      .where(eq(quotes.id, quote.id))
      .returning();

    let automationVersionResult: AutomationVersion | null = null;
    let previousAutomationStatus: AutomationLifecycleStatus | null = null;
    let projectResult: Project | null = null;
    let previousProjectStatus: AutomationLifecycleStatus | null = null;

    if (quote.automationVersionId) {
      const versionRows = await tx
        .select()
        .from(automationVersions)
        .where(and(eq(automationVersions.id, quote.automationVersionId), eq(automationVersions.tenantId, params.tenantId)))
        .limit(1);

      if (versionRows.length > 0) {
        previousAutomationStatus = fromDbAutomationStatus(versionRows[0].status);
        automationVersionResult = versionRows[0];

    if (previousAutomationStatus === "NeedsPricing" || previousAutomationStatus === "AwaitingClientApproval") {
          const [updatedVersion] = await tx
            .update(automationVersions)
        .set({ status: toDbAutomationStatus("BuildInProgress") })
            .where(eq(automationVersions.id, versionRows[0].id))
            .returning();

          automationVersionResult = updatedVersion ?? automationVersionResult;
        }

        const projectRows = await tx
          .select()
          .from(projects)
          .where(and(eq(projects.automationVersionId, versionRows[0].id), eq(projects.tenantId, params.tenantId)))
          .limit(1);

        if (projectRows.length > 0) {
          previousProjectStatus = fromDbAutomationStatus(projectRows[0].status);
          projectResult = projectRows[0];

          if (previousProjectStatus === "NeedsPricing" || previousProjectStatus === "AwaitingClientApproval") {
            const [updatedProject] = await tx
              .update(projects)
              .set({ status: toDbAutomationStatus("BuildInProgress") })
              .where(eq(projects.id, projectRows[0].id))
              .returning();
            projectResult = updatedProject ?? projectResult;
          }
        }
      }
    }

    return {
      quote: updatedQuote,
      automationVersion: automationVersionResult,
      project: projectResult,
      previousQuoteStatus,
      previousAutomationStatus,
      previousProjectStatus,
    };
  });
}



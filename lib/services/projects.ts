import { and, desc, eq, inArray, sql } from "drizzle-orm";
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
  type Project,
  type Quote,
  type Task,
  type User,
} from "@/db/schema";
import { fromDbAutomationStatus, toDbAutomationStatus, AutomationLifecycleStatus } from "@/lib/automations/status";
import { canQuoteTransition, fromDbQuoteStatus, QuoteLifecycleStatus, toDbQuoteStatus } from "@/lib/quotes/status";

export type ProjectListItem = {
  project: Project;
  automation: Automation | null;
  version: AutomationVersion | null;
  latestQuote: Quote | null;
};

export class SigningError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 409) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

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

export async function listAutomationRequestsForTenant(tenantId: string, excludeVersionIds = new Set<string>()): Promise<ProjectListItem[]> {
  const versionRows = await db
    .select()
    .from(automationVersions)
    .where(eq(automationVersions.tenantId, tenantId))
    .orderBy(desc(automationVersions.updatedAt));

  const filteredVersions = versionRows.filter((version) => !excludeVersionIds.has(version.id));
  if (filteredVersions.length === 0) {
    return [];
  }

  const automationIds = Array.from(new Set(filteredVersions.map((row) => row.automationId).filter(Boolean))) as string[];
  const automationRows = automationIds.length
    ? await db.select().from(automations).where(inArray(automations.id, automationIds))
    : [];
  const automationMap = new Map(automationRows.map((row) => [row.id, row]));

  const versionIds = filteredVersions.map((row) => row.id);
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

  return filteredVersions.map((version) => {
    const automation = version.automationId ? automationMap.get(version.automationId) ?? null : null;
    // Fabricate a lightweight project wrapper so downstream mapping continues to work.
    const pseudoProject: Project = {
      id: version.id,
      tenantId: version.tenantId,
      automationId: version.automationId ?? null,
      automationVersionId: version.id,
      name: automation?.name ?? "Automation request",
      status: version.status,
      ownerId: null,
      createdAt: version.createdAt,
      updatedAt: version.updatedAt,
    };

    return {
      project: pseudoProject,
      automation,
      version,
      latestQuote: latestQuoteMap.get(version.id) ?? null,
    };
  });
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

  const tasksForProject = project.automationVersionId
    ? await db
        .select()
        .from(tasks)
        .where(and(eq(tasks.automationVersionId, project.automationVersionId), eq(tasks.tenantId, tenantId)))
        .orderBy(desc(tasks.createdAt))
    : [];

  const assigneeIds = Array.from(
    new Set(tasksForProject.map((task) => task.assigneeId).filter((id): id is string => Boolean(id)))
  );
  const assignees: User[] = assigneeIds.length
    ? await db
        .select()
        .from(users)
        .where(and(inArray(users.id, assigneeIds), eq(users.tenantId, tenantId)))
    : [];
  const assigneeMap = new Map<string, User>();
  assignees.forEach((user) => assigneeMap.set(user.id, user));

  const tasksWithAssignee: Array<Task & { assignee?: User | null }> = tasksForProject.map((task) => ({
    ...task,
    assignee: task.assigneeId ? assigneeMap.get(task.assigneeId) ?? null : null,
  }));

  return {
    project,
    automation: automationRow && automationRow[0] ? automationRow[0] : null,
    version: versionRow && versionRow[0] ? versionRow[0] : null,
    quotes: quotesForProject,
    tasks: tasksWithAssignee,
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
  alreadyApplied?: boolean;
};

type SignQuoteParams = {
  tenantId: string;
  quoteId: string;
  lastKnownUpdatedAt?: string | null;
  signatureMetadata?: Record<string, unknown> | null;
};

type QuoteType = "initial_commitment" | "change_order";

function parseQuoteType(value: unknown): QuoteType {
  if (value === "change_order") return "change_order";
  return "initial_commitment";
}

function isAllowedBillingActiveStatus(status: AutomationLifecycleStatus | null) {
  return (
    status === "ReadyForBuild" ||
    status === "BuildInProgress" ||
    status === "Live" ||
    status === "QATesting"
  );
}

export async function signQuoteAndPromote(params: SignQuoteParams): Promise<SignQuoteResult> {
  const { tenantId, quoteId, lastKnownUpdatedAt, signatureMetadata } = params;

  return db.transaction(async (tx) => {
    const quoteRows = await tx
      .select()
      .from(quotes)
      .where(and(eq(quotes.id, quoteId), eq(quotes.tenantId, tenantId)))
      .limit(1);

    if (quoteRows.length === 0) {
      throw new SigningError("not_found", "Quote not found", 404);
    }

    const quote = quoteRows[0];
    const previousQuoteStatus = fromDbQuoteStatus(quote.status);
    const quoteType = parseQuoteType((quote as unknown as { quoteType?: QuoteType }).quoteType);

    // Idempotent shortcut when already signed.
    if (previousQuoteStatus === "SIGNED") {
      return {
        quote,
        previousQuoteStatus,
        alreadyApplied: true,
      };
    }

    if (previousQuoteStatus !== "SENT") {
      throw new SigningError("invalid_quote_status", "Quote must be SENT before signing", 409);
    }

    if (lastKnownUpdatedAt) {
      const known = new Date(lastKnownUpdatedAt).getTime();
      const actual = quote.updatedAt instanceof Date ? quote.updatedAt.getTime() : new Date(quote.updatedAt).getTime();
      if (Number.isFinite(known) && Number.isFinite(actual) && known !== actual) {
        throw new SigningError("concurrency_conflict", "Quote has changed since last read", 409);
      }
    }

    if (quote.expiresAt && quote.expiresAt < new Date()) {
      throw new SigningError("quote_expired", "Quote has expired", 400);
    }

    let automationVersionResult: AutomationVersion | null = null;
    let previousAutomationStatus: AutomationLifecycleStatus | null = null;
    let projectResult: Project | null = null;
    let previousProjectStatus: AutomationLifecycleStatus | null = null;

    if (quote.automationVersionId) {
      const versionRows = await tx
        .select()
        .from(automationVersions)
        .where(and(eq(automationVersions.id, quote.automationVersionId), eq(automationVersions.tenantId, tenantId)))
        .limit(1);

      if (versionRows.length > 0) {
        previousAutomationStatus = fromDbAutomationStatus(versionRows[0].status);
        automationVersionResult = versionRows[0];

        const projectRows = await tx
          .select()
          .from(projects)
          .where(and(eq(projects.automationVersionId, versionRows[0].id), eq(projects.tenantId, tenantId)))
          .limit(1);

        if (projectRows.length > 0) {
          previousProjectStatus = fromDbAutomationStatus(projectRows[0].status);
          projectResult = projectRows[0];
        }
      }
    }

    // Enforce AAA or BAT triads before any write.
    if (quoteType === "initial_commitment") {
      if (previousProjectStatus !== "AwaitingClientApproval") {
        throw new SigningError("project_not_editable", "Project must be Awaiting Client Approval", 409);
      }
      if (previousAutomationStatus !== "AwaitingClientApproval") {
        throw new SigningError("invalid_status_transition", "Automation version not Awaiting Client Approval", 409);
      }
    } else {
      if ((projectResult as unknown as { pricingStatus?: string })?.pricingStatus !== "Signed") {
        throw new SigningError("project_not_priced", "Project pricing_status must be Signed", 409);
      }
      if (!isAllowedBillingActiveStatus(previousAutomationStatus)) {
        throw new SigningError("automation_not_active_for_billing", "Automation must be billing-active", 409);
      }
    }

    const signaturePayload =
      signatureMetadata && typeof signatureMetadata === "object"
        ? (signatureMetadata as Record<string, unknown>)
        : undefined;

    const [updatedQuote] = await tx
      .update(quotes)
      .set({
        status: toDbQuoteStatus("SIGNED"),
        signedAt: new Date(),
        signatureMetadata: signaturePayload
          ? sql`${quotes.signatureMetadata} || ${signaturePayload}::jsonb`
          : quotes.signatureMetadata,
        updatedAt: new Date(),
      })
      .where(eq(quotes.id, quote.id))
      .returning();

    // Update automation + project lifecycles.
    if (automationVersionResult) {
      if (quoteType === "initial_commitment" && previousAutomationStatus !== "ReadyForBuild") {
        const [updatedVersion] = await tx
          .update(automationVersions)
          .set({ status: toDbAutomationStatus("ReadyForBuild") })
          .where(eq(automationVersions.id, automationVersionResult.id))
          .returning();
        automationVersionResult = updatedVersion ?? automationVersionResult;
      }
    }

    if (projectResult) {
      const updates: Partial<typeof projects.$inferInsert> = { pricingStatus: "Signed" };
      if (quoteType === "initial_commitment" && previousProjectStatus !== "ReadyForBuild") {
        updates.status = toDbAutomationStatus("ReadyForBuild");
      }
      const [updatedProject] = await tx
        .update(projects)
        .set(updates)
        .where(eq(projects.id, projectResult.id))
        .returning();
      projectResult = updatedProject ?? projectResult;
    }

    return {
      quote: updatedQuote,
      automationVersion: automationVersionResult,
      project: projectResult,
      previousQuoteStatus,
      previousAutomationStatus,
      previousProjectStatus,
      alreadyApplied: false,
    };
  });
}



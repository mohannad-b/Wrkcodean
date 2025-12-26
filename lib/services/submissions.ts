import { and, desc, eq, inArray, sql } from "drizzle-orm";
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
  type Submission,
  type Quote,
  type Task,
  type User,
} from "@/db/schema";
import { fromDbAutomationStatus, toDbAutomationStatus, AutomationLifecycleStatus } from "@/lib/automations/status";
import { canQuoteTransition, fromDbQuoteStatus, QuoteLifecycleStatus, toDbQuoteStatus } from "@/lib/quotes/status";

export type SubmissionListItem = {
  submission: Submission;
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

export async function listSubmissionsForTenant(tenantId: string): Promise<SubmissionListItem[]> {
  const submissionRows = await db
    .select()
    .from(submissions)
    .where(eq(submissions.tenantId, tenantId))
    .orderBy(desc(submissions.updatedAt));

  if (submissionRows.length === 0) {
    return [];
  }

  const automationIds = Array.from(new Set(submissionRows.map((row) => row.automationId).filter(Boolean))) as string[];
  const versionIds = Array.from(new Set(submissionRows.map((row) => row.automationVersionId).filter(Boolean))) as string[];

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

  return submissionRows.map((submission) => ({
    submission,
    automation: submission.automationId ? automationMap.get(submission.automationId) ?? null : null,
    version: submission.automationVersionId ? versionMap.get(submission.automationVersionId) ?? null : null,
    latestQuote: submission.automationVersionId ? latestQuoteMap.get(submission.automationVersionId) ?? null : null,
  }));
}

export async function listSubmissionRequestsForTenant(
  tenantId: string,
  excludeVersionIds = new Set<string>()
): Promise<SubmissionListItem[]> {
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
    // Fabricate a lightweight submission wrapper so downstream mapping continues to work.
    const pseudoSubmission: Submission = {
      id: version.id,
      tenantId: version.tenantId,
      automationId: version.automationId ?? null,
      automationVersionId: version.id,
      name: automation?.name ?? "Automation request",
      status: version.status,
      ownerId: null,
      createdAt: version.createdAt,
      updatedAt: version.updatedAt,
      pricingStatus: "NotGenerated",
      type: "new_automation",
      checklistProgress: 0,
    };

    return {
      submission: pseudoSubmission,
      automation,
      version,
      latestQuote: latestQuoteMap.get(version.id) ?? null,
    };
  });
}

export async function getSubmissionDetail(tenantId: string, submissionId: string) {
  const submissionRows = await db
    .select()
    .from(submissions)
    .where(and(eq(submissions.id, submissionId), eq(submissions.tenantId, tenantId)))
    .limit(1);

  if (submissionRows.length === 0) {
    return null;
  }

  const submission = submissionRows[0];

  const automationRow =
    submission.automationId && (await db
      .select()
      .from(automations)
      .where(and(eq(automations.id, submission.automationId), eq(automations.tenantId, tenantId)))
      .limit(1));

  const versionRow =
    submission.automationVersionId && (await db
      .select()
      .from(automationVersions)
      .where(and(eq(automationVersions.id, submission.automationVersionId), eq(automationVersions.tenantId, tenantId)))
      .limit(1));

  const quotesForSubmission = submission.automationVersionId
    ? await db
        .select()
        .from(quotes)
        .where(and(eq(quotes.automationVersionId, submission.automationVersionId), eq(quotes.tenantId, tenantId)))
        .orderBy(desc(quotes.createdAt))
    : [];

  const tasksForSubmission = submission.automationVersionId
    ? await db
        .select()
        .from(tasks)
        .where(and(eq(tasks.automationVersionId, submission.automationVersionId), eq(tasks.tenantId, tenantId)))
        .orderBy(desc(tasks.createdAt))
    : [];

  const assigneeIds = Array.from(
    new Set(tasksForSubmission.map((task) => task.assigneeId).filter((id): id is string => Boolean(id)))
  );
  const assignees: User[] = assigneeIds.length
    ? await db
        .select()
        .from(users)
        .where(and(inArray(users.id, assigneeIds), eq(users.tenantId, tenantId)))
    : [];
  const assigneeMap = new Map<string, User>();
  assignees.forEach((user) => assigneeMap.set(user.id, user));

  const tasksWithAssignee: Array<Task & { assignee?: User | null }> = tasksForSubmission.map((task) => ({
    ...task,
    assignee: task.assigneeId ? assigneeMap.get(task.assigneeId) ?? null : null,
  }));

  return {
    submission,
    automation: automationRow && automationRow[0] ? automationRow[0] : null,
    version: versionRow && versionRow[0] ? versionRow[0] : null,
    quotes: quotesForSubmission,
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

export async function createQuoteForSubmission(params: QuoteInput) {
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
  submission?: Submission | null;
  previousQuoteStatus: QuoteLifecycleStatus;
  previousAutomationStatus?: AutomationLifecycleStatus | null;
  previousSubmissionStatus?: AutomationLifecycleStatus | null;
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
    let submissionResult: Submission | null = null;
    let previousSubmissionStatus: AutomationLifecycleStatus | null = null;

    if (quote.automationVersionId) {
      const versionRows = await tx
        .select()
        .from(automationVersions)
        .where(and(eq(automationVersions.id, quote.automationVersionId), eq(automationVersions.tenantId, tenantId)))
        .limit(1);

      if (versionRows.length > 0) {
        previousAutomationStatus = fromDbAutomationStatus(versionRows[0].status);
        automationVersionResult = versionRows[0];

        const submissionRows = await tx
          .select()
          .from(submissions)
          .where(and(eq(submissions.automationVersionId, versionRows[0].id), eq(submissions.tenantId, tenantId)))
          .limit(1);

        if (submissionRows.length > 0) {
          previousSubmissionStatus = fromDbAutomationStatus(submissionRows[0].status);
          submissionResult = submissionRows[0];
        }

        // Normalize statuses forward to the expected triad gating (Flow 16) if behind.
        if (quoteType === "initial_commitment") {
          if (previousAutomationStatus === "NeedsPricing") {
            const [updatedVersion] = await tx
              .update(automationVersions)
              .set({ status: toDbAutomationStatus("AwaitingClientApproval") })
              .where(eq(automationVersions.id, versionRows[0].id))
              .returning();
            automationVersionResult = updatedVersion ?? automationVersionResult;
            previousAutomationStatus = fromDbAutomationStatus(automationVersionResult.status);
          }
          if (previousSubmissionStatus === "NeedsPricing") {
            const [updatedSubmission] = await tx
              .update(submissions)
              .set({ status: toDbAutomationStatus("AwaitingClientApproval"), pricingStatus: "Sent" })
              .where(eq(submissions.id, submissionResult?.id ?? submissionRows[0].id))
              .returning();
            submissionResult = updatedSubmission ?? submissionResult;
            previousSubmissionStatus = fromDbAutomationStatus(submissionResult.status);
          }
        }
      }
    }

    // Enforce AAA or BAT triads before any write.
    if (quoteType === "initial_commitment") {
      if (previousSubmissionStatus !== "AwaitingClientApproval") {
        throw new SigningError("submission_not_editable", "Submission must be Awaiting Client Approval", 409);
      }
      if (previousAutomationStatus !== "AwaitingClientApproval") {
        throw new SigningError("invalid_status_transition", "Automation version not Awaiting Client Approval", 409);
      }
    } else {
      if ((submissionResult as unknown as { pricingStatus?: string })?.pricingStatus !== "Signed") {
        throw new SigningError("submission_not_priced", "Submission pricing_status must be Signed", 409);
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

    // Update automation + submission lifecycles.
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

    if (submissionResult) {
      const updates: Partial<typeof submissions.$inferInsert> = { pricingStatus: "Signed" };
      if (quoteType === "initial_commitment" && previousSubmissionStatus !== "ReadyForBuild") {
        updates.status = toDbAutomationStatus("ReadyForBuild");
      }
      const [updatedSubmission] = await tx
        .update(submissions)
        .set(updates)
        .where(eq(submissions.id, submissionResult.id))
        .returning();
      submissionResult = updatedSubmission ?? submissionResult;
    }

    return {
      quote: updatedQuote,
      automationVersion: automationVersionResult,
      submission: submissionResult,
      previousQuoteStatus,
      previousAutomationStatus,
      previousSubmissionStatus,
      alreadyApplied: false,
    };
  });
}

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { automationVersions, submissions, quotes } from "@/db/schema";
import { priceWorkflow, PricingInput, PricingResult } from "@/lib/pricing/engine";
import { loadWrkActionCatalog } from "@/lib/pricing/wrkactions-catalog";
import { toDbQuoteStatus } from "@/lib/quotes/status";
import { ensureSubmissionForVersion } from "@/lib/services/automations";
import { applyAutomationTransition, fromDbAutomationStatus, toDbAutomationStatus } from "@/lib/automations/status";
import { ensureDiscountOffersForVersion, findActiveDiscountByCode, markDiscountUsed } from "@/lib/services/discounts";
import { getNextStatusForEvent } from "@/lib/submissions/lifecycle";

export type PriceAndCreateQuoteParams = {
  tenantId: string;
  automationVersionId: string;
  pricing: PricingInput;
  clientMessage?: string | null;
  notes?: string | null;
  discountCode?: string | null;
  actorRole: Parameters<typeof applyAutomationTransition>[0]["actorRole"];
};

export type PriceAndCreateQuoteResult = {
  quoteId: string;
  submissionId: string;
  automationVersionId: string;
  pricing: PricingResult;
};

export async function priceAndCreateQuoteForVersion(
  params: PriceAndCreateQuoteParams
): Promise<PriceAndCreateQuoteResult> {
  if (!params.actorRole) {
    throw new Error("actorRole is required for lifecycle transitions");
  }
  const versionRow = await db
    .select()
    .from(automationVersions)
    .where(and(eq(automationVersions.id, params.automationVersionId), eq(automationVersions.tenantId, params.tenantId)))
    .limit(1);

  if (versionRow.length === 0) {
    throw new Error("Automation version not found");
  }

  // Ensure a submission exists for this version so pricing can attach to it.
  const submission = await ensureSubmissionForVersion(versionRow[0], params.actorRole);

  const actionCatalog = params.pricing.actionCatalog ?? (await loadWrkActionCatalog());
  await ensureDiscountOffersForVersion(params.tenantId, params.automationVersionId);

  let discounts = params.pricing.discounts ?? [];
  if (params.discountCode) {
    const offer = await findActiveDiscountByCode(params.tenantId, params.discountCode);
    if (!offer) {
      throw new Error("Invalid discount code");
    }
    discounts = [
      ...discounts,
      {
        code: offer.code,
        percent: Number(offer.percent),
        source: "code",
        appliesTo: "setup_fee" as const,
      },
    ];
    await markDiscountUsed(offer.id);
  }

  const pricingResult = priceWorkflow({ ...params.pricing, discounts, actionCatalog });

  const [quote] = await db
    .insert(quotes)
    .values({
      tenantId: params.tenantId,
      automationVersionId: params.automationVersionId,
      status: toDbQuoteStatus("SENT"),
      quoteType: "initial_commitment",
      currency: pricingResult.currency,
      setupFee: pricingResult.setupFee.toFixed(2),
      unitPrice: pricingResult.unitPrice.toFixed(4),
      effectiveUnitPrice: pricingResult.effectiveUnitPrice.toFixed(4),
      estimatedVolume: pricingResult.estimatedVolume,
      notes: params.notes ?? null,
      clientMessage: params.clientMessage ?? null,
      discountsJson: (pricingResult.discountsApplied ?? []) as unknown as Record<string, unknown>,
    })
    .returning();

  // Mark submission pricing status as Sent (pricing generated).
  const submissionStatus = fromDbAutomationStatus(submission.status);
  const targetSubmissionStatus =
    getNextStatusForEvent("quote.sent", submissionStatus) ?? "AwaitingClientApproval";
  const validatedSubmissionStatus = applyAutomationTransition({
    from: submissionStatus,
    to: targetSubmissionStatus,
    actorRole: params.actorRole,
    reason: "quote.sent",
  });

  const submissionUpdate = await db
    .update(submissions)
    .set({ pricingStatus: "Sent", status: toDbAutomationStatus(validatedSubmissionStatus) })
    .where(and(eq(submissions.id, submission.id), eq(submissions.tenantId, params.tenantId)))
    .returning();

  // Ensure automation version moves to AwaitingClientApproval if not already further along.
  const currentVersionStatus = fromDbAutomationStatus(versionRow[0].status);
  const targetVersionStatus = getNextStatusForEvent("quote.sent", currentVersionStatus);
  if (targetVersionStatus && currentVersionStatus !== targetVersionStatus) {
    const validatedVersionStatus = applyAutomationTransition({
      from: currentVersionStatus,
      to: targetVersionStatus,
      actorRole: params.actorRole,
      reason: "quote.sent:automationVersion",
    });
    await db
      .update(automationVersions)
      .set({ status: toDbAutomationStatus(validatedVersionStatus) })
      .where(and(eq(automationVersions.id, params.automationVersionId), eq(automationVersions.tenantId, params.tenantId)));
  }

  return {
    quoteId: quote.id,
    submissionId: submissionUpdate[0]?.id ?? submission.id,
    automationVersionId: params.automationVersionId,
    pricing: pricingResult,
  };
}


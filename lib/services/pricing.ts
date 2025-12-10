import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { automationVersions, projects, quotes } from "@/db/schema";
import { priceWorkflow, PricingInput, PricingResult } from "@/lib/pricing/engine";
import { loadWrkActionCatalog } from "@/lib/pricing/wrkactions-catalog";
import { toDbQuoteStatus } from "@/lib/quotes/status";
import { ensureProjectForVersion } from "@/lib/services/automations";
import { fromDbAutomationStatus, toDbAutomationStatus } from "@/lib/automations/status";
import { ensureDiscountOffersForVersion, findActiveDiscountByCode, markDiscountUsed } from "@/lib/services/discounts";

export type PriceAndCreateQuoteParams = {
  tenantId: string;
  automationVersionId: string;
  pricing: PricingInput;
  clientMessage?: string | null;
  notes?: string | null;
  discountCode?: string | null;
};

export type PriceAndCreateQuoteResult = {
  quoteId: string;
  projectId: string;
  automationVersionId: string;
  pricing: PricingResult;
};

export async function priceAndCreateQuoteForVersion(
  params: PriceAndCreateQuoteParams
): Promise<PriceAndCreateQuoteResult> {
  const versionRow = await db
    .select()
    .from(automationVersions)
    .where(and(eq(automationVersions.id, params.automationVersionId), eq(automationVersions.tenantId, params.tenantId)))
    .limit(1);

  if (versionRow.length === 0) {
    throw new Error("Automation version not found");
  }

  // Ensure a project exists for this version so pricing can attach to it.
  const project = await ensureProjectForVersion(versionRow[0]);

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
    discountsJson: pricingResult.discountsApplied,
    })
    .returning();

  // Mark project pricing status as Sent (pricing generated).
  const projectUpdate = await db
    .update(projects)
    .set({ pricingStatus: "Sent", status: toDbAutomationStatus("AwaitingClientApproval") })
    .where(and(eq(projects.id, project.id), eq(projects.tenantId, params.tenantId)))
    .returning();

  // Ensure automation version moves to AwaitingClientApproval if not already further along.
  const currentVersionStatus = fromDbAutomationStatus(versionRow[0].status);
  if (currentVersionStatus !== "AwaitingClientApproval" && currentVersionStatus !== "BuildInProgress" && currentVersionStatus !== "ReadyForBuild") {
    await db
      .update(automationVersions)
      .set({ status: toDbAutomationStatus("AwaitingClientApproval") })
      .where(and(eq(automationVersions.id, params.automationVersionId), eq(automationVersions.tenantId, params.tenantId)));
  }

  return {
    quoteId: quote.id,
    projectId: projectUpdate[0]?.id ?? project.id,
    automationVersionId: params.automationVersionId,
    pricing: pricingResult,
  };
}


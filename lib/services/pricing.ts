import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { automationVersions, projects, quotes } from "@/db/schema";
import { priceWorkflow, PricingInput, PricingResult } from "@/lib/pricing/engine";
import { loadWrkActionCatalog } from "@/lib/pricing/wrkactions-catalog";
import { toDbQuoteStatus } from "@/lib/quotes/status";
import { ensureProjectForVersion } from "@/lib/services/automations";

export type PriceAndCreateQuoteParams = {
  tenantId: string;
  automationVersionId: string;
  pricing: PricingInput;
  clientMessage?: string | null;
  notes?: string | null;
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
  const pricingResult = priceWorkflow({ ...params.pricing, actionCatalog });

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
    })
    .returning();

  // Mark project pricing status as Sent (pricing generated).
  await db
    .update(projects)
    .set({ pricingStatus: "Sent" })
    .where(and(eq(projects.id, project.id), eq(projects.tenantId, params.tenantId)));

  return {
    quoteId: quote.id,
    projectId: project.id,
    automationVersionId: params.automationVersionId,
    pricing: pricingResult,
  };
}


import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { discountOffers, projects } from "@/db/schema";
import crypto from "crypto";

export type DiscountKind = "first_congrats" | "first_incentive" | "followup_5" | "followup_10";

const OFFER_DEFS: Record<DiscountKind, { percent: number }> = {
  first_congrats: { percent: 0.1 },
  first_incentive: { percent: 0.25 },
  followup_5: { percent: 0.05 },
  followup_10: { percent: 0.1 },
};

function generateCode(prefix: string) {
  const random = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `${prefix}-${random}`;
}

async function isFirstWorkflowForTenant(tenantId: string) {
  const existingProjects = await db.select({ id: projects.id }).from(projects).where(eq(projects.tenantId, tenantId)).limit(1);
  return existingProjects.length === 0;
}

export async function ensureDiscountOffersForVersion(tenantId: string, automationVersionId: string) {
  const firstWorkflow = await isFirstWorkflowForTenant(tenantId);
  const kindsNeeded: DiscountKind[] = firstWorkflow
    ? ["first_congrats", "first_incentive"]
    : ["followup_5", "followup_10"];

  const existing = await db
    .select()
    .from(discountOffers)
    .where(and(eq(discountOffers.tenantId, tenantId), eq(discountOffers.automationVersionId, automationVersionId)));

  const existingKinds = new Set(existing.map((d) => d.kind));
  const toCreate = kindsNeeded.filter((k) => !existingKinds.has(k));

  if (toCreate.length === 0) return;

  const rows = toCreate.map((kind) => ({
    tenantId,
    automationVersionId,
    code: generateCode(kind === "first_congrats" || kind === "first_incentive" ? "FIRST" : "DISC"),
    percent: OFFER_DEFS[kind].percent,
    appliesTo: "setup_fee" as const,
    kind,
  }));

  await db.insert(discountOffers).values(rows);
}

export async function findActiveDiscountByCode(tenantId: string, code: string) {
  const rows = await db
    .select()
    .from(discountOffers)
    .where(
      and(
        eq(discountOffers.tenantId, tenantId),
        sql`${discountOffers.code} ILIKE ${code}`
      )
    )
    .limit(1);
  if (rows.length === 0) return null;
  const offer = rows[0];
  if (offer.expiresAt && offer.expiresAt < new Date()) return null;
  if (offer.usedAt) return null;
  return offer;
}

export async function markDiscountUsed(id: string) {
  await db.update(discountOffers).set({ usedAt: new Date() }).where(eq(discountOffers.id, id));
}


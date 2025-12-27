import { and, desc, eq, inArray, lt } from "drizzle-orm";
import { db } from "@/db";
import {
  automationMetricConfigs,
  automationVersionMetrics,
  automationVersions,
  quotes,
  type AutomationMetricConfig,
  type AutomationVersionMetric,
  type Quote,
} from "@/db/schema";

type UsageSnapshot = {
  totalExecutions: number;
  successCount: number;
  failureCount: number;
  spendUsd: number;
  source: string;
};

type MetricSnapshotInput = {
  tenantId: string;
  automationVersionId: string;
  asOfDate?: Date;
  usage?: UsageSnapshot;
};

type MetricConfigInput = {
  tenantId: string;
  automationVersionId: string;
  manualMinutesPerExecution?: number;
  hourlyRateUsd?: number;
};

export async function getLatestMetricForVersion(
  tenantId: string,
  automationVersionId: string
): Promise<AutomationVersionMetric | null> {
  const rows = await db
    .select()
    .from(automationVersionMetrics)
    .where(and(eq(automationVersionMetrics.tenantId, tenantId), eq(automationVersionMetrics.automationVersionId, automationVersionId)))
    .orderBy(desc(automationVersionMetrics.asOfDate))
    .limit(1);

  return rows[0] ?? null;
}

export async function getLatestMetricsForVersions(tenantId: string, versionIds: string[]) {
  if (versionIds.length === 0) {
    return new Map<string, AutomationVersionMetric>();
  }

  const rows = await db
    .select()
    .from(automationVersionMetrics)
    .where(and(eq(automationVersionMetrics.tenantId, tenantId), inArray(automationVersionMetrics.automationVersionId, versionIds)))
    .orderBy(desc(automationVersionMetrics.asOfDate));

  const result = new Map<string, AutomationVersionMetric>();
  for (const row of rows) {
    if (!result.has(row.automationVersionId)) {
      result.set(row.automationVersionId, row);
    }
  }
  return result;
}

export async function getOrCreateMetricConfig(
  tenantId: string,
  automationVersionId: string
): Promise<AutomationMetricConfig> {
  const existing = await db
    .select()
    .from(automationMetricConfigs)
    .where(and(eq(automationMetricConfigs.tenantId, tenantId), eq(automationMetricConfigs.automationVersionId, automationVersionId)))
    .limit(1);

  if (existing[0]) {
    return existing[0];
  }

  const [created] = await db
    .insert(automationMetricConfigs)
    .values({
      tenantId,
      automationVersionId,
    })
    .returning();

  return created;
}

export async function upsertMetricConfig(params: MetricConfigInput) {
  const manualSeconds =
    params.manualMinutesPerExecution !== undefined
      ? Math.max(Math.round(params.manualMinutesPerExecution * 60), 0)
      : undefined;
  const hourlyRate = params.hourlyRateUsd !== undefined ? Math.max(params.hourlyRateUsd, 0) : undefined;

  const existing = await getOrCreateMetricConfig(params.tenantId, params.automationVersionId);

  const patch: Partial<typeof automationMetricConfigs.$inferInsert> = {};
  if (manualSeconds !== undefined) {
    patch.manualSecondsPerExecution = manualSeconds;
  }
  if (hourlyRate !== undefined) {
    patch.hourlyRateUsd = hourlyRate.toString();
  }
  if (Object.keys(patch).length === 0) {
    return existing;
  }

  const [updated] = await db
    .update(automationMetricConfigs)
    .set({
      ...patch,
      updatedAt: new Date(),
    })
    .where(eq(automationMetricConfigs.id, existing.id))
    .returning();

  return updated ?? existing;
}

export async function recordDailyMetricSnapshot(params: MetricSnapshotInput) {
  const { tenantId, automationVersionId } = params;

  // Ensure automation version belongs to tenant
  const versionRows = await db
    .select({ id: automationVersions.id, tenantId: automationVersions.tenantId })
    .from(automationVersions)
    .where(and(eq(automationVersions.id, automationVersionId), eq(automationVersions.tenantId, tenantId)))
    .limit(1);

  if (versionRows.length === 0) {
    throw new Error("Automation version not found for tenant");
  }

  const asOfDate = toDateOnly(params.asOfDate ?? new Date()).toISOString().slice(0, 10);
  const config = await getOrCreateMetricConfig(tenantId, automationVersionId);
  const usage = params.usage ?? (await fetchUsageFromWrkPlatform(automationVersionId));
  const latestQuote = await getLatestQuote(automationVersionId, tenantId);

  const manualHoursPerExecution = Number(config.manualSecondsPerExecution ?? 0) / 3600;
  const hoursSaved = usage.totalExecutions * manualHoursPerExecution;
  const manualCost = hoursSaved * Number(config.hourlyRateUsd ?? 0);
  const unitPrice = latestQuote ? Number(latestQuote.unitPrice ?? 0) : 0;
  const spendUsd = usage.spendUsd > 0 ? usage.spendUsd : usage.totalExecutions * unitPrice;
  const estimatedCostSavings = Math.max(manualCost - spendUsd, 0);
  const total = Math.max(usage.totalExecutions, 0);
  const successRate = total > 0 ? (usage.successCount / total) * 100 : 0;

  const previousMonthSnapshot = await getLatestPriorMonthMetric(tenantId, automationVersionId, asOfDate);

  const hoursSavedDeltaPct = computeDeltaPct(hoursSaved, toNumberOrNull(previousMonthSnapshot?.hoursSaved));
  const costSavingsDeltaPct = computeDeltaPct(
    estimatedCostSavings,
    toNumberOrNull(previousMonthSnapshot?.estimatedCostSavings)
  );
  const executionsDeltaPct = computeDeltaPct(total, toNumberOrNull(previousMonthSnapshot?.totalExecutions));
  const successRateDeltaPct = computeDeltaPct(successRate, toNumberOrNull(previousMonthSnapshot?.successRate));
  const spendDeltaPct = computeDeltaPct(spendUsd, toNumberOrNull(previousMonthSnapshot?.spendUsd));

  const insertPayload: typeof automationVersionMetrics.$inferInsert = {
    tenantId,
    automationVersionId,
    asOfDate,
    totalExecutions: total,
    successCount: usage.successCount,
    failureCount: usage.failureCount,
    successRate: successRate.toString(),
    spendUsd: spendUsd.toString(),
    hoursSaved: hoursSaved.toString(),
    estimatedCostSavings: estimatedCostSavings.toString(),
    hoursSavedDeltaPct: hoursSavedDeltaPct === null ? null : hoursSavedDeltaPct.toString(),
    estimatedCostSavingsDeltaPct: costSavingsDeltaPct === null ? null : costSavingsDeltaPct.toString(),
    executionsDeltaPct: executionsDeltaPct === null ? null : executionsDeltaPct.toString(),
    successRateDeltaPct: successRateDeltaPct === null ? null : successRateDeltaPct.toString(),
    spendDeltaPct: spendDeltaPct === null ? null : spendDeltaPct.toString(),
    source: usage.source,
  };

  const [snapshot] = await db
    .insert(automationVersionMetrics)
    .values(insertPayload)
    .onConflictDoUpdate({
      target: [automationVersionMetrics.automationVersionId, automationVersionMetrics.asOfDate],
      set: {
        ...insertPayload,
        updatedAt: new Date(),
      },
    })
    .returning();

  return snapshot;
}

async function getLatestPriorMonthMetric(tenantId: string, automationVersionId: string, asOfDate: string) {
  const monthStart = new Date(`${asOfDate}T00:00:00Z`);
  const rows = await db
    .select()
    .from(automationVersionMetrics)
    .where(
      and(
        eq(automationVersionMetrics.tenantId, tenantId),
        eq(automationVersionMetrics.automationVersionId, automationVersionId),
        lt(automationVersionMetrics.asOfDate, toDateOnly(monthStart).toISOString().slice(0, 10))
      )
    )
    .orderBy(desc(automationVersionMetrics.asOfDate))
    .limit(1);

  return rows[0] ?? null;
}

function computeDeltaPct(current: number, previous?: number | null) {
  if (previous === null || previous === undefined) return null;
  if (previous === 0) return null;
  const delta = ((current - previous) / previous) * 100;
  return Number.isFinite(delta) ? delta : null;
}

async function getLatestQuote(automationVersionId: string, tenantId: string): Promise<Quote | null> {
  const rows = await db
    .select()
    .from(quotes)
    .where(and(eq(quotes.automationVersionId, automationVersionId), eq(quotes.tenantId, tenantId)))
    .orderBy(desc(quotes.createdAt))
    .limit(1);

  return rows[0] ?? null;
}

async function fetchUsageFromWrkPlatform(automationVersionId: string): Promise<UsageSnapshot> {
  const baseUrl = process.env.WRK_PLATFORM_USAGE_URL;
  const apiKey = process.env.WRK_PLATFORM_API_KEY;

  if (!baseUrl) {
    return { totalExecutions: 0, successCount: 0, failureCount: 0, spendUsd: 0, source: "placeholder" };
  }

  try {
    const url = new URL(baseUrl);
    url.searchParams.set("automation_version_id", automationVersionId);
    url.searchParams.set("period", "day");

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: apiKey ? `Bearer ${apiKey}` : "",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`WRK usage fetch failed: ${response.status}`);
    }

    const data = (await response.json()) as Partial<UsageSnapshot> & Record<string, unknown>;
    return {
      totalExecutions: Number(data.totalExecutions ?? data.total_executions ?? 0) || 0,
      successCount: Number(data.successCount ?? data.success_count ?? 0) || 0,
      failureCount: Number(data.failureCount ?? data.failure_count ?? 0) || 0,
      spendUsd: Number(data.spendUsd ?? data.total_cost ?? 0) || 0,
      source: "wrk_platform",
    };
  } catch (error) {
    console.error("Failed to pull WRK usage metrics", error);
    return { totalExecutions: 0, successCount: 0, failureCount: 0, spendUsd: 0, source: "placeholder" };
  }
}

function toDateOnly(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function toNumberOrNull(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : null;
}


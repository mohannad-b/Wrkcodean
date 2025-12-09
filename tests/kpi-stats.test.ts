import { describe, expect, it } from "vitest";
import { buildKpiStats, formatDelta, formatHours, type MetricConfig, type VersionMetric } from "@/lib/metrics/kpi";

const metricSample: VersionMetric = {
  asOfDate: "2024-05-01",
  totalExecutions: 200,
  successRate: 97.2,
  successCount: 194,
  failureCount: 6,
  spendUsd: 320,
  hoursSaved: 150,
  estimatedCostSavings: 3800,
  hoursSavedDeltaPct: 10,
  estimatedCostSavingsDeltaPct: 5.5,
  executionsDeltaPct: 8,
  successRateDeltaPct: -0.2,
  spendDeltaPct: -3,
  source: "test",
};

const configSample: MetricConfig = {
  id: "cfg",
  manualSecondsPerExecution: 600,
  hourlyRateUsd: 55,
  updatedAt: "2024-05-01",
};

describe("buildKpiStats", () => {
  it("returns placeholder values when no metric data", () => {
    const stats = buildKpiStats(null, configSample);
    expect(stats[0].value).toContain("Pending");
    expect(stats[2].value).toContain("Pending");
  });

  it("formats metrics and deltas when data is present", () => {
    const stats = buildKpiStats(metricSample, configSample);
    const hours = stats.find((s) => s.label === "Hours Saved");
    const cost = stats.find((s) => s.label === "Est. Cost Savings");
    const executions = stats.find((s) => s.label === "Total Executions");

    expect(hours?.value).toBe(formatHours(metricSample.hoursSaved));
    expect(cost?.trend).toBe(formatDelta(metricSample.estimatedCostSavingsDeltaPct));
    expect(executions?.value).toBe("200");
  });
});


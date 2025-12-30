import { describe, expect, it } from "vitest";
import { summarizeCounts, toDashboardAutomation, type ApiAutomationSummary } from "@/lib/dashboard/mapper";

const baseAutomation: ApiAutomationSummary = {
  id: "a1",
  name: "Invoice Processing",
  description: "Extract data",
  updatedAt: "2024-01-01T00:00:00Z",
  creator: null,
  latestVersion: {
    id: "v1",
    versionLabel: "v1.0",
    status: "Live",
    updatedAt: "2024-01-02T00:00:00Z",
    latestQuote: null,
    latestMetrics: {
      totalExecutions: 1200,
      successRate: 98.5,
      spendUsd: 450,
    },
  },
};

describe("dashboard mapper", () => {
  it("maps API automation to dashboard card fields", () => {
    const mapped = toDashboardAutomation(baseAutomation);
    expect(mapped).toMatchObject({
      id: "a1",
      name: "Invoice Processing",
      latestVersionId: "v1",
      latestVersionLabel: "v1.0",
      version: "v1.0",
      status: "Live",
      runs: 1200,
      success: 98.5,
      spend: 450,
    });
  });

  it("falls back to defaults when metrics missing", () => {
    const mapped = toDashboardAutomation({ ...baseAutomation, latestVersion: { ...baseAutomation.latestVersion!, latestMetrics: null } });
    expect(mapped.runs).toBe(0);
    expect(mapped.success).toBe(0);
    expect(mapped.spend).toBe(0);
  });

  it("summarizes total, live, and building counts", () => {
    const items = [
      toDashboardAutomation(baseAutomation),
      toDashboardAutomation({ ...baseAutomation, id: "a2", latestVersion: { ...baseAutomation.latestVersion!, status: "BuildInProgress" } }),
    ];
    const summary = summarizeCounts(items);
    expect(summary).toEqual({ total: 2, live: 1, building: 1 });
  });
});


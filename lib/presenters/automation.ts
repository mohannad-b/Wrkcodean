import type { Task } from "@/db/schema";

export function presentTask(task: Task) {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    metadata: task.metadata,
    updatedAt: task.updatedAt,
  };
}

export function presentMetric(metric: { [key: string]: any }) {
  return {
    asOfDate: metric.asOfDate,
    totalExecutions: Number(metric.totalExecutions ?? 0),
    successRate: Number(metric.successRate ?? 0),
    successCount: Number(metric.successCount ?? 0),
    failureCount: Number(metric.failureCount ?? 0),
    spendUsd: Number(metric.spendUsd ?? 0),
    hoursSaved: Number(metric.hoursSaved ?? 0),
    estimatedCostSavings: Number(metric.estimatedCostSavings ?? 0),
    hoursSavedDeltaPct: metric.hoursSavedDeltaPct !== null ? Number(metric.hoursSavedDeltaPct) : null,
    estimatedCostSavingsDeltaPct:
      metric.estimatedCostSavingsDeltaPct !== null ? Number(metric.estimatedCostSavingsDeltaPct) : null,
    executionsDeltaPct: metric.executionsDeltaPct !== null ? Number(metric.executionsDeltaPct) : null,
    successRateDeltaPct: metric.successRateDeltaPct !== null ? Number(metric.successRateDeltaPct) : null,
    spendDeltaPct: metric.spendDeltaPct !== null ? Number(metric.spendDeltaPct) : null,
    source: metric.source ?? "unknown",
  };
}

import { ArrowRight, ArrowUpRight, CheckCircle2, Clock, DollarSign, Zap } from "lucide-react";

export type VersionMetric = {
  asOfDate: string;
  totalExecutions: number;
  successRate: number;
  successCount: number;
  failureCount: number;
  spendUsd: number;
  hoursSaved: number;
  estimatedCostSavings: number;
  hoursSavedDeltaPct: number | null;
  estimatedCostSavingsDeltaPct: number | null;
  executionsDeltaPct: number | null;
  successRateDeltaPct: number | null;
  spendDeltaPct: number | null;
  source?: string | null;
};

export type MetricConfig = {
  id: string;
  manualSecondsPerExecution: number;
  hourlyRateUsd: number;
  updatedAt: string;
};

export type KpiStat = {
  label: string;
  subtext: string;
  icon: typeof Clock;
  value: string;
  trend: string;
  trendPositive: boolean;
  placeholder?: boolean;
  onConfigure?: () => void;
};

export function buildKpiStats(
  metric: VersionMetric | null,
  config?: MetricConfig | null,
  actions?: { onConfigureHours?: () => void; onConfigureCost?: () => void }
): KpiStat[] {
  const hasData = Boolean(metric && (metric.totalExecutions > 0 || metric.spendUsd > 0 || metric.successCount > 0));
  const placeholder = "Pending — populates after first live run";
  const manualMinutes = config ? config.manualSecondsPerExecution / 60 : null;

  return [
    {
      label: "Hours Saved",
      subtext: manualMinutes ? `Assumes ~${manualMinutes.toFixed(1)} min / run` : "Configured effort per run",
      icon: Clock,
      value: hasData ? formatHours(metric?.hoursSaved ?? 0) : placeholder,
      trend: formatDelta(metric?.hoursSavedDeltaPct),
      trendPositive: (metric?.hoursSavedDeltaPct ?? 0) >= 0,
      placeholder: !hasData,
      onConfigure: actions?.onConfigureHours,
    },
    {
      label: "Est. Cost Savings",
      subtext: "vs prior month",
      icon: DollarSign,
      value: hasData ? formatCurrencyValue(metric?.estimatedCostSavings ?? 0) : placeholder,
      trend: formatDelta(metric?.estimatedCostSavingsDeltaPct),
      trendPositive: (metric?.estimatedCostSavingsDeltaPct ?? 0) >= 0,
      placeholder: !hasData,
      onConfigure: actions?.onConfigureCost,
    },
    {
      label: "Total Executions",
      subtext: "Daily snapshot",
      icon: Zap,
      value: hasData ? formatNumber(metric?.totalExecutions ?? 0) : placeholder,
      trend: formatDelta(metric?.executionsDeltaPct),
      trendPositive: (metric?.executionsDeltaPct ?? 0) >= 0,
      placeholder: !hasData,
    },
    {
      label: "Success Rate",
      subtext: "Daily snapshot",
      icon: CheckCircle2,
      value: hasData ? `${(metric?.successRate ?? 0).toFixed(1)}%` : placeholder,
      trend: formatDelta(metric?.successRateDeltaPct),
      trendPositive: (metric?.successRateDeltaPct ?? 0) >= 0,
      placeholder: !hasData,
    },
    {
      label: "Spend",
      subtext: "vs prior month",
      icon: DollarSign,
      value: hasData ? formatCurrencyValue(metric?.spendUsd ?? 0) : placeholder,
      trend: formatDelta(metric?.spendDeltaPct),
      trendPositive: metric?.spendDeltaPct !== null && metric?.spendDeltaPct !== undefined ? metric.spendDeltaPct <= 0 : true,
      placeholder: !hasData,
    },
  ];
}

export function formatDelta(delta?: number | null) {
  if (delta === null || delta === undefined || Number.isNaN(delta)) return "—";
  const rounded = Number(delta.toFixed(1));
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded}%`;
}

export function formatCurrencyValue(value: number) {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

export function formatNumber(value: number) {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString();
}

export function formatHours(value: number) {
  if (!Number.isFinite(value)) return "—";
  if (value < 1) {
    const minutes = Math.round(value * 60);
    return `${minutes}m`;
  }
  return `${value.toFixed(1)}h`;
}

export const ArrowIcons = { ArrowUpRight, ArrowRight };


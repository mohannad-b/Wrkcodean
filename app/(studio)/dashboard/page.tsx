"use client";

import { useEffect, useMemo, useState } from "react";
import { StatCard } from "@/components/ui/StatCard";
import { DashboardAutomationCard } from "@/components/ui/DashboardAutomationCard";
import { ActivityFeedItem } from "@/components/ui/ActivityFeedItem";
import { UsageChart } from "@/components/charts/UsageChart";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowRight,
  ArrowUpRight,
  Plus,
  Zap,
  Filter,
  Search,
  Briefcase,
  ChevronDown,
  AlertTriangle,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { mockActivityFeed, mockUsageData } from "@/lib/mock-dashboard";
import { currentUser } from "@/lib/mock-automations";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { summarizeCounts, toDashboardAutomation, type ApiAutomationSummary } from "@/lib/dashboard/mapper";
import type { DashboardAutomation } from "@/lib/mock-dashboard";
import { buildKpiStats, type KpiStat, type VersionMetric } from "@/lib/metrics/kpi";

export default function DashboardPage() {
  const router = useRouter();
  const [showAlert, setShowAlert] = useState(true);
  const [automations, setAutomations] = useState<DashboardAutomation[]>([]);
  const [automationSummaries, setAutomationSummaries] = useState<ApiAutomationSummary[]>([]);
  const [loadingAutomations, setLoadingAutomations] = useState(true);
  const [automationsError, setAutomationsError] = useState<string | null>(null);

  useEffect(() => {
    const loadAutomations = async () => {
      setLoadingAutomations(true);
      setAutomationsError(null);
      try {
        const response = await fetch("/api/automations", { cache: "no-store" });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error ?? "Failed to load automations");
        }
        const payload = (await response.json()) as { automations: ApiAutomationSummary[] };
        setAutomationSummaries(payload.automations);
        setAutomations(payload.automations.map(toDashboardAutomation));
      } catch (err) {
        setAutomationsError(err instanceof Error ? err.message : "Unable to load automations");
      } finally {
        setLoadingAutomations(false);
      }
    };

    void loadAutomations();
  }, []);

  const { total, live, building } = summarizeCounts(automations);
  const aggregatedMetric = useMemo(() => aggregateMetrics(automationSummaries), [automationSummaries]);
  const kpiStats = useMemo(() => buildKpiStats(aggregatedMetric, null), [aggregatedMetric]);

  return (
    <div className="flex-1 h-full overflow-y-auto bg-gray-50/50">
      <div className="max-w-[1600px] mx-auto p-6 md:p-8 lg:p-12 space-y-8">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 text-gray-500 mb-1">
              <Briefcase size={16} />
              <span className="text-sm font-medium">Acme Corp</span>
              <ChevronDown
                size={14}
                className="cursor-pointer hover:text-black transition-colors"
              />
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-[#0A0A0A] tracking-tight">
              Good afternoon, {currentUser.name.split(" ")[0]}
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/automations/new">
              <Button className="bg-[#E43632] hover:bg-[#C12E2A] text-white shadow-lg shadow-red-500/20 font-bold">
                <Plus className="mr-2 h-4 w-4" />
                New Automation
              </Button>
            </Link>
          </div>
        </header>

        {/* KPI Bar */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-[#0A0A0A]">Automation Impact</h2>
            <p className="text-xs text-gray-500">Aggregated across active automations</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {kpiStats.map((kpi) => (
              <KpiCard key={kpi.label} {...kpi} isLoading={loadingAutomations} />
            ))}
          </div>
        </section>

        {/* Alert Bar */}
        <AnimatePresence>
          {showAlert && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
            >
              <div className="flex items-start gap-3">
                <div className="p-2 bg-amber-100 rounded-lg text-amber-600 shrink-0">
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-amber-900 text-sm">
                    Action Required: Payment Method Expiring
                  </h3>
                  <p className="text-xs text-amber-700 mt-0.5">
                    Your primary card ending in 4242 expires in 3 days. Update now to avoid service
                    interruption.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <Link href="/workspace-settings">
                  <Button
                    size="sm"
                    className="bg-amber-600 hover:bg-amber-700 text-white border-none w-full sm:w-auto"
                  >
                    Update Payment
                  </Button>
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowAlert(false)}
                  className="text-amber-700 hover:bg-amber-100 hidden sm:flex"
                >
                  <X size={16} />
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* LEFT COLUMN (2/3 width on large screens) */}
          <div className="lg:col-span-2 space-y-8">
            {/* Active Automations Grid */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2
                  className="text-lg font-bold text-[#0A0A0A] cursor-pointer hover:text-[#E43632] transition-colors"
                  onClick={() => router.push("/automations")}
                >
                  Active Automations
                </h2>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" className="text-gray-500">
                    <Filter size={16} />
                  </Button>
                  <Button variant="ghost" size="sm" className="text-gray-500">
                    <Search size={16} />
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {loadingAutomations ? (
                  Array.from({ length: 4 }).map((_, idx) => (
                    <div key={idx} className="h-[180px] bg-white border border-gray-200 rounded-xl animate-pulse" />
                  ))
                ) : automationsError ? (
                  <div className="col-span-2 rounded-lg border border-red-200 bg-red-50 text-red-700 p-4 text-sm">
                    {automationsError}
                  </div>
                ) : automations.length === 0 ? (
                  <div className="col-span-2 rounded-lg border border-dashed border-gray-200 bg-white p-6 text-sm text-gray-600">
                    No automations yet. Create one to see metrics here.
                  </div>
                ) : (
                  automations.map((auto) => <DashboardAutomationCard key={auto.id} automation={auto} />)
                )}

                {/* Create New Card */}
                <Link href="/automations/new">
                  <button className="group border-2 border-dashed border-gray-200 rounded-xl p-6 flex flex-col items-center justify-center text-center hover:border-[#E43632]/40 hover:bg-[#E43632]/5 transition-all min-h-[200px] w-full">
                    <div className="w-12 h-12 rounded-full bg-gray-50 group-hover:bg-white flex items-center justify-center mb-4 group-hover:shadow-md transition-all">
                      <Plus className="text-gray-400 group-hover:text-[#E43632]" />
                    </div>
                    <h3 className="font-bold text-gray-900 mb-1">Create New Automation</h3>
                  </button>
                </Link>
              </div>
            </section>

            {/* Usage & Spend Overview */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-[#0A0A0A]">Usage & Spend</h2>
                <Select defaultValue="30d">
                  <SelectTrigger className="h-8 w-[120px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7d">Last 7 Days</SelectItem>
                    <SelectItem value="30d">Last 30 Days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                <div className="h-[250px] w-full mb-6">
                  <UsageChart data={mockUsageData} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 border-t border-gray-50 pt-6">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Total Spend (Oct)</p>
                    <p className="text-2xl font-bold text-[#0A0A0A]">$3,450</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Cost per Unit</p>
                    <p className="text-2xl font-bold text-[#0A0A0A]">$0.024</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Highest Volume</p>
                    <p className="text-sm font-bold text-[#0A0A0A] truncate">Invoice Processing</p>
                    <p className="text-[10px] text-gray-400">14.2k units</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Forecast (Nov)</p>
                    <p className="text-2xl font-bold text-gray-400">~$3,800</p>
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* RIGHT COLUMN (1/3 width on large screens) */}
          <div className="space-y-8">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 gap-6">
              <StatCard
                label="Total Automations"
                value={total}
                icon={<Zap size={18} />}
              />
              <StatCard label="Live" value={live} />
              <StatCard label="Building" value={building} />
            </div>

            {/* Build Activity Feed */}
            <section>
              <h2 className="text-lg font-bold text-[#0A0A0A] mb-4">Build Activity</h2>
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="divide-y divide-gray-100">
                  {mockActivityFeed.map((item) => (
                    <ActivityFeedItem key={item.id} item={item} />
                  ))}
                  <div className="p-2 text-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-gray-400 hover:text-[#0A0A0A] w-full"
                      onClick={() => router.push("/automations")}
                    >
                      View All Activity
                    </Button>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

function aggregateMetrics(automations: ApiAutomationSummary[]): VersionMetric | null {
  const metrics = automations
    .filter((automation) => automation.latestVersion && automation.latestVersion.status !== "Archived")
    .map((automation) => automation.latestVersion?.latestMetrics)
    .filter((metric): metric is NonNullable<ApiAutomationSummary["latestVersion"]>["latestMetrics"] => Boolean(metric));

  if (metrics.length === 0) {
    return null;
  }

  const normalized: VersionMetric[] = metrics.map((metric) => ({
    asOfDate: metric?.asOfDate ?? new Date().toISOString(),
    totalExecutions: Number(metric?.totalExecutions ?? 0),
    successRate: Number(metric?.successRate ?? 0),
    successCount: Number(metric?.successCount ?? 0),
    failureCount: Number(metric?.failureCount ?? 0),
    spendUsd: Number(metric?.spendUsd ?? 0),
    hoursSaved: Number(metric?.hoursSaved ?? 0),
    estimatedCostSavings: Number(metric?.estimatedCostSavings ?? 0),
    hoursSavedDeltaPct: metric?.hoursSavedDeltaPct !== null && metric?.hoursSavedDeltaPct !== undefined ? Number(metric.hoursSavedDeltaPct) : null,
    estimatedCostSavingsDeltaPct:
      metric?.estimatedCostSavingsDeltaPct !== null && metric?.estimatedCostSavingsDeltaPct !== undefined
        ? Number(metric.estimatedCostSavingsDeltaPct)
        : null,
    executionsDeltaPct:
      metric?.executionsDeltaPct !== null && metric?.executionsDeltaPct !== undefined ? Number(metric.executionsDeltaPct) : null,
    successRateDeltaPct:
      metric?.successRateDeltaPct !== null && metric?.successRateDeltaPct !== undefined ? Number(metric.successRateDeltaPct) : null,
    spendDeltaPct: metric?.spendDeltaPct !== null && metric?.spendDeltaPct !== undefined ? Number(metric.spendDeltaPct) : null,
    source: metric?.source ?? "unknown",
  }));

  const sum = (fn: (m: VersionMetric) => number) => normalized.reduce((acc, metric) => acc + fn(metric), 0);
  const latestDate = normalized.reduce<string | null>((latest, metric) => {
    if (!metric.asOfDate) return latest;
    return !latest || new Date(metric.asOfDate) > new Date(latest) ? metric.asOfDate : latest;
  }, null);

  const totalExecutions = sum((m) => m.totalExecutions);
  const successCount = sum((m) =>
    m.successCount || Math.max(0, Math.round((m.successRate / 100) * m.totalExecutions))
  );
  const failureCount = sum((m) =>
    m.failureCount || Math.max(0, m.totalExecutions - (m.successCount || Math.round((m.successRate / 100) * m.totalExecutions)))
  );

  const spendUsd = sum((m) => m.spendUsd);
  const hoursSaved = sum((m) => m.hoursSaved);
  const estimatedCostSavings = sum((m) => m.estimatedCostSavings);

  const successRate = totalExecutions > 0 ? (successCount / totalExecutions) * 100 : 0;
  const averageDelta = (key: keyof VersionMetric) => {
    const values = normalized
      .map((metric) => metric?.[key])
      .filter((value): value is number => value !== null && value !== undefined && !Number.isNaN(Number(value)));
    return values.length ? values.reduce((acc, val) => acc + Number(val), 0) / values.length : null;
  };

  return {
    asOfDate: latestDate ?? new Date().toISOString(),
    totalExecutions,
    successRate,
    successCount,
    failureCount,
    spendUsd,
    hoursSaved,
    estimatedCostSavings,
    hoursSavedDeltaPct: averageDelta("hoursSavedDeltaPct"),
    estimatedCostSavingsDeltaPct: averageDelta("estimatedCostSavingsDeltaPct"),
    executionsDeltaPct: averageDelta("executionsDeltaPct"),
    successRateDeltaPct: averageDelta("successRateDeltaPct"),
    spendDeltaPct: averageDelta("spendDeltaPct"),
    source: "aggregate",
  };
}

function KpiCard({
  icon: Icon,
  label,
  value,
  trend,
  trendPositive,
  subtext,
  placeholder,
  isLoading,
}: KpiStat & { isLoading?: boolean }) {
  const pillClass = placeholder
    ? "text-gray-400 bg-gray-100"
    : trendPositive
      ? "text-emerald-700 bg-emerald-50"
      : "text-amber-700 bg-amber-50";

  return (
    <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-[0_2px_8px_rgba(0,0,0,0.02)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.04)] transition-all group">
      <div className="flex items-start justify-between mb-4 gap-2 min-w-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 bg-gray-50 rounded-lg group-hover:bg-red-50 group-hover:text-[#E43632] transition-colors text-gray-400">
            <Icon size={18} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#0A0A0A] whitespace-nowrap">{label}</p>
            <p className="text-[10px] text-gray-400 mt-0.5 whitespace-nowrap">{subtext}</p>
          </div>
        </div>
        {!placeholder ? (
          <div className={cn("flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full", pillClass)}>
            {trendPositive ? <ArrowUpRight size={10} /> : <ArrowRight size={10} className="rotate-45" />}
            {trend}
          </div>
        ) : null}
      </div>
      {placeholder ? (
        <div className="flex flex-col items-center justify-center text-gray-400 gap-2 py-2">
          <div className="h-6 w-6 rounded-full border-2 border-dashed border-gray-300 animate-spin" />
          <p className="text-[11px] font-medium">populates after first live run</p>
        </div>
      ) : (
        <div>
          <h3 className={cn("text-2xl font-bold mb-1 tracking-tight", placeholder ? "text-gray-400" : "text-[#0A0A0A]")}>
            {isLoading ? "Refreshing..." : value}
          </h3>
        </div>
      )}
    </div>
  );
}

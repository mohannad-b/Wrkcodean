"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardAutomationCard } from "@/components/ui/DashboardAutomationCard";
import { ActivityFeedItem } from "@/components/ui/ActivityFeedItem";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  ArrowRight,
  ArrowUpRight,
  Plus,
  Filter,
  Search,
  Briefcase,
  ChevronDown,
  X,
} from "lucide-react";
import { logger } from "@/lib/logger";
import type { ActivityItem } from "@/lib/mock-dashboard";
import { useUserProfile } from "@/components/providers/user-profile-provider";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toDashboardAutomation, type ApiAutomationSummary } from "@/lib/dashboard/mapper";
import type { DashboardAutomation } from "@/lib/mock-dashboard";
import { buildKpiStats, type KpiStat, type VersionMetric } from "@/lib/metrics/kpi";
import { getStatusLabel, KANBAN_COLUMNS, resolveStatus } from "@/lib/submissions/lifecycle";
import { fetchCurrentWorkspaceOnce, fetchTenantMembershipsOnce } from "@/lib/workspaces/client-cache";

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  ...KANBAN_COLUMNS.flatMap((column) =>
    column.statuses.map((status) => ({
      value: status,
      label: getStatusLabel(status),
    }))
  ),
];

type TenantMembership = {
  tenantId: string;
  tenantName: string;
  tenantSlug?: string;
  role: string;
};

export default function DashboardPage() {
  const router = useRouter();
  const { profile } = useUserProfile();
  const [automations, setAutomations] = useState<DashboardAutomation[]>([]);
  const [automationSummaries, setAutomationSummaries] = useState<ApiAutomationSummary[]>([]);
  const [loadingAutomations, setLoadingAutomations] = useState(true);
  const [isRefreshingAutomations, setIsRefreshingAutomations] = useState(false);
  const [automationsLastUpdated, setAutomationsLastUpdated] = useState<Date | null>(null);
  const [automationsError, setAutomationsError] = useState<string | null>(null);
  const [tenantMemberships, setTenantMemberships] = useState<TenantMembership[]>([]);
  const [currentTenant, setCurrentTenant] = useState<{ id: string; name: string } | null>(null);
  const [loadingTenants, setLoadingTenants] = useState(true);
  const [activityFeed, setActivityFeed] = useState<ActivityItem[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set(["all"]));
  const [showSearch, setShowSearch] = useState(false);
  const [showFilter, setShowFilter] = useState(false);

  const loadAutomations = useCallback(async () => {
    setLoadingAutomations(true);
    setIsRefreshingAutomations(true);
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
      setAutomationsLastUpdated(new Date());
    } catch (err) {
      setAutomationsError(err instanceof Error ? err.message : "Unable to load automations");
    } finally {
      setLoadingAutomations(false);
      setIsRefreshingAutomations(false);
    }
  }, []);

  useEffect(() => {
    void loadAutomations();
  }, [loadAutomations]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void loadAutomations();
      }
    };

    const handleFocus = () => {
      void loadAutomations();
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [loadAutomations]);

  useEffect(() => {
    const loadTenants = async () => {
      setLoadingTenants(true);
      try {
        const [tenants, workspace] = await Promise.all([fetchTenantMembershipsOnce(), fetchCurrentWorkspaceOnce()]);
        setTenantMemberships(tenants);
        if (workspace) {
          setCurrentTenant({ id: workspace.id, name: workspace.name });
        }
      } catch (err) {
        logger.error("[dashboard] failed to load tenant info", err);
      } finally {
        setLoadingTenants(false);
      }
    };

    void loadTenants();
  }, []);

  useEffect(() => {
    const loadActivity = async () => {
      setLoadingActivity(true);
      try {
        const response = await fetch("/api/dashboard/activity?limit=10", { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Failed to load activity");
        }
        const data = (await response.json()) as {
          activities: Array<{
            id: string;
            action: string;
            displayText: string;
            user: string;
            userAvatarUrl: string | null;
            userFirstName: string | null;
            userLastName: string | null;
            timestamp: string;
          }>;
        };
        // Convert API response to ActivityItem format
        const formattedActivities: ActivityItem[] = data.activities.map((activity, index) => ({
          id: index + 1,
          user: activity.user,
          avatar: activity.userAvatarUrl || "",
          action: activity.action,
          target: activity.displayText,
          time: formatRelativeTime(activity.timestamp),
          // Include extended fields for ActivityFeedItem compatibility
          userAvatarUrl: activity.userAvatarUrl,
          userFirstName: activity.userFirstName,
          userLastName: activity.userLastName,
        } as ActivityItem & { userAvatarUrl?: string | null; userFirstName?: string | null; userLastName?: string | null }));
        setActivityFeed(formattedActivities);
      } catch (err) {
      logger.error("[dashboard] failed to load activity", err);
        setActivityFeed([]);
      } finally {
        setLoadingActivity(false);
      }
    };

    void loadActivity();
  }, []);

  const handleTenantSwitch = async (tenantId: string) => {
    try {
      const response = await fetch("/api/auth/switch-workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenant_id: tenantId }),
      });

      if (!response.ok) {
        throw new Error("Failed to switch workspace");
      }

      // Reload the page to update the session
      window.location.reload();
    } catch (err) {
    logger.error("[dashboard] failed to switch tenant", err);
    }
  };

  const getUserFirstName = () => {
    if (profile?.firstName) return profile.firstName;
    if (profile?.name) return profile.name.split(" ")[0];
    return "there";
  };

  const formatRelativeTime = (timestamp: string): string => {
    const now = new Date();
    const time = new Date(timestamp);
    const diffInSeconds = Math.floor((now.getTime() - time.getTime()) / 1000);

    if (diffInSeconds < 60) {
      return "just now";
    }

    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) {
      return `${diffInMinutes}m ago`;
    }

    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) {
      return `${diffInHours}h ago`;
    }

    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) {
      return `${diffInDays}d ago`;
    }

    const diffInWeeks = Math.floor(diffInDays / 7);
    if (diffInWeeks < 4) {
      return `${diffInWeeks}w ago`;
    }

    const diffInMonths = Math.floor(diffInDays / 30);
    return `${diffInMonths}mo ago`;
  };

  const aggregatedMetric = useMemo(() => aggregateMetrics(automationSummaries), [automationSummaries]);
  const kpiStats = useMemo(() => buildKpiStats(aggregatedMetric, null), [aggregatedMetric]);

  const formatLastUpdated = (date: Date) => {
    const diffMs = Date.now() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 45) return "just now";
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour}h ago`;
    const diffDay = Math.floor(diffHour / 24);
    if (diffDay < 7) return `${diffDay}d ago`;
    const diffWeek = Math.floor(diffDay / 7);
    return `${diffWeek}w ago`;
  };

  // Filter automations based on search and status filter
  const filteredAutomations = useMemo(() => {
    return automations.filter((auto) => {
      const searchLower = searchQuery.trim().toLowerCase();
      const matchesSearch =
        searchLower === "" ||
        auto.name.toLowerCase().includes(searchLower) ||
        (auto.description && auto.description.toLowerCase().includes(searchLower)) ||
        auto.version.toLowerCase().includes(searchLower);

      const normalizedStatus =
        resolveStatus(auto.statusEnum ?? "IntakeInProgress") ?? (auto.statusEnum as string) ?? "IntakeInProgress";
      const matchesStatus = statusFilter.has("all") || statusFilter.has(normalizedStatus);

      return matchesSearch && matchesStatus;
    });
  }, [automations, searchQuery, statusFilter]);

  return (
    <div className="flex-1 h-full overflow-y-auto bg-gray-50/50">
      <div className="max-w-[1600px] mx-auto p-6 md:p-8 lg:p-12 space-y-8">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 text-gray-500 mb-1">
              <Briefcase size={16} />
              {loadingTenants ? (
                <span className="text-sm font-medium">Loading...</span>
              ) : currentTenant ? (
                tenantMemberships.length > 1 ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="flex items-center gap-1 text-sm font-medium hover:text-black transition-colors">
                        <span>{currentTenant.name}</span>
                        <ChevronDown size={14} />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-56">
                      {tenantMemberships.map((membership) => (
                        <DropdownMenuItem
                          key={membership.tenantId}
                          onClick={() => handleTenantSwitch(membership.tenantId)}
                          className={membership.tenantId === currentTenant.id ? "bg-gray-50" : ""}
                        >
                          <div className="flex flex-col">
                            <span className="font-medium">{membership.tenantName}</span>
                            {membership.tenantId !== currentTenant.id && (
                              <span className="text-xs text-gray-500">{membership.role.replace("_", " ")}</span>
                            )}
                          </div>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <span className="text-sm font-medium">{currentTenant.name}</span>
                )
              ) : (
                <span className="text-sm font-medium">Workspace</span>
              )}
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-[#0A0A0A] tracking-tight">
              Good afternoon, {getUserFirstName()}
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
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 text-[11px] text-gray-500">
                    <span
                      aria-hidden
                      className={cn(
                        "h-2 w-2 rounded-full",
                        isRefreshingAutomations ? "bg-emerald-500 animate-pulse" : "bg-gray-300"
                      )}
                    />
                    <span>
                      {isRefreshingAutomations
                        ? "Refreshing..."
                        : automationsLastUpdated
                          ? `Updated ${formatLastUpdated(automationsLastUpdated)}`
                          : "Loading..."}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 bg-white rounded-lg border border-gray-200 shadow-sm p-1.5">
                  <Popover open={showFilter} onOpenChange={setShowFilter}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn(
                          "h-8 px-3 text-gray-500 bg-white border-transparent hover:bg-gray-50 hover:border-gray-200 shadow-none",
                          statusFilter.size > 1 || (statusFilter.size === 1 && !statusFilter.has("all"))
                            ? "text-[#E43632] bg-red-50 hover:bg-red-100 border-red-100"
                            : ""
                        )}
                      >
                        <Filter size={16} />
                        {statusFilter.size > 1 || (statusFilter.size === 1 && !statusFilter.has("all")) ? (
                          <span className="ml-1 text-xs font-semibold">
                            {statusFilter.has("all") ? statusFilter.size - 1 : statusFilter.size}
                          </span>
                        ) : null}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-56 p-2 !bg-white">
                      <div className="space-y-1">
                        <div className="px-2 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          Filter by Status
                        </div>
                        {STATUS_OPTIONS.map((option) => (
                          <button
                            key={option.value}
                            onClick={() => {
                              const newFilter = new Set(statusFilter);
                              if (option.value === "all") {
                                if (newFilter.has("all")) {
                                  newFilter.clear();
                                  newFilter.add("all");
                                } else {
                                  newFilter.clear();
                                  newFilter.add("all");
                                }
                              } else {
                                newFilter.delete("all");
                                if (newFilter.has(option.value)) {
                                  newFilter.delete(option.value);
                                  if (newFilter.size === 0) {
                                    newFilter.add("all");
                                  }
                                } else {
                                  newFilter.add(option.value);
                                }
                              }
                              setStatusFilter(newFilter);
                            }}
                            className={cn(
                              "w-full text-left px-2 py-1.5 text-sm rounded-md hover:bg-gray-50 flex items-center gap-2",
                              statusFilter.has(option.value) ? "bg-gray-100 font-medium" : ""
                            )}
                          >
                            <div
                              className={cn(
                                "w-4 h-4 rounded border-2 flex items-center justify-center",
                                statusFilter.has(option.value)
                                  ? "bg-[#E43632] border-[#E43632]"
                                  : "border-gray-300"
                              )}
                            >
                              {statusFilter.has(option.value) && (
                                <div className="w-2 h-2 bg-white rounded-sm" />
                              )}
                            </div>
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>

                  <Popover open={showSearch} onOpenChange={setShowSearch}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn(
                          "h-8 px-3 text-gray-500 bg-white border-transparent hover:bg-gray-50 hover:border-gray-200 shadow-none",
                          searchQuery.trim() !== "" ? "text-[#E43632] bg-red-50 hover:bg-red-100 border-red-100" : ""
                        )}
                      >
                        <Search size={16} />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-80 p-3 !bg-white">
                      <div className="space-y-2">
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                          Search Automations
                        </div>
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                          <Input
                            placeholder="Search by name, description, or version..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 pr-9 h-9"
                            autoFocus
                          />
                          {searchQuery && (
                            <button
                              onClick={() => setSearchQuery("")}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                            >
                              <X size={14} />
                            </button>
                          )}
                        </div>
                        {searchQuery && (
                          <div className="text-xs text-gray-500 pt-1">
                            {filteredAutomations.length} result{filteredAutomations.length !== 1 ? "s" : ""} found
                          </div>
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
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
                ) : (
                  <>
                    {/* Create New Card - First in grid */}
                    <Link href="/automations/new">
                      <button className="group relative border-2 border-dashed border-gray-200 rounded-xl p-6 flex flex-col items-center justify-center text-center hover:border-[#E43632]/40 hover:bg-[#E43632]/5 transition-all min-h-[200px] w-full overflow-hidden">
                        {/* Background Image/Pattern */}
                        <div className="absolute inset-0 opacity-5 group-hover:opacity-10 transition-opacity">
                          <div
                            className="w-full h-full"
                            style={{
                              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23E43632' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
                              backgroundSize: "60px 60px",
                            }}
                          />
                        </div>
                        <div className="relative z-10 w-12 h-12 rounded-full bg-gray-50 group-hover:bg-white flex items-center justify-center mb-4 group-hover:shadow-md transition-all">
                          <Plus className="text-gray-400 group-hover:text-[#E43632]" />
                        </div>
                        <h3 className="relative z-10 font-bold text-gray-900 mb-1">Create New Automation</h3>
                      </button>
                    </Link>

                    {/* Filtered Automation Cards */}
                    {filteredAutomations.length === 0 && !loadingAutomations ? (
                      <div className="col-span-1 md:col-span-1 rounded-lg border border-dashed border-gray-200 bg-white p-6 text-sm text-gray-600 flex items-center justify-center min-h-[200px]">
                        {searchQuery || (statusFilter.size > 0 && !statusFilter.has("all")) ? (
                          <div className="text-center">
                            <p className="font-medium text-gray-900 mb-1">No automations match your filters</p>
                            <p className="text-xs text-gray-500">
                              Try adjusting your search or filter criteria
                            </p>
                          </div>
                        ) : (
                          <div className="text-center">
                            <p className="font-medium text-gray-900 mb-1">No automations yet</p>
                            <p className="text-xs text-gray-500">Create one to see metrics here</p>
                          </div>
                        )}
                      </div>
                    ) : (
                      filteredAutomations.map((auto) => <DashboardAutomationCard key={auto.id} automation={auto} />)
                    )}
                  </>
                )}
              </div>
            </section>
          </div>

          {/* RIGHT COLUMN (1/3 width on large screens) */}
          <div className="space-y-8">
            {/* Build Activity Feed */}
            <section>
              <h2 className="text-lg font-bold text-[#0A0A0A] mb-4">Build Activity</h2>
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                {loadingActivity ? (
                  <div className="p-4 space-y-4">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="animate-pulse flex gap-3">
                        <div className="h-8 w-8 rounded-full bg-gray-200" />
                        <div className="flex-1 space-y-2">
                          <div className="h-3 bg-gray-200 rounded w-3/4" />
                          <div className="h-3 bg-gray-200 rounded w-1/2" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : activityFeed.length === 0 ? (
                  <div className="p-6 text-center text-sm text-gray-500">
                    No activity yet. Start building automations to see updates here.
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {activityFeed.map((item) => (
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
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

function toDashboardMetrics(metric?: Partial<VersionMetric> | null): VersionMetric {
  return {
    asOfDate: metric?.asOfDate ?? new Date().toISOString(),
    totalExecutions: Number(metric?.totalExecutions ?? 0),
    successRate: Number(metric?.successRate ?? 0),
    successCount: Number(metric?.successCount ?? 0),
    failureCount: Number(metric?.failureCount ?? 0),
    spendUsd: Number(metric?.spendUsd ?? 0),
    hoursSaved: Number(metric?.hoursSaved ?? 0),
    estimatedCostSavings: Number(metric?.estimatedCostSavings ?? 0),
    hoursSavedDeltaPct: metric?.hoursSavedDeltaPct ?? null,
    estimatedCostSavingsDeltaPct: metric?.estimatedCostSavingsDeltaPct ?? null,
    executionsDeltaPct: metric?.executionsDeltaPct ?? null,
    successRateDeltaPct: metric?.successRateDeltaPct ?? null,
    spendDeltaPct: metric?.spendDeltaPct ?? null,
    source: metric?.source ?? "unknown",
  };
}

function aggregateMetrics(automations: ApiAutomationSummary[]): VersionMetric | null {
  const metrics = automations
    .filter((automation) => automation.latestVersion && automation.latestVersion.status !== "Archived")
    .map((automation) => toDashboardMetrics(automation.latestVersion?.latestMetrics));

  if (metrics.length === 0) {
    return null;
  }

  const sum = (fn: (m: VersionMetric) => number) => metrics.reduce((acc, metric) => acc + fn(metric), 0);
  const latestDate = metrics.reduce<string | null>((latest, metric) => {
    if (!metric.asOfDate) return latest;
    return !latest || new Date(metric.asOfDate) > new Date(latest) ? metric.asOfDate : latest;
  }, null);

  const totalExecutions = sum((m) => m.totalExecutions);
  const successCount = sum((m) => m.successCount);
  const failureCount = sum((m) => m.failureCount);
  const spendUsd = sum((m) => m.spendUsd);
  const hoursSaved = sum((m) => m.hoursSaved);
  const estimatedCostSavings = sum((m) => m.estimatedCostSavings);

  const successRate = totalExecutions > 0 ? (successCount / totalExecutions) * 100 : 0;
  const average = (values: Array<number | null>) => {
    const valid = values.filter((v): v is number => v !== null && Number.isFinite(v));
    if (valid.length === 0) return null;
    return valid.reduce((acc, v) => acc + v, 0) / valid.length;
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
    hoursSavedDeltaPct: average(metrics.map((m) => m.hoursSavedDeltaPct)),
    estimatedCostSavingsDeltaPct: average(metrics.map((m) => m.estimatedCostSavingsDeltaPct)),
    executionsDeltaPct: average(metrics.map((m) => m.executionsDeltaPct)),
    successRateDeltaPct: average(metrics.map((m) => m.successRateDeltaPct)),
    spendDeltaPct: average(metrics.map((m) => m.spendDeltaPct)),
    source: metrics[0]?.source ?? "unknown",
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

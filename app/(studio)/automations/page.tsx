"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { RefreshCw, Plus, AlertCircle, Search, Filter, LayoutGrid, List as ListIcon, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AutomationGrid } from "@/components/ui/AutomationGrid";
import { AutomationList } from "@/components/ui/AutomationList";
import type { AutomationSummary as LegacyAutomationSummary, AutomationStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { AutomationLifecycleStatus } from "@/lib/automations/status";

type ApiAutomationSummary = {
  id: string;
  name: string;
  description: string | null;
  updatedAt: string | null;
  latestVersion: {
    id: string;
    versionLabel: string;
    status: AutomationLifecycleStatus;
    intakeNotes: string | null;
    updatedAt: string | null;
    latestQuote: {
      id: string;
      status: string;
      setupFee: string | null;
      unitPrice: string | null;
      updatedAt: string | null;
    } | null;
  } | null;
};

type QuoteFilter = "ALL" | "NO_QUOTE" | "DRAFT" | "SENT" | "SIGNED";
type StatusChipValue = AutomationLifecycleStatus | "ALL" | "BLOCKED";

const STATUS_FILTERS: Array<{ label: string; value: StatusChipValue; helper?: string }> = [
  { label: "All Automations", value: "ALL" },
  { label: "Intake in Progress", value: "DRAFT" },
  { label: "Needs Pricing", value: "NEEDS_PRICING" },
  { label: "Build in Progress", value: "READY_TO_BUILD" },
  { label: "Live", value: "LIVE" },
  {
    label: "Blocked",
    value: "BLOCKED",
    helper: "No blocked automations yet",
    // TODO: replace mock Blocked filter once automations have a BLOCKED lifecycle status.
  },
];

const QUOTE_STATUS_FILTERS: QuoteFilter[] = ["DRAFT", "SENT", "SIGNED"];

const formatQuoteFilterLabel = (value: QuoteFilter) => {
  if (value === "NO_QUOTE") {
    return "No quote";
  }
  if (value === "ALL") {
    return "All quotes";
  }
  return value
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const mapStatusForCards = (status: AutomationLifecycleStatus): AutomationStatus => {
  switch (status) {
    case "NEEDS_PRICING":
      return "Needs Pricing";
    case "READY_TO_BUILD":
      return "Build in Progress";
    case "LIVE":
      return "Live";
    case "DRAFT":
    default:
      return "Intake in Progress";
  }
};

const getPlaceholderAvatar = (name: string) =>
  `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}&backgroundType=gradientLinear`;

const MOCK_OWNER_POOL = [
  { name: "Ava Chen", role: "Automation PM" },
  { name: "Noah Patel", role: "Solutions Lead" },
  { name: "Isabelle Torres", role: "Commercial Ops" },
  { name: "Leo Park", role: "Builder" },
  { name: "Monica Ruiz", role: "Automation Strategist" },
];

const hashString = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

const getMockOwnerProfile = (automationId: string) => {
  const index = hashString(automationId) % MOCK_OWNER_POOL.length;
  const profile = MOCK_OWNER_POOL[index];

  return {
    id: `${automationId}-owner`,
    name: profile.name,
    email: `${profile.name.toLowerCase().replace(/\s+/g, ".")}@wrk.com`,
    avatar: getPlaceholderAvatar(profile.name),
  };
};

const getMockAutomationMetrics = (automationId: string) => {
  const seed = hashString(automationId);
  return {
    runs: 180 + (seed % 320),
    success: 92 + (seed % 6),
    spend: 2500 + (seed % 4500),
    progress: 40 + (seed % 50),
  };
};
// TODO: Replace mock owner + metric data with real usage insights once available from analytics service.

export default function AutomationsPage() {
  const [automations, setAutomations] = useState<ApiAutomationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [statusFilter, setStatusFilter] = useState<StatusChipValue>("ALL");
  const [quoteFilter, setQuoteFilter] = useState<QuoteFilter>("ALL");

  const fetchAutomations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/automations", { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Failed to load automations");
      }
      const data = (await response.json()) as { automations: ApiAutomationSummary[] };
      setAutomations(data.automations);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAutomations();
  }, [fetchAutomations]);

  const filteredAutomations = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const sorted = [...automations].sort((a, b) => {
      const aTime = new Date(a.latestVersion?.updatedAt ?? a.updatedAt ?? 0).getTime();
      const bTime = new Date(b.latestVersion?.updatedAt ?? b.updatedAt ?? 0).getTime();
      return bTime - aTime;
    });

    return sorted
      .filter((automation) => {
        if (!normalizedQuery) return true;
        return (
          automation.name.toLowerCase().includes(normalizedQuery) ||
          (automation.description ?? "").toLowerCase().includes(normalizedQuery)
        );
      })
      .filter((automation) => {
        const status = automation.latestVersion?.status ?? "DRAFT";
        if (statusFilter === "ALL") return true;
        if (statusFilter === "BLOCKED") {
          return false;
        }
        return status === statusFilter;
      })
      .filter((automation) => {
        const quoteStatus = automation.latestVersion?.latestQuote?.status ?? null;
        if (quoteFilter === "ALL") return true;
        if (quoteFilter === "NO_QUOTE") {
          return !quoteStatus;
        }
        return quoteStatus === quoteFilter;
      });
  }, [automations, searchQuery, statusFilter, quoteFilter]);

  const presentationData: LegacyAutomationSummary[] = filteredAutomations.map((automation) => {
    const version = automation.latestVersion;
    const status = mapStatusForCards(version?.status ?? "DRAFT");
    const owner = getMockOwnerProfile(automation.id);
    const metrics = getMockAutomationMetrics(automation.id);
    const spend = version?.latestQuote?.setupFee ? Number(version.latestQuote.setupFee) : metrics.spend;

    return {
      id: automation.id,
      name: automation.name,
      description: automation.description ?? "No description yet.",
      department: version?.versionLabel ?? "Automation",
      owner,
      version: version?.versionLabel ?? "v1.0",
      status,
      runs: metrics.runs,
      success: metrics.success,
      spend,
      updated: version?.updatedAt ?? automation.updatedAt ?? new Date().toISOString(),
      progress: status === "Build in Progress" ? metrics.progress : undefined,
    };
  });

  const hasAutomations = automations.length > 0;
  const hasActiveFilters = Boolean(searchQuery.trim()) || statusFilter !== "ALL" || quoteFilter !== "ALL";
  const emptyTitle = hasAutomations || hasActiveFilters ? "No automations found" : "No automations yet";
  const emptyDescription = hasAutomations || hasActiveFilters
    ? "Try adjusting your search or filters."
    : "Get started by creating your first automation or importing a process.";

  return (
    <div className="flex-1 h-full overflow-y-auto bg-gray-50/50">
      <div className="max-w-[1600px] mx-auto p-6 md:p-10 space-y-8">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-[#0A0A0A] tracking-tight mb-1">Automations</h1>
            <p className="text-gray-500 text-sm font-medium">Manage your organization&apos;s workflows and bots.</p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={fetchAutomations} disabled={loading}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Link href="/automations/new">
              <Button className="bg-[#E43632] hover:bg-[#C12E2A] text-white shadow-lg shadow-red-500/20 font-semibold">
                <Plus className="mr-2 h-4 w-4" />
                New Automation
              </Button>
            </Link>
          </div>
        </header>

        {error ? (
          <div className="flex items-center gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4" />
            <span>{error}</span>
          </div>
        ) : null}

        <div className="space-y-4">
          <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="relative flex-1 md:w-80">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Search automations..."
                  className="pl-9 bg-white border-gray-200 focus-visible:ring-[#E43632]"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
              </div>
              <Select value={quoteFilter} onValueChange={(value) => setQuoteFilter(value as QuoteFilter)}>
                <SelectTrigger className="w-44 bg-white border-gray-200">
                  <SelectValue placeholder="Quote status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">{formatQuoteFilterLabel("ALL")}</SelectItem>
                  <SelectItem value="NO_QUOTE">{formatQuoteFilterLabel("NO_QUOTE")}</SelectItem>
                  {QUOTE_STATUS_FILTERS.map((status) => (
                    <SelectItem key={status} value={status}>
                      {formatQuoteFilterLabel(status)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" className="shrink-0 bg-white border-gray-200" aria-label="Additional filters">
                <Filter size={16} className="text-gray-500" />
              </Button>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-1 flex items-center gap-1">
              <button
                onClick={() => setViewMode("grid")}
                aria-label="Grid view"
                aria-pressed={viewMode === "grid"}
                className={cn(
                  "p-1.5 rounded-md transition-all flex items-center justify-center",
                  viewMode === "grid" ? "bg-gray-100 text-[#0A0A0A] shadow-sm" : "text-gray-400 hover:text-gray-600"
                )}
              >
                <LayoutGrid size={16} />
              </button>
              <button
                onClick={() => setViewMode("list")}
                aria-label="List view"
                aria-pressed={viewMode === "list"}
                className={cn(
                  "p-1.5 rounded-md transition-all flex items-center justify-center",
                  viewMode === "list" ? "bg-gray-100 text-[#0A0A0A] shadow-sm" : "text-gray-400 hover:text-gray-600"
                )}
              >
                <ListIcon size={16} />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {STATUS_FILTERS.map((chip) => (
              <button
                key={chip.value}
                onClick={() => setStatusFilter(chip.value)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-medium border transition-all whitespace-nowrap",
                  statusFilter === chip.value
                    ? "bg-[#0A0A0A] text-white border-[#0A0A0A]"
                    : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                )}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-36 w-full rounded-2xl bg-white" />
            ))}
          </div>
        ) : presentationData.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-xl border border-dashed border-gray-200">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
              <Zap size={24} className="text-gray-300" />
            </div>
            <h3 className="text-lg font-bold text-[#0A0A0A] mb-1">{emptyTitle}</h3>
            <p className="text-sm text-gray-500 max-w-xs mb-6">{emptyDescription}</p>
            <Link href="/automations/new">
              <Button className="bg-[#E43632] hover:bg-[#C12E2A] text-white">Create Automation</Button>
            </Link>
          </div>
        ) : viewMode === "grid" ? (
          <AutomationGrid automations={presentationData} />
        ) : (
          <div className="space-y-4">
            <AutomationList automations={presentationData} />
          </div>
        )}
      </div>
    </div>
  );
}

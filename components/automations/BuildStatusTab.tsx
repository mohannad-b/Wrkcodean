"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { NeedsAttentionCard } from "@/components/automations/NeedsAttentionCard";
import { cn } from "@/lib/utils";
import {
  BUILD_STATUS_LABELS,
  BUILD_STATUS_ORDER,
  BuildStatus,
  DEFAULT_BUILD_STATUS,
} from "@/lib/build-status/types";
import type { AutomationLifecycleStatus } from "@/lib/automations/status";
import { getAttentionTasks, type AutomationTask } from "@/lib/automations/tasks";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  FileSignature,
  Hammer,
  MessageSquare,
  Rocket,
} from "lucide-react";

interface BuildStatusTabProps {
  status?: AutomationLifecycleStatus | null;
  latestQuote?: {
    status: string;
    setupFee: string | null;
    unitPrice: string | null;
    estimatedVolume: number | null;
    updatedAt: string;
  } | null;
  lastUpdated?: string | null;
  versionLabel?: string;
  tasks?: AutomationTask[];
}

const BUILD_STAGE_SUMMARY: Record<BuildStatus, string> = {
  IntakeInProgress: "Collecting requirements and shaping the automation scope.",
  NeedsPricing: "Commercial team is preparing pricing details and the initial quote.",
  AwaitingClientApproval: "Quote has been delivered and is awaiting client approval.",
  BuildInProgress: "Build team is implementing the approved blueprint and integrations.",
  QATesting: "QA is validating flows, data paths, and go-live readiness.",
  Live: "Automation is deployed and running in production.",
};

const formatCurrency = (value?: string | null) => {
  if (!value) return "—";
  const next = Number(value);
  return Number.isFinite(next) ? `$${next.toLocaleString()}` : value;
};

const formatUnitPrice = (value?: string | null) => {
  if (!value) return "—";
  const next = Number(value);
  return Number.isFinite(next) ? `$${next.toFixed(3)}` : value;
};

const formatTimestamp = (value?: string | null) => {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  } catch {
    return value;
  }
};

const resolveBuildStatus = (status?: AutomationLifecycleStatus | null): BuildStatus => {
  if (!status || status === "Archived") {
    return DEFAULT_BUILD_STATUS;
  }
  return (BUILD_STATUS_ORDER as AutomationLifecycleStatus[]).includes(status) ? (status as BuildStatus) : DEFAULT_BUILD_STATUS;
};

const STAGE_ICONS: Record<BuildStatus, React.ComponentType<{ size?: number | string }>> = {
  IntakeInProgress: CheckCircle2,
  NeedsPricing: CheckCircle2,
  AwaitingClientApproval: FileSignature,
  BuildInProgress: Hammer,
  QATesting: Check,
  Live: Rocket,
};

export function BuildStatusTab({ status, latestQuote, lastUpdated, versionLabel, tasks = [] }: BuildStatusTabProps) {
  const currentStatus = resolveBuildStatus(status);
  const currentIndex = BUILD_STATUS_ORDER.indexOf(currentStatus);
  const attentionTasks = getAttentionTasks(tasks);
  const onTrack = currentIndex >= BUILD_STATUS_ORDER.indexOf("BuildInProgress");
  const versionDisplay = versionLabel ? `Version ${versionLabel}` : "Version";
  const estimatedVolume = latestQuote?.estimatedVolume ?? 15000;
  const unitPrice = latestQuote?.unitPrice ?? "0.040";
  const previousUnitPrice = Number(unitPrice) > 0 ? Number(unitPrice) - 0.002 : 0.038;

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="max-w-6xl mx-auto p-8 pb-24 space-y-8">
        <Card className="p-6 space-y-5 border-gray-200 shadow-sm">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <h2 className="text-3xl font-bold text-[#0A0A0A] leading-tight">{versionDisplay}</h2>
                <Badge variant="secondary" className="bg-[#E8F0FF] text-[#2B64E3] text-xs px-3 py-1.5 rounded-full">
                  Awaiting Approval
                </Badge>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <span className="text-lg">↳</span>
                <span>
                  Created from <span className="font-semibold text-[#0A0A0A]">{versionLabel ? `v${versionLabel}` : "v1.0"}</span>
                </span>
                <button className="text-sm font-semibold text-[#E43632] hover:underline inline-flex items-center gap-1">
                  View Version Changes
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="relative">
              <div className="absolute left-10 right-10 top-7 h-1 bg-gray-100" />
              <div className="flex justify-between relative">
                {BUILD_STATUS_ORDER.map((stage, index) => {
                  const isComplete = index < currentIndex;
                  const isActive = index === currentIndex;
                  const Icon = STAGE_ICONS[stage];
                  const showDate = index < 2; // show date for first two like mock
                  const dateLabel = showDate ? `Nov ${12 + index}` : "";
                  return (
                    <div key={stage} className="flex flex-col items-center gap-2 w-full">
                      <div
                        className={cn(
                          "w-16 h-16 rounded-full border-4 flex items-center justify-center bg-white transition-all",
                          isComplete
                            ? "border-[#E43632] text-[#E43632] shadow-[0_8px_24px_rgba(228,54,50,0.18)]"
                            : isActive
                              ? "border-[#E43632] text-[#E43632] shadow-[0_8px_24px_rgba(228,54,50,0.18)] ring-8 ring-[#E43632]/10"
                              : "border-gray-200 text-gray-300"
                        )}
                      >
                        <Icon size={22} />
                      </div>
                      <div className="text-center">
                        <p
                          className={cn(
                            "text-sm font-semibold",
                            isComplete || isActive ? "text-[#0A0A0A]" : "text-gray-400"
                          )}
                        >
                          {BUILD_STATUS_LABELS[stage]}
                        </p>
                        {showDate ? <p className="text-xs text-gray-400 mt-0.5">Nov {12 + index}</p> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card className="p-6 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">One-time build fee</p>
                  <h3 className="text-lg font-bold text-[#0A0A0A]">v{versionLabel ?? "1"} delta</h3>
                </div>
                <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 border border-emerald-100">
                  Credits applied
                </Badge>
              </div>
              <div className="flex items-baseline gap-2">
                <p className="text-3xl font-bold text-[#0A0A0A]">
                  {latestQuote?.setupFee ? `+${formatCurrency(latestQuote.setupFee)}` : "+$350"}
                </p>
                <span className="text-sm line-through text-gray-400">$500 base</span>
              </div>
              <div className="text-sm text-gray-600">
                Incremental cost for new configuration and logic steps. Applied once for this amendment.
              </div>
            </Card>

            <Card className="p-6 space-y-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Recurring usage adjustment</p>
                  <h3 className="text-lg font-bold text-[#0A0A0A]">Unit price adjusted for complexity</h3>
                </div>
                <Badge variant="outline" className="text-[11px] text-amber-600 border-amber-200 bg-amber-50">
                  Price increase
                </Badge>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm text-gray-600">
                <div>
                  <p className="text-xs text-gray-400 uppercase font-semibold mb-1">Volume estimate</p>
                  <p className="text-xl font-bold text-[#0A0A0A]">
                    {estimatedVolume.toLocaleString()}
                    <span className="text-sm text-gray-500 font-medium"> results / mo</span>
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-400 uppercase font-semibold mb-1">New unit price</p>
                  <p className="text-xl font-bold text-[#0A0A0A]">
                    {formatUnitPrice(unitPrice)} <span className="text-sm text-gray-500 font-medium">/ result</span>
                  </p>
                  <p className="text-xs text-gray-400">was {formatUnitPrice(previousUnitPrice.toFixed(3))}</p>
                </div>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div className="h-2 rounded-full bg-red-400" style={{ width: "75%" }} />
              </div>
              <div className="text-xs text-gray-600">
                Impact analysis: Estimated monthly spend increases with the added steps and volume assumptions.
              </div>
              <Button className="bg-[#E43632] hover:bg-[#d12f2c]" size="sm">
                Review & Sign v{versionLabel ?? "1"} Amendment
              </Button>
            </Card>

            <Card className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[#0A0A0A]">Build history</h3>
                <Badge variant="outline" className="text-xs text-gray-500">
                  Full Log
                </Badge>
              </div>
              <div className="space-y-3">
                {BUILD_STATUS_ORDER.map((stage, index) => {
                  const isComplete = index <= currentIndex;
                  return (
                    <div key={stage} className="flex items-center gap-3 text-sm">
                      <div
                        className={cn(
                          "w-8 h-8 rounded-full border flex items-center justify-center",
                          isComplete ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-gray-200 bg-white text-gray-400"
                        )}
                      >
                        {isComplete ? <Check size={14} /> : index + 1}
                      </div>
                      <div>
                        <p className="font-semibold text-[#0A0A0A]">{BUILD_STATUS_LABELS[stage]}</p>
                        <p className="text-xs text-gray-500">{BUILD_STAGE_SUMMARY[stage]}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="p-6 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">v{versionLabel ?? "1"} completion</p>
                  <h3 className="text-xl font-bold text-[#0A0A0A]">
                    {onTrack ? "On track" : "In progress"}
                  </h3>
                </div>
                <Badge variant="outline" className="text-xs text-emerald-700 border-emerald-200 bg-emerald-50">
                  AI Forecast
                </Badge>
              </div>
              <p className="text-sm text-gray-600">
                Forecast based on current scope and pricing progress. Latest update {formatTimestamp(lastUpdated)}.
              </p>
            </Card>

            <NeedsAttentionCard tasks={attentionTasks} />
          </div>
        </div>
      </div>
    </div>
  );
}

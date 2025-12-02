"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { cn } from "@/lib/utils";
import {
  BUILD_STATUS_LABELS,
  BUILD_STATUS_ORDER,
  BuildStatus,
  DEFAULT_BUILD_STATUS,
} from "@/lib/build-status/types";
import type { AutomationLifecycleStatus } from "@/lib/automations/status";
import { CheckCircle2, Clock, FileSignature } from "lucide-react";

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

export function BuildStatusTab({ status, latestQuote, lastUpdated, versionLabel }: BuildStatusTabProps) {
  const currentStatus = resolveBuildStatus(status);
  const currentIndex = BUILD_STATUS_ORDER.indexOf(currentStatus);

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="max-w-6xl mx-auto p-8 pb-24 space-y-8">
        <Card className="p-6 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Build pipeline</p>
              <h2 className="text-2xl font-bold text-[#0A0A0A]">{BUILD_STATUS_LABELS[currentStatus]}</h2>
              <p className="text-xs text-gray-500">Last updated {formatTimestamp(lastUpdated)}</p>
            </div>
            {versionLabel ? (
              <Badge variant="secondary" className="bg-gray-100 text-gray-600">
                {versionLabel}
              </Badge>
            ) : null}
          </div>

          <div className="relative mt-6">
            <div className="absolute left-4 right-4 top-6 h-0.5 bg-gray-100" />
            <div className="flex justify-between relative">
              {BUILD_STATUS_ORDER.map((stage, index) => {
                const isComplete = index < currentIndex;
                const isActive = index === currentIndex;
                return (
                  <div key={stage} className="flex flex-col items-center gap-2">
                    <div
                      className={cn(
                        "w-10 h-10 rounded-full border-4 flex items-center justify-center",
                        isComplete
                          ? "border-emerald-200 text-emerald-600 bg-white"
                          : isActive
                            ? "border-rose-200 text-rose-600 bg-white shadow-[0_0_0_4px_rgba(228,54,50,0.12)]"
                            : "border-gray-100 text-gray-300 bg-white"
                      )}
                    >
                      {isComplete ? (
                        <CheckCircle2 size={16} />
                      ) : isActive ? (
                        <FileSignature size={16} />
                      ) : (
                        <Clock size={16} />
                      )}
                    </div>
                    <div className="text-center">
                      <p
                        className={cn(
                          "text-xs font-semibold",
                          isComplete || isActive ? "text-[#0A0A0A]" : "text-gray-400"
                        )}
                      >
                        {BUILD_STATUS_LABELS[stage]}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="p-6 space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Stage overview</p>
            <h3 className="text-lg font-bold text-[#0A0A0A]">{BUILD_STATUS_LABELS[currentStatus]}</h3>
            <p className="text-sm text-gray-600">{BUILD_STAGE_SUMMARY[currentStatus]}</p>
          </Card>

          <Card className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-[#0A0A0A]">Quote</p>
                <p className="text-xs text-gray-500">
                  {latestQuote ? `Last updated ${formatTimestamp(latestQuote.updatedAt)}` : "Not generated yet"}
                </p>
              </div>
              {latestQuote ? <StatusBadge status={latestQuote.status} /> : <Badge variant="outline">No quote</Badge>}
            </div>
            {latestQuote ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm text-gray-600">
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase">Setup fee</p>
                  <p className="font-medium text-[#0A0A0A]">{formatCurrency(latestQuote.setupFee)}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase">Unit price</p>
                  <p className="font-medium text-[#0A0A0A]">{formatUnitPrice(latestQuote.unitPrice)}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase">Est. volume</p>
                  <p className="font-medium text-[#0A0A0A]">{latestQuote.estimatedVolume ?? "—"}</p>
                </div>
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
                No quote has been generated for this version yet. Send for pricing to kick off the commercial flow.
              </div>
            )}
          </Card>
        </div>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-[#0A0A0A]">Pipeline timeline</h3>
            <Badge variant="outline" className="text-xs text-gray-500">
              {BUILD_STATUS_LABELS[currentStatus]}
            </Badge>
          </div>
          <div className="flex flex-col gap-4">
            {BUILD_STATUS_ORDER.map((stage, index) => {
              const isComplete = index < currentIndex;
              const isActive = index === currentIndex;
              return (
                <div key={stage} className="flex items-center gap-3">
                  <div
                    className={cn(
                      "w-6 h-6 rounded-full border flex items-center justify-center text-[10px] font-bold",
                      isComplete
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : isActive
                          ? "border-rose-200 bg-rose-50 text-rose-600"
                          : "border-gray-200 bg-white text-gray-400"
                    )}
                  >
                    {isComplete ? <CheckCircle2 size={12} /> : index + 1}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#0A0A0A]">{BUILD_STATUS_LABELS[stage]}</p>
                    <p className="text-xs text-gray-500">{BUILD_STAGE_SUMMARY[stage]}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}

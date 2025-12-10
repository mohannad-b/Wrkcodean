"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { NeedsAttentionCard } from "@/components/automations/NeedsAttentionCard";
import { QuoteSignatureModal } from "@/components/modals/QuoteSignatureModal";
import { cn } from "@/lib/utils";
import {
  BUILD_STATUS_LABELS,
  BUILD_STATUS_ORDER,
  BuildStatus,
  DEFAULT_BUILD_STATUS,
} from "@/lib/build-status/types";
import type { AutomationLifecycleStatus } from "@/lib/automations/status";
import { getAttentionTasks, type AutomationTask } from "@/lib/automations/tasks";
import { AlertTriangle, Check, CheckCircle2, FileSignature, Hammer, Sparkles, Rocket } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

interface BuildStatusTabProps {
  status?: AutomationLifecycleStatus | null;
  latestQuote?: {
    id?: string | null;
    status: string;
    setupFee: string | null;
    unitPrice: string | null;
    estimatedVolume: number | null;
    discountsJson?: Array<{ code: string | null; percent: number; source: string; appliesTo?: string; amount: number }> | null;
    updatedAt: string;
  } | null;
  lastUpdated?: string | null;
  versionLabel?: string;
  tasks?: AutomationTask[];
  onViewTasks?: () => void;
  automationVersionId?: string | null;
  onPricingRefresh?: () => void;
}

const formatCurrency = (value?: string | null) => {
  if (!value) return "—";
  const next = Number(value);
  return Number.isFinite(next) ? `$${next.toLocaleString()}` : value;
};

const formatUnitPrice = (value?: string | null) => {
  if (!value) return "—";
  const next = Number(value);
  return Number.isFinite(next) ? `$${next.toFixed(2)}` : value;
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
  ReadyForBuild: FileSignature,
  BuildInProgress: Hammer,
  QATesting: Check,
  Live: Rocket,
};

export function BuildStatusTab({
  status,
  latestQuote,
  lastUpdated,
  versionLabel,
  tasks = [],
  onViewTasks,
  automationVersionId,
  onPricingRefresh,
}: BuildStatusTabProps) {
  const [localStatus, setLocalStatus] = useState<BuildStatus>(resolveBuildStatus(status));
  useEffect(() => {
    setLocalStatus(resolveBuildStatus(status));
  }, [status]);
  const currentStatus = localStatus;
  const currentIndex = BUILD_STATUS_ORDER.indexOf(currentStatus);
  const attentionTasks = getAttentionTasks(tasks);
  const onTrack = currentIndex >= BUILD_STATUS_ORDER.indexOf("BuildInProgress");
  const versionDisplay = versionLabel ? `Version ${versionLabel}` : "Version";
  const minVolume = 100;
  const maxVolume = 15000;
  const estimatedVolume = latestQuote?.estimatedVolume ?? 1000;
  const pricingTiers = useMemo(
    () => [
      { label: "< 2.5k", maxVolume: 2500, price: 0.25 },
      { label: "2.5k - 5k", maxVolume: 5000, price: 0.2 },
      { label: "5k - 10k", maxVolume: 10000, price: 0.15 },
      { label: "10k - 15k", maxVolume: 15000, price: 0.1 },
    ],
    []
  );
  const [sliderVolume, setSliderVolume] = useState(
    Math.min(Math.max(estimatedVolume, minVolume), pricingTiers.at(-1)?.maxVolume ?? maxVolume)
  );
  const activeTier = pricingTiers.find((tier) => sliderVolume <= tier.maxVolume) ?? pricingTiers[pricingTiers.length - 1];
  const unitPriceValue = latestQuote?.unitPrice ? Number(latestQuote.unitPrice) : activeTier.price;
  const unitPrice = unitPriceValue.toFixed(2);
  const oneTimeFee = latestQuote?.setupFee ?? "1000";
  const maxTierVolume = pricingTiers[pricingTiers.length - 1].maxVolume ?? maxVolume;
  const sliderPercent = Math.min(Math.max((sliderVolume - minVolume) / (maxTierVolume - minVolume), 0), 1) * 100;
  const redFillPercent = Math.min(100, Math.ceil(sliderPercent / 25) * 25);
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const monthlyCost = unitPriceValue * sliderVolume;
  const [discountCode, setDiscountCode] = useState("");
  const [applyingDiscount, setApplyingDiscount] = useState(false);

  const applyDiscountCode = async () => {
    if (!automationVersionId || !discountCode.trim()) return;
    setApplyingDiscount(true);
    try {
      await fetch(`/api/automation-versions/${automationVersionId}/price-and-quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          complexity: "medium",
          estimatedVolume: sliderVolume,
          estimatedActions: [],
          discounts: [],
          discountCode: discountCode.trim(),
        }),
      });
      // Consumer should refetch automation data; here we rely on parent refresh side-effects.
    } catch (err) {
      console.error("Failed to apply discount code", err);
    } finally {
      setApplyingDiscount(false);
    }
  };

  const advanceAutomationStatus = async () => {
    if (!automationVersionId) return;
    try {
      await fetch(`/api/automation-versions/${automationVersionId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "BuildInProgress" }),
      });
    } catch (err) {
      console.error("Failed to advance automation status", err);
    }
  };

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
            <Card className="p-6 space-y-5 shadow-sm border border-gray-200">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-2xl font-bold text-[#0A0A0A]">One-Time Build Fee</h3>
                  <p className="text-sm text-gray-600 mt-2">
                    Covers architecture, implementation, testing, and deployment of your automation.
                  </p>
                </div>
                <div className="text-right space-y-2">
                  <Badge variant="outline" className="bg-gray-100 text-gray-600 border border-gray-200 text-xs rounded-full px-3 py-1">
                    Refundable
                  </Badge>
                  <p className="text-3xl font-extrabold text-[#0A0A0A]">{formatCurrency(oneTimeFee)}</p>
                  <p className="text-xs text-gray-500">
                    {latestQuote?.status ? `Quote status: ${latestQuote.status}` : "Quote not generated"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                <Sparkles size={16} />
                <span>
                  Includes <span className="font-bold">$100 in free credits</span> for your first runs.
                </span>
              </div>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-gray-600">Have a discount code? Apply it to your build fee.</div>
              <div className="flex gap-2 w-full sm:w-auto">
                <input
                  className="flex-1 rounded-md border border-gray-200 px-3 py-2 text-sm"
                  placeholder="Enter code"
                  value={discountCode}
                  onChange={(e) => setDiscountCode(e.target.value)}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={applyDiscountCode}
                  disabled={applyingDiscount || !discountCode.trim()}
                  className="min-w-[90px]"
                >
                  {applyingDiscount ? "Applying…" : "Apply"}
                </Button>
              </div>
            </div>
            </Card>

            {latestQuote ? (
              <Card className="p-6 space-y-4 border border-gray-200 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-xl font-bold text-[#0A0A0A]">Latest Quote</h3>
                    <p className="text-sm text-gray-600">Pricing generated from the latest workflow.</p>
                  </div>
                  <Badge variant="secondary" className="text-xs bg-gray-100 text-gray-700">
                    {latestQuote.status ?? "Sent"}
                  </Badge>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div className="space-y-1">
                    <p className="text-gray-500">Setup fee</p>
                    <p className="text-base font-semibold text-[#0A0A0A]">{formatCurrency(latestQuote.setupFee)}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-gray-500">Unit price</p>
                    <p className="text-base font-semibold text-[#0A0A0A]">
                      {formatUnitPrice(latestQuote.unitPrice)} / result
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-gray-500">Est. volume</p>
                    <p className="text-base font-semibold text-[#0A0A0A]">
                      {latestQuote.estimatedVolume?.toLocaleString() ?? "—"} / mo
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-gray-500">Last priced</p>
                    <p className="text-base font-semibold text-[#0A0A0A]">{formatTimestamp(latestQuote.updatedAt)}</p>
                  </div>
                </div>
                {latestQuote.discountsJson && latestQuote.discountsJson.length > 0 ? (
                  <div className="border-t border-gray-200 pt-3 space-y-2 text-sm">
                    <p className="text-gray-600 font-semibold">Discounts applied</p>
                    <div className="space-y-1">
                      {latestQuote.discountsJson.map((d, idx) => (
                        <div key={idx} className="flex items-center justify-between text-gray-700">
                          <span>
                            {(d.code ?? "Discount")} · {(d.appliesTo ?? "both").replace("_", " ")} · {d.source}
                          </span>
                          <span className="font-semibold">-{(d.percent * 100).toFixed(0)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </Card>
            ) : null}

            <Card className="p-0 overflow-hidden border border-gray-200 shadow-sm">
              <div className="flex flex-col gap-2 px-6 py-5 border-b border-gray-100">
                <div className="flex items-start justify-between gap-3">
                <div>
                    <h3 className="text-2xl font-bold text-[#0A0A0A]">Recurring Usage</h3>
                    <p className="text-sm text-gray-600 mt-1">
                      Once live, you are billed per result. Estimate your volume to see pricing.
                    </p>
                  </div>
                  <Badge variant="outline" className="bg-gray-100 text-gray-600 border border-gray-200 text-xs rounded-full px-3 py-1">
                    Post-Launch
                  </Badge>
                </div>
              </div>
              <div className="border-l-4 border-[#E43632] bg-white">
                <div className="p-6">
                  <div className="rounded-2xl bg-[#F8F9FB] border border-gray-200 p-5 space-y-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Volume estimate</p>
                        <p className="text-3xl font-extrabold text-[#0A0A0A] leading-tight">
                          {sliderVolume.toLocaleString()}
                          <span className="text-base font-medium text-gray-500"> results / mo</span>
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Unit price</p>
                        <p className="text-3xl font-extrabold text-[#E43632] leading-tight">
                          {formatUnitPrice(unitPrice)}
                          <span className="text-base font-medium text-gray-600"> / result</span>
                        </p>
              </div>
        </div>

                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min={minVolume}
                          max={maxTierVolume}
                          step={100}
                          value={sliderVolume}
                          onChange={(event) => setSliderVolume(Number(event.target.value))}
                          className="w-full accent-black h-3"
                        />
                        <span className="text-xs text-gray-500 w-16 text-right">{sliderVolume.toLocaleString()}</span>
          </div>
                      <div className="flex items-center justify-between text-xs text-gray-600">
                        {pricingTiers.map((tier, idx) => (
                          <span
                            key={tier.label}
                    className={cn(
                              "flex-1 text-center",
                              idx === 0 ? "text-[#E43632] font-semibold" : "text-gray-400"
                            )}
                          >
                            {tier.label}
                          </span>
                        ))}
                      </div>
                      <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
                        <div
                          className="h-full bg-[#E43632]"
                          style={{
                            width: `${redFillPercent}%`,
                          }}
                        />
                      </div>
                    </div>

                    <div className="flex items-start gap-2 text-sm text-gray-700 border-t border-gray-200 pt-4">
                      <div className="mt-0.5 text-[#2B64E3]">
                        <AlertTriangle size={16} />
                      </div>
                      <p className="leading-relaxed">
                        <span className="font-semibold">How billing works:</span> We bill your estimated spend (
                        {formatCurrency((Number(unitPrice) * sliderVolume).toFixed(0))}) in advance each month. Actual
                        usage is deducted from this balance. Any unused credits roll over to the next month automatically.
                      </p>
                  </div>

                    <Button
                      className="mt-2 w-full bg-[#E43632] hover:bg-[#d12f2c] text-white text-base font-semibold h-12 shadow-md"
                      onClick={() => setShowQuoteModal(true)}
                    >
                      Review & Sign Agreement
                    </Button>
                  </div>
                </div>
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

            <NeedsAttentionCard tasks={attentionTasks} onGoToWorkflow={onViewTasks} />
          </div>
        </div>
      </div>
      <QuoteSignatureModal
        open={showQuoteModal}
        onOpenChange={setShowQuoteModal}
        onSigned={(result) => {
          if (result?.automationStatus) {
            setLocalStatus(resolveBuildStatus(result.automationStatus as AutomationLifecycleStatus));
          }
          void advanceAutomationStatus();
        }}
        quoteId={latestQuote?.id ?? undefined}
        automationVersionId={automationVersionId ?? undefined}
        onPricingRefresh={onPricingRefresh}
        volume={sliderVolume}
        unitPrice={unitPriceValue}
        monthlyCost={monthlyCost}
        buildFee={Number(oneTimeFee)}
      />
    </div>
  );
}

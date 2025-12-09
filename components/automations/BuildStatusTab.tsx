"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { NeedsAttentionCard } from "@/components/automations/NeedsAttentionCard";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Sparkles,
  Rocket,
} from "lucide-react";
import { useMemo, useState } from "react";

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
  const unitPrice = (latestQuote?.unitPrice ? Number(latestQuote.unitPrice) : activeTier.price).toFixed(2);
  const previousUnitPrice = Math.max(Number(unitPrice) - 0.01, 0);
  const oneTimeFee = latestQuote?.setupFee ?? "1000";
  const maxTierVolume = pricingTiers[pricingTiers.length - 1].maxVolume ?? maxVolume;
  const sliderPercent = Math.min(Math.max((sliderVolume - minVolume) / (maxTierVolume - minVolume), 0), 1) * 100;
  const redFillPercent = Math.min(100, Math.ceil(sliderPercent / 25) * 25);
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [quoteStep, setQuoteStep] = useState<"review" | "payment" | "sign" | "done">("review");

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
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                <Sparkles size={16} />
                <span>
                  Includes <span className="font-bold">$100 in free credits</span> for your first runs.
                </span>
              </div>
            </Card>

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
                      onClick={() => {
                        setQuoteStep("review");
                        setShowQuoteModal(true);
                      }}
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

            <NeedsAttentionCard tasks={attentionTasks} />
          </div>
        </div>
      </div>

      <Dialog open={showQuoteModal} onOpenChange={setShowQuoteModal}>
        <DialogContent className="max-w-6xl w-[95vw] h-[90vh] p-0 overflow-hidden bg-white">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div>
              <DialogTitle className="text-xl font-bold text-[#0A0A0A]">Review & Sign Quote</DialogTitle>
              <DialogDescription className="text-sm text-gray-600">
                Lock your pricing, approve the build, and authorize WRK to begin.
              </DialogDescription>
            </div>
            <div className="flex items-center gap-3 text-xs font-semibold text-gray-500">
              {["review", "payment", "sign"].map((step, idx) => {
                const stepMap: Record<string, string> = { review: "Review", payment: "Payment", sign: "Sign" };
                const current = quoteStep === step;
                const completed =
                  (quoteStep === "payment" && step === "review") || (quoteStep === "sign" && step !== "sign") || quoteStep === "done";
                return (
                  <div key={step} className="flex items-center gap-2">
                    <div
                      className={cn(
                        "w-6 h-6 rounded-full border flex items-center justify-center text-xs",
                        completed
                          ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                          : current
                            ? "border-[#E43632] bg-rose-50 text-[#E43632]"
                            : "border-gray-200 bg-white text-gray-400"
                      )}
                    >
                      {idx + 1}
                    </div>
                    <span className={cn("text-sm font-semibold", current ? "text-[#0A0A0A]" : "text-gray-500")}>
                      {stepMap[step]}
                    </span>
                    {idx < 2 ? <div className="w-8 h-px bg-gray-200" /> : null}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] h-[calc(100%-64px)]">
            <div className="bg-white flex items-center justify-center border-r border-gray-100">
              <div className="w-full h-full flex items-center justify-center text-gray-400">
                PDF preview placeholder
              </div>
            </div>
            <div className="bg-white p-6 space-y-4 overflow-y-auto">
              {quoteStep === "review" && (
                <>
                  <div className="rounded-lg border border-gray-200 p-4 space-y-3">
                    <div className="flex items-center justify-between text-sm text-gray-700">
                      <span>Build Fee</span>
                      <span className="font-semibold">{formatCurrency(oneTimeFee)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm text-gray-700">
                      <span>First Month Est.</span>
                      <span className="font-semibold">{formatCurrency((Number(unitPrice) * sliderVolume).toFixed(0))}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>Volume</span>
                      <span>{sliderVolume.toLocaleString()} units</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-md px-3 py-2">
                      <AlertTriangle size={14} className="text-emerald-600" />
                      <span>Your unit rate of {formatUnitPrice(unitPrice)} is locked for 12 months from today.</span>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <Button variant="ghost" className="w-full" onClick={() => setShowQuoteModal(false)}>
                      Back
                    </Button>
                    <Button className="w-full bg-[#0A0A0A] hover:bg-gray-900 text-white" onClick={() => setQuoteStep("payment")}>
                      Proceed to Payment
                    </Button>
                  </div>
                </>
              )}

              {quoteStep === "payment" && (
                <>
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-[#0A0A0A]">Payment Method</h3>
                    <div className="rounded-lg border border-gray-200 p-4">
                      <div className="text-sm font-semibold text-[#0A0A0A]">•••• 4242</div>
                      <div className="text-xs text-gray-500">Expires 12/25 · Card verified</div>
                      <Badge className="mt-2 bg-gray-900 text-white">Default</Badge>
                    </div>
                    <Button variant="outline" className="w-full text-sm">
                      Add New Card
                    </Button>
                  </div>
                  <div className="flex gap-3">
                    <Button variant="ghost" className="w-full" onClick={() => setQuoteStep("review")}>
                      Back
                    </Button>
                    <Button className="w-full bg-[#0A0A0A] hover:bg-gray-900 text-white" onClick={() => setQuoteStep("sign")}>
                      Use this Card
                    </Button>
                  </div>
                </>
              )}

              {quoteStep === "sign" && (
                <>
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-[#0A0A0A]">Sign & Authorize</h3>
                    <div className="space-y-2 text-sm">
                      <label className="font-semibold text-gray-700">Company Name</label>
                      <input
                        className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E43632]"
                        defaultValue="Acme Corp"
                      />
                      <label className="font-semibold text-gray-700">Signature</label>
                      <input
                        className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E43632]"
                        placeholder="Type your full name"
                      />
                      <label className="flex items-start gap-2 text-sm text-gray-700 mt-2">
                        <input type="checkbox" className="mt-1" />{" "}
                        <span>
                          I agree to the terms in the attached quote and authorize WRK to charge my payment method for the{" "}
                          {formatCurrency(oneTimeFee)} build fee today, and recurring monthly fees thereafter.
                        </span>
                      </label>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <Button variant="ghost" className="w-full" onClick={() => setQuoteStep("payment")}>
                      Back
                    </Button>
                    <Button className="w-full bg-[#E43632] hover:bg-[#d12f2c] text-white" onClick={() => setQuoteStep("done")}>
                      Sign & Approve Quote
                    </Button>
                  </div>
                </>
              )}

              {quoteStep === "done" && (
                <div className="flex flex-col items-center justify-center text-center space-y-4 py-8">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                    <CheckCircle2 className="h-8 w-8" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-[#0A0A0A]">Build Authorized</h3>
                    <p className="text-sm text-gray-600 mt-2">
                      Your quote is locked and your build is now officially in progress.
                    </p>
                  </div>
                  <div className="rounded-lg border border-gray-200 px-4 py-3 text-sm text-gray-700 w-full">
                    <div className="flex items-center justify-between">
                      <span>Reference ID</span>
                      <span className="font-semibold">QT-7418</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Billed Today</span>
                      <span className="font-semibold">{formatCurrency(oneTimeFee)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Est. Next Bill</span>
                      <span className="font-semibold">{formatCurrency((Number(unitPrice) * sliderVolume).toFixed(0))}</span>
                    </div>
                  </div>
                  <Button className="bg-[#E43632] hover:bg-[#d12f2c] text-white px-6" onClick={() => setShowQuoteModal(false)}>
                    Return to Build Status
                  </Button>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

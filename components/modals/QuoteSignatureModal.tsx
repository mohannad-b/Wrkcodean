"use client";
/* eslint-disable react/no-unescaped-entities */

import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, Download, Printer, ShieldCheck, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { WrkLogo } from "@/components/brand/WrkLogo";
import { updateQuoteStatus } from "@/features/quotes/services/quoteApi";
import { priceAutomationQuote } from "@/features/automations/services/automationApi";

interface QuoteSignatureModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSigned?: (result?: { automationStatus?: string | null; quoteStatus?: string | null }) => void;
  onPricingRefresh?: () => void;
  quoteId?: string | null;
  automationVersionId?: string | null;
  volume: number;
  unitPrice: number;
  monthlyCost: number;
  buildFee: number;
}

export const QuoteSignatureModal: React.FC<QuoteSignatureModalProps> = ({
  open,
  onOpenChange,
  onSigned,
  onPricingRefresh,
  quoteId,
  automationVersionId,
  volume,
  unitPrice,
  monthlyCost,
  buildFee,
}) => {
  const [step, setStep] = useState<"review" | "payment" | "sign" | "success">("review");
  const [companyName, setCompanyName] = useState("Acme Corp");
  const [signature, setSignature] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const [showCheckmark, setShowCheckmark] = useState(false);
  const [signing, setSigning] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  const [discountCode, setDiscountCode] = useState("");
  const [applyingDiscount, setApplyingDiscount] = useState(false);
  const [discountMessage, setDiscountMessage] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setStep("review");
      // reset any transient visuals on open
      setCelebrating(false);
      setShowCheckmark(false);
      setSignError(null);
      setSigning(false);
    }
  }, [open]);

  useEffect(() => {
    if (step === "success") {
      setCelebrating(true);
      setShowCheckmark(false);
      const timer = setTimeout(() => {
        setCelebrating(false);
        setShowCheckmark(true);
      }, 3000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [step]);

  const handleClose = () => {
    onOpenChange(false);
  };

  const handleAdvance = (next: "review" | "payment" | "sign" | "success") => {
    setStep(next);
  };

  const handleSignAndApprove = async () => {
    if (signing) return;
    setSignError(null);
    setSigning(true);
    if (!quoteId) {
      onSigned?.({ quoteStatus: "SIGNED" });
      setStep("success");
      setSigning(false);
      return;
    }
    try {
      const response = await updateQuoteStatus(quoteId, {
        status: "signed",
        signature_metadata: {
          name: signature,
          company: companyName,
          channel: "in_app",
        },
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "Unable to sign quote");
      }
      const data = await response.json().catch(() => ({}));
      onSigned?.({
        automationStatus: data?.automationVersion?.status ?? null,
        quoteStatus: data?.quote?.status ?? null,
      });
      setStep("success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to sign quote";
      setSignError(message);
    } finally {
      setSigning(false);
    }
  };

  const handleApplyDiscount = async () => {
    if (!automationVersionId || !discountCode.trim()) {
      setDiscountMessage("Enter a discount code to apply.");
      return;
    }
    setApplyingDiscount(true);
    setDiscountMessage(null);
    try {
      const response = await priceAutomationQuote(automationVersionId, {
        complexity: "medium",
        estimatedVolume: volume,
        estimatedActions: [],
        discounts: [],
        discountCode: discountCode.trim(),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error ?? payload?.message ?? "Unable to apply discount");
      }
      setDiscountMessage("Discount applied. Pricing refreshed.");
      onPricingRefresh?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to apply discount";
      setDiscountMessage(message);
    } finally {
      setApplyingDiscount(false);
    }
  };

  const referenceId = useMemo(() => `QT-${Date.now().toString().slice(-6)}`, []);
  const orderDate = useMemo(() => new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }), []);
  const clientName = companyName || "Client Name";
  const clientAddress = "123 Client St, City, State ZIP, Country";
  const workflowDescription = "Finance Reconciliation"; // placeholder
  const handlePrint = () => window.print();
  const handleDownload = () => window.print();

  const particles = useMemo(
    () =>
      Array.from({ length: 120 }).map((_, i) => ({
    id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        dx: (Math.random() - 0.5) * 500,
        dy: (Math.random() - 0.5) * 400,
        size: 24 + Math.random() * 28,
    color: ["#E43632", "#22c55e", "#3b82f6", "#f59e0b"][Math.floor(Math.random() * 4)],
        delay: Math.random() * 0.4,
      })),
    []
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[80vw] w-[80vw] p-0 overflow-hidden bg-gray-50 gap-0 border-0 sm:rounded-3xl shadow-2xl h-[90vh] flex flex-col !z-[60]">
        {/* Header */}
        <div className="bg-white border-b border-gray-100 p-6 flex items-center justify-between shrink-0 z-20">
          <div>
            <DialogTitle className="text-xl font-bold text-[#0A0A0A] flex items-center gap-2">
              {step === "success" ? (
                <>
                  <CheckCircle2 className="text-emerald-500" size={24} /> Quote Signed
                </>
              ) : (
                "Review & Sign Quote"
              )}
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-500 mt-1">
              {step === "success"
                ? "Your agreement is secure and stored."
                : "Lock your pricing, approve the build, and authorize WRK to begin."}
            </DialogDescription>
          </div>

          <button
            onClick={handleClose}
            className="w-9 h-9 rounded-full border border-gray-200 hover:bg-gray-100 flex items-center justify-center text-gray-500"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        {step === "success" ? (
          <div className="flex-1 bg-white flex flex-col items-center justify-center gap-6 relative overflow-hidden">
            <AnimatePresence>
              {celebrating &&
                particles.map((p) => (
                <motion.div
                  key={p.id}
                    initial={{ opacity: 0.9, scale: 0.5, x: 0, y: 0 }}
                    animate={{ opacity: 0, scale: 2.6, x: p.dx, y: p.dy }}
                  exit={{ opacity: 0 }}
                    transition={{ duration: 1.2, delay: p.delay }}
                  className="absolute"
                    style={{
                      left: `${p.x}%`,
                      top: `${p.y}%`,
                      color: p.color,
                      pointerEvents: "none",
                    }}
                >
                    <Sparkles size={p.size} />
                </motion.div>
              ))}
            </AnimatePresence>
            {showCheckmark ? (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 shadow-inner transition-opacity duration-300">
              <CheckCircle2 className="h-10 w-10" />
            </div>
            ) : null}
            <div className="text-center space-y-2">
              <h3 className="text-2xl font-bold text-[#0A0A0A]">Build Authorized</h3>
              <p className="text-sm text-gray-600">Your quote is locked and your build is now officially in progress.</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 w-full max-w-md shadow-sm">
              <div className="flex items-center justify-between">
                <span>Reference ID</span>
                <span className="font-semibold">{quoteId ?? referenceId}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Billed Today</span>
                <span className="font-semibold">${buildFee.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Est. Next Bill</span>
                <span className="font-semibold">${monthlyCost.toFixed(2)}</span>
              </div>
            </div>
            <Button className="bg-[#E43632] hover:bg-[#d12f2c] text-white px-6" onClick={handleClose}>
              Return to Build Status
            </Button>
            <p className="text-xs text-gray-400">A copy of the signed agreement has been sent to your email.</p>
          </div>
        ) : (
          <div className="flex-1 bg-[#f5f6f7] overflow-auto">
            <div className="max-w-[105%] lg:max-w-[105%] mx-auto px-4 py-6">
              <div className="grid grid-cols-1 lg:grid-cols-[2.2fr_1.1fr] gap-4 items-start">
                <div className="bg-white border border-gray-200 rounded-2xl shadow-2xl w-full relative pt-8 pb-16">
                <div className="absolute right-4 top-[-12px] flex gap-2">
                  <button
                    onClick={handlePrint}
                    className="w-9 h-9 rounded-full border border-gray-200 bg-white flex items-center justify-center text-gray-600 hover:bg-gray-100 shadow-sm"
                    aria-label="Print quote"
                  >
                    <Printer size={16} />
                  </button>
                  <button
                    onClick={handleDownload}
                    className="w-9 h-9 rounded-full border border-gray-200 bg-white flex items-center justify-center text-gray-600 hover:bg-gray-100 shadow-sm"
                    aria-label="Download PDF"
                  >
                    <Download size={16} />
                  </button>
                </div>

                  <div className="p-8 pt-10 space-y-8">
                    <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-auto">
                        <WrkLogo />
                      </div>
                      <div>
                        <p className="text-lg font-bold text-[#0A0A0A]">Wrk.com</p>
                        <p className="text-sm text-gray-500">Automate Everything.</p>
                      </div>
                    </div>
                      <div className="text-right text-sm text-gray-600 space-y-1">
                        <p className="text-base font-bold text-[#0A0A0A]">Quote</p>
                        <p className="text-sm">Quote #: {referenceId}</p>
                        <p className="text-sm">Date: {orderDate}</p>
                        <p className="text-sm">Valid Until: {orderDate}</p>
                      </div>
                    </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-sm text-gray-700">
                      <div className="space-y-1">
                        <p className="text-xs uppercase font-bold text-gray-500">Prepared For</p>
                        <p className="font-bold text-[#0A0A0A]">{clientName}</p>
                        <p>Attn: Authorized Signatory</p>
                        <p>{clientAddress}</p>
                      </div>
                      <div className="space-y-1 text-right">
                        <p className="text-xs uppercase font-bold text-gray-500">Services Provided By</p>
                        <p className="font-bold text-[#0A0A0A]">WRK Technologies Inc.</p>
                        <p>123 Innovation Drive</p>
                        <p>New York, NY 10012</p>
                      </div>
                    </div>

                  <div className="space-y-4 mt-10">
                      <div className="flex items-center text-sm font-semibold text-gray-700">
                        <span className="w-1/2">Description</span>
                        <span className="w-1/6 text-center">Rate</span>
                        <span className="w-1/6 text-center">Qty</span>
                        <span className="w-1/6 text-right">Amount</span>
                      </div>
                      <div className="border-t border-gray-300" />

                      <div className="flex items-start text-sm py-4">
                        <div className="w-1/2">
                          <p className="font-bold text-[#0A0A0A]">One-Time Build Fee</p>
                          <p className="text-gray-600 text-sm mt-1 leading-relaxed">
                            Implementation, testing, and deployment of "{workflowDescription}" automation, including up to 3 minor revisions.
                          </p>
                        </div>
                        <div className="w-1/6 text-center pt-2">$1,000.00</div>
                        <div className="w-1/6 text-center pt-2">1</div>
                        <div className="w-1/6 text-right pt-2">${buildFee.toLocaleString()}</div>
                      </div>

                      <div className="flex items-start text-sm py-4">
                        <div className="w-1/2">
                          <p className="font-bold text-[#0A0A0A]">Monthly Usage (Estimated)</p>
                          <p className="text-gray-600 text-sm mt-1 leading-relaxed">
                            Volume Tier: {volume.toLocaleString()} units @ ${unitPrice.toFixed(2)}/unit · 12-Month Price Lock Applied
                          </p>
                        </div>
                        <div className="w-1/6 text-center pt-2">${unitPrice.toString()}</div>
                        <div className="w-1/6 text-center pt-2">{volume.toLocaleString()}</div>
                        <div className="w-1/6 text-right pt-2">${monthlyCost.toFixed(0)}</div>
                      </div>
                    </div>

                    <div className="pt-6 border-t border-gray-300 space-y-2 text-sm text-gray-700">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600">Monthly subtotal</span>
                        <span className="font-semibold text-[#0A0A0A]">${monthlyCost.toFixed(0)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600">One-time subtotal</span>
                        <span className="font-semibold text-[#0A0A0A]">${buildFee.toLocaleString()}</span>
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                        <span className="text-base font-bold text-[#0A0A0A]">Total Due Today</span>
                        <span className="text-lg font-extrabold text-[#0A0A0A]">${(buildFee + monthlyCost).toLocaleString()}</span>
                      </div>
                    </div>

                    <div className="pt-6 border-t border-gray-300">
                      <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6 space-y-4 text-xs text-gray-700">
                        <p className="text-sm font-semibold text-[#0A0A0A]">Terms &amp; Conditions</p>

                        <div className="space-y-2">
                          <p>
                            THIS WRK DELIVERY PLATFORM AGREEMENT (the “Agreement”) is entered into as of the Effective Date indicated above (the
                            “Effective Date”), by and between WRK Technologies Inc. (“WRK”) and the customer identified in the Order Form (the
                            “Customer”).
                          </p>
                          <p>This Agreement consists of:</p>
                          <ul className="list-disc list-outside pl-5 space-y-1">
                            <li>the terms and conditions contained herein (the “Order Form”);</li>
                            <li>
                              the WRK{" "}
                              <a href="https://wrk.com/terms-of-service/" target="_blank" rel="noreferrer" className="underline text-[#0A0A0A]">
                                Terms of Service
                              </a>{" "}
                              (the “Terms of Service”); and
                            </li>
                            <li>
                              the WRK{" "}
                              <a href="https://wrk.com/privacy-policy/" target="_blank" rel="noreferrer" className="underline text-[#0A0A0A]">
                                Privacy Policy
                              </a>{" "}
                              (the “Privacy Policy”).
                            </li>
                          </ul>
                          <p>By executing this Agreement, Customer agrees to be bound by all of the foregoing.</p>
                        </div>
                        <div className="border-t border-gray-200" />

                        <div className="space-y-2">
                          <p className="font-semibold">1. Currency</p>
                          <p>All fees are quoted and invoiced in U.S. Dollars (USD) unless otherwise stated in writing.</p>
                        </div>
                        <div className="border-t border-gray-200" />

                        <div className="space-y-2">
                          <p className="font-semibold">2. Workflow Build Price</p>
                          <p>
                            The Workflow Build Price is a one-time, non-recurring fee covering the requirements gathering, feasibility assessment,
                            design, build, testing, and deployment of a fully functional automation or AI workflow (the “Workflow”).
                          </p>
                          <p>This price includes up to three (3) minor revisions following initial delivery.</p>
                          <p>The Workflow Build Price is invoiced upon execution of this Agreement and is due upon receipt.</p>
                        </div>
                        <div className="border-t border-gray-200" />

                        <div className="space-y-2">
                          <p className="font-semibold">3. Workflow Delivery Guarantee</p>
                          <p>WRK guarantees delivery of a functional Workflow provided that the Customer:</p>
                          <ul className="list-disc list-outside pl-5 space-y-1">
                            <li>Participates in at least two (2) one-hour working sessions with the WRK team;</li>
                            <li>Provides clear and complete requirements and acceptance criteria;</li>
                            <li>Supplies all necessary credentials, API keys, or system access to enable delivery; and</li>
                            <li>
                              Remains reasonably responsive to communications and feedback requests from WRK during a 30-day delivery window.
                            </li>
                          </ul>
                          <p>
                            If WRK fails to deliver a functional Workflow after the Customer fulfills the obligations above, the Customer may request a
                            full refund of the Workflow Build Price. This refund constitutes the Customer’s sole and exclusive remedy for non-delivery.
                          </p>
                        </div>
                        <div className="border-t border-gray-200" />

                        <div className="space-y-2">
                          <p className="font-semibold">4. Workflow Monthly Run Price</p>
                          <p>
                            Monthly usage billing will begin at the date your workflow goes live but in no case more than 30 days after the Signature
                            Date of this Agreement. WRK will pre-bill the Customer’s credit card monthly for the committed amounts and will
                            automatically top up the account in $100 increments if actual usage exceeds the prepaid balance. The Monthly Run Price is
                            calculated as: (Unit Price) × (Number of Results Generated) for the applicable billing month. Any unused pre-billed
                            amounts are carried forward as non-expiring credits toward future usage. WRK reserves the right to pause or suspend
                            services for accounts with overdue balances.
                          </p>
                        </div>
                        <div className="border-t border-gray-200" />

                        <div className="space-y-2">
                          <p className="font-semibold">5. Term and Renewal</p>
                          <p>Initial Term: One (1) year from the Effective Date.</p>
                          <p>
                            Renewal Term(s): This Agreement automatically renews for successive one-year periods unless either party provides written
                            notice of non-renewal at least sixty (60) days prior to the end of the then-current term.
                          </p>
                          <p>
                            Either party may terminate this Agreement upon material breach by the other party, provided the breaching party fails to cure
                            such breach within thirty (30) days of written notice.
                          </p>
                        </div>
                        <div className="border-t border-gray-200" />

                        <div className="space-y-2">
                          <p className="font-semibold">6. General</p>
                          <p>All capitalized terms not defined herein shall have the meanings set forth in the WRK Terms of Service.</p>
                          <p>In the event of conflict, the terms of this Order Form shall prevail over the Terms of Service.</p>
                        </div>

                        <div className="border-t border-gray-200 pt-4"></div>
                      </div>
                    </div>

                  <div className="pt-8 pb-10">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-end">
                            <div className="space-y-2">
                        <div className="h-10 border-b border-gray-300 text-base text-[#0A0A0A]">
                          {signature || "Awaiting signature..."}
                        </div>
                              <p className="text-xs font-semibold text-gray-800 uppercase tracking-wide">Authorized Signature</p>
                            </div>
                            <div className="space-y-2">
                              <div className="h-10 border-b border-gray-300 text-gray-900 text-base">{orderDate}</div>
                              <p className="text-xs font-semibold text-gray-800 uppercase tracking-wide">Date</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                <div className="bg-white border border-gray-200 rounded-2xl shadow-lg p-6 space-y-5 lg:sticky lg:top-4">
                  {/* Step header */}
                  <div className="flex items-center gap-3">
                    {[
                      { key: "review", label: "Review" },
                      { key: "payment", label: "Payment" },
                      { key: "sign", label: "Sign" },
                    ].map((item, idx) => {
                      const isActive = step === item.key;
                      const isCompleted =
                        (step === "payment" && item.key === "review") ||
                        (step === "sign" && (item.key === "review" || item.key === "payment"));
                      return (
                        <React.Fragment key={item.key}>
                          <button
                            className={cn(
                              "flex items-center gap-2 text-sm font-semibold transition-colors",
                              isActive ? "text-[#E43632]" : isCompleted ? "text-emerald-600" : "text-gray-400"
                            )}
                            onClick={() => handleAdvance(item.key as typeof step)}
                          >
                            <span
                              className={cn(
                                "h-7 w-7 rounded-full border flex items-center justify-center text-xs",
                                isActive
                                  ? "border-[#E43632] bg-[#fff3f3] text-[#E43632]"
                                  : isCompleted
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                    : "border-gray-200 bg-white text-gray-500"
                              )}
                            >
                              {idx + 1}
                            </span>
                            {item.label}
                          </button>
                          {idx < 2 && <div className="flex-1 h-px bg-gray-200" />}
                        </React.Fragment>
                      );
                    })}
                  </div>

                  <AnimatePresence mode="wait">
                    <motion.div
                      key={step}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      transition={{ duration: 0.18 }}
                      className="space-y-4"
                    >
                      {step === "review" && (
                        <>
                          <div className="space-y-2">
                            <h3 className="text-xl font-bold text-[#0A0A0A]">Order Summary</h3>
                            <p className="text-sm text-gray-600">Please review the breakdown before proceeding.</p>
                          </div>
                          <div className="border rounded-2xl p-5 space-y-4 bg-white">
                            <div className="flex items-center justify-between text-base">
                              <span className="text-gray-700">Build Fee</span>
                              <span className="font-semibold text-[#0A0A0A]">${buildFee.toLocaleString()}</span>
                            </div>
                            <div className="flex items-center justify-between text-base pt-1">
                              <div>
                                <p className="text-gray-700">First Month Est.</p>
                                <p className="text-xs text-gray-500 mt-0.5">Volume</p>
                              </div>
                              <div className="text-right">
                                <p className="font-semibold text-[#0A0A0A]">${monthlyCost.toFixed(0)}</p>
                                <p className="text-xs text-gray-500">{volume.toLocaleString()} units</p>
                              </div>
                            </div>
                      <div className="pt-2 space-y-2">
                        <p className="text-sm font-semibold text-[#0A0A0A]">Apply Discount</p>
                        <div className="flex gap-2 items-center">
                          <input
                            className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm"
                            placeholder="Enter discount code"
                            value={discountCode}
                            onChange={(e) => setDiscountCode(e.target.value)}
                          />
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={handleApplyDiscount}
                            disabled={applyingDiscount || !discountCode.trim()}
                          >
                            {applyingDiscount ? "Applying…" : "Apply"}
                          </Button>
                        </div>
                        {discountMessage ? (
                          <p className="text-xs text-gray-600">{discountMessage}</p>
                        ) : null}
                      </div>
                          </div>
                          <div className="rounded-2xl bg-[#f1f6ff] border border-[#dbe7ff] p-4 flex items-start gap-3 text-[#0a3ea1]">
                            <div className="h-9 w-9 rounded-full bg-white border border-[#cddcff] flex items-center justify-center text-[#0a3ea1]">
                              <ShieldCheck size={18} />
                            </div>
                            <div className="space-y-1 text-[#0a3ea1]">
                              <p className="text-lg font-semibold">Price Lock Guarantee</p>
                              <p className="text-sm text-[#0a3ea1]">
                                Your unit rate of ${unitPrice.toFixed(3)} is locked for 12 months from today.
                              </p>
                            </div>
                          </div>
                          <Button className="w-full bg-[#0A0A0A] hover:bg-gray-900 text-white" onClick={() => handleAdvance("payment")}>
                            Proceed to Payment
                          </Button>
                        </>
                      )}

                      {step === "payment" && (
                        <>
                          <div className="space-y-2">
                            <h3 className="text-xl font-bold text-[#0A0A0A]">Payment Method</h3>
                            <p className="text-sm text-gray-600">Securely add a card for the build fee.</p>
                          </div>
                          <div className="border rounded-2xl p-4 space-y-2">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-sm font-semibold text-[#0A0A0A]">Visa •••• 4242</p>
                                <p className="text-xs text-gray-500">Expires 12/25</p>
                              </div>
                              <span className="text-[10px] px-2 py-1 rounded-full bg-gray-900 text-white">DEFAULT</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-emerald-600 font-semibold">
                              <span className="h-2 w-2 rounded-full bg-emerald-500" />
                              Card verified
                            </div>
                          </div>

                          <div className="border rounded-2xl p-4 text-sm text-gray-500 bg-gray-50">
                            <p className="font-semibold text-[#0A0A0A] text-sm mb-1">Add New Card</p>
                            <p>Securely add a card for the build fee.</p>
                          </div>

                          <div className="flex gap-3 items-center w-full min-w-0">
                            <Button
                              variant="outline"
                              className="flex-1 h-9 px-3 text-sm bg-white border border-gray-200 hover:bg-gray-50"
                              onClick={() => handleAdvance("review")}
                            >
                              Back
                            </Button>
                            <Button
                              className="flex-1 h-10 text-sm bg-[#0A0A0A] hover:bg-gray-900 text-white"
                              onClick={() => handleAdvance("sign")}
                            >
                              Use this Card
                            </Button>
                          </div>
                        </>
                      )}

                      {step === "sign" && (
                        <>
                          <div className="space-y-2">
                            <h3 className="text-xl font-bold text-[#0A0A0A]">Sign &amp; Authorize</h3>
                            <p className="text-sm text-gray-600">Final step to activate your build.</p>
                          </div>
                          <div className="space-y-3">
                            <div>
                              <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Company Name</p>
                              <input
                                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                                value={companyName}
                                onChange={(e) => setCompanyName(e.target.value)}
                              />
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Signature</p>
                              <input
                                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                                placeholder="Type your full name"
                                value={signature}
                                onChange={(e) => setSignature(e.target.value)}
                              />
                            </div>
                            <label className="flex items-start gap-2 text-sm text-gray-700">
                              <input
                                type="checkbox"
                                className="mt-1 h-4 w-4"
                                checked={agreed}
                                onChange={(e) => setAgreed(e.target.checked)}
                              />
                              <span>
                                I agree to the terms in the attached quote and authorize WRK to charge my payment method for the{" "}
                                <strong>${buildFee.toLocaleString()}</strong> build fee today, and recurring monthly fees thereafter.
                              </span>
                            </label>
                          </div>
                          <div className="flex gap-3 items-center w-full min-w-0">
                            <Button
                              variant="outline"
                              className="flex-1 h-9 px-3 text-sm bg-white border border-gray-200 hover:bg-gray-50"
                              onClick={() => handleAdvance("payment")}
                            >
                              Back
                            </Button>
                            <Button
                              className="flex-1 h-10 text-sm bg-[#E43632] hover:bg-[#d12f2c] text-white"
                              onClick={handleSignAndApprove}
                              disabled={!signature || !agreed || signing}
                            >
                              {signing ? "Signing..." : "Sign & Approve Quote"}
                            </Button>
                          </div>
                          {signError ? <p className="text-xs text-red-600">{signError}</p> : null}
                        </>
                      )}
                    </motion.div>
                  </AnimatePresence>

                  <div className="border-t border-gray-200 pt-4 space-y-2 text-xs text-gray-500">
                    <p>Secure processing • You can return to previous steps anytime.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

/* eslint-enable react/no-unescaped-entities */



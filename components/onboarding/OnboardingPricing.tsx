"use client";

import { useState } from "react";
import { FileText, CreditCard, Lock, Info, Sparkles, Zap, PenTool } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { currentUser } from "@/lib/mock-automations";

export function OnboardingPricing({ onComplete }: { onComplete: () => void }) {
  const [volume, setVolume] = useState([1000]);
  const [signature, setSignature] = useState("");
  const [cardName, setCardName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc] = useState("");

  // Dynamic Pricing Logic
  const getUnitPrice = (v: number) => {
    if (v >= 10000) return 0.1;
    if (v >= 5000) return 0.15;
    if (v >= 2500) return 0.2;
    return 0.25;
  };

  const currentVol = volume[0];
  const unitPrice = getUnitPrice(currentVol);
  const monthlyEst = (currentVol * unitPrice).toFixed(0);
  const buildFee = 1000;

  return (
    <div className="h-full bg-gray-50 overflow-y-auto p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-[#0A0A0A]">Finalize & Approve</h2>
          <p className="text-gray-500">Review commercial terms and setup your billing.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* LEFT: PRICING CONFIG */}
          <div className="lg:col-span-2 space-y-6">
            {/* 1. ONE-TIME BUILD FEE */}
            <Card className="p-6 border-gray-200 shadow-sm bg-white relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-[#0A0A0A]" />
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-[#0A0A0A] text-lg flex items-center gap-2">
                    One-Time Build Fee
                    <Badge
                      variant="secondary"
                      className="bg-gray-100 text-gray-600 font-normal text-[10px]"
                    >
                      Refundable
                    </Badge>
                  </h3>
                  <p className="text-sm text-gray-500 mt-1 max-w-md">
                    Covers architecture, implementation, testing, and deployment of your automation.
                  </p>
                  <div className="flex items-center gap-2 mt-3 text-xs text-green-700 bg-green-50 px-2 py-1 rounded-md inline-flex border border-green-100">
                    <Sparkles size={12} />
                    Includes <strong>$100 in free credits</strong> for your first runs.
                  </div>
                </div>
                <div className="text-right">
                  <span className="block text-2xl font-bold text-[#0A0A0A]">
                    ${buildFee.toLocaleString()}
                  </span>
                </div>
              </div>
            </Card>

            {/* 2. USAGE PRICING */}
            <Card className="p-6 border-gray-200 shadow-sm space-y-6 bg-white relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-[#E43632]" />
              <div>
                <h3 className="font-bold text-[#0A0A0A] text-lg mb-1 flex items-center gap-2">
                  Recurring Usage
                  <span className="text-xs font-normal text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                    Post-Launch
                  </span>
                </h3>
                <p className="text-sm text-gray-500">
                  Once live, you are billed per result. Estimate your volume to see pricing.
                </p>
              </div>

              <div className="bg-gray-50 p-6 rounded-xl border border-gray-100">
                <div className="flex justify-between items-end mb-6">
                  <div>
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                      Volume Estimate
                    </span>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-bold text-[#0A0A0A]">
                        {currentVol.toLocaleString()}
                      </span>
                      <span className="text-sm text-gray-500 font-medium">results / mo</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                      Unit Price
                    </span>
                    <div className="flex items-baseline gap-1 justify-end">
                      <span className="text-3xl font-bold text-[#E43632]">
                        ${unitPrice.toFixed(2)}
                      </span>
                      <span className="text-sm text-gray-500 font-medium">/ result</span>
                    </div>
                  </div>
                </div>

                <Slider
                  value={volume}
                  onValueChange={setVolume}
                  max={15000}
                  step={100}
                  min={100}
                  className="mb-8"
                />

                {/* Pricing Tiers Viz */}
                <div className="grid grid-cols-4 text-center gap-2 text-[10px] text-gray-400 mb-2">
                  <div className={currentVol < 2500 ? "text-[#E43632] font-bold" : ""}>
                    {"< 2.5k"}
                  </div>
                  <div
                    className={
                      currentVol >= 2500 && currentVol < 5000 ? "text-[#E43632] font-bold" : ""
                    }
                  >
                    {"2.5k+"}
                  </div>
                  <div
                    className={
                      currentVol >= 5000 && currentVol < 10000 ? "text-[#E43632] font-bold" : ""
                    }
                  >
                    {"5k+"}
                  </div>
                  <div className={currentVol >= 10000 ? "text-[#E43632] font-bold" : ""}>
                    {"10k+"}
                  </div>
                </div>
                <div className="flex w-full h-2 rounded-full overflow-hidden bg-gray-200 mb-6">
                  <div
                    className={`flex-1 transition-colors ${currentVol < 2500 ? "bg-[#E43632]" : "bg-gray-300"}`}
                  />
                  <div
                    className={`flex-1 transition-colors ${currentVol >= 2500 && currentVol < 5000 ? "bg-[#E43632]" : "bg-gray-300"}`}
                  />
                  <div
                    className={`flex-1 transition-colors ${currentVol >= 5000 && currentVol < 10000 ? "bg-[#E43632]" : "bg-gray-300"}`}
                  />
                  <div
                    className={`flex-1 transition-colors ${currentVol >= 10000 ? "bg-[#E43632]" : "bg-gray-300"}`}
                  />
                </div>

                <div className="flex items-start gap-3 pt-4 border-t border-gray-200">
                  <Info size={16} className="text-blue-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-gray-500 leading-relaxed">
                    <strong>How billing works:</strong> We bill your estimated spend (${monthlyEst})
                    in advance each month. Actual usage is deducted from this balance. Any unused
                    credits roll over to the next month automatically.
                  </p>
                </div>
              </div>
            </Card>

            {/* 3. PAYMENT METHOD */}
            <Card className="p-6 border-gray-200 shadow-sm bg-white">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                  <CreditCard size={18} className="text-gray-600" />
                </div>
                <h3 className="font-bold text-[#0A0A0A] text-lg">Payment Method</h3>
              </div>

              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 space-y-4">
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">
                    Cardholder Name
                  </label>
                  <Input
                    placeholder="Name on card"
                    className="bg-white"
                    value={cardName}
                    onChange={(e) => setCardName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">
                    Card Number
                  </label>
                  <div className="relative">
                    <Input
                      placeholder="0000 0000 0000 0000"
                      className="bg-white pr-10"
                      value={cardNumber}
                      onChange={(e) => setCardNumber(e.target.value)}
                    />
                    <Lock size={14} className="absolute right-3 top-3 text-gray-400" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">
                      Expiry
                    </label>
                    <Input
                      placeholder="MM/YY"
                      className="bg-white"
                      value={expiry}
                      onChange={(e) => setExpiry(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">
                      CVC
                    </label>
                    <Input
                      placeholder="123"
                      className="bg-white"
                      value={cvc}
                      onChange={(e) => setCvc(e.target.value)}
                    />
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-4 text-xs text-gray-400">
                <Lock size={12} />
                Secure 256-bit SSL encrypted payment.
              </div>
            </Card>
          </div>

          {/* RIGHT: QUOTE PREVIEW */}
          <div className="lg:col-span-1">
            <div className="bg-white border border-gray-200 shadow-lg rounded-xl overflow-hidden sticky top-8">
              {/* Quote Header */}
              <div className="bg-[#0A0A0A] p-6 text-white">
                <div className="flex items-center gap-2 mb-4">
                  <FileText size={20} className="text-gray-400" />
                  <span className="font-bold tracking-wide">ORDER SUMMARY</span>
                </div>
                <h2 className="text-2xl font-bold">Order #WRK-8821</h2>
              </div>

              {/* Quote Body */}
              <div className="p-6 space-y-6">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Client</span>
                    <span className="font-bold text-[#0A0A0A]">{currentUser.name}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Date</span>
                    <span className="font-bold text-[#0A0A0A]">
                      {new Date().toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">One-Time Build Fee</span>
                    <span className="font-bold text-[#0A0A0A]">$1,000.00</span>
                  </div>
                  <div className="flex justify-between text-sm text-green-600">
                    <span className="flex items-center gap-1">
                      <Zap size={12} /> Initial Credits
                    </span>
                    <span>$100.00 (Free)</span>
                  </div>
                  <div className="flex justify-between text-sm opacity-50">
                    <span className="text-gray-600">Est. Monthly Usage</span>
                    <span className="text-gray-400 italic">${monthlyEst}.00</span>
                  </div>
                </div>

                <Separator />

                <div className="flex justify-between items-baseline">
                  <span className="font-bold text-lg text-[#0A0A0A]">Total Due Today</span>
                  <span className="font-bold text-xl text-[#E43632]">$1,000.00</span>
                </div>

                <div className="bg-gray-50 p-3 rounded-lg border border-gray-100 text-xs text-gray-500 leading-relaxed">
                  <strong>Refund Policy:</strong> The build fee is fully refundable if we cannot
                  successfully build your requested automation.
                </div>

                {/* Signature Field */}
                <div className="mt-6">
                  <label className="text-xs font-bold text-gray-400 uppercase mb-2 block">
                    Sign to Confirm
                  </label>
                  <div className="relative">
                    <Input
                      placeholder="Type full name"
                      className="font-serif italic text-lg py-6 border-gray-300 bg-gray-50"
                      value={signature}
                      onChange={(e) => setSignature(e.target.value)}
                    />
                    <PenTool size={14} className="absolute right-3 top-4 text-gray-400" />
                  </div>
                </div>

                <Button
                  onClick={onComplete}
                  disabled={signature.length < 3 || cardNumber.length < 4}
                  className="w-full h-12 font-bold bg-[#E43632] hover:bg-[#C12E2A] text-white shadow-md mt-4"
                >
                  Approve & Start Build
                </Button>
                <p className="text-[10px] text-center text-gray-400 mt-2">
                  By signing, you agree to the Terms of Service.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

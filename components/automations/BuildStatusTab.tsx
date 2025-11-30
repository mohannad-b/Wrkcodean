"use client";

import { useState, useEffect } from "react";
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  FileText,
  Hammer,
  Search,
  Rocket,
  Sparkles,
  ChevronRight,
  FileSignature,
  GitBranch,
  ArrowUpRight,
  History,
  Layout,
  Info,
  Zap,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type VersionStatus =
  | "Intake in Progress"
  | "Needs Pricing"
  | "Awaiting Client Approval"
  | "Build in Progress"
  | "QA & Testing"
  | "Ready to Launch"
  | "Live"
  | "Blocked"
  | "Archived";

interface BuildStatusTabProps {
  version?: string;
}

// Mock build status data per version
const VERSION_BUILD_DATA: Record<
  string,
  {
    status: VersionStatus;
    step: number;
    volume: number;
    deltaBuildFee: number;
    baseBuildFee: number;
    baseUnitPrice: number;
    newUnitPrice: number;
    outstandingItems: Array<{
      id: number;
      title: string;
      type: string;
      desc: string;
      priority: string;
    }>;
    createdFrom: string;
    completionDate?: string;
    liveSince?: string;
  }
> = {
  "v1.2": {
    status: "Build in Progress",
    step: 3,
    volume: 18000,
    deltaBuildFee: 450,
    baseBuildFee: 1000,
    baseUnitPrice: 0.04,
    newUnitPrice: 0.042,
    outstandingItems: [
      {
        id: 1,
        title: "Advanced OCR Configuration",
        type: "Configuration",
        desc: "Configure new invoice format parsing.",
        priority: "high",
      },
    ],
    createdFrom: "v1.1",
  },
  "v1.1": {
    status: "Awaiting Client Approval",
    step: 2,
    volume: 15000,
    deltaBuildFee: 350,
    baseBuildFee: 1000,
    baseUnitPrice: 0.038,
    newUnitPrice: 0.04,
    outstandingItems: [
      {
        id: 1,
        title: "New OCR Field Mapping",
        type: "Configuration",
        desc: 'Map "Vendor Address" for new layout.',
        priority: "high",
      },
      {
        id: 2,
        title: "Approve New Rate",
        type: "Signature",
        desc: "Unit price changed from $0.038 to $0.040.",
        priority: "medium",
      },
    ],
    createdFrom: "v1.0",
  },
  "v1.0": {
    status: "Live",
    step: 6,
    volume: 12000,
    deltaBuildFee: 0,
    baseBuildFee: 1000,
    baseUnitPrice: 0.038,
    newUnitPrice: 0.038,
    outstandingItems: [],
    createdFrom: "Initial",
    liveSince: "Oct 24, 2023",
  },
};

export function BuildStatusTab({ version = "v1.1" }: BuildStatusTabProps) {
  const versionData = VERSION_BUILD_DATA[version] || VERSION_BUILD_DATA["v1.1"];

  const [volume, setVolume] = useState([versionData.volume]);
  const [showChangesModal, setShowChangesModal] = useState(false);
  const [outstandingItems, setOutstandingItems] = useState(versionData.outstandingItems);

  // Update state when version changes
  useEffect(() => {
    const data = VERSION_BUILD_DATA[version] || VERSION_BUILD_DATA["v1.1"];
    setVolume([data.volume]);
    setOutstandingItems(data.outstandingItems);
  }, [version]);

  const baseBuildFee = versionData.baseBuildFee;
  const deltaBuildFee = versionData.deltaBuildFee;

  const baseUnitPrice = versionData.baseUnitPrice;
  const newUnitPrice = versionData.newUnitPrice;

  const unitCount = volume[0];
  const monthlyCost = unitCount * newUnitPrice;
  const versionStatus = versionData.status;
  const currentStep = versionData.step;

  const steps = [
    {
      id: "intake",
      label: "Intake in Progress",
      icon: FileText,
      desc: `Scope changes for ${version}`,
      date: "Nov 12",
    },
    { id: "pricing", label: "Needs Pricing", icon: Search, desc: "Delta analysis", date: "Nov 13" },
    {
      id: "approval",
      label: "Awaiting Client Approval",
      icon: FileSignature,
      desc: "Approve amendment",
    },
    { id: "build", label: "Build in Progress", icon: Hammer, desc: "Implementing changes" },
    { id: "qa", label: "QA & Testing", icon: CheckCircle2, desc: "Regression testing" },
    { id: "launch", label: "Ready to Launch", icon: Rocket, desc: `Deploy ${version}` },
  ];

  const handleFixItem = (id: number) => {
    setOutstandingItems((prev) => prev.filter((item) => item.id !== id));
  };

  const getStatusBadge = () => {
    switch (versionStatus) {
      case "Intake in Progress":
        return (
          <Badge variant="outline" className="bg-gray-100 text-gray-600 border-gray-200">
            Intake
          </Badge>
        );
      case "Needs Pricing":
        return (
          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
            Pricing
          </Badge>
        );
      case "Awaiting Client Approval":
        return (
          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
            Awaiting Approval
          </Badge>
        );
      case "Build in Progress":
        return (
          <Badge
            variant="outline"
            className="bg-red-50 text-[#E43632] border-red-200 animate-pulse"
          >
            Building
          </Badge>
        );
      case "QA & Testing":
        return (
          <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
            QA Testing
          </Badge>
        );
      case "Ready to Launch":
        return (
          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
            Ready
          </Badge>
        );
      case "Live":
        return <Badge className="bg-emerald-500 text-white border-none">Live</Badge>;
      case "Blocked":
        return (
          <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
            Blocked
          </Badge>
        );
      case "Archived":
        return (
          <Badge variant="outline" className="bg-gray-100 text-gray-500 border-gray-200">
            Archived
          </Badge>
        );
      default:
        return null;
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="p-8 max-w-6xl mx-auto pb-32 space-y-8">
        {/* VERSION HEADER */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-2xl font-bold text-[#0A0A0A]">Version {version}</h2>
              {getStatusBadge()}
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <GitBranch size={14} />
              <span>
                Created from <strong>{versionData.createdFrom}</strong>
              </span>
              <span className="w-1 h-1 rounded-full bg-gray-300" />
              <Button
                variant="link"
                className="h-auto p-0 text-xs text-[#E43632]"
                onClick={() => setShowChangesModal(true)}
              >
                View Version Changes
              </Button>
            </div>
          </div>
        </div>

        {/* ANIMATED VERSION TRACKER */}
        <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm relative overflow-visible mb-12">
          <div className="relative flex items-center justify-between z-10">
            <div className="absolute left-0 top-[22px] w-full h-1 bg-gray-100 -z-10 rounded-full" />

            <motion.div
              className="absolute left-0 top-[22px] h-1 bg-[#E43632] -z-10 rounded-full origin-left"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: currentStep / (steps.length - 1) }}
              transition={{ duration: 0.8, ease: "easeInOut" }}
            />

            {steps.map((step, index) => {
              const isCompleted = index < currentStep;
              const isActive = index === currentStep;

              return (
                <div key={step.id} className="flex flex-col items-center relative group">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <motion.div
                          className={cn(
                            "w-12 h-12 rounded-full flex items-center justify-center border-4 transition-colors duration-300 bg-white",
                            isCompleted
                              ? "border-[#E43632] text-[#E43632]"
                              : isActive
                                ? "border-[#E43632] text-[#E43632] shadow-[0_0_0_4px_rgba(228,54,50,0.1)]"
                                : "border-gray-100 text-gray-300"
                          )}
                          animate={isActive ? { scale: [1, 1.1, 1] } : {}}
                          transition={isActive ? { repeat: Infinity, duration: 2 } : {}}
                        >
                          <div
                            className={cn(
                              "w-full h-full rounded-full flex items-center justify-center",
                              isCompleted && "bg-[#E43632] text-white"
                            )}
                          >
                            {isCompleted ? <CheckCircle2 size={18} /> : <step.icon size={18} />}
                          </div>
                        </motion.div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="font-bold">{step.label}</p>
                        <p className="text-xs text-gray-500">{step.desc}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  <div className="flex flex-col items-center mt-3">
                    <p
                      className={cn(
                        "text-xs font-bold transition-colors duration-300",
                        isActive || isCompleted ? "text-[#0A0A0A]" : "text-gray-400"
                      )}
                    >
                      {step.label}
                    </p>
                    {isCompleted && step.date && (
                      <span className="text-[10px] text-gray-400 font-mono mt-0.5">
                        {step.date}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* PRICING SECTION */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="p-6 border-gray-200 shadow-sm bg-white relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-[#0A0A0A]" />
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-[#0A0A0A] text-lg flex items-center gap-2">
                    One-Time Build Fee ({version} Delta)
                  </h3>
                  <p className="text-sm text-gray-500 mt-1 max-w-md">
                    Incremental cost for new OCR configuration and logic steps.
                  </p>
                  <div className="flex items-center gap-2 mt-3 text-xs text-green-700 bg-green-50 px-2 py-1 rounded-md inline-flex border border-green-100">
                    <Zap size={12} />
                    Credits applied to this amendment.
                  </div>
                </div>
                <div className="text-right">
                  <span className="block text-2xl font-bold text-[#0A0A0A]">
                    +${deltaBuildFee.toLocaleString()}
                  </span>
                  <span className="text-xs text-gray-400 line-through">${baseBuildFee} Base</span>
                </div>
              </div>
            </Card>

            <Card className="p-6 border-gray-200 shadow-sm space-y-6 bg-white relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-[#E43632]" />
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-[#0A0A0A] text-lg mb-1 flex items-center gap-2">
                    Recurring Usage Adjustment
                  </h3>
                  <p className="text-sm text-gray-500">
                    Unit price adjusted for {version} complexity.
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className="text-[10px] border-blue-100 bg-blue-50 text-blue-600 h-6"
                >
                  <ArrowUpRight size={12} className="mr-1" /> Price Increase
                </Badge>
              </div>

              <div className="bg-gray-50 p-6 rounded-xl border border-gray-100">
                <div className="flex justify-between items-end mb-6">
                  <div>
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                      Volume Estimate
                    </span>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-bold text-[#0A0A0A]">
                        {unitCount.toLocaleString()}
                      </span>
                      <span className="text-sm text-gray-500 font-medium">results / mo</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                      New Unit Price
                    </span>
                    <div className="flex items-baseline gap-1 justify-end">
                      <span className="text-3xl font-bold text-[#E43632]">
                        ${newUnitPrice.toFixed(3)}
                      </span>
                      <span className="text-sm text-gray-500 font-medium">/ result</span>
                    </div>
                    <span className="text-xs text-gray-400 line-through block mt-1">
                      was ${baseUnitPrice.toFixed(3)}
                    </span>
                  </div>
                </div>

                <Slider
                  value={volume}
                  onValueChange={(val) =>
                    versionStatus === "Awaiting Client Approval" && setVolume(val)
                  }
                  max={25000}
                  step={500}
                  min={500}
                  className={cn(
                    "mb-8",
                    versionStatus !== "Awaiting Client Approval" && "opacity-50 pointer-events-none"
                  )}
                />

                <div className="flex items-start gap-3 pt-4 border-t border-gray-200">
                  <Info size={16} className="text-blue-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-gray-500 leading-relaxed">
                    <strong>Impact Analysis:</strong> Your estimated monthly spend will increase
                    from ${(unitCount * baseUnitPrice).toLocaleString()} to{" "}
                    <strong>${monthlyCost.toLocaleString()}</strong> due to the new complexity.
                  </p>
                </div>

                {versionStatus !== "Awaiting Client Approval" && (
                  <div className="mt-6 pt-6 border-t border-gray-200">
                    <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3 text-center">
                      <p className="text-xs font-bold text-emerald-700 flex items-center justify-center gap-2">
                        <CheckCircle2 size={14} /> {version} Amendment Signed
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* RIGHT COLUMN */}
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50 rounded-bl-full -mr-4 -mt-4" />

              <div className="relative">
                <div className="flex items-center gap-2 mb-4 text-gray-500 text-xs font-bold uppercase tracking-wider">
                  <Clock size={12} /> {version} Completion
                </div>
                <h3 className="text-3xl font-bold text-[#0A0A0A] mb-2">Friday</h3>
                <p className="text-lg text-gray-500 font-medium mb-6">by 2:40 PM EST</p>

                <div className="bg-gray-50 rounded-lg p-3 border border-gray-100 flex gap-3 items-start">
                  <Sparkles size={16} className="text-purple-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-gray-600 leading-relaxed">
                    <span className="font-bold text-purple-700">AI Forecast:</span> Based on the +3
                    step delta, v1.1 is on track.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-[300px]">
              <div className="p-4 border-b border-gray-100 bg-amber-50/30 flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-sm text-[#0A0A0A]">
                  <AlertTriangle size={16} className="text-amber-500" />
                  {version} Action Items
                </div>
                <Badge className="bg-amber-100 text-amber-800 border-amber-200">
                  {outstandingItems.length}
                </Badge>
              </div>
              <ScrollArea className="flex-1">
                <div className="p-2 space-y-2">
                  <AnimatePresence>
                    {outstandingItems.length === 0 ? (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex flex-col items-center justify-center h-40 text-gray-400"
                      >
                        <CheckCircle2 size={24} className="mb-2 text-emerald-500" />
                        <p className="text-sm">{version} Requirements Met</p>
                      </motion.div>
                    ) : (
                      outstandingItems.map((item) => (
                        <motion.div
                          key={item.id}
                          layout
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, height: 0, marginTop: 0 }}
                          className="bg-amber-50/50 border border-amber-100 p-3 rounded-lg group relative"
                        >
                          <div className="flex justify-between items-start mb-1">
                            <Badge
                              variant="outline"
                              className="text-[9px] bg-white border-amber-200 text-amber-700 uppercase tracking-wider"
                            >
                              {item.type}
                            </Badge>
                            <button
                              onClick={() => handleFixItem(item.id)}
                              className="text-[10px] font-bold text-[#E43632] opacity-0 group-hover:opacity-100 transition-opacity flex items-center hover:underline"
                            >
                              Fix Now <ChevronRight size={10} />
                            </button>
                          </div>
                          <p className="text-sm font-bold text-[#0A0A0A] leading-tight mb-1">
                            {item.title}
                          </p>
                          <p className="text-xs text-gray-500">{item.desc}</p>
                        </motion.div>
                      ))
                    )}
                  </AnimatePresence>
                </div>
              </ScrollArea>
            </div>
          </div>
        </div>

        {/* BUILD LOG */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-[#0A0A0A] flex items-center gap-2">
              <History size={16} className="text-gray-400" /> {version} Build History
            </h3>
            <Button variant="ghost" size="sm" className="text-xs h-8">
              Full Log
            </Button>
          </div>
          <div className="relative pl-2">
            <div className="absolute left-2 top-2 bottom-2 w-px bg-gray-100" />
            <div className="flex gap-8 overflow-x-auto pb-4 pl-4">
              {[
                { time: "Just Now", title: "Pricing Delta Generated", type: "info" },
                { time: "2h ago", title: "Delta: +3 Steps Detected", type: "info" },
                { time: "Yesterday", title: "v1.1 Created from v1.0", type: "info" },
              ].map((log, idx) => (
                <div key={idx} className="flex flex-col min-w-[160px] relative">
                  <div
                    className={cn(
                      "w-4 h-4 rounded-full border-2 flex items-center justify-center bg-white z-10 mb-3",
                      "border-gray-300 text-gray-300"
                    )}
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-current" />
                  </div>
                  <p className="text-xs font-bold text-[#0A0A0A] mb-1">{log.title}</p>
                  <p className="text-[10px] text-gray-400 font-mono">{log.time}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* CHANGES MODAL */}
        <Dialog open={showChangesModal} onOpenChange={setShowChangesModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Version {version} Changes</DialogTitle>
              <DialogDescription>Comparison against {versionData.createdFrom}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
                <div className="flex items-center gap-3">
                  <Layout size={16} className="text-gray-400" />
                  <div>
                    <p className="text-sm font-bold text-[#0A0A0A]">Workflow Steps</p>
                    <p className="text-xs text-gray-500">Added 3, Modified 1</p>
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className="text-emerald-600 bg-emerald-50 border-emerald-200"
                >
                  +3 New
                </Badge>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

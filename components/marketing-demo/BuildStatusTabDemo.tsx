'use client';

import React, { useState } from "react";
import {
  CheckCircle2,
  FileText,
  Hammer,
  Search,
  Rocket,
  Sparkles,
  FileSignature,
  GitBranch,
  ArrowUpRight,
} from "lucide-react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getStatusLabel, type SubmissionLifecycleStatus } from "@/lib/submissions/lifecycle";

type VersionStatus = Exclude<SubmissionLifecycleStatus, "Archived">;

export const BuildStatusTabDemo: React.FC = () => {
  const [versionStatus] = useState<VersionStatus>("AwaitingClientApproval");
  const [currentStep] = useState(2);
  const [volume, setVolume] = useState([15000]);
  // Pricing Constants (Delta Logic)
  const baseBuildFee = 1000;
  const deltaBuildFee = 350;
  const totalBuildFee = baseBuildFee + deltaBuildFee;
  
  const baseUnitPrice = 0.038;
  const newUnitPrice = 0.040; // Slight increase due to complexity
  
  const unitCount = volume[0];
  const monthlyCost = unitCount * newUnitPrice;

  // Mock Outstanding Items specific to v1.1
  const [outstandingItems, setOutstandingItems] = useState([
    { id: 1, title: 'New OCR Field Mapping', type: 'Configuration', desc: 'Map "Vendor Address" for new layout.', priority: 'high' },
    { id: 2, title: 'Approve New Rate', type: 'Signature', desc: 'Unit price changed from $0.038 to $0.040.', priority: 'medium' },
  ]);

  // Build Pipeline Steps
  const steps = [
    { id: "IntakeInProgress" as VersionStatus, label: getStatusLabel("IntakeInProgress"), icon: FileText, desc: "Scope changes for v1.1", date: "Nov 12" },
    { id: "NeedsPricing" as VersionStatus, label: getStatusLabel("NeedsPricing"), icon: Search, desc: "Delta analysis", date: "Nov 13" },
    { id: "AwaitingClientApproval" as VersionStatus, label: getStatusLabel("AwaitingClientApproval"), icon: FileSignature, desc: "Approve amendment" },
    { id: "BuildInProgress" as VersionStatus, label: getStatusLabel("BuildInProgress"), icon: Hammer, desc: "Implementing changes" },
    { id: "QATesting" as VersionStatus, label: getStatusLabel("QATesting"), icon: CheckCircle2, desc: "Regression testing" },
    { id: "ReadyForBuild" as VersionStatus, label: getStatusLabel("ReadyForBuild"), icon: Rocket, desc: "Deploy v1.1" },
    { id: "Live" as VersionStatus, label: getStatusLabel("Live"), icon: Rocket, desc: "Live" },
  ];

  const handleFixItem = (id: number) => {
    setOutstandingItems(prev => prev.filter(item => item.id !== id));
  };

  // Helper to render status badge
  const getStatusBadge = () => {
    const label = getStatusLabel(versionStatus);
    const classes: Record<VersionStatus, string> = {
      IntakeInProgress: "bg-gray-100 text-gray-600 border-gray-200",
      NeedsPricing: "bg-amber-50 text-amber-700 border-amber-200",
      AwaitingClientApproval: "bg-blue-50 text-blue-700 border-blue-200",
      ReadyForBuild: "bg-blue-50 text-blue-700 border-blue-200",
      BuildInProgress: "bg-red-50 text-[#E43632] border-red-200 animate-pulse",
      QATesting: "bg-purple-50 text-purple-700 border-purple-200",
      Live: "bg-emerald-500 text-white border-none",
    };
    return (
      <Badge variant="outline" className={cn("border", classes[versionStatus] ?? "bg-gray-50 text-gray-600 border-gray-200")}>
        {label}
      </Badge>
    );
  };

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="p-8 max-w-6xl mx-auto pb-32 space-y-8">
        
        {/* 1. VERSION HEADER */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
           <div>
             <div className="flex items-center gap-3 mb-1">
               <h2 className="text-2xl font-bold text-[#0A0A0A]">Version 1.1</h2>
               {getStatusBadge()}
             </div>
             <div className="flex items-center gap-2 text-sm text-gray-500">
                <GitBranch size={14} />
                <span>Created from <strong>v1.0</strong></span>
                <span className="w-1 h-1 rounded-full bg-gray-300" />
                <Button variant="link" className="h-auto p-0 text-xs text-[#E43632]">
                  View Version Changes
                </Button>
             </div>
           </div>
           
           {versionStatus === 'Live' && (
             <div className="text-right">
                <p className="text-xs text-gray-500 uppercase tracking-wider font-bold mb-1">Live Since</p>
                <p className="text-sm font-mono font-bold text-[#0A0A0A]">Oct 24, 2023</p>
             </div>
           )}
        </div>

        {/* 2. ANIMATED VERSION TRACKER */}
        <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm relative overflow-visible mb-12">
           <div className="relative flex items-center justify-between z-10">
              {/* Background Line */}
              <div className="absolute left-0 top-[22px] w-full h-1 bg-gray-100 -z-10 rounded-full" />
              
              {/* Animated Progress Line */}
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
                                isCompleted ? "border-[#E43632] text-[#E43632]" :
                                isActive ? "border-[#E43632] text-[#E43632] shadow-[0_0_0_4px_rgba(228,54,50,0.1)]" :
                                "border-gray-100 text-gray-300"
                              )}
                              animate={isActive ? { scale: [1, 1.1, 1] } : {}}
                              transition={isActive ? { repeat: Infinity, duration: 2 } : {}}
                            >
                               <div className={cn(
                                 "w-full h-full rounded-full flex items-center justify-center",
                                 isCompleted && "bg-[#E43632] text-white"
                               )}>
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
                       <p className={cn(
                         "text-xs font-bold transition-colors duration-300",
                         isActive || isCompleted ? "text-[#0A0A0A]" : "text-gray-400"
                       )}>
                         {step.label}
                       </p>
                       {isCompleted && step.date && (
                         <span className="text-[10px] text-gray-400 font-mono mt-0.5">{step.date}</span>
                       )}
                     </div>

                     {isActive && (
                       <motion.div 
                         initial={{ opacity: 0, y: 10 }}
                         animate={{ opacity: 1, y: 0 }}
                         className="absolute -bottom-14 bg-white border border-blue-100 text-blue-800 text-[10px] px-3 py-2 rounded-lg flex flex-col items-center shadow-lg z-20 min-w-[140px]"
                       >
                         <div className="flex items-center gap-1.5 font-bold mb-0.5">
                           <Sparkles size={10} className="text-blue-500" /> AI Note
                         </div>
                         <span className="text-center leading-tight text-blue-600">v1.1 adds 3 new steps & modifies logic.</span>
                       </motion.div>
                     )}
                  </div>
                );
              })}
           </div>
        </div>

        {/* 3. PRICING + QUOTE OVERVIEW */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr,1fr]">
          <Card className="border-gray-200 shadow-sm">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-[#0A0A0A]">Pricing Overview</h3>
                <p className="text-xs text-gray-500">Based on estimated volume</p>
              </div>
              <Button variant="outline" size="sm" className="text-xs">
                <ArrowUpRight size={14} className="mr-1" />
                View Full Quote
              </Button>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <div className="flex items-center justify-between text-sm font-semibold text-gray-500">
                  <span>Monthly Volume</span>
                  <span>{unitCount.toLocaleString()} units</span>
                </div>
                <Slider
                  value={volume}
                  onValueChange={setVolume}
                  min={5000}
                  max={50000}
                  step={1000}
                  className="mt-3"
                />
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="rounded-lg border border-gray-100 p-3">
                  <p className="text-xs text-gray-400 mb-1">Build Fee</p>
                  <p className="font-bold text-[#0A0A0A]">${totalBuildFee.toLocaleString()}</p>
                  <p className="text-[10px] text-gray-400">Base: ${baseBuildFee} + Delta: ${deltaBuildFee}</p>
                </div>
                <div className="rounded-lg border border-gray-100 p-3">
                  <p className="text-xs text-gray-400 mb-1">Unit Price</p>
                  <p className="font-bold text-[#0A0A0A]">${newUnitPrice.toFixed(3)}</p>
                  <p className="text-[10px] text-gray-400">Prev: ${baseUnitPrice.toFixed(3)}</p>
                </div>
              </div>
              <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Estimated Monthly Spend</span>
                  <span className="text-base font-bold text-[#0A0A0A]">${monthlyCost.toLocaleString()}</span>
                </div>
              </div>
              <Button className="w-full bg-[#0A0A0A] text-white">
                Sign Updated Quote
              </Button>
            </div>
          </Card>

          <Card className="border-gray-200 shadow-sm">
            <div className="p-6 border-b border-gray-100">
              <h3 className="text-lg font-bold text-[#0A0A0A]">Outstanding Items</h3>
              <p className="text-xs text-gray-500">Resolve to proceed</p>
            </div>
            <div className="p-6 space-y-4">
              {outstandingItems.map((item) => (
                <div key={item.id} className="rounded-lg border border-gray-100 p-4 text-sm">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-[#0A0A0A]">{item.title}</p>
                      <p className="text-xs text-gray-500">{item.desc}</p>
                    </div>
                    <Badge variant="outline" className="text-[10px]">{item.type}</Badge>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className={`text-[10px] uppercase font-semibold ${item.priority === 'high' ? 'text-red-600' : 'text-amber-600'}`}>
                      {item.priority} priority
                    </span>
                    <Button size="sm" variant="outline" className="text-xs" onClick={() => handleFixItem(item.id)}>
                      Mark Done
                    </Button>
                  </div>
                </div>
              ))}
              {outstandingItems.length === 0 && (
                <div className="rounded-lg border border-dashed border-gray-200 p-6 text-center text-xs text-gray-500">
                  All requirements complete.
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

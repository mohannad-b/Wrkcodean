'use client';

import React, { useState } from "react";
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
import { QuoteSignatureModal } from "@/components/modals/QuoteSignatureModal";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getStatusLabel, type SubmissionLifecycleStatus } from "@/lib/submissions/lifecycle";

type VersionStatus = Exclude<SubmissionLifecycleStatus, "Archived">;

export const BuildStatusTab: React.FC = () => {
  const [versionStatus, setVersionStatus] = useState<VersionStatus>("AwaitingClientApproval");
  const [currentStep, setCurrentStep] = useState(2);
  const [volume, setVolume] = useState([15000]);
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [showLaunchModal, setShowLaunchModal] = useState(false);
  const [showChangesModal, setShowChangesModal] = useState(false);

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

  const handleQuoteSigned = () => {
    setVersionStatus("BuildInProgress");
    setCurrentStep(3); // Move to Build
    setShowQuoteModal(false);
    // Clear approval item
    setOutstandingItems(prev => prev.filter(i => i.id !== 2));
  };

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
                <Button variant="link" className="h-auto p-0 text-xs text-[#E43632]" onClick={() => setShowChangesModal(true)}>
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
                         {/* Arrow */}
                         <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-white border-t border-l border-blue-100 rotate-45" />
                       </motion.div>
                     )}
                  </div>
                );
              })}
           </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* 3. VERSIONED PRICING (DELTA) - REFACTORED STYLE */}
          <div className="lg:col-span-2 space-y-6">
             
             {/* ONE-TIME BUILD FEE */}
             <Card className="p-6 border-gray-200 shadow-sm bg-white relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-[#0A0A0A]" />
                <div className="flex justify-between items-start">
                   <div>
                      <h3 className="font-bold text-[#0A0A0A] text-lg flex items-center gap-2">
                         One-Time Build Fee (v1.1 Delta)
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
                      <span className="block text-2xl font-bold text-[#0A0A0A]">+${deltaBuildFee.toLocaleString()}</span>
                      <span className="text-xs text-gray-400 line-through">${baseBuildFee} Base</span>
                   </div>
                </div>
             </Card>

             {/* RECURRING USAGE (Styled like OnboardingPricing) */}
             <Card className="p-6 border-gray-200 shadow-sm space-y-6 bg-white relative overflow-hidden">
                 <div className="absolute top-0 left-0 w-1 h-full bg-[#E43632]" />
                 <div className="flex justify-between items-start">
                    <div>
                       <h3 className="font-bold text-[#0A0A0A] text-lg mb-1 flex items-center gap-2">
                          Recurring Usage Adjustment
                       </h3>
                       <p className="text-sm text-gray-500">
                          Unit price adjusted for v1.1 complexity.
                       </p>
                    </div>
                    <Badge variant="outline" className="text-[10px] border-blue-100 bg-blue-50 text-blue-600 h-6">
                        <ArrowUpRight size={12} className="mr-1" /> Price Increase
                    </Badge>
                 </div>
                
                <div className="bg-gray-50 p-6 rounded-xl border border-gray-100">
                   <div className="flex justify-between items-end mb-6">
                      <div>
                         <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Volume Estimate</span>
                         <div className="flex items-baseline gap-2">
                            <span className="text-3xl font-bold text-[#0A0A0A]">{unitCount.toLocaleString()}</span>
                            <span className="text-sm text-gray-500 font-medium">results / mo</span>
                         </div>
                      </div>
                      <div className="text-right">
                         <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">New Unit Price</span>
                         <div className="flex items-baseline gap-1 justify-end">
                            <span className="text-3xl font-bold text-[#E43632]">${newUnitPrice.toFixed(3)}</span>
                            <span className="text-sm text-gray-500 font-medium">/ result</span>
                         </div>
                         <span className="text-xs text-gray-400 line-through block mt-1">was ${baseUnitPrice.toFixed(3)}</span>
                      </div>
                   </div>
                   
                   <Slider 
                      value={volume} 
                      onValueChange={(val) => versionStatus === 'Awaiting Client Approval' && setVolume(val)} 
                      max={25000} 
                      step={500} 
                      min={500}
                      className={cn("mb-8", versionStatus !== 'Awaiting Client Approval' && "opacity-50 pointer-events-none")}
                   />

                   {/* Pricing Tiers Viz */}
                   <div className="grid grid-cols-4 text-center gap-2 text-[10px] text-gray-400 mb-2">
                      <div className={unitCount < 2500 ? "text-[#E43632] font-bold" : ""}>{'< 2.5k'}</div>
                      <div className={unitCount >= 2500 && unitCount < 5000 ? "text-[#E43632] font-bold" : ""}>{'2.5k+'}</div>
                      <div className={unitCount >= 5000 && unitCount < 10000 ? "text-[#E43632] font-bold" : ""}>{'5k+'}</div>
                      <div className={unitCount >= 10000 ? "text-[#E43632] font-bold" : ""}>{'10k+'}</div>
                   </div>
                   <div className="flex w-full h-2 rounded-full overflow-hidden bg-gray-200 mb-6">
                      <div className={`flex-1 transition-colors ${unitCount < 2500 ? "bg-[#E43632]" : "bg-gray-300"}`} />
                      <div className={`flex-1 transition-colors ${unitCount >= 2500 && unitCount < 5000 ? "bg-[#E43632]" : "bg-gray-300"}`} />
                      <div className={`flex-1 transition-colors ${unitCount >= 5000 && unitCount < 10000 ? "bg-[#E43632]" : "bg-gray-300"}`} />
                      <div className={`flex-1 transition-colors ${unitCount >= 10000 ? "bg-[#E43632]" : "bg-gray-300"}`} />
                   </div>

                   <div className="flex items-start gap-3 pt-4 border-t border-gray-200">
                      <Info size={16} className="text-blue-500 mt-0.5 shrink-0" />
                      <p className="text-xs text-gray-500 leading-relaxed">
                         <strong>Impact Analysis:</strong> Your estimated monthly spend will increase from ${(unitCount * baseUnitPrice).toLocaleString()} to <strong>${monthlyCost.toLocaleString()}</strong> due to the new complexity.
                      </p>
                   </div>

                   {/* Action Button inside card for cohesion */}
                   {versionStatus === 'Awaiting Client Approval' && (
                     <div className="mt-6 pt-6 border-t border-gray-200">
                       <Button 
                         onClick={() => setShowQuoteModal(true)}
                         className="w-full h-12 bg-[#E43632] hover:bg-[#C12E2A] text-white font-bold shadow-lg shadow-red-500/20"
                       >
                         Review & Sign v1.1 Amendment
                       </Button>
                     </div>
                   )}
                   
                   {versionStatus !== 'Awaiting Client Approval' && (
                     <div className="mt-6 pt-6 border-t border-gray-200">
                        <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3 text-center">
                           <p className="text-xs font-bold text-emerald-700 flex items-center justify-center gap-2">
                              <CheckCircle2 size={14} /> v1.1 Amendment Signed
                           </p>
                        </div>
                     </div>
                   )}
                </div>
             </Card>
          </div>

          {/* RIGHT COLUMN */}
          <div className="space-y-6">
            
            {/* 4. VERSION SPECIFIC ETA */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm relative overflow-hidden">
               <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50 rounded-bl-full -mr-4 -mt-4" />
               
               <div className="relative">
                  <div className="flex items-center gap-2 mb-4 text-gray-500 text-xs font-bold uppercase tracking-wider">
                    <Clock size={12} /> v1.1 Completion
                  </div>
                  <h3 className="text-3xl font-bold text-[#0A0A0A] mb-2">Friday</h3>
                  <p className="text-lg text-gray-500 font-medium mb-6">by 2:40 PM EST</p>
                  
                  <div className="bg-gray-50 rounded-lg p-3 border border-gray-100 flex gap-3 items-start">
                    <Sparkles size={16} className="text-purple-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-gray-600 leading-relaxed">
                      <span className="font-bold text-purple-700">AI Forecast:</span> Based on the +3 step delta, v1.1 is on track.
                    </p>
                  </div>
               </div>
            </div>

            {/* 5. OUTSTANDING ITEMS (VERSIONED) */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-[300px]">
               <div className="p-4 border-b border-gray-100 bg-amber-50/30 flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-sm text-[#0A0A0A]">
                     <AlertTriangle size={16} className="text-amber-500" />
                     v1.1 Action Items
                  </div>
                  <Badge className="bg-amber-100 text-amber-800 border-amber-200">{outstandingItems.length}</Badge>
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
                         <p className="text-sm">v1.1 Requirements Met</p>
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
                             <Badge variant="outline" className="text-[9px] bg-white border-amber-200 text-amber-700 uppercase tracking-wider">
                               {item.type}
                             </Badge>
                             <button 
                               onClick={() => handleFixItem(item.id)}
                               className="text-[10px] font-bold text-[#E43632] opacity-0 group-hover:opacity-100 transition-opacity flex items-center hover:underline"
                             >
                               Fix Now <ChevronRight size={10} />
                             </button>
                           </div>
                           <p className="text-sm font-bold text-[#0A0A0A] leading-tight mb-1">{item.title}</p>
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
        
        {/* 7. VERSIONED BUILD LOG */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
           <div className="flex items-center justify-between mb-6">
              <h3 className="font-bold text-[#0A0A0A] flex items-center gap-2">
                <History size={16} className="text-gray-400" /> v1.1 Build History
              </h3>
              <Button variant="ghost" size="sm" className="text-xs h-8">Full Log</Button>
           </div>
           <div className="relative pl-2">
              <div className="absolute left-2 top-2 bottom-2 w-px bg-gray-100" />
              <div className="flex gap-8 overflow-x-auto pb-4 pl-4 no-scrollbar">
                 {[
                   { time: 'Just Now', title: 'Pricing Delta Generated', type: 'info' },
                   { time: '2h ago', title: 'Delta: +3 Steps Detected', type: 'info' },
                   { time: 'Yesterday', title: 'v1.1 Created from v1.0', type: 'info' },
                 ].map((log, idx) => (
                   <div key={idx} className="flex flex-col min-w-[160px] relative">
                      <div className={cn(
                        "w-4 h-4 rounded-full border-2 flex items-center justify-center bg-white z-10 mb-3",
                        "border-gray-300 text-gray-300"
                      )}>
                        <div className="w-1.5 h-1.5 rounded-full bg-current" />
                      </div>
                      <p className="text-xs font-bold text-[#0A0A0A] mb-1">{log.title}</p>
                      <p className="text-[10px] text-gray-400 font-mono">{log.time}</p>
                   </div>
                 ))}
              </div>
           </div>
        </div>

        {/* 7. READY TO LAUNCH CTA */}
        {versionStatus === 'Build in Progress' && currentStep >= 4 && (
           <motion.div 
             initial={{ opacity: 0, y: 20 }}
             animate={{ opacity: 1, y: 0 }}
             className="bg-[#0A0A0A] rounded-2xl p-10 text-center text-white relative overflow-hidden shadow-2xl"
           >
              <div className="relative z-10 flex flex-col items-center max-w-2xl mx-auto">
                 <Badge className="mb-6 bg-[#E43632] text-white border-none px-4 py-1.5 text-sm">
                   v1.1 Ready
                 </Badge>
                 <h2 className="text-4xl font-bold mb-4">Deploy Version 1.1</h2>
                 <p className="text-gray-400 mb-8 text-lg leading-relaxed">
                   Going live will immediately supersede v1.0. New pricing and logic will take effect for all subsequent executions.
                 </p>
                 <Button 
                   size="lg" 
                   onClick={() => {
                     setVersionStatus('active');
                     setShowLaunchModal(true);
                   }}
                   className="h-14 px-10 bg-[#E43632] hover:bg-[#C12E2A] text-white font-bold text-lg rounded-full shadow-[0_0_30px_rgba(228,54,50,0.5)] hover:shadow-[0_0_50px_rgba(228,54,50,0.7)] transition-all hover:-translate-y-1"
                 >
                   <Rocket size={20} className="mr-2" /> Go Live with v1.1
                 </Button>
              </div>
           </motion.div>
        )}

        {/* MODALS */}
        <QuoteSignatureModal 
           open={showQuoteModal}
           onOpenChange={setShowQuoteModal}
           onSign={handleQuoteSigned}
           volume={volume[0]}
           unitPrice={newUnitPrice}
           monthlyCost={monthlyCost}
           buildFee={totalBuildFee}
        />
        
        {/* Changes Modal (Mock) */}
        <Dialog open={showChangesModal} onOpenChange={setShowChangesModal}>
          <DialogContent>
             <DialogHeader>
               <DialogTitle>Version 1.1 Changes</DialogTitle>
               <DialogDescription>Comparison against v1.0</DialogDescription>
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
                 <Badge variant="outline" className="text-emerald-600 bg-emerald-50 border-emerald-200">+3 New</Badge>
               </div>
             </div>
          </DialogContent>
        </Dialog>

      </div>
    </div>
  );
};

'use client';
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { HeroBlueprint } from './HeroBlueprint';
import { cn } from '../../lib/utils';

const STEPS = [
  { 
    id: 1, 
    label: "Step 1 · Describe", 
    title: "You describe your process",
    description: "Explain your workflow in plain English or upload screenshots. CoPilot understands your intent.",
    duration: 5000 
  },
  { 
    id: 2, 
    label: "Step 2 · Blueprint", 
    title: "AI constructs the blueprint",
    description: "CoPilot instantly architects the visual flow, handling logic, data models, and API connections.",
    duration: 5000 
  },
  { 
    id: 3, 
    label: "Step 3 · Monitor", 
    title: "Humans monitor 24/7",
    description: "Our expert ops team watches your automation runs, fixing edge cases before they become issues.",
    duration: 5000 
  },
  { 
    id: 4, 
    label: "Step 4 · Pay per Outcome", 
    title: "Pay only for success",
    description: "Forget hourly rates. You only pay when the job is successfully completed.",
    duration: 7000 
  },
];

export const HeroProductFrame: React.FC = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (isPaused) return;
    
    let timer: NodeJS.Timeout;
    
    const runSequence = () => {
       const stepConfig = STEPS.find(s => s.id === currentStep);
       const duration = stepConfig?.duration || 4000;

       timer = setTimeout(() => {
          setCurrentStep(prev => (prev === 4 ? 1 : prev + 1));
       }, duration);
    };

    runSequence();
    return () => clearTimeout(timer);
  }, [currentStep, isPaused]);

  const currentStepConfig = STEPS.find(s => s.id === currentStep);

  return (
    <div className="w-full max-w-[1400px] mx-auto relative z-10">
       
       {/* Browser Shell */}
       <div 
         className="rounded-xl md:rounded-2xl overflow-hidden bg-white shadow-[0_0_50px_-12px_rgba(0,0,0,0.15)] border border-gray-200/60 ring-1 ring-black/5 relative h-[700px] md:h-[750px] lg:h-[800px]"
         onMouseEnter={() => setIsPaused(true)}
         onMouseLeave={() => setIsPaused(false)}
       >
          
          {/* Browser Bar */}
          <div className="h-8 md:h-10 bg-[#fcfcfc] border-b border-gray-200 flex items-center px-4 justify-between shrink-0">
             <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-[#FF5F57] border border-[#E0443E]" />
                <div className="w-2.5 h-2.5 rounded-full bg-[#FEBC2E] border border-[#D89E24]" />
                <div className="w-2.5 h-2.5 rounded-full bg-[#28C840] border border-[#1AAB29]" />
             </div>
             
             {/* Address Bar / Step Label */}
             <div className="bg-gray-100/50 border border-gray-200 rounded px-3 py-0.5 flex items-center justify-center min-w-[240px]">
                <AnimatePresence mode="wait">
                  <motion.span 
                    key={currentStep}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    className="text-[10px] md:text-xs font-medium text-gray-500 flex items-center gap-2"
                  >
                    <span className={cn(
                       "w-1.5 h-1.5 rounded-full",
                       currentStep === 1 ? "bg-blue-500" :
                       currentStep === 2 ? "bg-purple-500" :
                       currentStep === 3 ? "bg-amber-500" : "bg-emerald-500"
                    )} />
                    {currentStepConfig?.label}
                  </motion.span>
                </AnimatePresence>
             </div>

             <div className="w-12" /> {/* Spacer */}
          </div>

          {/* Viewport */}
          <div className="relative w-full h-full bg-white group">
             <HeroBlueprint step={currentStep as 1|2|3|4} />

             {/* Step Description Overlay */}
             <AnimatePresence mode="wait">
               {currentStep === 1 && (
                   <motion.div
                     key="step1"
                     initial={{ opacity: 0, y: 10 }}
                     animate={{ opacity: 1, y: 0 }}
                     exit={{ opacity: 0, y: -10 }}
                     className="absolute bottom-24 left-8 max-w-xs z-50 hidden md:block"
                   >
                      <OverlayCard step={1} config={STEPS[0]} arrow="down" />
                   </motion.div>
               )}
               {currentStep === 2 && (
                   <motion.div
                     key="step2"
                     initial={{ opacity: 0, x: -10 }}
                     animate={{ opacity: 1, x: 0 }}
                     exit={{ opacity: 0, x: 10 }}
                     className="absolute top-[300px] md:left-[350px] max-w-xs z-50 hidden md:block"
                   >
                      <OverlayCard step={2} config={STEPS[1]} arrow="right" />
                   </motion.div>
               )}
               {currentStep === 3 && (
                   <motion.div
                     key="step3"
                     initial={{ opacity: 0, x: 10 }}
                     animate={{ opacity: 1, x: 0 }}
                     exit={{ opacity: 0, x: -10 }}
                     className="absolute top-20 right-8 max-w-xs z-50 hidden md:block"
                   >
                      <OverlayCard step={3} config={STEPS[2]} arrow="up" />
                   </motion.div>
               )}
               {currentStep === 4 && (
                   <motion.div
                     key="step4"
                     initial={{ opacity: 0, x: -10 }}
                     animate={{ opacity: 1, x: 0 }}
                     exit={{ opacity: 0, x: 10 }}
                     className="absolute bottom-12 right-[350px] max-w-xs z-50 hidden md:block"
                   >
                      <OverlayCard step={4} config={STEPS[3]} arrow="right" />
                   </motion.div>
               )}
             </AnimatePresence>
          </div>

       </div>

       {/* Manual Controls - Moved outside browser shell */}
       <div className="mt-6 flex justify-center">
          <div className="flex items-center gap-2 bg-black/5 backdrop-blur-sm p-1.5 rounded-full hover:bg-black/10 transition-colors">
             {STEPS.map((step) => (
                <button
                  key={step.id}
                  onClick={() => setCurrentStep(step.id)}
                  className={cn(
                     "w-2 h-2 rounded-full transition-all duration-300",
                     currentStep === step.id ? "bg-[#E43632] w-6" : "bg-gray-400/50 hover:bg-gray-600"
                  )}
                />
             ))}
          </div>
       </div>

       {/* Caption */}
       <div className="mt-4 text-center">
          <p className="text-sm text-gray-400 font-medium tracking-wide uppercase">
             From plain-language process to monitored automation — built and run for you
          </p>
       </div>

    </div>
  );
};

const OverlayCard = ({ step, config, arrow }: { step: number, config: any, arrow: 'up' | 'down' | 'left' | 'right' }) => (
  <div className="relative bg-black backdrop-blur-md border border-white/10 p-4 rounded-xl shadow-2xl ring-1 ring-white/5 text-white z-50">
      {/* Arrow Pointer */}
      <div className={cn(
          "absolute w-3 h-3 bg-black border-white/10 rotate-45 transform z-50",
          arrow === 'down' && "bottom-[-6px] left-8 border-r border-b",
          arrow === 'up' && "top-[-6px] right-8 border-l border-t",
          arrow === 'right' && "right-[-6px] top-1/2 -translate-y-1/2 border-r border-t",
          arrow === 'left' && "left-[-6px] top-1/2 -translate-y-1/2 border-l border-b"
      )} />

      <div className="flex items-center gap-2 mb-2 relative z-50">
          <div className={cn(
            "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-sm ring-1 ring-white/20",
            step === 1 ? "bg-blue-600" :
            step === 2 ? "bg-purple-600" :
            step === 3 ? "bg-amber-600" : "bg-emerald-600"
          )}>
            {step}
          </div>
          <h3 className="text-sm font-bold text-white">{config?.title}</h3>
      </div>
      <p className="text-xs text-gray-300 leading-relaxed font-medium relative z-50">
          {config?.description}
      </p>
  </div>
);

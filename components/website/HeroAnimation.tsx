'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CardChatWorkflow } from './hero/CardChatWorkflow';
import { CardCollaboration } from './hero/CardCollaboration';
import { CardLaunchDashboard } from './hero/CardLaunchDashboard';
import { cn } from '@/lib/utils';

export const HeroAnimation = () => {
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % 3);
    }, 6000); // Switch every 6 seconds
    return () => clearInterval(interval);
  }, []);

  const steps = [
    {
      id: 'chat',
      title: 'Describe',
      component: <CardChatWorkflow />,
      description: 'Chat to Workflow'
    },
    {
      id: 'collab',
      title: 'Refine',
      component: <CardCollaboration />,
      description: 'Multiplayer Edit'
    },
    {
      id: 'launch',
      title: 'Launch',
      component: <CardLaunchDashboard />,
      description: 'Live Dashboard'
    }
  ];

  return (
    <div className="relative w-full h-[600px] flex flex-col items-center justify-center perspective-1000">
      
      {/* Main Card Container */}
      <div className="relative w-full max-w-5xl aspect-[16/10] z-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeStep}
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 1.05, filter: 'blur(10px)' }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0 w-full h-full"
          >
            {steps[activeStep].component}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Step Indicators (Bottom) */}
      <div className="mt-8 flex items-center gap-4 bg-white/5 backdrop-blur-sm border border-white/10 px-2 py-2 rounded-full">
        {steps.map((step, index) => (
          <button
            key={step.id}
            onClick={() => setActiveStep(index)}
            className={cn(
              "px-4 py-1.5 rounded-full text-xs font-bold transition-all duration-300 flex items-center gap-2",
              activeStep === index 
                ? "bg-white text-black shadow-lg shadow-white/10 scale-105" 
                : "text-gray-400 hover:text-white hover:bg-white/5"
            )}
          >
            {/* Progress Bar for Active Step */}
            {activeStep === index && (
               <motion.div 
                  layoutId="active-pill"
                  className="absolute inset-0 bg-white rounded-full -z-10"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
               />
            )}
            <span className="relative z-10">{step.title}</span>
          </button>
        ))}
      </div>

    </div>
  );
};

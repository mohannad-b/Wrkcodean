"use client";

import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OnboardingStart } from "@/components/onboarding/OnboardingStart";
import { OnboardingIntake } from "@/components/onboarding/OnboardingIntake";
import { OnboardingPricing } from "@/components/onboarding/OnboardingPricing";
import { OnboardingSuccess } from "@/components/onboarding/OnboardingSuccess";

export function OnboardingFlow({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(1);

  const nextStep = () => setStep((s) => s + 1);
  const prevStep = () => setStep((s) => Math.max(s - 1, 1));

  return (
    <div className="h-screen w-full bg-white overflow-hidden flex flex-col">
      {/* Header (Hidden on Success) */}
      {step !== 4 && (
        <header className="h-16 border-b border-gray-100 flex items-center justify-between px-6 shrink-0 bg-white z-50">
          <div className="flex items-center gap-4">
            {step > 1 && step < 4 && (
              <Button variant="ghost" size="icon" onClick={prevStep} className="hover:bg-gray-100">
                <ArrowLeft size={18} className="text-gray-500" />
              </Button>
            )}
            <span className="text-sm font-bold text-[#0A0A0A]">Build New Automation</span>
          </div>

          {step > 1 && step < 4 && (
            <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
              <span className={step === 2 ? "text-[#E43632] font-bold" : ""}>Blueprint</span>
              <span className="text-gray-300">/</span>
              <span className={step === 3 ? "text-[#E43632] font-bold" : ""}>Review</span>
            </div>
          )}
        </header>
      )}

      {/* Content */}
      <div className="flex-1 relative overflow-hidden bg-gray-50">
        <div className="w-full h-full transition-all duration-300">
          {step === 1 && <OnboardingStart onStart={nextStep} />}
          {step === 2 && <OnboardingIntake onNext={nextStep} />}
          {step === 3 && <OnboardingPricing onComplete={nextStep} />}
          {step === 4 && <OnboardingSuccess onComplete={onComplete} />}
        </div>
      </div>
    </div>
  );
}

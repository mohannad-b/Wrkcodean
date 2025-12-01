"use client";

import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";
import { useRouter } from "next/navigation";

export default function NewAutomationPage() {
  const router = useRouter();

  const handleComplete = () => {
    // Redirect to the automations list page
    router.push("/automations");
  };

  return (
    <div className="h-full overflow-hidden">
      <OnboardingFlow onComplete={handleComplete} />
    </div>
  );
}




import {
  BlueprintGallery as WorkflowGallery,
  ComparisonBlock,
  HowItWorks,
  PricingOverview,
  TrustSection,
} from "@/components/website/HomeSections";
import { NewHero } from "@/components/website/NewHero";

export default function HomePage() {
  return (
    <div className="bg-[#F9FAFB] font-sans text-[#0A0A0A] selection:bg-[#E43632] selection:text-white">
      <NewHero />
      <HowItWorks />
      <WorkflowGallery />
      <PricingOverview />
      <ComparisonBlock />
      <TrustSection />
    </div>
  );
}


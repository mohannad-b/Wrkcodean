import { AutomationSummary } from "@/lib/types";
import { AutomationCard } from "./AutomationCard";

interface AutomationGridProps {
  automations: AutomationSummary[];
}

export function AutomationGrid({ automations }: AutomationGridProps) {
  if (automations.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
      {automations.map((automation) => (
        <AutomationCard key={automation.id} automation={automation} />
      ))}
    </div>
  );
}




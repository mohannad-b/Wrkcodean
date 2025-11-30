import { SectionCard } from "@/components/ui/SectionCard";
import { SpendSummary } from "@/lib/admin-mock";
import { DollarSign, TrendingUp, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface SpendSummaryCardProps {
  summary: SpendSummary;
}

export function SpendSummaryCard({ summary }: SpendSummaryCardProps) {
  const { committedMonthlySpend, currentMonthSpend, setupFeesCollected, utilizationPercent } = summary;

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
      <SectionCard className="p-6">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-bold text-gray-500 uppercase">Committed MRR</p>
          <DollarSign size={16} className="text-gray-400" />
        </div>
        <p className="text-2xl font-mono font-bold text-[#0A0A0A]">
          ${committedMonthlySpend.toLocaleString()}
        </p>
        <p className="text-xs text-gray-500 mt-1">Monthly recurring</p>
      </SectionCard>

      <SectionCard className="p-6">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-bold text-gray-500 uppercase">Current Month</p>
          <TrendingUp size={16} className="text-gray-400" />
        </div>
        <p className="text-2xl font-mono font-bold text-[#0A0A0A]">
          ${currentMonthSpend.toLocaleString()}
        </p>
        <p className="text-xs text-gray-500 mt-1">Active spend</p>
      </SectionCard>

      <SectionCard className="p-6">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-bold text-gray-500 uppercase">Setup Fees</p>
          <CheckCircle2 size={16} className="text-gray-400" />
        </div>
        <p className="text-2xl font-mono font-bold text-[#0A0A0A]">
          ${setupFeesCollected.toLocaleString()}
        </p>
        <p className="text-xs text-gray-500 mt-1">Total collected</p>
      </SectionCard>

      <SectionCard className="p-6">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-bold text-gray-500 uppercase">Utilization</p>
          <div
            className={cn(
              "w-3 h-3 rounded-full",
              utilizationPercent >= 100
                ? "bg-emerald-500"
                : utilizationPercent >= 80
                ? "bg-emerald-400"
                : utilizationPercent >= 50
                ? "bg-amber-400"
                : "bg-red-400"
            )}
          />
        </div>
        <p
          className={cn(
            "text-2xl font-mono font-bold",
            utilizationPercent > 100 ? "text-red-600" : "text-emerald-600"
          )}
        >
          {utilizationPercent.toFixed(0)}%
        </p>
        <p className="text-xs text-gray-500 mt-1">Active / Committed</p>
      </SectionCard>
    </div>
  );
}

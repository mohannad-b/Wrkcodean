import { ArrowRight, ArrowUpRight, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { KpiStat } from "@/lib/metrics/kpi";

export function KpiCard({
  icon: Icon,
  label,
  value,
  trend,
  trendPositive,
  subtext,
  placeholder,
  onConfigure,
  isLoading,
}: KpiStat & { isLoading?: boolean }) {
  const pillClass = placeholder
    ? "text-gray-400 bg-gray-100"
    : trendPositive
      ? "text-emerald-700 bg-emerald-50"
      : "text-amber-700 bg-amber-50";

  return (
    <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-[0_2px_8px_rgba(0,0,0,0.02)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.04)] transition-all group">
      <div className="flex items-start justify-between mb-4 gap-2 min-w-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 bg-gray-50 rounded-lg group-hover:bg-red-50 group-hover:text-[#E43632] transition-colors text-gray-400">
            <Icon size={18} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#0A0A0A] whitespace-nowrap">{label}</p>
            <p className="text-[10px] text-gray-400 mt-0.5 whitespace-nowrap">{subtext}</p>
          </div>
        </div>
        {onConfigure || !placeholder ? (
          <div className="flex items-center gap-1">
            {onConfigure ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-gray-400 hover:text-[#0A0A0A] relative -top-5 translate-x-[10px]"
                onClick={(e) => {
                  e.stopPropagation();
                  onConfigure();
                }}
              >
                <Settings2 size={14} />
              </Button>
            ) : null}
            {!placeholder ? (
              <div className={cn("flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full", pillClass)}>
                {trendPositive ? <ArrowUpRight size={10} /> : <ArrowRight size={10} className="rotate-45" />}
                {trend}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      {placeholder ? (
        <div className="flex flex-col items-center justify-center text-gray-400 gap-2 py-2">
          <div className="h-6 w-6 rounded-full border-2 border-dashed border-gray-300 animate-spin" />
          <p className="text-[11px] font-medium">populates after first live run</p>
        </div>
      ) : (
        <div>
          <h3 className={cn("text-2xl font-bold mb-1 tracking-tight", placeholder ? "text-gray-400" : "text-[#0A0A0A]")}>
            {isLoading ? "Refreshing..." : value}
          </h3>
        </div>
      )}
    </div>
  );
}

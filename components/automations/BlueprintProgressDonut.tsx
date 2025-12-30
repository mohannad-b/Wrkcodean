import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface WorkflowProgressDonutProps {
  progress?: number;
  complete?: boolean;
  size?: number;
  thickness?: number;
  className?: string;
  showPercentage?: boolean;
}

const clamp = (value: number) => Math.min(Math.max(value, 0), 1);

const getProgressColor = (value: number) => {
  const clamped = clamp(value);
  const hue = 0 + clamped * 120; // shift from red (0deg) to green (120deg)
  const lightness = clamped > 0.85 ? 40 : 50;
  return `hsl(${hue}, 70%, ${lightness}%)`;
};

export function WorkflowProgressDonut({
  progress = 0,
  complete = false,
  size = 28,
  thickness = 4,
  className,
  showPercentage = true,
}: WorkflowProgressDonutProps) {
  const clamped = clamp(progress);
  const angle = clamped * 360;
  const fillColor = getProgressColor(clamped);

  return (
    <div
      className={cn("relative isolate flex items-center justify-center", className)}
      style={{ width: size, height: size }}
      aria-label={complete ? "Section complete" : `Section ${Math.round(clamped * 100)}% complete`}
      role="img"
    >
      <div
        className="absolute inset-0 rounded-full transition-[background] duration-500"
        style={{ background: `conic-gradient(${fillColor} ${angle}deg, #E5E7EB ${angle}deg)` }}
      />
      <div className="absolute rounded-full bg-white" style={{ inset: thickness }} />
      <div
        className={cn(
          "relative flex items-center justify-center text-[9px] font-semibold text-gray-500 transition-opacity duration-300",
          complete ? "text-emerald-600" : clamped === 0 ? "opacity-0" : "opacity-100"
        )}
        style={{ width: size - thickness * 2, height: size - thickness * 2 }}
      >
        {complete ? (
          <Check className="h-3.5 w-3.5 text-emerald-500" strokeWidth={3} />
        ) : showPercentage ? (
          <span>{Math.round(clamped * 100)}%</span>
        ) : null}
      </div>
    </div>
  );
}


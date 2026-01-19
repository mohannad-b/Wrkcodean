import { Loader2 } from "lucide-react";

interface BuildActivityPanelProps {
  phase: string;
  lastLine: string | null;
  isRunning: boolean;
}

export function BuildActivityPanel({ phase, lastLine, isRunning }: BuildActivityPanelProps) {
  return (
    <div className="border-t border-gray-200 bg-white px-4 py-2">
      <div className="flex items-center gap-2 text-xs text-gray-600">
        {isRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin text-[#E43632]" /> : null}
        <span className="font-semibold capitalize">{phase || "Working"}</span>
        {lastLine ? <span className="text-gray-400">• {lastLine}</span> : null}
      </div>
    </div>
  );
}

import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

export function SaveIndicator({
  state,
  lastSavedAt,
  error,
  onRetry,
}: {
  state: SaveState;
  lastSavedAt: Date | null;
  error?: string | null;
  onRetry?: () => void;
}) {
  const savedText = lastSavedAt ? `Saved ${formatDistanceToNow(lastSavedAt, { addSuffix: true })}` : "Saved";

  if (state === "saving") {
    return (
      <div
        className="flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full border border-gray-200 bg-white shadow-sm"
        data-testid="save-indicator"
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-500" />
        <span className="text-gray-700">Saving…</span>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div
        className="flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full border border-red-200 bg-red-50 text-red-700 shadow-sm"
        data-testid="save-indicator"
      >
        <AlertTriangle className="h-3.5 w-3.5" />
        <span>{error || "Save failed"}</span>
        {onRetry ? (
          <Button size="sm" variant="secondary" className="h-6 text-[11px]" onClick={onRetry}>
            Retry
          </Button>
        ) : null}
      </div>
    );
  }

  if (state === "dirty") {
    return (
      <div
        className="flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full border border-amber-200 bg-amber-50 text-amber-800 shadow-sm"
        data-testid="save-indicator"
      >
        <Sparkles className="h-3.5 w-3.5" />
        <span>Unsaved changes</span>
      </div>
    );
  }

  if (state === "saved") {
    return (
      <div
        className="flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 shadow-sm"
        data-testid="save-indicator"
      >
        <CheckCircle2 className="h-3.5 w-3.5" />
        <span>{savedText}</span>
      </div>
    );
  }

  return null;
}

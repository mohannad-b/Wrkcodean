"use client";

import { GitBranch, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type EdgeDetails = {
  id: string;
  label?: string;
  branchLetter?: string;
  condition?: string;
  sourceName?: string;
  targetName?: string;
  displayId?: string;
};

interface EdgeInspectorProps {
  edge: EdgeDetails | null;
  onChange: (edgeId: string, updates: { label?: string; condition?: string }) => void;
  onDelete: (edgeId: string) => void;
  onClose?: () => void;
}

export function EdgeInspector({ edge, onChange, onDelete, onClose }: EdgeInspectorProps) {
  if (!edge) {
    return (
      <div
        className="h-full flex flex-col items-center justify-center bg-white border-l border-gray-200 p-8 text-center"
        data-testid="edge-inspector"
      >
        <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mb-4 border border-gray-100">
          <GitBranch className="text-gray-400" size={20} />
        </div>
        <h3 className="text-[#0A0A0A] font-bold mb-2">No connection selected</h3>
        <p className="text-sm text-gray-500 max-w-[220px] mx-auto">
          Click a conditional line to edit its label or condition.
        </p>
      </div>
    );
  }

  const labelInputId = `${edge.id}-label`;
  const conditionInputId = `${edge.id}-condition`;

  const handleLabelChange = (value: string) => {
    onChange(edge.id, { label: value });
  };

  const handleConditionChange = (value: string) => {
    onChange(edge.id, { condition: value });
  };

  return (
    <div
      className="h-full flex flex-col bg-white border-l border-gray-200 shadow-xl shadow-gray-200/50 overflow-hidden"
      data-testid="edge-inspector"
    >
      <div className="flex-none px-6 py-5 border-b border-gray-100 bg-white sticky top-0 z-10">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">
                Edge {edge.displayId ?? edge.branchLetter ?? edge.id}
              </span>
              <span className="text-[10px] text-gray-300">•</span>
              <span className="text-[10px] text-gray-500">
                {edge.sourceName ?? "Unknown"} → {edge.targetName ?? "Unknown"}
              </span>
            </div>
            <h2 className="text-xl font-bold text-[#0A0A0A] leading-tight">
              {edge.label || edge.branchLetter || "Conditional path"}
            </h2>
          </div>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-gray-400 hover:text-red-600 transition-colors"
              onClick={() => onDelete(edge.id)}
            >
              <Trash2 size={16} />
            </Button>
            {onClose ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-gray-400 hover:text-[#0A0A0A] transition-colors"
                onClick={onClose}
              >
                <X size={16} />
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex-1 w-full overflow-y-auto min-h-0">
        <div className="p-6 space-y-6">
          <div className="space-y-2">
            <Label
              htmlFor={labelInputId}
              className="text-xs font-bold text-[#0A0A0A] uppercase tracking-wider"
            >
              Branch label
            </Label>
            <Input
              id={labelInputId}
              value={edge.label ?? ""}
              placeholder={edge.branchLetter ? `Branch ${edge.branchLetter}` : "Name this branch"}
              onChange={(event) => handleLabelChange(event.target.value)}
              className="text-sm"
            />
            <p className="text-[11px] text-gray-400">
              This appears on the connector and helps distinguish branches.
            </p>
          </div>

          <div className="space-y-2">
            <Label
              htmlFor={conditionInputId}
              className="text-xs font-bold text-[#0A0A0A] uppercase tracking-wider"
            >
              Condition
            </Label>
            <Textarea
              id={conditionInputId}
              value={edge.condition ?? ""}
              onChange={(event) => handleConditionChange(event.target.value)}
              placeholder="e.g. Amount > $10,000 or Status equals Approved"
              className="min-h-[100px] text-sm"
            />
            <p className="text-[11px] text-gray-400">
              Explain when this branch should run so teammates and copilots stay in sync.
            </p>
          </div>
        </div>
      </div>

      <div className="flex-none p-6 border-t border-gray-200 bg-white space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-xs text-gray-500">
            Connected to {edge.sourceName ?? "source"} → {edge.targetName ?? "target"}
          </div>
          <Button
            variant="outline"
            className={cn("text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700")}
            onClick={() => onDelete(edge.id)}
          >
            Delete connection
          </Button>
        </div>
      </div>
    </div>
  );
}


"use client";

import { useState, useRef, useEffect, memo } from "react";
import { BaseEdge, EdgeLabelRenderer, EdgeProps, getSmoothStepPath } from "reactflow";
import { ChevronDown, AlertCircle, Sparkles, ExternalLink, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

// This is the data we expect in the edge
interface ConditionEdgeData {
  label?: string;
  operator?: string;
  value?: string | number;
  unit?: string;
  isMissingInfo?: boolean;
  onLabelChange?: (
    id: string,
    newLabel: string,
    newData: { operator: string; value: string | number; unit: string }
  ) => void;
  onDelete?: (id: string) => void;
}

function ConditionEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  data,
  selected,
}: EdgeProps<ConditionEdgeData>) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const [isEditing, setIsEditing] = useState(false);
  const [operator, setOperator] = useState(data?.operator || ">");
  const [value, setValue] = useState(data?.value || "");
  const [unit, setUnit] = useState(data?.unit || "Dollars");
  const editorRef = useRef<HTMLDivElement>(null);

  // Close editor on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (editorRef.current && !editorRef.current.contains(event.target as Node)) {
        setIsEditing(false);
      }
    };

    if (isEditing) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isEditing]);

  const handleSave = () => {
    const newLabel = `${operator} ${unit === "Dollars" ? "$" : ""}${value}${unit === "Percent" ? "%" : ""}`;
    if (data?.onLabelChange) {
      data.onLabelChange(id, newLabel, { operator, value, unit });
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    }
  };

  // Mock AI suggestions
  const suggestions = [5000, 10000, 25000];

  return (
    <>
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          strokeWidth: 2,
          stroke: selected || isEditing ? "#E43632" : style.stroke || "#D1D5DB",
          transition: "stroke 0.3s ease",
        }}
      />

      <EdgeLabelRenderer>
        <div
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: "all",
            zIndex: 10,
          }}
          className="group"
        >
          {!isEditing ? (
            <div
              onClick={() => setIsEditing(true)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-full shadow-sm border cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5",
                selected
                  ? "border-[#E43632] ring-2 ring-[#E43632]/10"
                  : "border-gray-200 hover:border-[#E43632]/50",
                data?.isMissingInfo ? "border-amber-300 bg-amber-50" : ""
              )}
            >
              {data?.isMissingInfo && <AlertCircle size={12} className="text-amber-600" />}
              <span
                className={cn(
                  "text-xs font-bold",
                  data?.isMissingInfo ? "text-amber-800" : "text-gray-700"
                )}
              >
                {data?.label || "Set Condition"}
              </span>
              {selected && data?.onDelete && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    data.onDelete?.(id);
                  }}
                  className="ml-1 p-0.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
                  title="Delete connection"
                >
                  <X size={12} />
                </button>
              )}
              {data?.isMissingInfo && (
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-white px-2 py-1 rounded shadow-lg border border-gray-100 whitespace-nowrap flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  <Sparkles size={10} className="text-[#E43632]" />
                  <span className="text-[10px] font-medium text-gray-600">
                    AI Suggests: Add a threshold
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div
              ref={editorRef}
              className="bg-white rounded-xl shadow-xl border border-gray-200 p-3 w-[220px] animate-in fade-in zoom-in-95 duration-200 flex flex-col gap-3"
            >
              {/* Inline Editor Inputs */}
              <div className="flex items-center gap-2">
                <div className="relative w-[60px]">
                  <select
                    value={operator}
                    onChange={(e) => setOperator(e.target.value)}
                    className="w-full appearance-none bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 text-sm font-bold text-gray-700 focus:outline-none focus:border-[#E43632] focus:ring-1 focus:ring-[#E43632]"
                  >
                    <option value=">">&gt;</option>
                    <option value="<">&lt;</option>
                    <option value="=">=</option>
                    <option value=">=">&ge;</option>
                    <option value="<=">&le;</option>
                  </select>
                  <ChevronDown
                    size={12}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                  />
                </div>

                <div className="flex-1">
                  <input
                    type="number"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    autoFocus
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 text-sm font-medium text-gray-900 focus:outline-none focus:border-[#E43632] focus:ring-1 focus:ring-[#E43632]"
                    placeholder="Value"
                  />
                </div>
              </div>

              <div className="relative w-full">
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="w-full appearance-none bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-medium text-gray-600 focus:outline-none focus:border-[#E43632]"
                >
                  <option value="Dollars">USD Dollars ($)</option>
                  <option value="Percent">Percentage (%)</option>
                  <option value="">Number</option>
                </select>
                <ChevronDown
                  size={12}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                />
              </div>

              {/* AI Suggestions */}
              <div className="flex flex-col gap-1.5 pt-1 border-t border-gray-100">
                <div className="flex items-center gap-1 text-[10px] text-gray-400 font-medium">
                  <Sparkles size={10} className="text-[#E43632]" /> Suggested
                </div>
                <div className="flex flex-wrap gap-1">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      onClick={() => setValue(s.toString())}
                      className="text-[10px] bg-gray-50 hover:bg-red-50 hover:text-[#E43632] border border-gray-100 px-2 py-0.5 rounded-md transition-colors"
                    >
                      ${s.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Footer Links */}
              <div className="flex items-center justify-between pt-1">
                <button className="text-[10px] text-gray-400 hover:text-[#E43632] flex items-center gap-1 transition-colors">
                  Explain <Info size={10} />
                </button>
                <button className="text-[10px] text-[#E43632] font-medium hover:text-[#C12E2A] flex items-center gap-1 transition-colors">
                  Inspector <ExternalLink size={10} />
                </button>
              </div>
            </div>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export default memo(ConditionEdge);

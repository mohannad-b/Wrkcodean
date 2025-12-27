"use client";

import { memo, useState } from "react";
import { BaseEdge, EdgeLabelRenderer, EdgeProps, getSmoothStepPath } from "reactflow";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface DefaultEdgeData {
  onDelete?: (id: string) => void;
}

function DefaultEdge({
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
}: EdgeProps<DefaultEdgeData>) {
  const [isHovered, setIsHovered] = useState(false);
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const showDeleteButton = (selected || isHovered) && data?.onDelete;

  return (
    <>
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          strokeWidth: selected || isHovered ? 2.5 : 1.5,
          stroke: selected || isHovered ? "#E43632" : style.stroke || "#9CA3AF",
          transition: "stroke 0.2s ease, stroke-width 0.2s ease",
        }}
        // reactflow supports mouse handlers on edges for hover affordances
        // @ts-expect-error upstream types omit these handlers
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      />

      {showDeleteButton && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: "all",
              zIndex: 10,
            }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                data?.onDelete?.(id);
              }}
              className={cn(
                "p-1.5 rounded-full bg-white border shadow-sm transition-all",
                "hover:bg-red-50 hover:border-red-300 hover:shadow-md",
                "text-gray-400 hover:text-red-600",
                selected ? "border-red-300 ring-2 ring-red-100" : "border-gray-200"
              )}
              title="Delete connection"
            >
              <X size={14} />
            </button>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export default memo(DefaultEdge);


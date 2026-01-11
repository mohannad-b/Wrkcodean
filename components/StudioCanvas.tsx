'use client';
import React from "react";
import ReactFlow, {
  Background,
  Controls,
  type Node,
  type Edge,
  type Connection,
  BackgroundVariant,
  type OnNodesChange,
  type OnEdgesChange,
  type NodeTypes,
  type ReactFlowInstance,
} from "reactflow";
import "reactflow/dist/style.css";
import CustomNode from "./flow/CustomNode";
import ConditionEdge from "./flow/ConditionEdge";

const nodeTypes: NodeTypes = {
  custom: CustomNode,
};

const edgeTypes = {
  condition: ConditionEdge,
};

export interface StudioCanvasProps {
  nodes: Node[];
  edges: Edge[];
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: (connection: Connection) => void;
  onNodeClick: (event: React.MouseEvent, node: Node) => void;
  onEdgeClick?: (event: React.MouseEvent, edge: Edge) => void;
  onEdgeUpdate?: (oldEdge: Edge, connection: Connection) => void;
  emptyState?: React.ReactNode;
  isSynthesizing?: boolean;
  buildActivity?: {
    runId: string;
    phase: string;
    lastLine: string | null;
    lines: string[];
    isRunning: boolean;
    completedAt: number | null;
  } | null;
}

export const StudioCanvas: React.FC<StudioCanvasProps> = ({ 
  nodes, 
  edges, 
  onNodesChange, 
  onEdgesChange, 
  onConnect,
  onNodeClick,
  onEdgeClick,
  onEdgeUpdate,
  emptyState,
  isSynthesizing = false,
  buildActivity = null,
}) => {
  const [rfInstance, setRfInstance] = React.useState<ReactFlowInstance | null>(null);
  const [showDetails, setShowDetails] = React.useState(false);
  const [visible, setVisible] = React.useState(false);
  const hideTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  React.useEffect(() => {
    if (rfInstance && nodes.length > 0) {
      // Small delay to ensure nodes are rendered before fitting
      const timeout = setTimeout(() => {
         rfInstance.fitView({ duration: 800, padding: 0.2 });
      }, 100);
      return () => clearTimeout(timeout);
    }
    return undefined;
  }, [rfInstance, nodes.length, isSynthesizing]);

  React.useEffect(() => {
    if (!buildActivity) {
      setVisible(false);
      return;
    }
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    setVisible(true);
    if (!buildActivity.isRunning && !showDetails) {
      hideTimerRef.current = setTimeout(() => setVisible(false), 1500);
    }
    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    };
  }, [buildActivity, showDetails]);

  const phaseLabel = React.useMemo(() => {
    const normalized = (buildActivity?.phase ?? "").toLowerCase();
    switch (normalized) {
      case "understanding":
        return "Understanding";
      case "clarifying":
        return "Clarifying";
      case "drafting":
        return "Drafting";
      case "requirements":
        return "Requirements";
      case "tasks":
        return "Tasks";
      case "saving":
        return "Saving";
      case "ready":
      case "done":
        return "Ready";
      case "error":
        return "Error";
      default:
        return "Working";
    }
  }, [buildActivity]);
  
  return (
    <div className="w-full h-full bg-[#F9FAFB] relative">
      {/* Synthesizing Indicator */}
      {isSynthesizing && (
        <div 
          className="absolute top-8 left-1/2 -translate-x-1/2 z-50 bg-white/90 backdrop-blur border border-[#E43632]/20 px-4 py-2 rounded-full shadow-lg shadow-red-500/10 flex items-center gap-2 animate-in fade-in slide-in-from-top-4 duration-300"
        >
            <div className="relative w-2 h-2">
              <span className="absolute w-full h-full bg-[#E43632] rounded-full animate-ping opacity-75" />
              <span className="relative inline-flex rounded-full w-2 h-2 bg-[#E43632]" />
            </div>
            <span className="text-xs font-bold text-[#0A0A0A]">Synthesizing process...</span>
        </div>
      )}

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onEdgeUpdate={onEdgeUpdate}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onInit={setRfInstance}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        className="bg-[#F9FAFB]"
        defaultEdgeOptions={{ 
          type: 'default', 
          animated: false, 
          style: { stroke: '#9CA3AF', strokeWidth: 1.5 } 
        }}
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1.5} color="#E5E7EB" />
        <Controls className="!bg-white !border-gray-200 !shadow-sm !rounded-lg overflow-hidden [&>button]:!border-b-gray-100 [&>button]:text-gray-500 hover:[&>button]:text-[#E43632]" />
        {!nodes.length && emptyState ? (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            {emptyState}
          </div>
        ) : null}
      </ReactFlow>

      {visible && buildActivity ? (
        <div className="pointer-events-none absolute bottom-6 left-0 right-0 flex justify-center z-50">
          <div className="pointer-events-auto bg-gray-900/70 text-white px-4 py-3 rounded-xl shadow-lg backdrop-blur-sm max-w-xl w-full mx-8">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-wide text-gray-200">Build Activity</div>
                <div className="flex items-center gap-2">
                  {buildActivity.isRunning ? (
                    <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  ) : (
                    <span className="inline-flex h-2 w-2 rounded-full bg-gray-300" />
                  )}
                  <span className="text-sm font-semibold">
                    {buildActivity.isRunning ? "Building in the background — keep chatting." : "Ready"}
                  </span>
                  <span className="text-xs text-gray-200">{phaseLabel}</span>
                </div>
                {buildActivity.lastLine ? (
                  <div className="text-xs text-gray-100 mt-1 line-clamp-2">{buildActivity.lastLine}</div>
                ) : null}
              </div>
              <button
                type="button"
                className="text-[11px] text-gray-200 underline"
                onClick={() => setShowDetails((prev) => !prev)}
              >
                {showDetails ? "Hide details" : "Details"}
              </button>
            </div>
            {showDetails ? (
              <div className="mt-2 bg-black/30 rounded-md p-2 text-[11px] text-gray-100 max-h-40 overflow-auto space-y-1">
                {buildActivity.lines.slice(-10).map((line, idx) => (
                  <div key={`ba-line-${idx}`} className="flex items-start gap-2">
                    <span className="mt-1 block h-1 w-1 rounded-full bg-gray-400" />
                    <span className="leading-snug">{line}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default StudioCanvas;

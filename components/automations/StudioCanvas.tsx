"use client";

import "reactflow/dist/style.css";
import { useState, useEffect } from "react";
import ReactFlow, {
  Background,
  Controls,
  Node,
  Edge,
  Connection,
  OnNodesChange,
  OnEdgesChange,
  NodeTypes,
  BackgroundVariant,
  ReactFlowInstance,
  ReactFlowProvider,
} from "reactflow";
import CustomNode from "@/components/flow/CustomNode";
import ConditionEdge from "@/components/flow/ConditionEdge";

// Define nodeTypes and edgeTypes at module level - MUST be outside component for ReactFlow
// These are stable references that won't change between renders
const nodeTypes: NodeTypes = {
  custom: CustomNode,
};

const edgeTypes = {
  condition: ConditionEdge,
};

// Define defaultEdgeOptions at module level to avoid recreating on each render
const defaultEdgeOptions = {
  type: "default" as const,
  animated: false,
  style: { stroke: "#9CA3AF", strokeWidth: 1.5 },
};

interface StudioCanvasProps {
  nodes: Node[];
  edges: Edge[];
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: (connection: Connection) => void;
  onNodeClick: (event: React.MouseEvent, node: Node) => void;
  isSynthesizing?: boolean;
}

export function StudioCanvas({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onNodeClick,
  isSynthesizing = false,
}: StudioCanvasProps) {
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);

  useEffect(() => {
    if (rfInstance && nodes.length > 0) {
      // Small delay to ensure nodes are rendered before fitting
      const timeout = setTimeout(() => {
        rfInstance.fitView({ duration: 800, padding: 0.2 });
      }, 100);
      return () => clearTimeout(timeout);
    }
    return undefined;
  }, [rfInstance, nodes.length, isSynthesizing]);

  return (
    <ReactFlowProvider>
      <div className="w-full h-full bg-[#F9FAFB] relative">
        {/* Synthesizing Indicator */}
        {isSynthesizing && (
          <div className="absolute top-8 left-1/2 -translate-x-1/2 z-50 bg-white/90 backdrop-blur border border-[#E43632]/20 px-4 py-2 rounded-full shadow-lg shadow-red-500/10 flex items-center gap-2 animate-in fade-in slide-in-from-top-4 duration-300">
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
          onNodeClick={onNodeClick}
          onInit={setRfInstance}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          className="bg-[#F9FAFB]"
          defaultEdgeOptions={defaultEdgeOptions}
          minZoom={0.1}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1.5} color="#E5E7EB" />
          <Controls className="!bg-white !border-gray-200 !shadow-sm !rounded-lg overflow-hidden [&>button]:!border-b-gray-100 [&>button]:text-gray-500 hover:[&>button]:text-[#E43632]" />
        </ReactFlow>
      </div>
    </ReactFlowProvider>
  );
}

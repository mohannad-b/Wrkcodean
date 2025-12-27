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
  onEdgeUpdate?: (oldEdge: Edge, connection: Connection) => void;
  emptyState?: React.ReactNode;
  isSynthesizing?: boolean;
}

export const StudioCanvas: React.FC<StudioCanvasProps> = ({ 
  nodes, 
  edges, 
  onNodesChange, 
  onEdgesChange, 
  onConnect,
  onNodeClick,
  onEdgeUpdate,
  emptyState,
  isSynthesizing = false 
}) => {
  const [rfInstance, setRfInstance] = React.useState<ReactFlowInstance | null>(null);

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
  
  return (
    <div className="w-full h-full bg-[#F9FAFB]">
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
    </div>
  );
};

export default StudioCanvas;

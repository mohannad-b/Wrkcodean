"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import ReactFlow, {
  Background,
  Controls,
  Node,
  Edge,
  Connection,
  OnNodesChange,
  OnEdgesChange,
  OnEdgeUpdateFunc,
  NodeTypes,
  BackgroundVariant,
  ReactFlowInstance,
  ReactFlowProvider,
  applyNodeChanges,
  type NodeChange,
} from "reactflow";
import CustomNode from "@/components/flow/CustomNode";
import ConditionEdge from "@/components/flow/ConditionEdge";
import DefaultEdge from "@/components/flow/DefaultEdge";

// Define nodeTypes and edgeTypes at module level - MUST be outside component for ReactFlow
// These are stable references that won't change between renders
const nodeTypes: NodeTypes = {
  custom: CustomNode,
};

// Use Object.freeze to ensure ReactFlow recognizes these as stable references
const edgeTypes = Object.freeze({
  condition: ConditionEdge,
  default: DefaultEdge,
});

// Define defaultEdgeOptions at module level to avoid recreating on each render
const defaultEdgeOptions = {
  type: "default" as const,
  animated: false,
  style: { stroke: "#9CA3AF", strokeWidth: 1.5 },
};

interface StudioCanvasProps {
  nodes: Node[];
  edges: Edge[];
  onNodesChange?: OnNodesChange;
  onEdgesChange?: OnEdgesChange;
  onConnect?: (connection: Connection) => void;
  onEdgeUpdate?: OnEdgeUpdateFunc;
  onNodeClick?: (event: React.MouseEvent, node: Node) => void;
  onEdgeClick?: (event: React.MouseEvent, edge: Edge) => void;
  isSynthesizing?: boolean;
  emptyState?: React.ReactNode;
}

export function StudioCanvas({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onEdgeUpdate,
  onNodeClick,
  onEdgeClick,
  isSynthesizing = false,
  emptyState,
}: StudioCanvasProps) {
  // Load ReactFlow styles client-side to avoid pulling CSS into server bundles
  useEffect(() => {
    void import("reactflow/dist/style.css");
  }, []);

  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);
  const [renderNodes, setRenderNodes] = useState<Node[]>(nodes);
  const previousNodeMap = useRef<Map<string, Node>>(new Map());
  useEffect(() => {
    const prevMap = previousNodeMap.current;
    const mappedNodes = nodes.map((node) => {
      const prev = prevMap.get(node.id);
      const isNew = !prev;
      const hasChanged =
        !!prev &&
        JSON.stringify(prev.data) !== JSON.stringify(node.data);
      return {
        ...node,
        data: {
          ...node.data,
          isNew,
          isUpdated: !isNew && hasChanged,
        },
      };
    });
    setRenderNodes(mappedNodes);
    previousNodeMap.current = new Map(nodes.map((node) => [node.id, node]));
  }, [nodes]);

  useEffect(() => {
    if (!rfInstance) {
      return undefined;
    }

    if (renderNodes.length === 0) {
      rfInstance.setCenter(0, 0, { zoom: 1 });
      return undefined;
    }

    const timeout = setTimeout(() => {
      rfInstance.fitView({ duration: 800, padding: 0.6 });
      const zoomTarget = Math.min(1, Math.max(0.25, 1.2 - renderNodes.length * 0.05));
      rfInstance.zoomTo(zoomTarget, { duration: 400 });
    }, 100);
    return () => clearTimeout(timeout);
  }, [rfInstance, renderNodes.length, isSynthesizing]);

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setRenderNodes((current) => applyNodeChanges(changes, current));
      onNodesChange?.(changes);
    },
    [onNodesChange]
  );

  return (
    <ReactFlowProvider>
      <div className="w-full h-full bg-[#F9FAFB] relative" data-testid="canvas-pane">
        {/* Synthesizing Indicator */}
        {isSynthesizing && (
          <div className="absolute top-8 left-1/2 -translate-x-1/2 z-50 bg-white/90 backdrop-blur border border-[#E43632]/20 px-4 py-2 rounded-full shadow-lg shadow-red-500/10 flex items-center gap-2 animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="relative w-2 h-2">
              <span className="absolute w-full h-full bg-[#E43632] rounded-full animate-ping opacity-75" />
              <span className="relative inline-flex rounded-full w-2 h-2 bg-[#E43632]" />
            </div>
            <span className="text-xs font-bold text-[#0A0A0A]">Updating flowchart...</span>
          </div>
        )}

        <ReactFlow
          nodes={renderNodes}
          edges={edges}
          onNodesChange={handleNodesChange}
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
          defaultEdgeOptions={defaultEdgeOptions}
          minZoom={0.1}
          maxZoom={2}
          nodesDraggable
          nodesConnectable={Boolean(onConnect)}
          connectOnClick={Boolean(onConnect)}
          panOnDrag
          nodesFocusable
          elementsSelectable
          selectNodesOnDrag={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1.5} color="#E5E7EB" />
          <Controls className="!bg-white !border-gray-200 !shadow-sm !rounded-lg overflow-hidden [&>button]:!border-b-gray-100 [&>button]:text-gray-500 hover:[&>button]:text-[#E43632]" />
        </ReactFlow>

        {nodes.length === 0 && emptyState ? (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            {emptyState}
          </div>
        ) : null}
      </div>
    </ReactFlowProvider>
  );
}

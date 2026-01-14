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
    lastSeq?: number | null;
    rawPhase?: string | null;
    lastLine: string | null;
    isRunning: boolean;
    completedAt: number | null;
  } | null;
  activityFeed?: Array<{ id: string; text: string; seq: number | null; signature: string; ts: number }>;
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
  activityFeed: externalActivityFeed,
}) => {
  const [placeholderText, setPlaceholderText] = React.useState("Listening for updates…");
  const [placeholderShimmer, setPlaceholderShimmer] = React.useState(false);
  const lastRunIdRef = React.useRef<string | null>(null);
  console.log("[Canvas render]", {
    runId: buildActivity?.runId ?? null,
    lastSeq: buildActivity?.lastSeq ?? null,
    lastLine: buildActivity?.lastLine ?? null,
    phase: buildActivity?.phase ?? null,
    feedLengthRender: undefined,
  });
  const [rfInstance, setRfInstance] = React.useState<ReactFlowInstance | null>(null);
  const [activityFeed, setActivityFeed] = React.useState<
    Array<{ id: string; text: string; seq: number | null; signature: string; ts: number }>
  >([]);
  const feedRunIdRef = React.useRef<string | null>(null);

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

  // inline feed is always visible when buildActivity is present

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

  const usingExternalFeed = Array.isArray(externalActivityFeed);

  React.useEffect(() => {
    const runId = buildActivity?.runId ?? null;
    const phase = buildActivity?.phase ?? null;
    const rawPhase = buildActivity?.rawPhase ?? null;
    const lastSeq = buildActivity?.lastSeq ?? null;
    const lastLine = buildActivity?.lastLine ?? null;
    const isRunning = buildActivity?.isRunning ?? null;
    const completedAt = buildActivity?.completedAt ?? null;

    if (!buildActivity) return;
    console.log("[Canvas effect] incoming", {
      runId,
      phase,
      rawPhase,
      lastSeq,
      lastLine,
      isRunning,
      completedAt,
      feedLength: activityFeed.length,
    });
    console.log("[Canvas received buildActivity]", {
      runId,
      phase,
      rawPhase,
      lastSeq,
      lastLine,
      isRunning,
      completedAt,
    });
    if (runId && feedRunIdRef.current && feedRunIdRef.current !== runId) {
      setActivityFeed([]);
    }
    if (runId) {
      feedRunIdRef.current = runId;
    }
    const lineText = (lastLine ?? "").trim();
    if (!lineText) return;
    if (usingExternalFeed) return;
    const useSeq = lastSeq !== undefined && lastSeq !== null;
    const signature = useSeq ? `${runId ?? "unknown"}|seq:${lastSeq}` : `${runId ?? "unknown"}|msg:${lineText}`;
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setActivityFeed((prev) => {
      const next = [
        ...prev,
        { id, text: lineText, seq: lastSeq ?? null, signature, ts: Date.now() },
      ];
      console.log("[Canvas feed] append", {
        runId,
        signature,
        seq: lastSeq ?? null,
        text: lineText,
        entries: next.map((e) => ({ signature: e.signature, seq: e.seq, text: e.text })),
      });
      return next;
    });
  }, [
    buildActivity?.runId,
    buildActivity?.phase,
    buildActivity?.rawPhase,
    buildActivity?.lastSeq,
    buildActivity?.lastLine,
    buildActivity?.isRunning,
    buildActivity?.completedAt,
    phaseLabel,
  ]);
  
  React.useEffect(() => {
    const currentRunId = buildActivity?.runId ?? null;
    if (!currentRunId) {
      setPlaceholderText("Listening for updates…");
      setPlaceholderShimmer(false);
      lastRunIdRef.current = null;
      return;
    }
    if (lastRunIdRef.current !== currentRunId) {
      lastRunIdRef.current = currentRunId;
      setPlaceholderText("New update detected");
      setPlaceholderShimmer(true);
    }
  }, [buildActivity?.runId]);

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

      {/* Inline status feed on canvas (non-blocking) */}
      <div
        data-testid="canvas-status-panel"
        className="pointer-events-none absolute right-6 top-4 z-[9999] rounded-lg px-4 py-3 w-[320px]"
      >
        <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-gray-500 mb-1">
          <span>Background build</span>
        </div>
        <div className="text-[12px] leading-snug text-gray-700 space-y-0.5 mb-2" />
        {(() => {
          const feed = externalActivityFeed ?? activityFeed;
          const sorted = [...feed].sort((a, b) => {
            const sa = a.seq ?? Number.MAX_SAFE_INTEGER;
            const sb = b.seq ?? Number.MAX_SAFE_INTEGER;
            if (sa !== sb) return sa - sb;
            return a.id.localeCompare(b.id);
          });
          return (
            <div className="space-y-2">
              <div className="space-y-1">
                {sorted.length === 0 ? (
                  <div
                    className={
                      placeholderShimmer
                        ? "text-[11px] text-gray-900 font-semibold bg-gradient-to-r from-gray-100 via-white to-gray-100 animate-pulse rounded px-1 inline-block"
                        : "text-[11px] text-gray-500"
                    }
                  >
                    {placeholderText}
                  </div>
                ) : (
                  sorted.map((item, idx) => {
                    const isLatest = idx === sorted.length - 1;
                    const isDone = item.text === "Done!";
                    const baseClass = "text-[12px]";
                    const latestClass =
                      "text-gray-900 font-semibold bg-gradient-to-r from-gray-100 via-white to-gray-100 animate-pulse rounded px-1";
                    const latestSolidClass = "text-gray-900 font-semibold";
                    const olderClass = "text-gray-500";
                    return (
                      <div
                        key={item.id}
                        className={`${baseClass} ${
                          isLatest ? (isDone ? latestSolidClass : latestClass) : olderClass
                        }`}
                      >
                        • {item.text}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })()}
      </div>

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
    </div>
  );
};

export default StudioCanvas;

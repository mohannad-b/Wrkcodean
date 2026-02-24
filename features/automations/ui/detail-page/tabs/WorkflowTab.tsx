"use client";

import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import {
  AlertTriangle,
  ArrowRight,
  CheckSquare,
  FileText,
  GitBranch,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import type { Connection, Edge, EdgeChange, Node, NodeChange } from "reactflow";
import type { Workflow } from "@/features/workflows/domain";
import type { WorkflowUpdates } from "@/lib/workflows/ai-updates";
import { StudioChat } from "@/features/copilot/ui/chat";
import { StudioInspector } from "@/components/automations/StudioInspector";
import { EdgeInspector, type EdgeDetails } from "@/components/automations/EdgeInspector";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { CopilotMessage } from "@/features/copilot/types";
import type { CopilotAnalysisState, ReadinessSignals } from "@/features/copilot/domain";
import type { StudioCanvasProps } from "@/features/workflows/ui/canvas/StudioCanvas";
import { RequirementsView } from "../panels/RequirementsView";
import { TasksViewCanvas } from "../panels/WorkflowTasksPanel";
import type { BuildActivity, VersionTask } from "../types";
import { BuildActivityPanel } from "@/features/copilot/ui/BuildActivityPanel";

const StudioCanvas = dynamic<StudioCanvasProps>(
  () => import("@/features/workflows/ui/canvas/StudioCanvas").then((m) => m.StudioCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center bg-gray-50">
        <span className="text-sm text-gray-500">Loading canvas…</span>
      </div>
    ),
  }
);

interface WorkflowTabProps {
  workflow: Workflow | null;
  workflowError: string | null;
  canvasState: "loading" | "ready" | "empty" | "error";
  canvasViewMode: "requirements" | "flowchart" | "tasks";
  onCanvasViewModeChange: (mode: "requirements" | "flowchart" | "tasks") => void;
  workflowIsEmpty: boolean;
  isOptimizingFlow: boolean;
  onOptimizeFlow: () => void;
  onRetryAutomation: () => void;
  requirementsText: string;
  onRequirementsChange: (text: string) => void;
  onSaveRequirements: () => void;
  savingRequirements: boolean;
  automationVersionId: string | null;
  tasks: VersionTask[];
  blockersRemaining: number;
  tasksLoadState: "loading" | "ready" | "empty" | "error";
  onViewTaskStep: (stepId: string) => void;
  onViewTask: (task: VersionTask) => void;
  flowNodes: Node[];
  flowEdges: Edge[];
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnectNodes: (connection: Connection) => void;
  onEdgeUpdate: (oldEdge: Edge, newConnection: Connection) => void;
  onNodeClick: (event: React.MouseEvent, node: Node) => void;
  onEdgeClick: (event: React.MouseEvent, edge: Edge) => void;
  selectedEdge: EdgeDetails | null;
  selectedStep: Workflow["steps"][number] | null;
  selectedStepDisplayId: string | null;
  inspectorTasks: VersionTask[];
  onEdgeChange: (edgeId: string, updates: Partial<Edge>) => void;
  onEdgeDelete: (edgeId: string) => void;
  onEdgeClose: () => void;
  onStepChange: (stepId: string, patch: Partial<Workflow["steps"][number]>) => void;
  onDeleteStep: (stepId: string) => void;
  onCloseInspector: () => void;
  hasSelectedStep: boolean;
  showStepHelper: boolean;
  setHasSelectedStep: (value: boolean) => void;
  setShowStepHelper: (value: boolean) => void;
  isSwitchingVersion: boolean;
  isSynthesizingWorkflow: boolean;
  buildActivity: BuildActivity | null;
  canvasActivityFeed: Array<{ id: string; text: string; seq: number | null; signature: string; ts: number }>;
  injectedChatMessage: CopilotMessage | null;
  onInjectedMessageConsumed: () => void;
  onWorkflowAIUpdates: (updates: WorkflowUpdates | Workflow) => void;
  onWorkflowRefresh: () => void;
  onTasksUpdate: (tasks: VersionTask[]) => void;
  onWorkflowUpdatingChange: (isUpdating: boolean) => void;
  analysis: CopilotAnalysisState | null;
  analysisLoading: boolean;
  analysisUnavailable: boolean;
  onRefreshAnalysis: () => void;
  onBuildActivityUpdate: (activity: BuildActivity | null) => void;
  onProceedToBuild: () => void;
  proceedButtonDisabled: boolean;
  proceedDisabledReason: string | null;
  proceedingToBuild: boolean;
  readinessPercent: number;
  readinessHintText: string;
  alreadyInBuild: boolean;
  onReadinessUpdate: (payload: {
    runId?: string;
    readinessScore?: number;
    proceedReady?: boolean;
    proceedReason?: string | null;
    proceedBasicsMet?: boolean;
    proceedThresholdMet?: boolean;
    signals?: ReadinessSignals;
  }) => void;
  onRequirementsUpdate?: (text: string) => void;
}

export function WorkflowTab({
  workflow,
  workflowError,
  canvasState,
  canvasViewMode,
  onCanvasViewModeChange,
  workflowIsEmpty,
  isOptimizingFlow,
  onOptimizeFlow,
  onRetryAutomation,
  requirementsText,
  onRequirementsChange,
  onSaveRequirements,
  savingRequirements,
  automationVersionId,
  tasks,
  blockersRemaining,
  tasksLoadState,
  onViewTaskStep,
  onViewTask,
  flowNodes,
  flowEdges,
  onNodesChange,
  onEdgesChange,
  onConnectNodes,
  onEdgeUpdate,
  onNodeClick,
  onEdgeClick,
  selectedEdge,
  selectedStep,
  selectedStepDisplayId,
  inspectorTasks,
  onEdgeChange,
  onEdgeDelete,
  onEdgeClose,
  onStepChange,
  onDeleteStep,
  onCloseInspector,
  setHasSelectedStep,
  setShowStepHelper,
  isSwitchingVersion,
  isSynthesizingWorkflow,
  buildActivity,
  canvasActivityFeed,
  injectedChatMessage,
  onInjectedMessageConsumed,
  onWorkflowAIUpdates,
  onWorkflowRefresh,
  onTasksUpdate,
  onWorkflowUpdatingChange,
  analysis,
  analysisLoading,
  analysisUnavailable,
  onRefreshAnalysis,
  onBuildActivityUpdate,
  onProceedToBuild,
  proceedButtonDisabled,
  proceedDisabledReason,
  proceedingToBuild,
  readinessPercent,
  readinessHintText,
  alreadyInBuild,
  onReadinessUpdate,
  onRequirementsUpdate,
}: WorkflowTabProps) {
  const [buildActivityPanelState, setBuildActivityPanelState] = useState<{
    activity: Parameters<typeof BuildActivityPanel>[0]["activity"];
    onRetry: () => void;
  } | null>(null);
  const onBuildActivityPanelUpdate = useCallback(
    (state: { activity: Parameters<typeof BuildActivityPanel>[0]["activity"] | null; onRetry: () => void }) =>
      setBuildActivityPanelState(state.activity ? { activity: state.activity, onRetry: state.onRetry } : null),
    []
  );

  if (!workflow) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-500">
          Loading workflow…
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full relative bg-gray-50 min-h-0">
      <div className="border-b border-gray-100 bg-white px-6 py-4 z-20 relative">
        <div className="flex items-center gap-4">
          <div className="flex flex-col flex-1 min-w-0 gap-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-700">Build readiness</span>
                <span className="text-xs font-semibold text-gray-900">{readinessPercent}%</span>
              </div>
              <div className="flex items-center gap-2">
                {proceedButtonDisabled && !alreadyInBuild && !proceedingToBuild ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div>
                        <Button
                          size="sm"
                          onClick={onProceedToBuild}
                          disabled={proceedButtonDisabled}
                          className={cn(
                            "gap-2 rounded-full px-4 py-1 text-xs font-semibold",
                            alreadyInBuild
                              ? "bg-gray-200 text-gray-600"
                              : proceedButtonDisabled
                                ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                                : "bg-gray-900 text-white hover:bg-gray-800"
                          )}
                        >
                          {proceedingToBuild ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              Updating…
                            </>
                          ) : alreadyInBuild ? (
                            "Build in progress"
                          ) : (
                            <>
                              Proceed to Build
                              <ArrowRight className="w-3.5 h-3.5" />
                            </>
                          )}
                        </Button>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent
                      side="bottom"
                      sideOffset={4}
                      className="text-xs bg-gray-900 text-white border border-gray-700 shadow-lg [&>svg]:fill-gray-900 [&>svg]:stroke-gray-700 [&>svg]:w-4 [&>svg]:h-4"
                    >
                      {proceedDisabledReason || "We need a little bit more information before we have enough information to build this automation."}
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <Button
                    size="sm"
                    onClick={onProceedToBuild}
                    disabled={proceedButtonDisabled}
                    className={cn(
                      "gap-2 rounded-full px-4 py-1 text-xs font-semibold",
                      alreadyInBuild
                        ? "bg-gray-200 text-gray-600"
                        : proceedButtonDisabled
                          ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                          : "bg-gray-900 text-white hover:bg-gray-800"
                    )}
                  >
                    {proceedingToBuild ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Updating…
                      </>
                    ) : alreadyInBuild ? (
                      "Build in progress"
                    ) : (
                      <>
                        Proceed to Build
                        <ArrowRight className="w-3.5 h-3.5" />
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
            <div className="w-full h-3 rounded-full bg-gray-100 border border-gray-200 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-400 via-yellow-500 to-emerald-500 transition-all duration-300"
                style={{ width: `${Math.max(4, Math.min(100, readinessPercent))}%` }}
              />
            </div>
            <div className="text-[11px] text-gray-600">{readinessHintText}</div>
          </div>
        </div>
      </div>

      {workflowError ? (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{workflowError}</div>
      ) : null}

      <div className="flex-1 flex relative overflow-hidden bg-gray-50 min-h-0">
        <div className="w-[360px] shrink-0 z-20 h-full bg-[#F9FAFB] border-r border-gray-200 shadow-[4px_0_24px_rgba(0,0,0,0.02)] overflow-hidden">
          <StudioChat
            automationVersionId={automationVersionId}
            workflowEmpty={workflowIsEmpty}
            onWorkflowUpdates={onWorkflowAIUpdates}
            onWorkflowRefresh={onWorkflowRefresh}
            onTasksUpdate={(nextTasks) => onTasksUpdate(nextTasks as VersionTask[])}
            injectedMessage={injectedChatMessage}
            onInjectedMessageConsumed={onInjectedMessageConsumed}
            onWorkflowUpdatingChange={onWorkflowUpdatingChange}
            analysis={analysis}
            analysisLoading={analysisLoading}
            analysisUnavailable={analysisUnavailable}
            onRefreshAnalysis={onRefreshAnalysis}
            onBuildActivityUpdate={onBuildActivityUpdate}
            buildActivityFromParent={buildActivity}
            onProceedToBuild={onProceedToBuild}
            proceedToBuildDisabled={proceedButtonDisabled}
            proceedToBuildReason={proceedDisabledReason}
            proceedingToBuild={proceedingToBuild}
            onReadinessUpdate={onReadinessUpdate}
            onRequirementsUpdate={onRequirementsUpdate}
            onBuildActivityPanelUpdate={onBuildActivityPanelUpdate}
          />
        </div>

        <div className="flex-1 relative h-full z-10 bg-gray-50 min-h-0 flex flex-col">
          <div className="absolute top-4 left-4 z-50 flex gap-2 items-center">
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-1 flex gap-2">
              <Button
                size="sm"
                variant={canvasViewMode === "requirements" ? "default" : "ghost"}
                onClick={() => onCanvasViewModeChange("requirements")}
                className={cn(
                  "text-xs font-semibold h-8 px-3",
                  canvasViewMode === "requirements"
                    ? "bg-gray-900 text-white hover:bg-gray-800"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                )}
              >
                <FileText className="h-3.5 w-3.5 mr-1.5" />
                Requirements
              </Button>
              <Button
                size="sm"
                variant={canvasViewMode === "flowchart" ? "default" : "ghost"}
                onClick={() => onCanvasViewModeChange("flowchart")}
                className={cn(
                  "text-xs font-semibold h-8 px-3",
                  canvasViewMode === "flowchart"
                    ? "bg-gray-900 text-white hover:bg-gray-800"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                )}
              >
                <GitBranch className="h-3.5 w-3.5 mr-1.5" />
                Flowchart
              </Button>
              <Button
                size="sm"
                variant={canvasViewMode === "tasks" ? "default" : "ghost"}
                onClick={() => onCanvasViewModeChange("tasks")}
                className={cn(
                  "text-xs font-semibold h-8 px-3",
                  canvasViewMode === "tasks"
                    ? "bg-gray-900 text-white hover:bg-gray-800"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                )}
              >
                <CheckSquare className="h-3.5 w-3.5 mr-1.5" />
                Tasks
              </Button>
            </div>
            {canvasViewMode === "flowchart" && (
              <Button
                size="sm"
                variant="secondary"
                onClick={onOptimizeFlow}
                disabled={isOptimizingFlow || workflowIsEmpty}
                className="text-xs font-semibold h-8 px-3 bg-white border border-gray-200 shadow-sm hover:bg-gray-50"
              >
                {isOptimizingFlow ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    Re-arranging...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                    Re-arrange Workflow
                  </>
                )}
              </Button>
            )}
          </div>

          {canvasViewMode === "requirements" ? (
            <RequirementsView
              requirementsText={requirementsText}
              onRequirementsChange={onRequirementsChange}
              onSave={onSaveRequirements}
              saving={savingRequirements}
              automationVersionId={automationVersionId}
            />
          ) : canvasViewMode === "tasks" ? (
            <TasksViewCanvas
              tasks={tasks}
              blockersRemaining={blockersRemaining}
              onViewStep={onViewTaskStep}
              onViewTask={onViewTask}
              loadState={tasksLoadState}
              onRetry={onRetryAutomation}
            />
          ) : (
            <div className="flex-1 relative h-full">
              {canvasState === "loading" ? (
                <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm">
                  <Loader2 className="h-8 w-8 animate-spin text-gray-500 mb-2" />
                  <p className="text-sm font-semibold text-gray-600">Loading workflow…</p>
                </div>
              ) : null}
              {canvasState === "error" ? (
                <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-white/85 backdrop-blur-sm px-6 text-center">
                  <AlertTriangle className="h-10 w-10 text-amber-500 mb-3" />
                  <p className="text-sm font-semibold text-gray-800">Couldn’t render workflow</p>
                  <p className="text-xs text-gray-500 mb-3">Try reloading the version.</p>
                  <Button size="sm" onClick={onRetryAutomation} className="px-4">
                    Retry
                  </Button>
                </div>
              ) : null}
              {buildActivity?.isRunning && canvasState !== "loading" && canvasState !== "error" ? (
                <div className="absolute inset-0 z-25 flex flex-col items-center justify-center bg-gray-50/90 backdrop-blur-[2px] pointer-events-none">
                  <Loader2 className="h-8 w-8 animate-spin text-gray-400 mb-2" />
                  <p className="text-sm font-medium text-gray-600">Building workflow…</p>
                  <p className="text-xs text-gray-500 mt-1">{buildActivity.lastLine ?? "Processing your request"}</p>
                </div>
              ) : null}
              <StudioCanvas
                nodes={flowNodes}
                edges={flowEdges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnectNodes}
                onEdgeUpdate={onEdgeUpdate}
                onNodeClick={onNodeClick}
                onEdgeClick={onEdgeClick}
                isSynthesizing={isSynthesizingWorkflow}
                emptyState={
                  canvasState === "empty" ? (
                    <div className="text-center max-w-md mx-auto space-y-2">
                      <Sparkles className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                      <p className="text-sm font-semibold text-gray-600">Workflow Canvas</p>
                      <p className="text-xs text-gray-500 leading-relaxed">
                        Describe your workflow in chat and steps will appear here.
                      </p>
                    </div>
                  ) : null
                }
              />
            </div>
          )}

          {buildActivityPanelState ? (
            <div className="absolute bottom-4 right-4 z-40 w-[320px]">
              <BuildActivityPanel
                activity={buildActivityPanelState.activity}
                onCtaClick={(cta) => {
                  if (cta.destination === "retry") {
                    buildActivityPanelState.onRetry();
                  }
                }}
              />
            </div>
          ) : null}
        </div>

        {canvasViewMode === "flowchart" && (selectedEdge || selectedStep) ? (
          <div
            className={cn(
              "shrink-0 z-20 bg-white transition-all duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)] border-l border-gray-200 shadow-xl overflow-y-auto min-h-0",
              "w-[420px] translate-x-0"
            )}
          >
            {selectedEdge ? (
              <EdgeInspector edge={selectedEdge} onChange={onEdgeChange} onDelete={onEdgeDelete} onClose={onEdgeClose} />
            ) : selectedStep ? (
              <StudioInspector
                step={selectedStep}
                onClose={() => {
                  onCloseInspector();
                  setHasSelectedStep(false);
                  setShowStepHelper(true);
                }}
                onChange={onStepChange}
                onDelete={onDeleteStep}
                tasks={inspectorTasks}
                onViewTask={(taskId) => {
                  const task = inspectorTasks.find((item) => item.id === taskId);
                  if (task) onViewTask(task);
                }}
                automationVersionId={automationVersionId}
                displayId={selectedStepDisplayId}
              />
            ) : null}
          </div>
        ) : null}

        {isSwitchingVersion ? (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/85 backdrop-blur-sm">
            <div className="flex items-center gap-3 text-sm font-semibold text-gray-700">
              <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
              Loading version…
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

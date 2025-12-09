"use client";

import { useEffect, useMemo, useState } from "react";
import { Trash2, X, Settings, Sparkles, Zap, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { BlueprintStep } from "@/lib/blueprint/types";
import { cn } from "@/lib/utils";

interface StudioInspectorProps {
  step: BlueprintStep | null;
  onClose: () => void;
  onChange: (stepId: string, patch: Partial<BlueprintStep>) => void;
  onDelete: (stepId: string) => void;
  clientName?: string;
  tasks?: StepTaskSummary[];
  onViewTask?: (taskId: string) => void;
}

type StepTaskSummary = {
  id: string;
  title: string;
  description: string | null;
  status: "pending" | "in_progress" | "complete";
  priority: "blocker" | "important" | "optional";
  metadata?: {
    systemType?: string;
    relatedSteps?: string[];
    isBlocker?: boolean;
  } | null;
};

type ResponsibilityTab = "automated" | "human" | "approval";

const RESPONSIBILITY_MAP: Record<ResponsibilityTab, BlueprintStep["responsibility"]> = {
  automated: "Automated",
  human: "HumanReview",
  approval: "Approval",
};

const RESPONSIBILITY_TAB_MAP: Record<BlueprintStep["responsibility"], ResponsibilityTab> = {
  Automated: "automated",
  HumanReview: "human",
  Approval: "approval",
};

const BADGE_STYLES: Record<"complete" | "warning" | "error" | "ai-suggested", string> = {
  complete: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  error: "border-red-200 bg-red-50 text-red-700",
  "ai-suggested": "border-blue-200 bg-blue-50 text-blue-700",
};

function deriveBadgeStatus(step: BlueprintStep): keyof typeof BADGE_STYLES {
  if (step.riskLevel === "High") return "error";
  if (step.riskLevel === "Medium") return "warning";
  if (step.notesForOps || step.notesExceptions) return "complete";
  return "ai-suggested";
}

const STEP_TASK_STATUS_STYLES: Record<StepTaskSummary["status"], string> = {
  pending: "bg-amber-50 text-amber-700 border border-amber-100",
  in_progress: "bg-blue-50 text-blue-700 border border-blue-100",
  complete: "bg-emerald-50 text-emerald-700 border border-emerald-100",
};

const STEP_TASK_PRIORITY_STYLES: Record<StepTaskSummary["priority"], string> = {
  blocker: "bg-red-50 text-red-700 border border-red-100",
  important: "bg-slate-50 text-slate-700 border border-slate-200",
  optional: "bg-gray-50 text-gray-500 border border-gray-200",
};

function formatTaskStatus(status: StepTaskSummary["status"]) {
  switch (status) {
    case "complete":
      return "Complete";
    case "in_progress":
      return "In Progress";
    default:
      return "Pending";
  }
}

export function StudioInspector({ step, onClose, onChange, onDelete, clientName, tasks = [], onViewTask }: StudioInspectorProps) {
  const [responsibilityTab, setResponsibilityTab] = useState<ResponsibilityTab>("automated");
  const parsedExceptions = useMemo(() => {
    if (!step?.notesExceptions) return [];
    return step.notesExceptions
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [condition, outcome] = line.split("->").map((part) => part.trim());
        return { condition, outcome };
      })
      .filter((item) => item.condition);
  }, [step?.notesExceptions]);

  useEffect(() => {
    if (!step) return;
    setResponsibilityTab(RESPONSIBILITY_TAB_MAP[step.responsibility]);
  }, [step?.id, step?.responsibility]);

  const clientDisplayName = useMemo(() => {
    const trimmed = (clientName ?? "").trim();
    return trimmed.length > 0 ? trimmed : "Client";
  }, [clientName]);

  const responsibilityLabels: Record<ResponsibilityTab, string> = useMemo(
    () => ({
      automated: "Wrk",
      human: clientDisplayName,
      approval: "Human in the loop",
    }),
    [clientDisplayName]
  );

  const badgeStatus = useMemo(() => (step ? deriveBadgeStatus(step) : "ai-suggested"), [step]);
  const stepTasks = useMemo(() => {
    if (!step || !Array.isArray(step.taskIds) || step.taskIds.length === 0) {
      return [];
    }
    return step.taskIds
      .map((taskId) => tasks.find((task) => task.id === taskId))
      .filter((task): task is StepTaskSummary => Boolean(task));
  }, [tasks, step?.taskIds]);

  if (!step) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-white border-l border-gray-200 p-8 text-center">
        <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mb-4 border border-gray-100">
          <Settings className="text-gray-400" size={20} />
        </div>
        <h3 className="text-[#0A0A0A] font-bold mb-2">No Step Selected</h3>
        <p className="text-sm text-gray-500 max-w-[200px] mx-auto">
          Click on a block in the canvas to edit its business rules.
        </p>
      </div>
    );
  }

  const handleChange = (patch: Partial<BlueprintStep>) => {
    onChange(step.id, patch);
  };

  const handleResponsibilityChange = (value: ResponsibilityTab) => {
    setResponsibilityTab(value);
    handleChange({ responsibility: RESPONSIBILITY_MAP[value] });
  };

  return (
    <>
      <div className="h-full flex flex-col bg-white border-l border-gray-200 shadow-xl shadow-gray-200/50 overflow-hidden">
        <div className="flex-none px-6 py-5 border-b border-gray-100 bg-white sticky top-0 z-10">
          <div className="flex items-start justify-between mb-2">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Badge
                  variant="outline"
                  className={cn(
                    "rounded-md px-2 py-0.5 h-auto text-[10px] font-semibold tracking-wide capitalize",
                    BADGE_STYLES[badgeStatus]
                  )}
                >
                  {badgeStatus === "ai-suggested" ? "Draft" : badgeStatus}
                </Badge>
                <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">ID: {step.id}</span>
              </div>
              <h2 className="text-xl font-bold text-[#0A0A0A] leading-tight">{step.name}</h2>
            </div>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-gray-400 hover:text-red-600 transition-colors"
                onClick={() => onDelete(step.id)}
              >
                <Trash2 size={16} />
              </Button>
              <Button
                onClick={onClose}
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-gray-400 hover:text-[#0A0A0A] transition-colors"
              >
                <X size={16} />
              </Button>
            </div>
          </div>
        </div>

        <div className="flex-1 w-full overflow-y-auto min-h-0">
          <div className="p-6 pb-20 space-y-8">
            {stepTasks.length > 0 && (
              <div className="space-y-3">
                <Label className="text-xs font-bold text-[#0A0A0A] uppercase tracking-wider flex items-center gap-2">
                  Setup tasks for this step
                </Label>
                <div className="space-y-3">
                  {stepTasks.map((task) => (
                    <div
                      key={task.id}
                      className="border border-gray-100 rounded-xl bg-gray-50/60 p-3 cursor-pointer hover:border-gray-200 transition-colors"
                      onClick={() => onViewTask?.(task.id)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-[#0A0A0A] leading-tight">{task.title}</p>
                          {task.description ? (
                            <p className="text-xs text-gray-500 mt-1 leading-relaxed">{task.description}</p>
                          ) : null}
                        </div>
                        <Badge className={cn("text-[10px] font-semibold", STEP_TASK_STATUS_STYLES[task.status])}>
                          {formatTaskStatus(task.status)}
                        </Badge>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Badge className={cn("text-[10px] font-semibold", STEP_TASK_PRIORITY_STYLES[task.priority])}>
                          {task.priority === "blocker" ? "Blocker" : task.priority === "optional" ? "Optional" : "Important"}
                        </Badge>
                        {task.metadata?.systemType ? (
                          <Badge variant="outline" className="text-[10px] text-gray-500 border-gray-200 capitalize">
                            {task.metadata.systemType}
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-3">
              <Label className="text-xs font-bold text-[#0A0A0A] uppercase tracking-wider flex items-center gap-2">
                Summary <span className="text-[#E43632]">*</span>
              </Label>
              <div className="relative group">
                <div className="absolute -top-2.5 right-3 z-10 bg-white px-2">
                  <div className="flex items-center gap-1 text-[10px] font-medium text-[#E43632] bg-red-50 px-2 py-0.5 rounded-full border border-red-100">
                    <Sparkles size={8} /> AI Generated Draft
                  </div>
                </div>
                <Textarea
                  className="min-h-[100px] text-base bg-white border-gray-200 shadow-sm hover:border-gray-300 focus-visible:ring-[#E43632] resize-none p-4 leading-relaxed rounded-xl transition-all"
                  value={step.summary}
                  onChange={(event) => handleChange({ summary: event.target.value })}
                  placeholder="Describe what happens in this step..."
                />
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-xs font-bold text-[#0A0A0A] uppercase tracking-wider flex items-center gap-2">
                Goal / Outcome <span className="text-[#E43632]">*</span>
              </Label>
              <Input
                className="h-11 bg-gray-50/50 border-gray-200 hover:bg-white focus-visible:ring-[#E43632] transition-all text-sm"
                value={step.goalOutcome}
                onChange={(event) => handleChange({ goalOutcome: event.target.value })}
                placeholder="What should this step accomplish?"
              />
              <p className="text-[11px] text-gray-400 pl-1">e.g. "Prepare invoice data for Xero" or "Notify sales rep"</p>
            </div>

            <div className="space-y-3">
              <Label className="text-xs font-bold text-[#0A0A0A] uppercase tracking-wider flex items-center gap-2">
                Responsibility <span className="text-[#E43632]">*</span>
              </Label>
              <Tabs
                value={responsibilityTab}
                onValueChange={(value) => handleResponsibilityChange(value as ResponsibilityTab)}
                className="w-full"
              >
                <TabsList className="w-full h-auto p-1 bg-gray-100/50 border border-gray-100 rounded-lg grid grid-cols-3 gap-1">
                  <TabsTrigger
                    value="automated"
                    className="data-[state=active]:bg-white data-[state=active]:text-[#E43632] data-[state=active]:shadow-sm py-2.5 text-xs font-medium"
                  >
                    <Zap size={14} className="mb-1 mx-auto block sm:hidden" />
                    <span className="hidden sm:block">{responsibilityLabels.automated}</span>
                    <span className="block sm:hidden">{responsibilityLabels.automated}</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="human"
                    className="data-[state=active]:bg-white data-[state=active]:text-amber-600 data-[state=active]:shadow-sm py-2.5 text-xs font-medium"
                  >
                    <Shield size={14} className="mb-1 mx-auto block sm:hidden" />
                    <span className="hidden sm:block">{responsibilityLabels.human}</span>
                    <span className="block sm:hidden">{responsibilityLabels.human}</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="approval"
                    className="data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm py-2.5 text-xs font-medium"
                  >
                    <Shield size={14} className="mb-1 mx-auto block sm:hidden" />
                    <span className="hidden sm:block">{responsibilityLabels.approval}</span>
                    <span className="block sm:hidden">HITL</span>
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <div className="space-y-3">
              <Label className="text-xs font-bold text-[#0A0A0A] uppercase tracking-wider flex items-center gap-2">Notes / Exceptions</Label>
              {parsedExceptions.length > 0 && (
                <div className="space-y-2 mb-3">
                  {parsedExceptions.map((item, index) => (
                    <div key={`${item.condition}-${index}`} className="bg-amber-50 border border-amber-100 rounded-lg p-3 text-xs flex items-start gap-2">
                      <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold text-amber-800">If: </span>
                        <span className="text-amber-900">{item.condition}</span>
                        {item.outcome ? (
                          <>
                            <br />
                            <span className="font-bold text-amber-800">Then: </span>
                            <span className="text-amber-900">{item.outcome}</span>
                          </>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <Textarea
                className="min-h-[80px] text-sm bg-gray-50/50 border-gray-200 focus-visible:ring-[#E43632] resize-none p-3"
                value={step.notesExceptions ?? ""}
                onChange={(event) => handleChange({ notesExceptions: event.target.value || undefined })}
                placeholder="Anything unusual or important about this step?"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Systems Involved</Label>
              <div className="flex flex-wrap gap-2">
                {step.systemsInvolved.length === 0 ? (
                  <span className="text-[12px] text-gray-400">No systems connected yet.</span>
                ) : (
                  step.systemsInvolved.map((system) => (
                    <Badge
                      key={system}
                      variant="secondary"
                      className="bg-gray-100 text-gray-600 hover:bg-gray-200 cursor-default font-normal border border-transparent"
                    >
                      {system}
                    </Badge>
                  ))
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Notes for Ops Team</Label>
              <Textarea
                className="min-h-[80px] text-xs bg-yellow-50/50 border-yellow-100 focus-visible:ring-yellow-400 resize-none p-3 placeholder:text-yellow-700/40"
                value={step.notesForOps ?? ""}
                onChange={(event) => handleChange({ notesForOps: event.target.value || undefined })}
                placeholder="Technical implementation details..."
              />
            </div>
          </div>
        </div>

        <div className="flex-none p-6 border-t border-gray-200 bg-white space-y-4">
          <Button
            className="w-full bg-[#0A0A0A] hover:bg-gray-900 text-white font-bold shadow-lg shadow-gray-900/10 h-11 text-sm rounded-lg transition-all hover:-translate-y-0.5"
            onClick={onClose}
          >
            Save Changes
          </Button>
          <div className="flex items-center justify-center">
            <Button
              variant="link"
              className="text-xs text-gray-400 hover:text-gray-600 h-auto p-0 font-medium"
              onClick={onClose}
            >
              Discard Changes
            </Button>
          </div>
        </div>
      </div>

    </>
  );
}

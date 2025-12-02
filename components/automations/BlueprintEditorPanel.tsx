"use client";

import { useCallback } from "react";
import type { Blueprint, BlueprintPhase, BlueprintStep } from "@/lib/blueprint/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronUp, ChevronDown, Trash2, Plus } from "lucide-react";

const BLUEPRINT_STATUSES: Blueprint["status"][] = ["Draft", "Planned", "InProgress", "Live"];
const STEP_TYPES: BlueprintStep["type"][] = ["Intake", "Automation", "HumanTask", "Integration", "QA", "Launch"];
const STEP_STATUSES: NonNullable<BlueprintStep["status"]>[] = ["Planned", "InProgress", "Complete"];

interface BlueprintEditorPanelProps {
  blueprint: Blueprint | null;
  onBlueprintChange: (next: Blueprint | null) => void;
  onCreateBlueprint: () => void;
  onSave: () => void;
  saving: boolean;
  canSave: boolean;
  disabled?: boolean;
}

const generateId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
};

function normalizePhaseOrder(phases: BlueprintPhase[]): BlueprintPhase[] {
  return phases
    .sort((a, b) => a.order - b.order)
    .map((phase, index) => ({
      ...phase,
      order: index,
    }));
}

export function BlueprintEditorPanel({
  blueprint,
  onBlueprintChange,
  onCreateBlueprint,
  onSave,
  saving,
  canSave,
  disabled,
}: BlueprintEditorPanelProps) {
  const guard = useCallback(() => {
    if (!blueprint) {
      return false;
    }
    return true;
  }, [blueprint]);

  const updateBlueprint = (updater: (current: Blueprint) => Blueprint) => {
    if (!blueprint) {
      return;
    }
    const next = updater(blueprint);
    onBlueprintChange({ ...next, updatedAt: new Date().toISOString() });
  };

  const handleStatusChange = (value: Blueprint["status"]) => {
    updateBlueprint((current) => ({ ...current, status: value }));
  };

  const handleGoalChange = (index: number, value: string) => {
    updateBlueprint((current) => {
      const goals = current.goals.map((goal, idx) => (idx === index ? value : goal));
      return { ...current, goals };
    });
  };

  const handleAddGoal = () => {
    updateBlueprint((current) => ({ ...current, goals: [...current.goals, ""] }));
  };

  const handleRemoveGoal = (index: number) => {
    updateBlueprint((current) => {
      const goals = current.goals.filter((_, idx) => idx !== index);
      return { ...current, goals };
    });
  };

  const handleAddPhase = () => {
    updateBlueprint((current) => {
      const newPhase: BlueprintPhase = {
        id: generateId(),
        name: `Phase ${current.phases.length + 1}`,
        order: current.phases.length,
        steps: [],
      };
      return { ...current, phases: [...current.phases, newPhase] };
    });
  };

  const handlePhaseNameChange = (phaseId: string, name: string) => {
    updateBlueprint((current) => {
      const phases = current.phases.map((phase) => (phase.id === phaseId ? { ...phase, name } : phase));
      return { ...current, phases };
    });
  };

  const handleMovePhase = (phaseId: string, direction: "up" | "down") => {
    updateBlueprint((current) => {
      const sorted = normalizePhaseOrder([...current.phases]);
      const index = sorted.findIndex((phase) => phase.id === phaseId);
      if (index === -1) {
        return current;
      }
      const swapIndex = direction === "up" ? index - 1 : index + 1;
      if (swapIndex < 0 || swapIndex >= sorted.length) {
        return current;
      }
      [sorted[index], sorted[swapIndex]] = [sorted[swapIndex], sorted[index]];
      return { ...current, phases: normalizePhaseOrder(sorted) };
    });
  };

  const handleDeletePhase = (phaseId: string) => {
    if (!guard()) return;
    const confirmed = window.confirm("Delete this phase and all of its steps?");
    if (!confirmed) return;
    updateBlueprint((current) => {
      const phases = current.phases.filter((phase) => phase.id !== phaseId);
      return { ...current, phases: normalizePhaseOrder(phases) };
    });
  };

  const handleAddStep = (phaseId: string) => {
    updateBlueprint((current) => {
      const phases = current.phases.map((phase) => {
        if (phase.id !== phaseId) {
          return phase;
        }
        const newStep: BlueprintStep = {
          id: generateId(),
          title: `Step ${phase.steps.length + 1}`,
          type: "Intake",
        };
        return { ...phase, steps: [...phase.steps, newStep] };
      });
      return { ...current, phases };
    });
  };

  const handleStepChange = (phaseId: string, stepId: string, patch: Partial<BlueprintStep>) => {
    updateBlueprint((current) => {
      const phases = current.phases.map((phase) => {
        if (phase.id !== phaseId) {
          return phase;
        }
        const steps = phase.steps.map((step) => (step.id === stepId ? { ...step, ...patch } : step));
        return { ...phase, steps };
      });
      return { ...current, phases };
    });
  };

  const handleMoveStep = (phaseId: string, stepId: string, direction: "up" | "down") => {
    updateBlueprint((current) => {
      const phases = current.phases.map((phase) => {
        if (phase.id !== phaseId) {
          return phase;
        }
        const index = phase.steps.findIndex((step) => step.id === stepId);
        if (index === -1) {
          return phase;
        }
        const swapIndex = direction === "up" ? index - 1 : index + 1;
        if (swapIndex < 0 || swapIndex >= phase.steps.length) {
          return phase;
        }
        const steps = [...phase.steps];
        [steps[index], steps[swapIndex]] = [steps[swapIndex], steps[index]];
        return { ...phase, steps };
      });
      return { ...current, phases };
    });
  };

  const handleDeleteStep = (phaseId: string, stepId: string) => {
    const confirmed = window.confirm("Delete this step?");
    if (!confirmed) {
      return;
    }
    updateBlueprint((current) => {
      const phases = current.phases.map((phase) => {
        if (phase.id !== phaseId) {
          return phase;
        }
        return { ...phase, steps: phase.steps.filter((step) => step.id !== stepId) };
      });
      return { ...current, phases };
    });
  };

  if (!blueprint) {
    return (
      <div className="rounded-lg border border-dashed border-gray-200 bg-white/50 px-6 py-10 text-center">
        <p className="text-sm text-gray-600 mb-4">Set up a blueprint to capture status, goals, phases, and steps.</p>
        <Button type="button" onClick={onCreateBlueprint} disabled={disabled}>
          Create Blueprint
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label>Status</Label>
        <Select value={blueprint.status} onValueChange={(value) => handleStatusChange(value as Blueprint["status"])}>
          <SelectTrigger>
            <SelectValue placeholder="Select status" />
          </SelectTrigger>
          <SelectContent>
            {BLUEPRINT_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {status}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Goals</Label>
          <Button type="button" variant="ghost" size="sm" onClick={handleAddGoal}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add goal
          </Button>
        </div>
        {blueprint.goals.length === 0 ? (
          <p className="text-sm text-gray-500">Add at least one goal to describe the desired outcome.</p>
        ) : (
          <div className="space-y-2">
            {blueprint.goals.map((goal, index) => (
              <div key={`goal-${index}`} className="flex items-center gap-2">
                <Input
                  value={goal}
                  onChange={(event) => handleGoalChange(index, event.target.value)}
                  placeholder="Define a measurable goal"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove goal"
                  onClick={() => handleRemoveGoal(index)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Phases</Label>
          <Button type="button" variant="outline" size="sm" onClick={handleAddPhase}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add phase
          </Button>
        </div>

        {blueprint.phases.length === 0 ? (
          <p className="text-sm text-gray-500">Break the rollout into phases to keep everyone aligned.</p>
        ) : (
          blueprint.phases
            .slice()
            .sort((a, b) => a.order - b.order)
            .map((phase, index) => (
              <div key={phase.id} className="rounded-lg border border-gray-200 bg-white p-4 space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    value={phase.name}
                    onChange={(event) => handlePhaseNameChange(phase.id, event.target.value)}
                    placeholder={`Phase ${index + 1}`}
                    className="flex-1"
                  />
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleMovePhase(phase.id, "up")}
                      disabled={index === 0}
                      aria-label="Move phase up"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleMovePhase(phase.id, "down")}
                      disabled={index === blueprint.phases.length - 1}
                      aria-label="Move phase down"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeletePhase(phase.id)}
                      aria-label="Delete phase"
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-900">Steps</p>
                    <Button type="button" variant="ghost" size="sm" onClick={() => handleAddStep(phase.id)}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> Add step
                    </Button>
                  </div>
                  {phase.steps.length === 0 ? (
                    <p className="text-sm text-gray-500">No steps yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {phase.steps.map((step, stepIndex) => (
                        <div key={step.id} className="rounded-md border border-gray-100 bg-gray-50 p-3 space-y-3">
                          <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
                            <Input
                              value={step.title}
                              onChange={(event) => handleStepChange(phase.id, step.id, { title: event.target.value })}
                              placeholder="Step title"
                            />
                            <Select
                              value={step.type}
                              onValueChange={(value) => handleStepChange(phase.id, step.id, { type: value as BlueprintStep["type"] })}
                            >
                              <SelectTrigger className="md:w-48">
                                <SelectValue placeholder="Type" />
                              </SelectTrigger>
                              <SelectContent>
                                {STEP_TYPES.map((type) => (
                                  <SelectItem key={type} value={type}>
                                    {type}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Select
                              value={step.status ?? ""}
                              onValueChange={(value) =>
                                handleStepChange(phase.id, step.id, {
                                  status: value === "" ? undefined : (value as BlueprintStep["status"]),
                                })
                              }
                            >
                              <SelectTrigger className="md:w-40">
                                <SelectValue placeholder="Status (optional)" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="">Not set</SelectItem>
                                {STEP_STATUSES.map((status) => (
                                  <SelectItem key={status} value={status}>
                                    {status}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <Textarea
                            value={step.description ?? ""}
                            onChange={(event) =>
                              handleStepChange(phase.id, step.id, { description: event.target.value || undefined })
                            }
                            placeholder="Add optional context or instructions"
                            rows={2}
                          />

                          <div className="grid gap-3 md:grid-cols-3">
                            <Input
                              value={step.ownerRole ?? ""}
                              onChange={(event) =>
                                handleStepChange(phase.id, step.id, { ownerRole: event.target.value || undefined })
                              }
                              placeholder="Owner role"
                            />
                            <Input
                              type="number"
                              min="1"
                              value={step.estimateMinutes?.toString() ?? ""}
                              onChange={(event) =>
                                handleStepChange(phase.id, step.id, {
                                  estimateMinutes: event.target.value ? Number(event.target.value) : undefined,
                                })
                              }
                              placeholder="Estimate (min)"
                            />
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => handleMoveStep(phase.id, step.id, "up")}
                                disabled={stepIndex === 0}
                                aria-label="Move step up"
                              >
                                <ChevronUp className="h-4 w-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => handleMoveStep(phase.id, step.id, "down")}
                                disabled={stepIndex === phase.steps.length - 1}
                                aria-label="Move step down"
                              >
                                <ChevronDown className="h-4 w-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label="Delete step"
                                onClick={() => handleDeleteStep(phase.id, step.id)}
                              >
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))
        )}
      </div>

      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <p className="text-xs text-gray-500">
          {canSave ? "Unsaved changes" : "All changes saved"}
        </p>
        <Button type="button" onClick={onSave} disabled={!canSave || saving || disabled}>
          {saving ? "Saving..." : "Save Blueprint"}
        </Button>
      </div>
    </div>
  );
}


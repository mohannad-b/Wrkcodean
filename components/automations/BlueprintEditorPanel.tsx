"use client";

import { useCallback } from "react";
import type { Blueprint, BlueprintSectionKey, BlueprintStep } from "@/lib/blueprint/types";
import { BLUEPRINT_SECTION_DEFINITIONS } from "@/lib/blueprint/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronUp, ChevronDown, Trash2, Plus } from "lucide-react";

const BLUEPRINT_STATUSES: Blueprint["status"][] = ["Draft", "ReadyForQuote", "ReadyToBuild"];
const STEP_TYPES: BlueprintStep["type"][] = ["Trigger", "Action", "Logic", "Human"];
const STEP_RESPONSIBILITIES: BlueprintStep["responsibility"][] = ["Automated", "HumanReview", "Approval"];
const STEP_RISK_LEVELS: NonNullable<BlueprintStep["riskLevel"]>[] = ["Low", "Medium", "High"];
const SECTION_ORDER = BLUEPRINT_SECTION_DEFINITIONS.reduce<Record<BlueprintSectionKey, number>>(
  (acc, definition, index) => {
    acc[definition.key] = index;
    return acc;
  },
  {} as Record<BlueprintSectionKey, number>
);

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

const parseList = (value: string) =>
  value
    .split(/,|\n/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

const formatList = (values: string[]) => values.join(", ");

export function BlueprintEditorPanel({
  blueprint,
  onBlueprintChange,
  onCreateBlueprint,
  onSave,
  saving,
  canSave,
  disabled,
}: BlueprintEditorPanelProps) {
  const guard = useCallback(() => Boolean(blueprint), [blueprint]);

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

  const handleSummaryChange = (value: string) => {
    updateBlueprint((current) => ({ ...current, summary: value }));
  };

  const handleSectionContentChange = (sectionId: string, content: string) => {
    updateBlueprint((current) => ({
      ...current,
      sections: current.sections.map((section) =>
        section.id === sectionId ? { ...section, content } : section
      ),
    }));
  };

  const handleAddStep = () => {
    updateBlueprint((current) => ({
      ...current,
      steps: [
        ...current.steps,
        {
          id: generateId(),
          type: "Action",
          name: `Step ${current.steps.length + 1}`,
          summary: "",
          goalOutcome: "",
          responsibility: "Automated",
          systemsInvolved: [],
          notifications: [],
          nextStepIds: [],
        },
      ],
    }));
  };

  const handleStepChange = (stepId: string, patch: Partial<BlueprintStep>) => {
    updateBlueprint((current) => ({
      ...current,
      steps: current.steps.map((step) => (step.id === stepId ? { ...step, ...patch } : step)),
    }));
  };

  const handleMoveStep = (stepId: string, direction: "up" | "down") => {
    updateBlueprint((current) => {
      const index = current.steps.findIndex((step) => step.id === stepId);
      if (index === -1) {
        return current;
      }
      const swapIndex = direction === "up" ? index - 1 : index + 1;
      if (swapIndex < 0 || swapIndex >= current.steps.length) {
        return current;
      }
      const nextSteps = [...current.steps];
      [nextSteps[index], nextSteps[swapIndex]] = [nextSteps[swapIndex], nextSteps[index]];
      return { ...current, steps: nextSteps };
    });
  };

  const handleDeleteStep = (stepId: string) => {
    if (!guard()) return;
    const confirmed = window.confirm("Delete this step?");
    if (!confirmed) return;
    updateBlueprint((current) => ({
      ...current,
      steps: current.steps.filter((step) => step.id !== stepId),
    }));
  };

  if (!blueprint) {
    return (
      <div className="rounded-lg border border-dashed border-gray-200 bg-white/50 px-6 py-10 text-center">
        <p className="text-sm text-gray-600 mb-4">
          Set up a blueprint to capture the sections, steps, and status that power the Copilot canvas.
        </p>
        <Button type="button" onClick={onCreateBlueprint} disabled={disabled}>
          Create Blueprint
        </Button>
      </div>
    );
  }

  const orderedSections = blueprint.sections
    .slice()
    .sort((a, b) => SECTION_ORDER[a.key] - SECTION_ORDER[b.key]);

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
        <Label>Blueprint summary</Label>
        <Textarea
          value={blueprint.summary}
          onChange={(event) => handleSummaryChange(event.target.value)}
          rows={3}
          placeholder="Provide a 2–3 sentence overview of the workflow."
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Sections (red-chip nav)</Label>
          <p className="text-xs text-gray-500">AI drafts populate these; humans refine the copy.</p>
        </div>
        <div className="space-y-4">
          {orderedSections.map((section) => (
            <div key={section.id} className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                {section.title}
              </Label>
              <Textarea
                value={section.content}
                onChange={(event) => handleSectionContentChange(section.id, event.target.value)}
                rows={3}
                placeholder={`Add notes for ${section.title}.`}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Steps (canvas nodes)</Label>
          <Button type="button" variant="outline" size="sm" onClick={handleAddStep}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add step
          </Button>
        </div>
        {blueprint.steps.length === 0 ? (
          <p className="text-sm text-gray-500">
            When Copilot drafts a workflow it fills these automatically. Add manual steps if you are working without an
            AI draft.
          </p>
        ) : (
          <div className="space-y-4">
            {blueprint.steps.map((step, index) => (
              <div key={step.id} className="rounded-lg border border-gray-200 bg-white p-4 space-y-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
                  <Input
                    value={step.name}
                    onChange={(event) => handleStepChange(step.id, { name: event.target.value })}
                    placeholder="Canvas label"
                  />
                  <Select
                    value={step.type}
                    onValueChange={(value) => handleStepChange(step.id, { type: value as BlueprintStep["type"] })}
                  >
                    <SelectTrigger className="md:w-40">
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
                    value={step.responsibility}
                    onValueChange={(value) =>
                      handleStepChange(step.id, { responsibility: value as BlueprintStep["responsibility"] })
                    }
                  >
                    <SelectTrigger className="md:w-48">
                      <SelectValue placeholder="Responsibility" />
                    </SelectTrigger>
                    <SelectContent>
                      {STEP_RESPONSIBILITIES.map((value) => (
                        <SelectItem key={value} value={value}>
                          {value === "HumanReview" ? "Human Review" : value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-gray-600">Summary</Label>
                    <Textarea
                      value={step.summary}
                      onChange={(event) => handleStepChange(step.id, { summary: event.target.value })}
                      rows={3}
                      placeholder="What happens in this step?"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-gray-600">Goal / outcome</Label>
                    <Input
                      value={step.goalOutcome}
                      onChange={(event) => handleStepChange(step.id, { goalOutcome: event.target.value })}
                      placeholder="Why this step exists."
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-gray-600">Notes & exceptions</Label>
                    <Textarea
                      value={step.notesExceptions ?? ""}
                      onChange={(event) =>
                        handleStepChange(step.id, { notesExceptions: event.target.value || undefined })
                      }
                      rows={2}
                      placeholder="Edge cases, escalation paths, etc."
                    />
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-gray-600">Systems involved (comma separated)</Label>
                    <Textarea
                      value={formatList(step.systemsInvolved)}
                      onChange={(event) => handleStepChange(step.id, { systemsInvolved: parseList(event.target.value) })}
                      rows={2}
                      placeholder="Email, Slack, Xero…"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-gray-600">Notifications (comma separated)</Label>
                    <Textarea
                      value={formatList(step.notifications)}
                      onChange={(event) => handleStepChange(step.id, { notifications: parseList(event.target.value) })}
                      rows={2}
                      placeholder="Slack, Email, SMS, MS Teams…"
                    />
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-gray-600">Timing / SLA</Label>
                    <Input
                      value={step.timingSla ?? ""}
                      onChange={(event) => handleStepChange(step.id, { timingSla: event.target.value || undefined })}
                      placeholder="24 Hours"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-gray-600">Risk level</Label>
                    <Select
                      value={step.riskLevel ?? ""}
                      onValueChange={(value) =>
                        handleStepChange(step.id, { riskLevel: value === "" ? undefined : (value as BlueprintStep["riskLevel"]) })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select risk" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Not set</SelectItem>
                        {STEP_RISK_LEVELS.map((level) => (
                          <SelectItem key={level} value={level}>
                            {level}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-gray-600">Exception IDs (comma separated)</Label>
                    <Input
                      value={step.exceptionIds?.join(", ") ?? ""}
                      onChange={(event) => {
                        const values = parseList(event.target.value);
                        handleStepChange(step.id, { exceptionIds: values.length > 0 ? values : undefined });
                      }}
                      placeholder="step-3, step-7"
                    />
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-gray-600">Notes for ops</Label>
                    <Textarea
                      value={step.notesForOps ?? ""}
                      onChange={(event) => handleStepChange(step.id, { notesForOps: event.target.value || undefined })}
                      rows={2}
                      placeholder="Technical implementation details."
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-gray-600">Next step IDs (comma separated)</Label>
                    <Input
                      value={step.nextStepIds.join(", ")}
                      onChange={(event) => handleStepChange(step.id, { nextStepIds: parseList(event.target.value) })}
                      placeholder="step-2, step-4"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                  <span className="text-xs text-gray-500">Step ID: {step.id}</span>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleMoveStep(step.id, "up")}
                      disabled={index === 0}
                      aria-label="Move step up"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleMoveStep(step.id, "down")}
                      disabled={index === blueprint.steps.length - 1}
                      aria-label="Move step down"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Delete step"
                      onClick={() => handleDeleteStep(step.id)}
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

      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <p className="text-xs text-gray-500">{canSave ? "Unsaved changes" : "All changes saved"}</p>
        <Button type="button" onClick={onSave} disabled={!canSave || saving || disabled}>
          {saving ? "Saving..." : "Save Blueprint"}
        </Button>
      </div>
    </div>
  );
}


"use client";

import { useMemo } from "react";
import { Trash2, Clock, Bell, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { BlueprintStep } from "@/lib/blueprint/types";

const STEP_TYPES: BlueprintStep["type"][] = ["Trigger", "Action", "Logic", "Human"];
const RESPONSIBILITIES: BlueprintStep["responsibility"][] = ["Automated", "HumanReview", "Approval"];

interface StudioInspectorProps {
  step: BlueprintStep | null;
  onClose: () => void;
  onChange: (stepId: string, patch: Partial<BlueprintStep>) => void;
  onDelete: (stepId: string) => void;
}

export function StudioInspector({ step, onClose, onChange, onDelete }: StudioInspectorProps) {
  const responsibilityLabel = useMemo(() => {
    if (!step) return "";
    return step.responsibility === "HumanReview" ? "Human Review" : step.responsibility;
  }, [step]);

  if (!step) {
    return (
      <div
        className="h-full flex flex-col items-center justify-center bg-white border-l border-gray-200 p-8 text-center gap-3"
        data-testid="inspector-placeholder"
      >
        <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mb-1 border border-gray-100">
          <Settings className="text-gray-400" size={20} />
        </div>
        <h3 className="text-[#0A0A0A] font-bold">Select a step to edit</h3>
        <p className="text-sm text-gray-500 max-w-xs">
          Click on any step in the canvas to configure its summary, systems, and downstream links.
        </p>
      </div>
    );
  }

  const handleChange = (patch: Partial<BlueprintStep>) => {
    onChange(step.id, patch);
  };

  const handleCommaListChange = (field: keyof Pick<BlueprintStep, "systemsInvolved" | "notifications" | "nextStepIds">) =>
    (value: string) => {
      const parsed = value
        .split(/,|\n/)
        .map((item) => item.trim())
        .filter(Boolean);
      handleChange({ [field]: parsed } as Partial<BlueprintStep>);
    };

  return (
    <div className="h-full flex flex-col bg-white border-l border-gray-200 shadow-xl shadow-gray-200/40" data-testid="inspector-pane">
      <div className="flex-none px-6 py-5 border-b border-gray-100 bg-white sticky top-0 z-10 flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">
              {step.type}
            </Badge>
            <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
              {responsibilityLabel}
            </Badge>
            {step.riskLevel ? (
              <Badge variant="outline" className="text-[10px] uppercase tracking-wider border-amber-200 text-amber-700">
                {step.riskLevel} Risk
              </Badge>
            ) : null}
          </div>
          <h2 className="text-xl font-bold text-[#0A0A0A] leading-tight">{step.name}</h2>
          <p className="text-[11px] text-gray-400">Node ID: {step.id}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400" onClick={() => onDelete(step.id)}>
            <Trash2 size={16} />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400" onClick={onClose}>
            ✕
          </Button>
        </div>
      </div>

      <div className="flex-1 w-full overflow-y-auto min-h-0" data-testid="inspector-scroll">
        <div className="p-6 space-y-6">
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-gray-600">Label</Label>
            <Input value={step.name} onChange={(event) => handleChange({ name: event.target.value })} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-gray-600">Type</Label>
              <Select value={step.type} onValueChange={(value) => handleChange({ type: value as BlueprintStep["type"] })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STEP_TYPES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-gray-600">Responsibility</Label>
              <Select
                value={step.responsibility}
                onValueChange={(value) => handleChange({ responsibility: value as BlueprintStep["responsibility"] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RESPONSIBILITIES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item === "HumanReview" ? "Human Review" : item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold text-gray-600">Summary</Label>
            <Textarea
              rows={3}
              value={step.summary}
              onChange={(event) => handleChange({ summary: event.target.value })}
              placeholder="What happens in this step?"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold text-gray-600">Goal / Outcome</Label>
            <Input
              value={step.goalOutcome}
              onChange={(event) => handleChange({ goalOutcome: event.target.value })}
              placeholder="What should this accomplish?"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold text-gray-600 flex items-center gap-1">
              <Clock size={12} /> Timing / SLA
            </Label>
            <Input
              value={step.timingSla ?? ""}
              onChange={(event) => handleChange({ timingSla: event.target.value || undefined })}
              placeholder="24 Hours"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold text-gray-600">Notes & exceptions</Label>
            <Textarea
              rows={3}
              value={step.notesExceptions ?? ""}
              onChange={(event) => handleChange({ notesExceptions: event.target.value || undefined })}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold text-gray-600 flex items-center gap-1">
              <Bell size={12} /> Notifications (comma separated)
            </Label>
            <Textarea
              rows={2}
              value={step.notifications.join(", ")}
              onChange={(event) => handleCommaListChange("notifications")(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold text-gray-600">Systems involved (comma separated)</Label>
            <Textarea
              rows={2}
              value={step.systemsInvolved.join(", ")}
              onChange={(event) => handleCommaListChange("systemsInvolved")(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold text-gray-600">Notes for Ops</Label>
            <Textarea
              rows={3}
              value={step.notesForOps ?? ""}
              onChange={(event) => handleChange({ notesForOps: event.target.value || undefined })}
              placeholder="Implementation details, APIs, or guardrails."
            />
          </div>

        </div>
      </div>

      <div className="flex-none p-6 border-t border-gray-200 bg-white space-y-3">
        <p className="text-[11px] text-gray-400">
          Changes are captured live. Use the Save button in the Blueprint toolbar to persist to the backend.
        </p>
        <Button variant="outline" className="w-full" onClick={onClose}>
          Close drawer
        </Button>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Trash2,
  X,
  Sparkles,
  ChevronRight,
  Shield,
  Clock,
  AlertTriangle,
  Bell,
  Zap,
  Settings,
  GitBranch,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ExceptionModal } from "@/components/modals/ExceptionModal";
import { SystemPickerModal } from "@/components/modals/SystemPickerModal";
import type { BlueprintStep } from "@/lib/blueprint/types";
import { cn } from "@/lib/utils";

interface StudioInspectorProps {
  step: BlueprintStep | null;
  onClose: () => void;
  onChange: (stepId: string, patch: Partial<BlueprintStep>) => void;
  onDelete: (stepId: string) => void;
}

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

const TIMING_OPTIONS = ["Real-time", "1 Hour", "24 Hours", "1 Week"];
const RISK_OPTIONS: BlueprintStep["riskLevel"][] = ["Low", "Medium", "High"];
const NOTIFICATION_CHANNELS = ["Slack", "Email", "SMS", "MS Teams"];

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

function parseExceptions(notes?: string) {
  if (!notes) return [];
  return notes
    .split("\n")
    .map((line) => line.trim().replace(/^•\s*/, ""))
    .map((line) => {
      const match = line.match(/if\s+(.*?)(?:,|\.)\s*then\s+(.*?)(?:\.)?$/i);
      if (match) {
        return { condition: match[1], outcome: match[2] };
      }
      if (!line) return null;
      return { condition: line, outcome: "" };
    })
    .filter(Boolean) as { condition: string; outcome: string }[];
}

export function StudioInspector({ step, onClose, onChange, onDelete }: StudioInspectorProps) {
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [responsibilityTab, setResponsibilityTab] = useState<ResponsibilityTab>("automated");
  const [exceptionModalOpen, setExceptionModalOpen] = useState(false);
  const [systemPickerOpen, setSystemPickerOpen] = useState(false);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!step) return;
    setResponsibilityTab(RESPONSIBILITY_TAB_MAP[step.responsibility]);
    setIsAdvancedOpen(false);
    setExceptionModalOpen(false);
    setSystemPickerOpen(false);
  }, [step?.id, step?.responsibility]);

  const badgeStatus = useMemo(() => (step ? deriveBadgeStatus(step) : "ai-suggested"), [step]);
  const parsedExceptions = useMemo(() => parseExceptions(step?.notesExceptions), [step?.notesExceptions]);

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

  const handleNotificationToggle = (channel: string) => {
    const normalized = channel.toLowerCase();
    const exists = step.notifications.some((note) => note.toLowerCase() === normalized);
    const next = exists
      ? step.notifications.filter((note) => note.toLowerCase() !== normalized)
      : [...step.notifications, channel];
    handleChange({ notifications: next });
  };

  const handleExceptionAdd = (rule: { condition: string; outcome: string }) => {
    const entry = `• If ${rule.condition}, then ${rule.outcome}.`;
    const combined = step.notesExceptions ? `${step.notesExceptions.trim()}\n${entry}` : entry;
    handleChange({ notesExceptions: combined });
  };

  const handleSystemSelect = (system: string) => {
    const exists = step.systemsInvolved.some((item) => item.toLowerCase() === system.toLowerCase());
    if (exists) {
      setSystemPickerOpen(false);
      return;
    }
    handleChange({ systemsInvolved: [...step.systemsInvolved, system] });
    setSystemPickerOpen(false);
  };

  const timingSelectValue = TIMING_OPTIONS.includes(step.timingSla ?? "") ? step.timingSla ?? undefined : undefined;
  const riskSelectValue = step.riskLevel && RISK_OPTIONS.includes(step.riskLevel) ? step.riskLevel : undefined;

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
            {step.type === "Logic" && (
              <div className="space-y-3 animate-in slide-in-from-bottom-2 duration-300">
                <Label className="text-xs font-bold text-[#0A0A0A] uppercase tracking-wider flex items-center gap-2">
                  Decision Rule
                </Label>
                <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 space-y-4">
                  <div className="flex items-center gap-2 text-sm font-bold text-gray-900 border-b border-gray-100 pb-2">
                    <GitBranch size={16} className="text-[#E43632]" />
                    Condition Logic
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-500 w-10 shrink-0">IF</span>
                    <div className="flex-1 flex items-center gap-2">
                      <Select defaultValue="amount">
                        <SelectTrigger className="h-8 text-xs bg-gray-50 border-gray-200 font-medium">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="amount">Amount</SelectItem>
                          <SelectItem value="vendor">Vendor</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select defaultValue=">">
                        <SelectTrigger className="w-[60px] h-8 text-xs bg-gray-50 border-gray-200 font-bold text-[#E43632]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value=">">&gt;</SelectItem>
                          <SelectItem value="<">&lt;</SelectItem>
                          <SelectItem value="=">=</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input className="h-8 text-xs bg-gray-50 border-gray-200 font-medium w-20" defaultValue="5000" />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-500 w-10 shrink-0">THEN</span>
                    <div className="flex-1 flex items-center gap-2 p-2 bg-gray-50 rounded-lg border border-gray-100">
                      <ArrowRight size={12} className="text-gray-400" />
                      <span className="text-xs font-medium text-gray-700">Request Approval</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-500 w-10 shrink-0">ELSE</span>
                    <div className="flex-1 flex items-center gap-2 p-2 bg-gray-50 rounded-lg border border-gray-100">
                      <ArrowRight size={12} className="text-gray-400" />
                      <span className="text-xs font-medium text-gray-700">Create Draft Bill</span>
                    </div>
                  </div>
                  <div className="flex items-start gap-1.5 pt-1">
                    <Sparkles size={10} className="text-[#E43632] mt-0.5 shrink-0" />
                    <p className="text-[10px] text-gray-400 leading-tight">
                      AI inferred this rule from your description. You can edit any part of it.
                    </p>
                  </div>
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
                    <span className="hidden sm:block">Automated</span>
                    <span className="block sm:hidden">Auto</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="human"
                    className="data-[state=active]:bg-white data-[state=active]:text-amber-600 data-[state=active]:shadow-sm py-2.5 text-xs font-medium"
                  >
                    <Shield size={14} className="mb-1 mx-auto block sm:hidden" />
                    <span className="hidden sm:block">Human Review</span>
                    <span className="block sm:hidden">Review</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="approval"
                    className="data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm py-2.5 text-xs font-medium"
                  >
                    <Shield size={14} className="mb-1 mx-auto block sm:hidden" />
                    <span className="hidden sm:block">Approval</span>
                    <span className="block sm:hidden">Approve</span>
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
              <button
                onClick={() => setExceptionModalOpen(true)}
                className="text-xs font-medium text-[#E43632] hover:text-[#C12E2A] hover:underline flex items-center gap-1 transition-colors"
              >
                + Add Exception (optional)
              </button>
            </div>

            <div className="pt-4 border-t border-gray-100">
              <Collapsible open={isAdvancedOpen} onOpenChange={setIsAdvancedOpen}>
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    className="w-full flex justify-between items-center p-0 h-auto hover:bg-transparent group"
                  >
                    <span className="text-sm font-bold text-[#0A0A0A]">Advanced Options</span>
                    <div className={cn("p-1 rounded-full transition-all", isAdvancedOpen ? "bg-gray-100 rotate-90" : "group-hover:bg-gray-50")}
                     >
                      <ChevronRight size={16} className="text-gray-400" />
                    </div>
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-6 mt-6 animate-in slide-in-from-top-2 duration-200">
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
                            className="bg-gray-100 text-gray-600 hover:bg-gray-200 cursor-pointer font-normal transition-colors hover:text-[#E43632] hover:border-red-200 border border-transparent"
                            onClick={() => setSystemPickerOpen(true)}
                          >
                            {system}
                          </Badge>
                        ))
                      )}
                      <button
                        onClick={() => setSystemPickerOpen(true)}
                        className="text-[10px] text-gray-400 border border-dashed border-gray-300 rounded-full px-2 py-0.5 hover:border-[#E43632] hover:text-[#E43632]"
                      >
                        + Connect
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
                        <Clock size={10} /> Timing / SLA
                      </Label>
                      <Select value={timingSelectValue} onValueChange={(value) => handleChange({ timingSla: value })}>
                        <SelectTrigger className="h-8 text-xs bg-white">
                          <SelectValue placeholder={step.timingSla || "Select SLA"} />
                        </SelectTrigger>
                        <SelectContent>
                          {TIMING_OPTIONS.map((option) => (
                            <SelectItem key={option} value={option}>
                              {option}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
                        <AlertTriangle size={10} /> Risk Level
                      </Label>
                      <Select value={riskSelectValue} onValueChange={(value) => handleChange({ riskLevel: value as BlueprintStep["riskLevel"] })}>
                        <SelectTrigger className="h-8 text-xs bg-white">
                          <SelectValue placeholder={step.riskLevel || "Select risk"} />
                        </SelectTrigger>
                        <SelectContent>
                          {RISK_OPTIONS.map((option) => (
                            <SelectItem key={option} value={option}>
                              {option} Risk
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
                      <Bell size={10} /> Notifications
                    </Label>
                    <div className="grid grid-cols-2 gap-2">
                      {NOTIFICATION_CHANNELS.map((channel) => {
                        const checked = step.notifications.some((note) => note.toLowerCase() === channel.toLowerCase());
                        const id = `notify-${channel.toLowerCase()}`;
                        return (
                          <div key={channel} className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg w-full">
                            <Switch
                              id={id}
                              checked={checked}
                              onCheckedChange={() => handleNotificationToggle(channel)}
                              className="data-[state=unchecked]:bg-gray-200"
                            />
                            <Label htmlFor={id} className="text-xs font-medium cursor-pointer">
                              {channel}
                            </Label>
                          </div>
                        );
                      })}
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
                </CollapsibleContent>
              </Collapsible>
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

      {isClient
        ? createPortal(
            <>
              <ExceptionModal
                isOpen={exceptionModalOpen}
                onClose={() => setExceptionModalOpen(false)}
                onAdd={handleExceptionAdd}
              />
              <SystemPickerModal
                isOpen={systemPickerOpen}
                onClose={() => setSystemPickerOpen(false)}
                onSelect={handleSystemSelect}
              />
            </>,
            document.body
          )
        : null}
    </>
  );
}

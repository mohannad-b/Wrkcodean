"use client";

import type { Blueprint, BlueprintSectionKey } from "@/lib/blueprint/types";
import { BLUEPRINT_SECTION_DEFINITIONS } from "@/lib/blueprint/types";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";

interface BlueprintSummaryProps {
  blueprint: Blueprint | null;
  onCreate?: () => void;
  disableCreate?: boolean;
}

function formatDateLabel(timestamp: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(timestamp));
  } catch {
    return timestamp;
  }
}

const SECTION_ORDER = BLUEPRINT_SECTION_DEFINITIONS.reduce<Record<BlueprintSectionKey, number>>(
  (acc, definition, index) => {
    acc[definition.key] = index;
    return acc;
  },
  {} as Record<BlueprintSectionKey, number>
);

export function BlueprintSummary({ blueprint, onCreate, disableCreate }: BlueprintSummaryProps) {
  if (!blueprint) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-200 bg-white/50 px-6 py-10 text-center">
        <p className="text-sm text-gray-600 mb-4">
          No blueprint yet. Ask Copilot to draft the workflow or create an empty blueprint to start capturing sections
          and steps.
        </p>
        <Button type="button" onClick={onCreate} disabled={!onCreate || disableCreate}>
          Create Blueprint
        </Button>
      </div>
    );
  }

  const orderedSections = blueprint.sections
    .slice()
    .sort((a, b) => SECTION_ORDER[a.key] - SECTION_ORDER[b.key]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="secondary" className="uppercase tracking-wide text-xs">
          {blueprint.status}
        </Badge>
        <span className="text-xs text-gray-500">Updated {formatDateLabel(blueprint.updatedAt)}</span>
      </div>

      <div>
        <p className="text-sm font-medium text-gray-900 mb-2">Summary</p>
        {blueprint.summary ? (
          <p className="text-sm text-gray-700 leading-relaxed">{blueprint.summary}</p>
        ) : (
          <p className="text-sm text-gray-500">No summary yet.</p>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium text-gray-900">Sections</p>
          <span className="text-xs text-gray-500">{orderedSections.length} total</span>
        </div>
        <div className="space-y-3">
          {orderedSections.map((section) => (
            <div key={section.id} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{section.title}</p>
              {section.content ? (
                <p className="text-sm text-gray-700 mt-1 whitespace-pre-line">{section.content}</p>
              ) : (
                <p className="text-xs text-gray-400 mt-1">No notes captured.</p>
              )}
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium text-gray-900">Steps</p>
          <span className="text-xs text-gray-500">{blueprint.steps.length} total</span>
        </div>
        {blueprint.steps.length === 0 ? (
          <p className="text-sm text-gray-500">No steps yet. Generate a draft to populate the canvas.</p>
        ) : (
          <Accordion type="multiple" className="space-y-2">
            {blueprint.steps.map((step, index) => (
              <AccordionItem key={step.id} value={step.id} className="border border-gray-100 rounded-lg px-3">
                <AccordionTrigger className="text-sm font-medium text-left">
                  <div className="flex flex-col gap-1 text-left w-full">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span>
                        Step {index + 1}: {step.name}
                      </span>
                      <div className="flex gap-1 flex-wrap">
                        <Badge variant="outline" className="text-[11px] uppercase tracking-wide">
                          {step.type}
                        </Badge>
                        <Badge variant="outline" className="text-[11px] uppercase tracking-wide">
                          {step.responsibility === "HumanReview" ? "Human Review" : step.responsibility}
                        </Badge>
                        {step.riskLevel ? (
                          <Badge variant="secondary" className="text-[11px] uppercase tracking-wide">
                            {step.riskLevel} Risk
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                    <span className="text-xs text-gray-500">{step.nextStepIds.length} next step links</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-3 py-3 text-sm text-gray-700">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Summary</p>
                      <p className="text-sm text-gray-700 mt-1 whitespace-pre-line">{step.summary || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Goal / outcome</p>
                      <p className="text-sm text-gray-700 mt-1">{step.goalOutcome || "—"}</p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Systems</p>
                        <p className="text-sm text-gray-700 mt-1">
                          {step.systemsInvolved.length > 0 ? step.systemsInvolved.join(", ") : "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Notifications</p>
                        <p className="text-sm text-gray-700 mt-1">
                          {step.notifications.length > 0 ? step.notifications.join(", ") : "—"}
                        </p>
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Timing / SLA</p>
                        <p className="text-sm text-gray-700 mt-1">{step.timingSla ?? "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Notes for Ops</p>
                        <p className="text-sm text-gray-700 mt-1 whitespace-pre-line">{step.notesForOps ?? "—"}</p>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Next steps</p>
                      <p className="text-sm text-gray-700 mt-1">
                        {step.nextStepIds.length > 0 ? step.nextStepIds.join(", ") : "—"}
                      </p>
                    </div>
                    {step.notesExceptions ? (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Notes / exceptions</p>
                        <p className="text-sm text-gray-700 mt-1 whitespace-pre-line">{step.notesExceptions}</p>
                      </div>
                    ) : null}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </div>
    </div>
  );
}


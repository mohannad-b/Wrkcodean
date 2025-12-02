"use client";
import type { Blueprint } from "@/lib/blueprint/types";
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

export function BlueprintSummary({ blueprint, onCreate, disableCreate }: BlueprintSummaryProps) {
  if (!blueprint) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-200 bg-white/50 px-6 py-10 text-center">
        <p className="text-sm text-gray-600 mb-4">No blueprint yet. Create one to outline phases and steps.</p>
        <Button type="button" onClick={onCreate} disabled={!onCreate || disableCreate}>
          Create Blueprint
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="secondary" className="uppercase tracking-wide text-xs">
          {blueprint.status}
        </Badge>
        <span className="text-xs text-gray-500">Updated {formatDateLabel(blueprint.updatedAt)}</span>
      </div>

      <div>
        <p className="text-sm font-medium text-gray-900 mb-2">Goals</p>
        {blueprint.goals.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {blueprint.goals.map((goal, index) => (
              <Badge key={`${goal}-${index}`} variant="outline">
                {goal}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">No goals defined yet.</p>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium text-gray-900">Phases</p>
          <span className="text-xs text-gray-500">{blueprint.phases.length} total</span>
        </div>
        {blueprint.phases.length === 0 ? (
          <p className="text-sm text-gray-500">Add phases to outline the workstream.</p>
        ) : (
          <Accordion type="multiple" className="space-y-2">
            {blueprint.phases
              .sort((a, b) => a.order - b.order)
              .map((phase, index) => (
                <AccordionItem key={phase.id} value={phase.id} className="border border-gray-100 rounded-lg px-3">
                  <AccordionTrigger className="text-sm font-medium text-left">
                    <div className="flex flex-col text-left">
                      <span>
                        Phase {index + 1}: {phase.name}
                      </span>
                      <span className="text-xs font-normal text-gray-500">{phase.steps.length} steps</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <ul className="space-y-2 py-2">
                      {phase.steps.length === 0 ? (
                        <li className="text-xs text-gray-500">No steps yet.</li>
                      ) : (
                        phase.steps.map((step) => (
                          <li
                            key={step.id}
                            className="rounded-md border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-700"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-medium">{step.title}</span>
                              <div className="flex gap-1">
                                <Badge variant="outline" className="text-[11px] uppercase tracking-wide">
                                  {step.type}
                                </Badge>
                                {step.status ? (
                                  <Badge variant="secondary" className="text-[11px] uppercase tracking-wide">
                                    {step.status}
                                  </Badge>
                                ) : null}
                              </div>
                            </div>
                            {step.description ? (
                              <p className="mt-1 text-xs text-gray-500">{step.description}</p>
                            ) : null}
                            <div className="mt-1 text-[11px] text-gray-500 flex gap-3 flex-wrap">
                              {step.ownerRole ? (
                                <span>
                                  <strong>Owner:</strong> {step.ownerRole}
                                </span>
                              ) : null}
                              {step.estimateMinutes ? (
                                <span>
                                  <strong>Estimate:</strong> ~{step.estimateMinutes} min
                                </span>
                              ) : null}
                            </div>
                          </li>
                        ))
                      )}
                    </ul>
                  </AccordionContent>
                </AccordionItem>
              ))}
          </Accordion>
        )}
      </div>
    </div>
  );
}


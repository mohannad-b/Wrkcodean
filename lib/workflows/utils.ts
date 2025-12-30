import type { WorkflowSpec, WorkflowSectionKey } from "./types";
import { WORKFLOW_SECTION_DEFINITIONS } from "./types";

export function isWorkflowEffectivelyEmpty(workflow: WorkflowSpec | null | undefined): boolean {
  if (!workflow) return true;
  const summaryEmpty = workflow.summary.trim().length === 0;
  const sectionsEmpty = workflow.sections.every((section) => section.content.trim().length === 0);
  const noSteps = workflow.steps.length === 0;
  return summaryEmpty && sectionsEmpty && noSteps;
}

export const SECTION_ORDER = WORKFLOW_SECTION_DEFINITIONS.reduce<Record<WorkflowSectionKey, number>>(
  (acc, definition, index) => {
    acc[definition.key] = index;
    return acc;
  },
  {} as Record<WorkflowSectionKey, number>
);

export function sortSections(sections: WorkflowSpec["sections"]) {
  return sections.slice().sort((a, b) => SECTION_ORDER[a.key] - SECTION_ORDER[b.key]);
}

export function timestampWorkflow(workflow: WorkflowSpec): WorkflowSpec {
  const now = new Date().toISOString();
  return {
    ...workflow,
    updatedAt: now,
  };
}

// Legacy aliases
export const isBlueprintEffectivelyEmpty = isWorkflowEffectivelyEmpty;
export const timestampBlueprint = timestampWorkflow;


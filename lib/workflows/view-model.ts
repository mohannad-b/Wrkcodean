import type { WorkflowSpec } from "@/lib/workflows/types";
import { parseWorkflowSpec } from "@/lib/workflows/schema";

export type WorkflowViewModel = {
  workflowSpec: WorkflowSpec | null;
  // TEMPORARY legacy aliases for backward compatibility; remove after callers migrate.
  // TODO: remove blueprintJson/requirementsText aliases once all callers read workflowSpec.
  blueprintJson?: WorkflowSpec | null;
  requirementsText?: string | null;
};

export function buildWorkflowViewModel(workflowJson: unknown): WorkflowViewModel {
  const parsed = parseWorkflowSpec(workflowJson);
  return {
    workflowSpec: parsed,
    blueprintJson: parsed,
    requirementsText: null,
  };
}


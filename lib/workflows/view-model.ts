import type { Blueprint } from "@/lib/blueprint/types";
import { parseBlueprint } from "@/lib/blueprint/schema";

export type WorkflowViewModel = {
  workflowSpec: Blueprint | null;
  // TEMPORARY legacy aliases for backward compatibility; remove after callers migrate.
  // TODO: remove blueprintJson/requirementsText aliases once all callers read workflowSpec.
  blueprintJson?: Blueprint | null;
  requirementsText?: string | null;
};

export function buildWorkflowViewModel(workflowJson: unknown): WorkflowViewModel {
  const parsed = parseBlueprint(workflowJson);
  return {
    workflowSpec: parsed,
    blueprintJson: parsed,
    requirementsText: null,
  };
}


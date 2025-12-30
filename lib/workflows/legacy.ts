import type { Workflow } from "@/lib/workflows/types";

/**
 * Normalize inbound payloads that may still send the legacy `blueprintJson` key.
 * Returns a canonical `workflowJson` plus the raw legacy value if present.
 */
export function normalizeWorkflowInput<T extends { workflowJson?: Workflow | null; blueprintJson?: Workflow | null }>(
  payload: T
): { workflowJson: Workflow | null | undefined; blueprintJson: Workflow | null | undefined } {
  const workflowJson = payload.workflowJson ?? payload.blueprintJson;
  return { workflowJson, blueprintJson: payload.blueprintJson };
}

/**
 * Provide a single legacy alias for responses. Avoid duplicating this mapping
 * throughout handlers to keep contract drift contained.
 */
export function withLegacyBlueprintAlias<T extends Workflow | null | undefined>(workflowJson: T): {
  workflowJson: T;
  blueprintJson: T;
} {
  return { workflowJson, blueprintJson: workflowJson };
}

// Canonical workflow alias
export const withLegacyWorkflowAlias = withLegacyBlueprintAlias;


import { randomUUID } from "crypto";
import type { Blueprint, BlueprintBranch, BlueprintStep } from "./types";

export type SanitizationSummary = {
  removedDuplicateEdges: number;
  reparentedBranches: number;
  removedCycles: number;
  trimmedConnections: number;
  attachedOrphans: number;
};

type StepMap = Map<string, BlueprintStep>;
type ParentMap = Map<string, Set<string>>;

const isDecisionStep = (step?: BlueprintStep): boolean => {
  if (!step) {
    return false;
  }
  return step.type === "Decision" || step.branchType === "conditional";
};

const unique = <T>(values: T[]): T[] => Array.from(new Set(values));

function buildParentMap(steps: BlueprintStep[]): ParentMap {
  const parents: ParentMap = new Map();
  steps.forEach((step) => {
    step.nextStepIds.forEach((targetId) => {
      if (!parents.has(targetId)) {
        parents.set(targetId, new Set());
      }
      parents.get(targetId)!.add(step.id);
    });
  });
  return parents;
}

function findPreferredParent(childId: string, parentMap: ParentMap, stepMap: StepMap): string | undefined {
  const candidates = parentMap.get(childId);
  if (!candidates || candidates.size === 0) {
    return undefined;
  }
  for (const parentId of candidates) {
    if (isDecisionStep(stepMap.get(parentId))) {
      return parentId;
    }
  }
  return candidates.values().next().value;
}

function computeLevels(steps: BlueprintStep[]): Map<string, number> {
  const indegree = new Map<string, number>();
  steps.forEach((step) => indegree.set(step.id, 0));
  steps.forEach((step) => {
    step.nextStepIds.forEach((targetId) => {
      indegree.set(targetId, (indegree.get(targetId) ?? 0) + 1);
    });
  });

  const queue: string[] = [];
  const levels = new Map<string, number>();
  indegree.forEach((count, id) => {
    if (count === 0) {
      queue.push(id);
      levels.set(id, 0);
    }
  });

  while (queue.length > 0) {
    const current = queue.shift() as string;
    const level = levels.get(current) ?? 0;
    const step = steps.find((s) => s.id === current);
    if (!step) continue;
    step.nextStepIds.forEach((targetId) => {
      const nextLevel = level + 1;
      levels.set(targetId, Math.max(levels.get(targetId) ?? 0, nextLevel));
      const updated = (indegree.get(targetId) ?? 0) - 1;
      indegree.set(targetId, updated);
      if (updated <= 0) {
        queue.push(targetId);
      }
    });
  }

  steps.forEach((step) => {
    if (!levels.has(step.id)) {
      levels.set(step.id, levels.size);
    }
  });

  return levels;
}

export function sanitizeBlueprintTopology(
  blueprint: Blueprint
): { blueprint: Blueprint; workflow: Blueprint; summary: SanitizationSummary } {
  if (!blueprint.steps || blueprint.steps.length === 0) {
    return { blueprint, workflow: blueprint, summary: defaultSummary() };
  }

  const summary = defaultSummary();
  const stepIdSet = new Set(blueprint.steps.map((step) => step.id));
  const sanitizedSteps: BlueprintStep[] = blueprint.steps.map((step) => {
    const filtered = step.nextStepIds.filter((id) => id !== step.id && stepIdSet.has(id));
    const deduped = unique(filtered);
    summary.removedDuplicateEdges += filtered.length - deduped.length;
    return {
      ...step,
      nextStepIds: deduped,
    };
  });

  const stepMap: StepMap = new Map(sanitizedSteps.map((step) => [step.id, step]));
  const parentMap: ParentMap = buildParentMap(sanitizedSteps);
  const stepNumberLookup = buildStepNumberLookup(sanitizedSteps);

  function linkParentChild(
    parentId: string,
    childId: string,
    options?: { label?: string; condition?: string; trackReparent?: boolean }
  ) {
    if (parentId === childId) {
      return;
    }
    const parent = stepMap.get(parentId);
    const child = stepMap.get(childId);
    if (!parent || !child) {
      return;
    }

    const beforeLength = parent.nextStepIds.length;
    parent.nextStepIds = unique([...parent.nextStepIds, childId]);
    if (parent.nextStepIds.length !== beforeLength && options?.trackReparent !== false) {
      summary.reparentedBranches += 1;
    }

    if (child.parentStepId !== parentId) {
      child.parentStepId = parentId;
    }

    if (options?.label && !child.branchLabel) {
      child.branchLabel = options.label;
    }

    if (options?.condition && !child.branchCondition) {
      child.branchCondition = options.condition;
    }

    const existingParents = parentMap.get(childId) ?? new Set<string>();
    existingParents.forEach((otherParentId) => {
      if (otherParentId === parentId) {
        return;
      }
      const otherParent = stepMap.get(otherParentId);
      if (otherParent) {
        otherParent.nextStepIds = otherParent.nextStepIds.filter((id) => id !== childId);
        if (options?.trackReparent !== false) {
          summary.trimmedConnections += 1;
        }
      }
    });
    parentMap.set(childId, new Set([parentId]));
  }

  function assignBranchParent(parentId: string, childId: string, label?: string, condition?: string) {
    linkParentChild(parentId, childId, { label, condition, trackReparent: true });
  }

  sanitizedSteps.forEach((step) => {
    if (!isDecisionStep(step)) {
      return;
    }
    step.nextStepIds.forEach((childId) => {
      const child = stepMap.get(childId);
      assignBranchParent(step.id, childId, child?.branchLabel, child?.branchCondition);
    });
  });

  blueprint.branches?.forEach((branch) => {
    if (!isDecisionStep(stepMap.get(branch.parentStepId))) {
      return;
    }
    assignBranchParent(branch.parentStepId, branch.targetStepId, branch.label, branch.condition);
  });

  sanitizedSteps.forEach((child) => {
    if (!child.branchLabel && !child.branchCondition) {
      return;
    }
    const preferredParent =
      (child.parentStepId && stepMap.has(child.parentStepId) && child.parentStepId) ||
      findPreferredParent(child.id, parentMap, stepMap);
    if (preferredParent) {
      assignBranchParent(preferredParent, child.id, child.branchLabel, child.branchCondition);
    }
  });

  sanitizedSteps.forEach((step) => {
    const uniqueTargets = unique(step.nextStepIds);
    summary.removedDuplicateEdges += step.nextStepIds.length - uniqueTargets.length;
    step.nextStepIds = uniqueTargets;
  });

  const levels = computeLevels(sanitizedSteps);
  sanitizedSteps.forEach((step) => {
    const stepLevel = levels.get(step.id) ?? 0;
    const filtered = step.nextStepIds.filter((targetId) => {
      const targetLevel = levels.get(targetId) ?? stepLevel + 1;
      if (targetLevel <= stepLevel) {
        summary.removedCycles += 1;
        return false;
      }
      return true;
    });
    step.nextStepIds = filtered;
  });

  const MAX_CONNECTIONS = 3;
  sanitizedSteps.forEach((step) => {
    if (isDecisionStep(step)) {
      return;
    }
    if (step.nextStepIds.length > MAX_CONNECTIONS) {
      const trimmed = step.nextStepIds.slice(0, MAX_CONNECTIONS);
      summary.trimmedConnections += step.nextStepIds.length - trimmed.length;
      step.nextStepIds = trimmed;
    }
  });

  sanitizedSteps.forEach((step) => {
    const hasDecisionChild = step.nextStepIds.some((id) => isDecisionStep(stepMap.get(id)));
    if (hasDecisionChild) {
      const filtered = step.nextStepIds.filter((id) => isDecisionStep(stepMap.get(id)));
      summary.trimmedConnections += step.nextStepIds.length - filtered.length;
      step.nextStepIds = filtered;
    }
  });

  attachOrphans(sanitizedSteps, parentMap, summary, stepNumberLookup, linkParentChild);

  const legacyBranchIdLookup = new Map(
    (blueprint.branches ?? []).map((branch) => [`${branch.parentStepId}:${branch.targetStepId}`, branch.id])
  );

  const sanitizedBranches: BlueprintBranch[] = [];
  sanitizedSteps.forEach((step) => {
    if (!step.parentStepId || (!step.branchLabel && !step.branchCondition)) {
      return;
    }
    const key = `${step.parentStepId}:${step.id}`;
    sanitizedBranches.push({
      id: legacyBranchIdLookup.get(key) ?? randomUUID(),
      parentStepId: step.parentStepId,
      targetStepId: step.id,
      label: step.branchLabel ?? "Branch",
      condition: step.branchCondition ?? "Meets branch criteria",
    });
  });

  const updatedBlueprint = {
    ...blueprint,
    steps: sanitizedSteps,
    branches: sanitizedBranches,
  };

  return {
    blueprint: updatedBlueprint,
    workflow: updatedBlueprint,
    summary,
  };
}

function attachOrphans(
  steps: BlueprintStep[],
  parentMap: ParentMap,
  summary: SanitizationSummary,
  stepNumberLookup: Map<string, BlueprintStep>,
  linkParentChild: (parentId: string, childId: string, options?: { trackReparent?: boolean }) => void
) {
  const ordered = [...steps].sort((a, b) => {
    const aNumber = parseInt(a.stepNumber.replace(/[^0-9]/g, ""), 10);
    const bNumber = parseInt(b.stepNumber.replace(/[^0-9]/g, ""), 10);
    return (aNumber || 0) - (bNumber || 0);
  });

  for (let index = 1; index < ordered.length; index += 1) {
    const step = ordered[index];
    const parents = parentMap.get(step.id);
    if (parents && parents.size > 0) {
      continue;
    }

    const parentByNumber = findParentFromStepNumber(step, stepNumberLookup);
    if (parentByNumber && parentByNumber.id !== step.id) {
      linkParentChild(parentByNumber.id, step.id, { trackReparent: false });
      summary.attachedOrphans += 1;
      continue;
    }

    const candidate = ordered[index - 1];
    if (!candidate || candidate.id === step.id) {
      continue;
    }

    linkParentChild(candidate.id, step.id, { trackReparent: false });
    summary.attachedOrphans += 1;
  }
}

function defaultSummary(): SanitizationSummary {
  return {
    removedDuplicateEdges: 0,
    reparentedBranches: 0,
    removedCycles: 0,
    trimmedConnections: 0,
    attachedOrphans: 0,
  };
}

function buildStepNumberLookup(steps: BlueprintStep[]): Map<string, BlueprintStep> {
  const map = new Map<string, BlueprintStep>();
  steps.forEach((step) => {
    const key = normalizeStepNumberKey(step.stepNumber);
    if (key) {
      map.set(key, step);
    }
  });
  return map;
}

function findParentFromStepNumber(
  step: BlueprintStep,
  lookup: Map<string, BlueprintStep>
): BlueprintStep | undefined {
  const normalized = normalizeStepNumberKey(step.stepNumber);
  if (!normalized) {
    return undefined;
  }
  let candidate = normalized.slice(0, -1);
  while (candidate.length > 0) {
    const parent = lookup.get(candidate);
    if (parent) {
      return parent;
    }
    candidate = candidate.slice(0, -1);
  }
  return undefined;
}

function normalizeStepNumberKey(stepNumber?: string | null): string | null {
  if (!stepNumber) {
    return null;
  }
  const cleaned = stepNumber.replace(/[^0-9a-z]/gi, "").toLowerCase();
  return cleaned.length > 0 ? cleaned : null;
}

// Canonical workflow alias
export const sanitizeWorkflowTopology = sanitizeBlueprintTopology;


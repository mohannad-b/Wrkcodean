import { randomUUID } from "crypto";
import type { Blueprint, BlueprintBranch, BlueprintStep } from "./types";

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

export function sanitizeBlueprintTopology(blueprint: Blueprint): Blueprint {
  if (!blueprint.steps || blueprint.steps.length === 0) {
    return blueprint;
  }

  const stepIdSet = new Set(blueprint.steps.map((step) => step.id));
  const sanitizedSteps: BlueprintStep[] = blueprint.steps.map((step) => ({
    ...step,
    nextStepIds: unique(step.nextStepIds.filter((id) => id !== step.id && stepIdSet.has(id))),
  }));

  const stepMap: StepMap = new Map(sanitizedSteps.map((step) => [step.id, step]));
  const parentMap: ParentMap = buildParentMap(sanitizedSteps);

  function assignBranchParent(parentId: string, childId: string, label?: string, condition?: string) {
    if (parentId === childId) {
      return;
    }
    const parent = stepMap.get(parentId);
    const child = stepMap.get(childId);
    if (!parent || !child) {
      return;
    }

    parent.nextStepIds = unique([...parent.nextStepIds, childId]);

    if (!child.parentStepId || child.parentStepId !== parentId) {
      child.parentStepId = parentId;
    }

    if (label && !child.branchLabel) {
      child.branchLabel = label;
    }

    if (condition && !child.branchCondition) {
      child.branchCondition = condition;
    }

    const existingParents = parentMap.get(childId) ?? new Set<string>();
    existingParents.forEach((otherParentId) => {
      if (otherParentId === parentId) {
        return;
      }
      const otherParent = stepMap.get(otherParentId);
      if (otherParent) {
        otherParent.nextStepIds = otherParent.nextStepIds.filter((id) => id !== childId);
      }
    });
    parentMap.set(childId, new Set([parentId]));
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
    step.nextStepIds = unique(step.nextStepIds);
  });

  sanitizedSteps.forEach((step) => {
    const hasDecisionChild = step.nextStepIds.some((id) => isDecisionStep(stepMap.get(id)));
    if (hasDecisionChild) {
      step.nextStepIds = step.nextStepIds.filter((id) => isDecisionStep(stepMap.get(id)));
    }
  });

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

  return {
    ...blueprint,
    steps: sanitizedSteps,
    branches: sanitizedBranches,
  };
}


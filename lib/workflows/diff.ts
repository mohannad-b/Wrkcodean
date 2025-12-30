import type { Blueprint, BlueprintBranch, BlueprintStep } from "./types";

export type StepSnapshot = {
  id: string;
  stepNumber?: string;
  name: string;
};

export type StepRename = {
  from: StepSnapshot;
  to: StepSnapshot;
};

export type BranchSnapshot = {
  from: StepSnapshot | null;
  to: StepSnapshot | null;
};

export type BlueprintDiff = {
  summary: string[];
  stepsAdded?: StepSnapshot[];
  stepsRemoved?: StepSnapshot[];
  stepsRenamed?: StepRename[];
  branchesAdded?: BranchSnapshot[];
  branchesRemoved?: BranchSnapshot[];
};

export function diffBlueprint(previous: Blueprint | null | undefined, next: Blueprint | null | undefined): BlueprintDiff {
  if (!previous || !next) {
    return { summary: [] };
  }

  const prevStepsById = indexSteps(previous.steps);
  const nextStepsById = indexSteps(next.steps);

  const stepsAdded = next.steps.filter((step) => !prevStepsById.has(step.id)).map(snapshotStep);
  const stepsRemoved = previous.steps.filter((step) => !nextStepsById.has(step.id)).map(snapshotStep);
  const stepsRenamed: StepRename[] = [];

  next.steps.forEach((step) => {
    const before = prevStepsById.get(step.id);
    if (before && before.name !== step.name) {
      stepsRenamed.push({ from: snapshotStep(before), to: snapshotStep(step) });
    }
  });

  const branchesAdded = diffBranches(previous.branches ?? [], next.branches ?? [], prevStepsById, nextStepsById, true);
  const branchesRemoved = diffBranches(previous.branches ?? [], next.branches ?? [], prevStepsById, nextStepsById, false);

  const summary: string[] = [];
  if (stepsAdded.length) {
    summary.push(`Added ${pluralize("step", stepsAdded.length)} ${formatList(stepsAdded.map(formatStepLabel))}`);
  }
  if (stepsRemoved.length) {
    summary.push(`Removed ${pluralize("step", stepsRemoved.length)} ${formatList(stepsRemoved.map(formatStepLabel))}`);
  }
  if (stepsRenamed.length) {
    const renameList = stepsRenamed
      .map((rename) => `${formatStepLabel(rename.from)} → ${formatStepLabel(rename.to)}`)
      .slice(0, 5);
    summary.push(`Renamed ${pluralize("step", stepsRenamed.length)} ${formatList(renameList)}`);
  }
  if (branchesAdded.length) {
    summary.push(`Created ${pluralize("branch", branchesAdded.length)} ${formatBranchList(branchesAdded)}`);
  }
  if (branchesRemoved.length) {
    summary.push(`Removed ${pluralize("branch", branchesRemoved.length)} ${formatBranchList(branchesRemoved)}`);
  }

  if (summary.length === 0) {
    summary.push("Updated blueprint details");
  }

  return {
    summary,
    stepsAdded: stepsAdded.length ? stepsAdded : undefined,
    stepsRemoved: stepsRemoved.length ? stepsRemoved : undefined,
    stepsRenamed: stepsRenamed.length ? stepsRenamed : undefined,
    branchesAdded: branchesAdded.length ? branchesAdded : undefined,
    branchesRemoved: branchesRemoved.length ? branchesRemoved : undefined,
  };
}

function indexSteps(steps: BlueprintStep[]) {
  return new Map(steps.map((step) => [step.id, step]));
}

function snapshotStep(step: BlueprintStep): StepSnapshot {
  return {
    id: step.id,
    stepNumber: step.stepNumber || undefined,
    name: step.name,
  };
}

function formatStepLabel(step: StepSnapshot): string {
  if (step.stepNumber && step.stepNumber.trim().length > 0) {
    return `${step.stepNumber.trim()} ${step.name}`.trim();
  }
  return step.name;
}

function formatStepShort(step: StepSnapshot | null): string {
  if (!step) {
    return "unknown step";
  }
  return step.stepNumber && step.stepNumber.trim().length > 0 ? step.stepNumber.trim() : step.name;
}

function diffBranches(
  prev: BlueprintBranch[],
  next: BlueprintBranch[],
  prevSteps: Map<string, BlueprintStep>,
  nextSteps: Map<string, BlueprintStep>,
  added: boolean
): BranchSnapshot[] {
  const prevSet = new Set(prev.map(branchKey));
  const nextSet = new Set(next.map(branchKey));

  const source = added ? next : prev;
  return source
    .filter((branch) => (added ? !prevSet.has(branchKey(branch)) : !nextSet.has(branchKey(branch))))
    .map((branch) => ({
      from: lookupStepSnapshot(branch.parentStepId, prevSteps, nextSteps),
      to: lookupStepSnapshot(branch.targetStepId, prevSteps, nextSteps),
    }));
}

function branchKey(branch: BlueprintBranch) {
  return `${branch.parentStepId}->${branch.targetStepId}`;
}

function lookupStepSnapshot(
  id: string,
  prevSteps: Map<string, BlueprintStep>,
  nextSteps: Map<string, BlueprintStep>
): StepSnapshot | null {
  const step = nextSteps.get(id) ?? prevSteps.get(id);
  return step ? snapshotStep(step) : null;
}

function formatList(items: string[], limit = 5) {
  if (items.length <= limit) {
    return items.join(", ");
  }
  const visible = items.slice(0, limit).join(", ");
  return `${visible} +${items.length - limit} more`;
}

function formatBranchList(branches: BranchSnapshot[]) {
  const labels = branches.map((branch) => `${formatStepShort(branch.from)} → ${formatStepShort(branch.to)}`);
  return formatList(labels);
}

function pluralize(word: string, count: number) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

// Canonical workflow aliases
export type WorkflowDiff = BlueprintDiff;
export const diffWorkflow = diffBlueprint;



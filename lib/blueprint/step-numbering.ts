import type { Blueprint, BlueprintStep } from "./types";

export interface StepNumbering {
  stepNumber: string; // "1", "2A", "3B1"
  displayLabel: string; // "Step 1", "Step 2A (Yes)"
  level: number; // 0 for main, 1 for first branch level
  branchIndex: number; // 0 for A, 1 for B, etc.
}

/**
 * Generate step numbers for all steps in a blueprint
 *
 * Rules:
 * - Main flow: 1, 2, 3, 4...
 * - First branch level: 3A, 3B, 3C...
 * - Nested branches: 3A1, 3A2...
 * - Exceptions: 2E
 *
 * @param blueprint - The blueprint with steps to number
 * @returns Map of step ID to numbering info
 */
export function generateStepNumbers(blueprint: Blueprint): Map<string, StepNumbering> {
  const numbering = new Map<string, StepNumbering>();
  const visited = new Set<string>();

  // Build incoming edge count for each step
  const incomingCount = new Map<string, number>();
  blueprint.steps.forEach((step) => incomingCount.set(step.id, 0));

  blueprint.steps.forEach((step) => {
    step.nextStepIds.forEach((targetId) => {
      incomingCount.set(targetId, (incomingCount.get(targetId) || 0) + 1);
    });
  });

  // Find root nodes (steps with no incoming edges)
  const roots = blueprint.steps.filter((step) => incomingCount.get(step.id) === 0);

  // Start numbering from each root
  let mainSequence = 1;

  for (const root of roots) {
    traverseAndNumber(root, mainSequence.toString(), 0, 0);
    mainSequence++;
  }

  /**
   * Recursive function to traverse the graph and assign numbers
   */
  function traverseAndNumber(
    step: BlueprintStep,
    numberPrefix: string, // "1", "2", "3"
    level: number, // 0 = main, 1 = first branch, 2 = nested
    branchIndex: number // 0 = A, 1 = B, 2 = C
  ) {
    if (visited.has(step.id)) return;
    visited.add(step.id);

    // Generate step number based on level
    let stepNumber: string;

    if (level === 0) {
      // Main flow: just use the prefix (1, 2, 3)
      stepNumber = numberPrefix;
    } else if (step.branchType === "exception") {
      // Exception: add E suffix
      stepNumber = `${numberPrefix}E`;
    } else {
      // Branch: add letter (A, B, C)
      const letter = String.fromCharCode(65 + branchIndex);
      stepNumber = `${numberPrefix}${letter}`;
    }

    // Get branch label for display
    const branchLabel = step.branchLabel ? ` (${step.branchLabel})` : "";
    const displayLabel = `Step ${stepNumber}${branchLabel}`;

    // Store numbering info
    numbering.set(step.id, {
      stepNumber,
      displayLabel,
      level,
      branchIndex,
    });

    // Find next steps
    const nextSteps = blueprint.steps.filter((s) => step.nextStepIds.includes(s.id));

    if (nextSteps.length === 0) {
      // End of path
      return;
    } else if (nextSteps.length === 1) {
      const [nextStep] = nextSteps;
      const isBranchContinuation = level > 0 && nextStep.parentStepId === step.id;
      const nextNumber = isBranchContinuation ? numberPrefix : incrementMainSequence(numberPrefix);
      const nextLevel = isBranchContinuation ? level : 0;
      traverseAndNumber(nextStep, nextNumber, nextLevel, 0);
    } else {
      // Multiple paths = branch point
      nextSteps.forEach((nextStep, index) => {
        traverseAndNumber(nextStep, stepNumber, level + 1, index);
      });
    }
  }

  return numbering;
}

/**
 * Apply generated step numbers to blueprint steps
 *
 * @param blueprint - The blueprint to update
 * @returns New blueprint with stepNumber fields populated
 */
export function applyStepNumbers(blueprint: Blueprint): Blueprint {
  const numbering = generateStepNumbers(blueprint);

  const stepsWithNumbers = blueprint.steps.map((step) => ({
    ...step,
    stepNumber: numbering.get(step.id)?.stepNumber || "",
  }));

  return {
    ...blueprint,
    steps: stepsWithNumbers,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Get display label for a step
 *
 * @param blueprint - The blueprint
 * @param stepId - The step ID
 * @returns Display label like "Step 3A (Yes)" or just the step number if not found
 */
export function getStepDisplayLabel(blueprint: Blueprint, stepId: string): string {
  const numbering = generateStepNumbers(blueprint);
  return numbering.get(stepId)?.displayLabel || stepId;
}

function incrementMainSequence(prefix: string): string {
  const numeric = parseInt(prefix.replace(/[^0-9]/g, ""), 10);
  if (Number.isNaN(numeric)) {
    return "1";
  }
  return (numeric + 1).toString();
}


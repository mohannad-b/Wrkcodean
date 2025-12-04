import { randomUUID } from "crypto";
import type { Blueprint, BlueprintStep } from "./types";
import type { ParsedCommand } from "./command-parser";
import { applyStepNumbers } from "./step-numbering";

export type BlueprintAuditEvent = {
  action: string;
  metadata?: Record<string, unknown>;
};

type CommandActionResult = {
  message: string;
  auditEvent?: BlueprintAuditEvent | null;
};

export interface CommandResult {
  success: boolean;
  blueprint: Blueprint;
  message: string;
  auditEvents: BlueprintAuditEvent[];
  error?: string;
}

export function executeCommand(blueprint: Blueprint, command: ParsedCommand): CommandResult {
  try {
    if (command.type === "unknown") {
      return { success: false, blueprint, message: "", error: "Unknown command", auditEvents: [] };
    }

    const working = cloneBlueprint(blueprint);
    let message = "";
    const auditEvents: BlueprintAuditEvent[] = [];
    let result: CommandActionResult = { message: "" };

    switch (command.type) {
      case "delete_step":
        result = deleteStep(working, command.params.stepNumber);
        break;
      case "rename_step":
        result = renameStep(working, command.params.stepNumber, command.params.newName);
        break;
      case "move_step":
        result = moveStep(
          working,
          command.params.sourceStep,
          command.params.targetStep,
          (command.params.position as "before" | "after") ?? "after"
        );
        break;
      case "connect_steps":
        result = connectSteps(working, command.params.fromStep, command.params.toStep);
        break;
      case "disconnect_steps":
        result = disconnectSteps(working, command.params.fromStep, command.params.toStep);
        break;
      case "add_step_after":
        result = addStepAfter(working, command.params.afterStep);
        break;
      case "add_step_before":
        result = addStepBefore(working, command.params.beforeStep);
        break;
      case "swap_steps":
        result = swapSteps(working, command.params.stepA, command.params.stepB);
        break;
      default:
        return { success: false, blueprint, message: "", error: `Command ${command.type} not supported`, auditEvents: [] };
    }

    message = result.message;
    if (result.auditEvent) {
      auditEvents.push(result.auditEvent);
    }

    const numbered = applyStepNumbers(working);
    return {
      success: true,
      blueprint: { ...numbered, updatedAt: new Date().toISOString() },
      message,
      auditEvents,
    };
  } catch (error) {
    return {
      success: false,
      blueprint,
      message: "",
      auditEvents: [],
      error: error instanceof Error ? error.message : "Command failed",
    };
  }
}

function cloneBlueprint(source: Blueprint): Blueprint {
  return {
    ...source,
    steps: source.steps.map((step) => ({
      ...step,
      nextStepIds: [...step.nextStepIds],
      taskIds: Array.isArray(step.taskIds) ? [...step.taskIds] : [],
    })),
    branches: Array.isArray(source.branches) ? source.branches.map((branch) => ({ ...branch })) : [],
  };
}

function findStepByNumber(blueprint: Blueprint, stepNumber: string): BlueprintStep | undefined {
  const normalized = stepNumber?.trim().toLowerCase();
  return blueprint.steps.find((step) => step.stepNumber?.toLowerCase() === normalized);
}

function deleteStep(blueprint: Blueprint, stepNumber?: string): CommandActionResult {
  if (!stepNumber) {
    throw new Error("Specify the step to delete.");
  }
  const step = findStepByNumber(blueprint, stepNumber);
  if (!step) {
    throw new Error(`Step ${stepNumber} not found`);
  }

  const parents = getIncomingSteps(blueprint, step.id);
  const children = [...step.nextStepIds];

  parents.forEach((parent) => {
    parent.nextStepIds = parent.nextStepIds.filter((id) => id !== step.id);
    children.forEach((childId) => {
      if (!parent.nextStepIds.includes(childId)) {
        parent.nextStepIds.push(childId);
      }
    });
  });

  blueprint.steps = blueprint.steps.filter((s) => s.id !== step.id);
  blueprint.branches = (blueprint.branches ?? []).filter(
    (branch) => branch.parentStepId !== step.id && branch.targetStepId !== step.id
  );

  return {
    message: `Deleted step ${step.stepNumber} (${step.name})`,
    auditEvent: {
      action: "automation.blueprint.step.deleted",
      metadata: {
        stepNumber: step.stepNumber,
        stepName: step.name,
      },
    },
  };
}

function renameStep(blueprint: Blueprint, stepNumber?: string, newName?: string): CommandActionResult {
  if (!stepNumber || !newName) {
    throw new Error("Specify the step and the new name.");
  }
  const step = findStepByNumber(blueprint, stepNumber);
  if (!step) {
    throw new Error(`Step ${stepNumber} not found`);
  }
  const previousName = step.name;
  step.name = newName.trim();
  step.summary = step.summary || step.description || step.name;
  return {
    message: `Renamed step ${step.stepNumber} to "${step.name}"`,
    auditEvent: {
      action: "automation.blueprint.step.renamed",
      metadata: {
        stepNumber: step.stepNumber,
        oldName: previousName,
        newName: step.name,
      },
    },
  };
}

function moveStep(
  blueprint: Blueprint,
  sourceStepNumber?: string,
  targetStepNumber?: string,
  position: "before" | "after" = "after"
): CommandActionResult {
  if (!sourceStepNumber || !targetStepNumber) {
    throw new Error("Specify both the source and target step numbers.");
  }
  if (sourceStepNumber.toLowerCase() === targetStepNumber.toLowerCase()) {
    throw new Error("Source and target steps must be different.");
  }

  const source = findStepByNumber(blueprint, sourceStepNumber);
  const target = findStepByNumber(blueprint, targetStepNumber);
  if (!source) {
    throw new Error(`Step ${sourceStepNumber} not found`);
  }
  if (!target) {
    throw new Error(`Step ${targetStepNumber} not found`);
  }

  const parentsOfSource = getIncomingSteps(blueprint, source.id);
  const sourceChildren = [...source.nextStepIds];

  parentsOfSource.forEach((parent) => {
    parent.nextStepIds = parent.nextStepIds.filter((id) => id !== source.id);
    sourceChildren.forEach((childId) => {
      if (!parent.nextStepIds.includes(childId)) {
        parent.nextStepIds.push(childId);
      }
    });
  });

  source.nextStepIds = [];

  if (position === "after") {
    if (target.nextStepIds.length > 1) {
      throw new Error("Move after is only supported when the target step has a single outgoing path.");
    }
    const originalNext = [...target.nextStepIds];
    target.nextStepIds = [source.id];
    source.nextStepIds = originalNext;
  } else {
    const targetParents = getIncomingSteps(blueprint, target.id);
    if (targetParents.length > 1) {
      throw new Error("Move before is only supported when the target step has a single incoming path.");
    }
    targetParents.forEach((parent) => {
      parent.nextStepIds = parent.nextStepIds.map((id) => (id === target.id ? source.id : id));
    });
    source.nextStepIds = [target.id];
  }

  reorderSteps(blueprint, source.id, target.id, position);

  return {
    message: `Moved step ${source.stepNumber} ${position} step ${target.stepNumber}`,
    auditEvent: {
      action: "automation.blueprint.step.moved",
      metadata: {
        sourceStep: source.stepNumber,
        targetStep: target.stepNumber,
        position,
      },
    },
  };
}

function addStepAfter(blueprint: Blueprint, afterStepNumber?: string): CommandActionResult {
  if (!afterStepNumber) {
    throw new Error("Specify the step to insert after.");
  }
  const afterStep = findStepByNumber(blueprint, afterStepNumber);
  if (!afterStep) {
    throw new Error(`Step ${afterStepNumber} not found`);
  }

  const newStep = createPlaceholderStep();
  const originalNext = [...afterStep.nextStepIds];
  afterStep.nextStepIds = [newStep.id];
  newStep.nextStepIds = originalNext;

  insertStepRelative(blueprint, newStep, afterStep.id, "after");

  return {
    message: `Added a new step after ${afterStep.stepNumber}. Rename and update it as needed.`,
    auditEvent: {
      action: "automation.blueprint.step.added",
      metadata: {
        referenceStep: afterStep.stepNumber,
        position: "after",
      },
    },
  };
}

function addStepBefore(blueprint: Blueprint, beforeStepNumber?: string): CommandActionResult {
  if (!beforeStepNumber) {
    throw new Error("Specify the step to insert before.");
  }
  const beforeStep = findStepByNumber(blueprint, beforeStepNumber);
  if (!beforeStep) {
    throw new Error(`Step ${beforeStepNumber} not found`);
  }

  const newStep = createPlaceholderStep();
  const parents = getIncomingSteps(blueprint, beforeStep.id);
  parents.forEach((parent) => {
    parent.nextStepIds = parent.nextStepIds.map((id) => (id === beforeStep.id ? newStep.id : id));
  });
  newStep.nextStepIds = [beforeStep.id];

  insertStepRelative(blueprint, newStep, beforeStep.id, "before");

  return {
    message: `Added a new step before ${beforeStep.stepNumber}. Rename and update it as needed.`,
    auditEvent: {
      action: "automation.blueprint.step.added",
      metadata: {
        referenceStep: beforeStep.stepNumber,
        position: "before",
      },
    },
  };
}

function connectSteps(blueprint: Blueprint, fromNumber?: string, toNumber?: string): CommandActionResult {
  if (!fromNumber || !toNumber) {
    throw new Error("Specify both steps to connect.");
  }
  const from = findStepByNumber(blueprint, fromNumber);
  const to = findStepByNumber(blueprint, toNumber);
  if (!from) throw new Error(`Step ${fromNumber} not found`);
  if (!to) throw new Error(`Step ${toNumber} not found`);

  if (!from.nextStepIds.includes(to.id)) {
    from.nextStepIds.push(to.id);
  }
  return {
    message: `Connected step ${from.stepNumber} to step ${to.stepNumber}`,
    auditEvent: {
      action: "automation.blueprint.step.updated",
      metadata: {
        sourceStep: from.stepNumber,
        targetStep: to.stepNumber,
        operation: "connect",
      },
    },
  };
}

function disconnectSteps(blueprint: Blueprint, fromNumber?: string, toNumber?: string): CommandActionResult {
  if (!fromNumber || !toNumber) {
    throw new Error("Specify both steps to disconnect.");
  }
  const from = findStepByNumber(blueprint, fromNumber);
  const to = findStepByNumber(blueprint, toNumber);
  if (!from) throw new Error(`Step ${fromNumber} not found`);
  if (!to) throw new Error(`Step ${toNumber} not found`);

  const existing = from.nextStepIds.includes(to.id);
  from.nextStepIds = from.nextStepIds.filter((id) => id !== to.id);
  if (!existing) {
    throw new Error(`Steps ${from.stepNumber} and ${to.stepNumber} are not connected`);
  }
  return {
    message: `Disconnected step ${from.stepNumber} from step ${to.stepNumber}`,
    auditEvent: {
      action: "automation.blueprint.step.updated",
      metadata: {
        sourceStep: from.stepNumber,
        targetStep: to.stepNumber,
        operation: "disconnect",
      },
    },
  };
}

function swapSteps(blueprint: Blueprint, stepANumber?: string, stepBNumber?: string): CommandActionResult {
  if (!stepANumber || !stepBNumber) {
    throw new Error("Specify the steps to swap.");
  }
  const stepA = findStepByNumber(blueprint, stepANumber);
  const stepB = findStepByNumber(blueprint, stepBNumber);
  if (!stepA) throw new Error(`Step ${stepANumber} not found`);
  if (!stepB) throw new Error(`Step ${stepBNumber} not found`);

  reorderSteps(blueprint, stepA.id, stepB.id, "swap");
  return {
    message: `Swapped step ${stepANumber} with step ${stepBNumber}`,
    auditEvent: {
      action: "automation.blueprint.step.moved",
      metadata: {
        sourceStep: stepANumber,
        targetStep: stepBNumber,
        position: "swap",
      },
    },
  };
}

function reorderSteps(blueprint: Blueprint, sourceId: string, targetId: string, position: "before" | "after" | "swap") {
  const steps = blueprint.steps;
  const sourceIndex = steps.findIndex((step) => step.id === sourceId);
  const targetIndex = steps.findIndex((step) => step.id === targetId);
  if (sourceIndex === -1 || targetIndex === -1) {
    return;
  }

  const [source] = steps.splice(sourceIndex, 1);
  if (position === "swap") {
    const [target] = steps.splice(targetIndex > sourceIndex ? targetIndex - 1 : targetIndex, 1, source);
    steps.splice(sourceIndex, 0, target);
    return;
  }

  const insertIndex = position === "after" ? (targetIndex > sourceIndex ? targetIndex : targetIndex + 1) : targetIndex;
  steps.splice(insertIndex, 0, source);
}

function insertStepRelative(
  blueprint: Blueprint,
  newStep: BlueprintStep,
  referenceStepId: string,
  position: "before" | "after"
) {
  const steps = blueprint.steps;
  const referenceIndex = steps.findIndex((step) => step.id === referenceStepId);
  const insertIndex = position === "after" ? referenceIndex + 1 : referenceIndex;
  steps.splice(insertIndex, 0, newStep);
}

function getIncomingSteps(blueprint: Blueprint, stepId: string): BlueprintStep[] {
  return blueprint.steps.filter((step) => step.nextStepIds.includes(stepId));
}

function createPlaceholderStep(): BlueprintStep {
  return {
    id: randomUUID(),
    stepNumber: "",
    type: "Action",
    name: "New step",
    summary: "Describe this step",
    description: "Describe this step",
    goalOutcome: "Describe this step",
    responsibility: "Automated",
    systemsInvolved: [],
    notifications: [],
    nextStepIds: [],
    taskIds: [],
  };
}


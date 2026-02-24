import type { WorkflowSpec, WorkflowStep } from "./types";
import { WORKFLOW_SECTION_DEFINITIONS } from "./types";

const generateId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
};

// Canonical factory for workflows
export function createEmptyWorkflowSpec(): WorkflowSpec {
  const timestamp = new Date().toISOString();
  return {
    version: 1,
    status: "Draft",
    summary: "",
    sections: WORKFLOW_SECTION_DEFINITIONS.map((definition) => ({
      id: generateId(),
      key: definition.key,
      title: definition.title,
      content: "",
    })),
    steps: [],
    branches: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

/**
 * Build a skeleton workflow (trigger + placeholder) for immediate display while AI generates the full workflow.
 * Used for streaming workflow updates: show skeleton instantly, then replace with real workflow.
 */
export function buildSkeletonWorkflow(currentWorkflow: WorkflowSpec | null): WorkflowSpec {
  const timestamp = new Date().toISOString();
  const triggerStep = currentWorkflow?.steps?.find((s) => s.type === "Trigger");
  const placeholderId = generateId();
  const triggerId = triggerStep?.id ?? generateId();

  const steps: WorkflowStep[] = [];
  if (triggerStep) {
    steps.push({
      ...triggerStep,
      id: triggerId,
      nextStepIds: [placeholderId],
    });
  } else {
    steps.push({
      id: triggerId,
      type: "Trigger",
      name: "Trigger",
      summary: "Starts the workflow",
      description: "Starts the workflow",
      goalOutcome: "Workflow initiated",
      responsibility: "Automated",
      systemsInvolved: [],
      notifications: [],
      nextStepIds: [placeholderId],
      stepNumber: "1",
      taskIds: [],
    });
  }
  steps.push({
    id: placeholderId,
    type: "Action",
    name: "Processing…",
    summary: "Building your workflow",
    description: "Building your workflow",
    goalOutcome: "Workflow generated",
    responsibility: "Automated",
    systemsInvolved: [],
    notifications: [],
    nextStepIds: [],
    stepNumber: "2",
    taskIds: [],
    parentStepId: triggerId,
  });

  return {
    version: 1,
    status: "Draft",
    summary: currentWorkflow?.summary ?? "",
    sections: currentWorkflow?.sections ?? WORKFLOW_SECTION_DEFINITIONS.map((definition) => ({
      id: generateId(),
      key: definition.key,
      title: definition.title,
      content: "",
    })),
    steps,
    branches: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    metadata: { skeleton: true },
  };
}

// Legacy aliases for backward compatibility
export const createEmptyWorkflow = createEmptyWorkflowSpec;
export const createEmptyBlueprint = createEmptyWorkflowSpec;


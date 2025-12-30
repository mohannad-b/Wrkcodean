import type { WorkflowSpec } from "./types";
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

// Legacy aliases for backward compatibility
export const createEmptyWorkflow = createEmptyWorkflowSpec;
export const createEmptyBlueprint = createEmptyWorkflowSpec;


import type { Workflow } from "./types";
import { WORKFLOW_SECTION_DEFINITIONS } from "./types";

const generateId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
};

export function createEmptyWorkflow(): Workflow {
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

// Legacy alias for backward compatibility
export const createEmptyBlueprint = createEmptyWorkflow;


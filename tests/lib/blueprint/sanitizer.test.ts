import { describe, it, expect } from "vitest";
import { sanitizeBlueprintTopology } from "@/lib/blueprint/sanitizer";
import type { Blueprint } from "@/lib/blueprint/types";

const baseBlueprint = (): Blueprint => ({
  version: 1,
  status: "Draft",
  summary: "",
  sections: [],
  steps: [],
  branches: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

describe("sanitizeBlueprintTopology", () => {
  it("ensures decision nodes own their branch children and removes duplicate edges", () => {
    const blueprint = baseBlueprint();
    const triggerId = "trigger";
    const extractId = "extract";
    const decisionId = "decision";
    const autoId = "auto";
    const manualId = "manual";
    const enterId = "enter";

    blueprint.steps = [
      {
        id: triggerId,
        type: "Trigger",
        name: "Receive invoice",
        summary: "",
        description: "",
        goalOutcome: "",
        responsibility: "Automated",
        systemsInvolved: [],
        notifications: [],
        nextStepIds: [extractId],
        stepNumber: "",
        taskIds: [],
      },
      {
        id: extractId,
        type: "Action",
        name: "Extract invoice data",
        summary: "",
        description: "",
        goalOutcome: "",
        responsibility: "Automated",
        systemsInvolved: [],
        notifications: [],
        nextStepIds: [decisionId, autoId, manualId, enterId],
        stepNumber: "",
        taskIds: [],
      },
      {
        id: decisionId,
        type: "Decision",
        name: "Check invoice amount",
        summary: "",
        description: "",
        goalOutcome: "",
        responsibility: "Automated",
        systemsInvolved: [],
        notifications: [],
        nextStepIds: [autoId, manualId],
        stepNumber: "",
        branchType: "conditional",
        taskIds: [],
      },
      {
        id: autoId,
        type: "Action",
        name: "Auto approve",
        summary: "",
        description: "",
        goalOutcome: "",
        responsibility: "Automated",
        systemsInvolved: [],
        notifications: [],
        nextStepIds: [enterId],
        stepNumber: "",
        branchLabel: "Under $1000",
        taskIds: [],
      },
      {
        id: manualId,
        type: "Human",
        name: "Slack approval",
        summary: "",
        description: "",
        goalOutcome: "",
        responsibility: "Approval",
        systemsInvolved: [],
        notifications: [],
        nextStepIds: [enterId],
        stepNumber: "",
        branchLabel: "Over $1000",
        taskIds: [],
      },
      {
        id: enterId,
        type: "Action",
        name: "Enter data",
        summary: "",
        description: "",
        goalOutcome: "",
        responsibility: "Automated",
        systemsInvolved: [],
        notifications: [],
        nextStepIds: [],
        stepNumber: "",
        taskIds: [],
      },
    ];

    blueprint.branches = [
      {
        id: "branch-auto",
        parentStepId: extractId,
        targetStepId: autoId,
        label: "Under $1000",
        condition: "< 1000",
      },
      {
        id: "branch-manual",
        parentStepId: extractId,
        targetStepId: manualId,
        label: "Over $1000",
        condition: ">= 1000",
      },
    ];

    const sanitized = sanitizeBlueprintTopology(blueprint);
    const steps = new Map(sanitized.steps.map((step) => [step.id, step]));

    expect(steps.get(extractId)?.nextStepIds).toEqual([decisionId]);
    expect(new Set(steps.get(decisionId)?.nextStepIds)).toEqual(new Set([autoId, manualId]));
    expect(steps.get(autoId)?.parentStepId).toBe(decisionId);
    expect(steps.get(manualId)?.parentStepId).toBe(decisionId);

    expect(sanitized.branches).toHaveLength(2);
    sanitizeBranchExpectations(sanitized.branches, decisionId, autoId, manualId);
  });
});

function sanitizeBranchExpectations(
  branches: Blueprint["branches"],
  decisionId: string,
  autoId: string,
  manualId: string
) {
  const branchPairs = branches.map((branch) => [branch.parentStepId, branch.targetStepId]);
  expect(branchPairs).toContainEqual([decisionId, autoId]);
  expect(branchPairs).toContainEqual([decisionId, manualId]);
}


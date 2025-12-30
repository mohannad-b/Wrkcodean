import { describe, expect, it } from "vitest";
import { createEmptyBlueprint } from "@/lib/workflows/factory";
import type { BlueprintSectionKey } from "@/lib/workflows/types";
import { determineConversationPhase, generateThinkingSteps } from "@/lib/ai/copilot-orchestrator";

describe("determineConversationPhase", () => {
  it("returns discovery for the first couple of user messages with no steps", () => {
    const blueprint = createEmptyBlueprint();
    const phase = determineConversationPhase(blueprint, [{ role: "user", content: "Hello" }]);
    expect(phase).toBe("discovery");
  });

  it("returns flow while steps are still being mapped", () => {
    const blueprint = createEmptyBlueprint();
    blueprint.steps.push(
      {
        id: "step_trigger",
        type: "Trigger",
        name: "Start",
        summary: "Kick off",
        description: "Kick off",
        goalOutcome: "Triggered",
        responsibility: "Automated",
        systemsInvolved: [],
        notifications: [],
        nextStepIds: [],
        stepNumber: "",
        taskIds: [],
      },
      {
        id: "step_action",
        type: "Action",
        name: "Process",
        summary: "Do work",
        description: "Do work",
        goalOutcome: "Processed",
        responsibility: "Automated",
        systemsInvolved: [],
        notifications: [],
        nextStepIds: [],
        stepNumber: "",
        taskIds: [],
      }
    );
    const phase = determineConversationPhase(blueprint, [
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Sure" },
      { role: "user", content: "Next" },
    ]);
    expect(phase).toBe("flow");
  });

  it("returns details when objectives are set but edge cases are missing", () => {
    const blueprint = createEmptyBlueprint();
    blueprint.sections.push(
      {
        id: "business_objectives",
        key: "business_objectives",
        title: "Business Objectives",
        content: "Improve reporting accuracy.",
      },
      {
        id: "systems",
        key: "systems",
        title: "Systems",
        content: "Salesforce and Slack.",
      }
    );
    blueprint.steps = Array.from({ length: 5 }).map((_, index) => ({
      id: `step_${index}`,
      type: index === 0 ? "Trigger" : "Action",
      name: `Step ${index}`,
      summary: "Do something important",
      description: "Do something important",
      goalOutcome: "Progress",
      responsibility: "Automated",
      systemsInvolved: [],
      notifications: [],
      nextStepIds: [],
      stepNumber: "",
      taskIds: [],
    }));
    const phase = determineConversationPhase(blueprint, [{ role: "user", content: "Update" }]);
    expect(phase).toBe("details");
  });

  it("returns validation when everything is populated", () => {
    const blueprint = createEmptyBlueprint();
    blueprint.summary = "Complete flow";
    blueprint.sections = [
      "business_requirements",
      "business_objectives",
      "success_criteria",
      "systems",
      "data_needs",
      "exceptions",
      "human_touchpoints",
      "flow_complete",
    ].map((key) => ({
      id: key,
      key: key as BlueprintSectionKey,
      title: key,
      content: "Captured",
    }));
    blueprint.steps = Array.from({ length: 7 }).map((_, index) => ({
      id: `step_${index}`,
      type: index === 0 ? "Trigger" : "Action",
      name: `Step ${index}`,
      summary: "Detail",
      description: "Detail",
      goalOutcome: "Done",
      responsibility: "Automated",
      systemsInvolved: [],
      notifications: [],
      nextStepIds: [],
      stepNumber: "",
      taskIds: [],
    }));
    const phase = determineConversationPhase(blueprint, [{ role: "user", content: "Next" }]);
    expect(phase).toBe("validation");
  });
});

describe("generateThinkingSteps", () => {
  it("returns discovery labels", () => {
    const steps = generateThinkingSteps("discovery");
    expect(steps).toHaveLength(3);
    expect(steps[0].label).toMatch(/goal/i);
  });

  it("returns validation labels", () => {
    const steps = generateThinkingSteps("validation");
    expect(steps).toHaveLength(2);
    expect(steps[0].label).toMatch(/validating/i);
  });

  it("references systems from the latest user message", () => {
    const steps = generateThinkingSteps("flow", "Route leads from Salesforce into HubSpot", null);
    expect(steps[1].label).toBe("Connecting Salesforce and HubSpot");
  });

  it("highlights approval logic when mentioned", () => {
    const steps = generateThinkingSteps("details", "If it's over $5K we need to approve manually", null);
    expect(steps[0].label).toBe("Analyzing approval threshold logic");
  });
});


import { describe, it, expect } from "vitest";
import { applyBlueprintUpdates, type BlueprintUpdates } from "@/lib/blueprint/ai-updates";
import { createEmptyBlueprint } from "@/lib/blueprint/factory";

describe("applyBlueprintUpdates", () => {
  it("fills empty sections but leaves populated ones intact", () => {
    const blueprint = createEmptyBlueprint();
    const requirementsSection = blueprint.sections.find((section) => section.key === "business_requirements");
    if (requirementsSection) {
      requirementsSection.content = "Already filled";
    }

    const updates: BlueprintUpdates = {
      sections: {
        business_requirements: "Should be ignored",
        business_objectives: "Increase lead capture",
        systems: ["HubSpot", "Slack"],
      },
    };

    const result = applyBlueprintUpdates(blueprint, updates);
    const objectives = result.sections.find((section) => section.key === "business_objectives");
    expect(objectives?.content).toBe("Increase lead capture");
    const requirements = result.sections.find((section) => section.key === "business_requirements");
    expect(requirements?.content).toBe("Already filled");
    const systems = result.sections.find((section) => section.key === "systems");
    expect(systems?.content).toBe("HubSpot, Slack");
  });

  it("returns original blueprint when there are no applicable updates", () => {
    const blueprint = createEmptyBlueprint();
    const result = applyBlueprintUpdates(blueprint, { steps: [], sections: {} });
    expect(result).toBe(blueprint);
  });

  it("fills summary, goal, and systems defaults when missing", () => {
    const blueprint = createEmptyBlueprint();
    const updates: BlueprintUpdates = {
      steps: [
        {
          id: "fallback",
          title: "Fallback Step",
          dependsOnIds: [],
        },
      ],
    };

    const result = applyBlueprintUpdates(blueprint, updates);
    const step = result.steps.find((item) => item.id === "fallback");
    expect(step?.summary).toBe("Summary pending");
    expect(step?.goalOutcome).toBe("Outcome pending");
    expect(step?.systemsInvolved).toEqual(["System TBD"]);
  });

  it("links steps using dependsOnIds", () => {
    const blueprint = createEmptyBlueprint();
    const updates: BlueprintUpdates = {
      steps: [
        { id: "step_a", title: "A" },
        { id: "step_b", title: "B", dependsOnIds: ["step_a"] },
      ],
    };

    const result = applyBlueprintUpdates(blueprint, updates);
    const stepA = result.steps.find((step) => step.id === "step_a");
    const stepB = result.steps.find((step) => step.id === "step_b");
    expect(stepA?.nextStepIds).toEqual(["step_b"]);
    expect(stepB?.nextStepIds).toEqual([]);
  });

  it("replaces existing flow when new steps arrive", () => {
    const blueprint = createEmptyBlueprint();
    blueprint.steps = [
      {
        id: "old",
        type: "Trigger",
        name: "Old",
        summary: "Old summary",
        goalOutcome: "Old outcome",
        responsibility: "Automated",
        systemsInvolved: ["Old System"],
        notifications: [],
        nextStepIds: [],
      },
    ];

    const updates: BlueprintUpdates = {
      steps: [
        { id: "step_a", title: "Step A" },
        { id: "step_b", title: "Step B", dependsOnIds: ["step_a"] },
      ],
    };

    const result = applyBlueprintUpdates(blueprint, updates);
    expect(result.steps.map((step) => step.id)).toEqual(["step_a", "step_b"]);
    expect(result.steps[0].nextStepIds).toEqual(["step_b"]);
  });
});


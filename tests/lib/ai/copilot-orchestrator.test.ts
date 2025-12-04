import { describe, expect, it, beforeEach, vi } from "vitest";
import { createEmptyBlueprint } from "@/lib/blueprint/factory";
import type { BlueprintSectionKey } from "@/lib/blueprint/types";
import {
  determineConversationPhase,
  generateThinkingSteps,
  runCopilotOrchestration,
} from "@/lib/ai/copilot-orchestrator";
import { callCopilotChat } from "@/lib/ai/openai-client";

vi.mock("@/lib/ai/openai-client", () => ({
  callCopilotChat: vi.fn(),
}));

const callCopilotChatMock = vi.mocked(callCopilotChat);

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
        goalOutcome: "Triggered",
        responsibility: "Automated",
        systemsInvolved: [],
        notifications: [],
        nextStepIds: [],
      },
      {
        id: "step_action",
        type: "Action",
        name: "Process",
        summary: "Do work",
        goalOutcome: "Processed",
        responsibility: "Automated",
        systemsInvolved: [],
        notifications: [],
        nextStepIds: [],
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
      goalOutcome: "Progress",
      responsibility: "Automated",
      systemsInvolved: [],
      notifications: [],
      nextStepIds: [],
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
      goalOutcome: "Done",
      responsibility: "Automated",
      systemsInvolved: [],
      notifications: [],
      nextStepIds: [],
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
});

describe("runCopilotOrchestration", () => {
  beforeEach(() => {
    callCopilotChatMock.mockReset();
  });

  it("calls the LLM once and parses the blueprint updates", async () => {
    callCopilotChatMock.mockResolvedValue(`
Got it - building the next steps.
\`\`\`json blueprint_updates
{
  "summary": "Sync invoices into NetSuite",
  "steps": [
    { "id": "step_trigger", "title": "Watch inbox" }
  ]
}
\`\`\`
Quick clarifications:
- When should this run?
`);

    const blueprint = createEmptyBlueprint();
    blueprint.sections.push({
      id: "business_requirements",
      key: "business_requirements",
      title: "Business Requirements",
      content: "Keep invoicing in sync.",
    });
    blueprint.steps.push({
      id: "step_trigger",
      type: "Trigger",
      name: "Kickoff",
      summary: "Start",
      goalOutcome: "Triggered",
      responsibility: "Automated",
      systemsInvolved: [],
      notifications: [],
      nextStepIds: [],
    });

    const result = await runCopilotOrchestration({
      blueprint,
      messages: [{ role: "user", content: "I get invoices every day." }],
    });

    expect(callCopilotChatMock).toHaveBeenCalledTimes(1);
    expect(result.assistantDisplayText).toMatch(/Got it/i);
    expect(result.blueprintUpdates?.summary).toBe("Sync invoices into NetSuite");
    expect(result.thinkingSteps).toHaveLength(3);
    expect(result.conversationPhase).toBe("flow");
  });
});


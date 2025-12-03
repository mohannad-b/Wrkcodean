import { describe, it, expect } from "vitest";
import { chooseNextUserQuestion, safeParsePossiblyTruncatedJson } from "@/lib/ai/copilot-orchestrator";
import { createEmptyCopilotAnalysisState } from "@/lib/blueprint/copilot-analysis";

describe("safeParsePossiblyTruncatedJson", () => {
  it("recovers a readiness payload before trailing partial text", () => {
    const raw = `
    {"readiness":{"score":88,"stateItemsSatisfied":["Flow mapped"],"stateItemsMissing":["Define review workflow"],"blockingTodos":["todo_approval"]},"todos":[{"id":"todo_approval","category":"human_touchpoints","description":"Define and document review and approval workflow for pricing data by Pricing Analyst","status":"open"}],"sections":{"flow_complete":{"textSummary":"Kayak flow outlined","confidence":"medium","source":"ai_inferred","missingInfo":["What systems will we orchestrate?"]}}} What systems will`;
    const result = safeParsePossiblyTruncatedJson<{ readiness: { score: number } }>(raw);
    expect(result?.readiness.score).toBe(88);
  });

  it("returns null when the JSON never closes", () => {
    const raw = '{"readiness":{"score":70,"blockingTodos":["todo"]';
    expect(safeParsePossiblyTruncatedJson(raw)).toBeNull();
  });
});

describe("chooseNextUserQuestion", () => {
  it("prioritizes blocking todos with preferred categories", () => {
    const analysis = createEmptyCopilotAnalysisState();
    analysis.todos = [
      {
        id: "todo_1",
        category: "systems",
        description: "Document the data warehouse connection for Kayak pricing",
        status: "open",
      },
      {
        id: "todo_2",
        category: "other",
        description: "Share brand guidelines",
        status: "open",
      },
    ];
    analysis.readiness.blockingTodos = ["todo_2", "todo_1"];

    const question = chooseNextUserQuestion(analysis);
    expect(question?.startsWith("Can you")).toBe(true);
    expect(question).toContain("data warehouse connection");
  });

  it("falls back to section missing info prompts", () => {
    const analysis = createEmptyCopilotAnalysisState();
    analysis.readiness.blockingTodos = [];
    analysis.sections.business_objectives.missingInfo = ["Clarify target markets for Kayak pricing data."];

    const question = chooseNextUserQuestion(analysis);
    expect(question).toContain("clarify target markets for Kayak pricing data");
  });
});


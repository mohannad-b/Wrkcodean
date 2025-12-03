import { describe, it, expect } from "vitest";
import { parseCopilotReply } from "@/lib/ai/parse-copilot-reply";

describe("parseCopilotReply", () => {
  it("returns original text when no blueprint block exists", () => {
    const input = "Short reply without JSON.";
    const result = parseCopilotReply(input);
    expect(result).toEqual({
      displayText: "Short reply without JSON.",
      blueprintUpdates: null,
    });
  });

  it("extracts blueprint_updates JSON when label is on same line", () => {
    const input = [
      "- Here is what I understood.",
      "",
      "```json blueprint_updates",
      '{"steps":[{"id":"step1"}],"sections":{"systems":["HubSpot"]},"assumptions":["volume unknown"]}',
      "```",
      "",
      "What SLA do you need?",
    ].join("\n");

    const result = parseCopilotReply(input);
    expect(result.displayText).toBe("- Here is what I understood.\n\nWhat SLA do you need?");
    expect(result.blueprintUpdates).toEqual({
      steps: [{ id: "step1" }],
      sections: { systems: ["HubSpot"] },
      assumptions: ["volume unknown"],
    });
  });

  it("extracts blueprint_updates JSON when label is on the next line", () => {
    const input = [
      "- Summary",
      "",
      "```json",
      "blueprint_updates",
      '{"sections":{"business_objectives":"Grow"},"assumptions":["a1"]}',
      "```",
      "",
      "Next question.",
    ].join("\n");

    const result = parseCopilotReply(input);
    expect(result.displayText).toBe("- Summary\n\nNext question.");
    expect(result.blueprintUpdates).toEqual({
      sections: { business_objectives: "Grow" },
      assumptions: ["a1"],
    });
  });

  it("uses the last labeled block when multiple exist", () => {
    const input = [
      "- Summary",
      "",
      "```json blueprint_updates",
      '{"steps":[{"id":"first"}]}',
      "```",
      "",
      "Additional context.",
      "",
      "```json blueprint_updates",
      '{"steps":[{"id":"winner"}]}',
      "```",
      "",
      "Any blockers?",
    ].join("\n");

    const result = parseCopilotReply(input);
    expect(result.displayText).toBe("- Summary\n\nAdditional context.\n\nAny blockers?");
    expect(result.blueprintUpdates).toEqual({
      steps: [{ id: "winner" }],
    });
  });

  it("falls back to unlabeled block at the end when it parses cleanly", () => {
    const input = [
      "- Summary",
      "",
      "```json",
      '{"steps":[{"id":"fallback"}]}',
      "```",
    ].join("\n");

    const result = parseCopilotReply(input);
    expect(result.displayText).toBe("- Summary");
    expect(result.blueprintUpdates).toEqual({
      steps: [{ id: "fallback" }],
    });
  });

  it("does not treat unlabeled mid-message blocks as blueprint updates but still strips them", () => {
    const input = [
      "- Summary",
      "",
      "```json",
      '{"steps":[{"id":"ignored"}]}',
      "```",
      "",
      "Follow-up question?",
    ].join("\n");

    const result = parseCopilotReply(input);
    expect(result.displayText).toBe("- Summary\n\nFollow-up question?");
    expect(result.blueprintUpdates).toBeNull();
  });

  it("returns null blueprint updates when JSON parsing fails", () => {
    const input = ["- Outline", "", "```json blueprint_updates", "{not valid json", "```"].join("\n");
    const result = parseCopilotReply(input);
    expect(result.displayText).toBe("- Outline");
    expect(result.blueprintUpdates).toBeNull();
  });

  it("removes all json blocks even when multiple appear", () => {
    const input = [
      "- Recap",
      "",
      "```json blueprint_updates",
      '{"steps":[{"id":"one"}]}',
      "```",
      "",
      "Another idea",
      "",
      "```json",
      '{"foo":"bar"}',
      "```",
      "",
      "Done.",
    ].join("\n");

    const result = parseCopilotReply(input);
    expect(result.displayText).toBe("- Recap\n\nAnother idea\n\nDone.");
    expect(result.blueprintUpdates).toEqual({
      steps: [{ id: "one" }],
    });
  });

  it("strips truncated JSON fences even without closing backticks", () => {
    const input = [
      "- Summary",
      "",
      "```json blueprint_updates",
      '{"steps":[{"id":"partial"}]',
      // no closing fence
    ].join("\n");

    const result = parseCopilotReply(input);
    expect(result.displayText).toBe("- Summary");
    expect(result.blueprintUpdates).toBeNull();
  });
});


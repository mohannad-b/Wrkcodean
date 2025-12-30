import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/context", () => ({
  requireTenantSession: vi.fn(async () => ({})),
  handleApiError: (error: unknown) => new Response(String((error as Error)?.message ?? "error"), { status: 500 }),
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

vi.mock("@/lib/auth/rbac", () => ({
  can: () => true,
}));

vi.mock("@/lib/services/automations", () => ({
  getAutomationVersionDetail: vi.fn(async () => ({
    version: { workflowJson: null },
    automation: { id: "a1", name: "Automation" },
  })),
}));

vi.mock("openai", () => ({
  default: class OpenAI {
    chat = { completions: { create: vi.fn(async () => ({ choices: [{ message: { content: "[]" } }] })) } };
  },
}));

import { coerceToStructuredTags, normalizeTags, normalizeWord } from "@/app/api/automation-versions/[id]/copilot/tags/route";

describe("copilot tags normalization", () => {
  it("strips markdown fences and parses json arrays", () => {
    const input = "```json\n[\"Sales\", \"Efficiency\", \"Medium\"]\n```";
    const result = normalizeTags(input);
    expect(result).toEqual(["Sales", "Efficiency", "Medium"]);
  });

  it("splits bullet/line separated content and removes cruft", () => {
    const input = "- Marketing\n- cost savings:\n- complex";
    const result = normalizeTags(input);
    expect(result).toEqual(["Marketing", "cost savings", "complex"]);
  });
});

describe("coerceToStructuredTags", () => {
  it("returns department, outcome, complexity in order", () => {
    const structured = coerceToStructuredTags(["Sales", "Efficiency", "Medium"]);
    expect(structured).toEqual(["Sales", "Efficiency", "Medium"]);
  });

  it("maps synonyms and defaults when missing", () => {
    const structured = coerceToStructuredTags(["ops", "cost", "complex"]);
    expect(structured).toEqual(["Ops", "Cost Savings", "Complex"]);

    const fallback = coerceToStructuredTags(["unknown"]);
    expect(fallback).toEqual(["Operations", "Efficiency", "Medium"]);
  });
});

describe("normalizeWord", () => {
  it("title-cases and removes punctuation", () => {
    expect(normalizeWord("  customer experience!!! ")).toBe("Customer Experience");
    expect(normalizeWord("risk-reduction")).toBe("Risk Reduction");
  });
});
